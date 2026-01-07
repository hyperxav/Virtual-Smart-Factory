#!/usr/bin/env python3
"""
Virtual Smart Factory - Edge Agent
===================================
Simulates industrial telemetry, publishes to MQTT, and handles store-and-forward
buffering for cloud ingestion resilience.
"""

import json
import logging
import os
import random
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import paho.mqtt.client as mqtt
import requests

# =============================================================================
# Configuration
# =============================================================================

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
CLOUD_API_URL = os.getenv("CLOUD_API_URL", "http://localhost:8000")
TENANT_ID = os.getenv("TENANT_ID", "acme")
PLANT_ID = os.getenv("PLANT_ID", "plant-01")
TELEMETRY_INTERVAL_MS = int(os.getenv("TELEMETRY_INTERVAL_MS", "2000"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
BUFFER_DB_PATH = os.getenv("BUFFER_DB_PATH", "/app/buffer/telemetry.db")

# Logging setup
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper()),
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("edge-agent")

# =============================================================================
# Factory Configuration (3 lines, multiple machines per line)
# =============================================================================

FACTORY_CONFIG = {
    "line-01": {
        "machines": ["cnc-01", "cnc-02", "robot-arm-01"],
        "base_temp": 45.0,
        "base_vibration": 2.5,
        "base_energy": 15.0,
    },
    "line-02": {
        "machines": ["press-01", "conveyor-01", "robot-arm-02"],
        "base_temp": 50.0,
        "base_vibration": 3.0,
        "base_energy": 25.0,
    },
    "line-03": {
        "machines": ["welder-01", "welder-02", "inspection-01"],
        "base_temp": 60.0,
        "base_vibration": 1.8,
        "base_energy": 35.0,
    },
}

# =============================================================================
# Fault State (modified by MQTT commands)
# =============================================================================

fault_state = {
    "bearing_fault": False,
    "energy_spike": False,
    "network_outage": False,
}
fault_lock = threading.Lock()

# =============================================================================
# SQLite Buffer for Store-and-Forward
# =============================================================================


def init_buffer_db():
    """Initialize SQLite buffer database."""
    os.makedirs(os.path.dirname(BUFFER_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(BUFFER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS buffer (
            id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            sent INTEGER DEFAULT 0
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sent ON buffer(sent, created_at)")
    conn.commit()
    conn.close()
    logger.info("Buffer database initialized at %s", BUFFER_DB_PATH)


def buffer_insert(point_id: str, payload: dict):
    """Insert a telemetry point into the buffer."""
    conn = sqlite3.connect(BUFFER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO buffer (id, payload, created_at, sent) VALUES (?, ?, ?, 0)",
        (point_id, json.dumps(payload), datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()


def buffer_mark_sent(point_id: str):
    """Mark a buffered point as sent."""
    conn = sqlite3.connect(BUFFER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE buffer SET sent = 1 WHERE id = ?", (point_id,))
    conn.commit()
    conn.close()


def buffer_get_unsent(limit: int = 100) -> list[tuple[str, dict]]:
    """Get unsent points from buffer, oldest first."""
    conn = sqlite3.connect(BUFFER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, payload FROM buffer WHERE sent = 0 ORDER BY created_at ASC LIMIT ?",
        (limit,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [(row[0], json.loads(row[1])) for row in rows]


def buffer_count_unsent() -> int:
    """Count unsent points in buffer."""
    conn = sqlite3.connect(BUFFER_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM buffer WHERE sent = 0")
    count = cursor.fetchone()[0]
    conn.close()
    return count


# =============================================================================
# Cloud API Client
# =============================================================================


def send_to_cloud(payload: dict) -> bool:
    """Attempt to send a telemetry point to the cloud API."""
    with fault_lock:
        if fault_state["network_outage"]:
            logger.debug("Network outage simulated - skipping cloud send")
            return False

    try:
        resp = requests.post(
            f"{CLOUD_API_URL}/ingest",
            json=payload,
            timeout=5,
            headers={"Content-Type": "application/json"},
        )
        if resp.status_code in (200, 201, 409):  # 409 = duplicate, still success
            return True
        logger.warning("Cloud API returned %d: %s", resp.status_code, resp.text)
        return False
    except requests.exceptions.RequestException as e:
        logger.warning("Cloud API error: %s", e)
        return False


def backfill_buffer():
    """Background task to backfill unsent points from buffer."""
    while True:
        time.sleep(5)  # Check every 5 seconds

        with fault_lock:
            if fault_state["network_outage"]:
                continue

        unsent = buffer_get_unsent(limit=50)
        if unsent:
            logger.info("Backfilling %d buffered points...", len(unsent))

        for point_id, payload in unsent:
            if send_to_cloud(payload):
                buffer_mark_sent(point_id)
                logger.debug("Backfilled point %s", point_id)
            else:
                logger.debug("Backfill failed for %s, will retry", point_id)
                break  # Stop on first failure to maintain order


# =============================================================================
# Telemetry Generation
# =============================================================================


def generate_telemetry_point(
    line_id: str, machine_id: str, metric: str, value: float, unit: str
) -> dict:
    """Generate a telemetry point with the standardized schema."""
    return {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "id": str(uuid.uuid4()),
        "tenant": TENANT_ID,
        "plant": PLANT_ID,
        "line": line_id,
        "machine": machine_id,
        "metric": metric,
        "value": value,
        "unit": unit,
        "q": 100,  # Quality score (100 = good)
    }


def generate_machine_telemetry(line_id: str, machine_id: str, config: dict) -> list[dict]:
    """Generate all telemetry points for a single machine."""
    points = []

    # Read fault state
    with fault_lock:
        bearing_fault = fault_state["bearing_fault"]
        energy_spike = fault_state["energy_spike"]

    # Temperature (°C)
    temp = config["base_temp"] + random.gauss(0, 2)
    if bearing_fault:
        temp += random.uniform(15, 25)  # Overheating due to bearing fault
    points.append(generate_telemetry_point(line_id, machine_id, "temp", round(temp, 2), "°C"))

    # Vibration RMS (mm/s)
    vibration = config["base_vibration"] + random.gauss(0, 0.3)
    if bearing_fault:
        vibration += random.uniform(5, 10)  # High vibration from bad bearing
    points.append(
        generate_telemetry_point(line_id, machine_id, "vibration_rms", round(vibration, 3), "mm/s")
    )

    # Energy (kW)
    energy = config["base_energy"] + random.gauss(0, 1)
    if energy_spike:
        energy *= random.uniform(2.5, 4.0)  # Energy spike
    points.append(
        generate_telemetry_point(line_id, machine_id, "energy_kw", round(energy, 2), "kW")
    )

    # Production counts
    good_count = random.randint(8, 15)
    bad_count = random.randint(0, 2)
    if bearing_fault:
        bad_count += random.randint(3, 8)  # More defects due to fault
    points.append(
        generate_telemetry_point(line_id, machine_id, "good_count", good_count, "units")
    )
    points.append(
        generate_telemetry_point(line_id, machine_id, "bad_count", bad_count, "units")
    )

    # Machine state
    state_value = 2 if bearing_fault else (1 if random.random() > 0.95 else 0)
    # 0 = RUN, 1 = STOP, 2 = FAULT
    points.append(generate_telemetry_point(line_id, machine_id, "state", state_value, "enum"))

    return points


# =============================================================================
# MQTT Client
# =============================================================================


def on_connect(client: mqtt.Client, userdata: Any, flags: dict, rc: int):
    """MQTT connection callback."""
    if rc == 0:
        logger.info("Connected to MQTT broker at %s:%d", MQTT_HOST, MQTT_PORT)
        # Subscribe to command topic
        cmd_topic = f"v1/{TENANT_ID}/{PLANT_ID}/cmd"
        client.subscribe(cmd_topic)
        logger.info("Subscribed to command topic: %s", cmd_topic)
    else:
        logger.error("MQTT connection failed with code %d", rc)


def on_message(client: mqtt.Client, userdata: Any, msg: mqtt.MQTTMessage):
    """Handle incoming MQTT commands."""
    try:
        payload = json.loads(msg.payload.decode())
        cmd = payload.get("cmd")
        value = payload.get("value", True)

        logger.info("Received command: %s = %s", cmd, value)

        with fault_lock:
            if cmd in fault_state:
                fault_state[cmd] = bool(value)
                logger.info("Fault state updated: %s = %s", cmd, fault_state[cmd])

                # Log buffer status on network_outage toggle
                if cmd == "network_outage":
                    count = buffer_count_unsent()
                    logger.info("Buffer status: %d unsent points", count)
            else:
                logger.warning("Unknown command: %s", cmd)

    except Exception as e:
        logger.error("Error processing command: %s", e)


def publish_telemetry(client: mqtt.Client):
    """Generate and publish telemetry for all machines."""
    for line_id, config in FACTORY_CONFIG.items():
        for machine_id in config["machines"]:
            points = generate_machine_telemetry(line_id, machine_id, config)

            for point in points:
                # Construct MQTT topic
                topic = f"v1/{point['tenant']}/{point['plant']}/{point['line']}/{point['machine']}/{point['metric']}"

                # Publish to MQTT
                client.publish(topic, json.dumps(point), qos=1)

                # Store in buffer (always)
                buffer_insert(point["id"], point)

                # Attempt to send to cloud
                if send_to_cloud(point):
                    buffer_mark_sent(point["id"])


# =============================================================================
# Main Loop
# =============================================================================


def main():
    """Main entry point."""
    logger.info("=" * 60)
    logger.info("Virtual Smart Factory - Edge Agent Starting")
    logger.info("=" * 60)
    logger.info("MQTT Broker: %s:%d", MQTT_HOST, MQTT_PORT)
    logger.info("Cloud API: %s", CLOUD_API_URL)
    logger.info("Tenant: %s, Plant: %s", TENANT_ID, PLANT_ID)
    logger.info("Telemetry Interval: %d ms", TELEMETRY_INTERVAL_MS)
    logger.info("=" * 60)

    # Initialize buffer database
    init_buffer_db()

    # Start backfill thread
    backfill_thread = threading.Thread(target=backfill_buffer, daemon=True)
    backfill_thread.start()
    logger.info("Backfill thread started")

    # Setup MQTT client
    client = mqtt.Client(client_id=f"edge-agent-{PLANT_ID}")
    client.on_connect = on_connect
    client.on_message = on_message

    # Connect to MQTT broker with retry
    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT, 60)
            break
        except Exception as e:
            logger.warning("MQTT connection failed: %s. Retrying in 5s...", e)
            time.sleep(5)

    # Start MQTT loop in background
    client.loop_start()

    # Main telemetry loop
    interval_sec = TELEMETRY_INTERVAL_MS / 1000.0
    cycle = 0

    try:
        while True:
            cycle += 1
            start = time.time()

            publish_telemetry(client)

            # Log status every 10 cycles
            if cycle % 10 == 0:
                unsent = buffer_count_unsent()
                with fault_lock:
                    faults = {k: v for k, v in fault_state.items() if v}
                logger.info(
                    "Cycle %d | Buffer unsent: %d | Active faults: %s",
                    cycle,
                    unsent,
                    faults or "none",
                )

            # Sleep for remaining interval
            elapsed = time.time() - start
            sleep_time = max(0, interval_sec - elapsed)
            time.sleep(sleep_time)

    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
