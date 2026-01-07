#!/usr/bin/env python3
"""
Virtual Smart Factory - Cloud API
==================================
FastAPI service for telemetry ingestion, KPI computation, and time series queries.
"""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# =============================================================================
# Configuration
# =============================================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://vsf:vsf_secret_2024@localhost:5432/smartfactory"
)
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

# Logging setup
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper()),
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("cloud-api")


# =============================================================================
# Database Connection Pool
# =============================================================================


def get_db_connection():
    """Get a database connection."""
    return psycopg2.connect(DATABASE_URL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("Starting Virtual Smart Factory Cloud API")
    logger.info("Database: %s", DATABASE_URL.split("@")[-1])  # Log without password
    yield
    logger.info("Shutting down Cloud API")


# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="Virtual Smart Factory API",
    description="Cloud API for industrial IoT telemetry ingestion and analytics",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Pydantic Models
# =============================================================================


class TelemetryPoint(BaseModel):
    """Single telemetry data point."""

    ts: str = Field(..., description="ISO8601 timestamp with Z suffix")
    id: str = Field(..., description="UUID for idempotency")
    tenant: str = Field(..., description="Tenant identifier")
    plant: str = Field(..., description="Plant identifier")
    line: str = Field(..., description="Production line identifier")
    machine: str = Field(..., description="Machine identifier")
    metric: str = Field(..., description="Metric name (temp, vibration_rms, etc.)")
    value: float = Field(..., description="Metric value")
    unit: str = Field(..., description="Unit of measurement")
    q: int = Field(default=100, description="Quality score (0-100)")


class IngestResponse(BaseModel):
    """Response from ingest endpoint."""

    status: str
    id: str
    duplicate: bool = False


class KPIResponse(BaseModel):
    """KPI aggregation response."""

    period_minutes: int
    avg_temp: Optional[float]
    avg_vibration_rms: Optional[float]
    avg_energy_kw: Optional[float]
    total_good_count: Optional[int]
    total_bad_count: Optional[int]
    fault_count: int
    total_points: int
    timestamp: str


class TimeSeriesPoint(BaseModel):
    """Single point in time series response."""

    bucket: str
    avg_value: float
    min_value: float
    max_value: float
    count: int


class TimeSeriesResponse(BaseModel):
    """Time series query response."""

    metric: str
    line: Optional[str]
    machine: Optional[str]
    bucket_seconds: int
    points: list[TimeSeriesPoint]


class FaultCommand(BaseModel):
    """Fault injection command."""

    cmd: str
    value: bool


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    database: str
    timestamp: str


# =============================================================================
# API Endpoints
# =============================================================================


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    db_status = "healthy"
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        conn.close()
    except Exception as e:
        db_status = f"unhealthy: {e}"

    return HealthResponse(
        status="ok" if db_status == "healthy" else "degraded",
        database=db_status,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.post("/ingest", response_model=IngestResponse)
async def ingest_telemetry(point: TelemetryPoint):
    """
    Ingest a single telemetry point.

    Idempotent: duplicate IDs are ignored (returns 200 with duplicate=True).
    """
    try:
        # Parse timestamp
        ts = datetime.fromisoformat(point.ts.replace("Z", "+00:00"))

        conn = get_db_connection()
        cursor = conn.cursor()

        # Idempotent insert (ON CONFLICT DO NOTHING)
        cursor.execute(
            """
            INSERT INTO telemetry (id, ts, tenant, plant, line, machine, metric, value, unit, q)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            RETURNING id
            """,
            (
                point.id,
                ts,
                point.tenant,
                point.plant,
                point.line,
                point.machine,
                point.metric,
                point.value,
                point.unit,
                point.q,
            ),
        )

        result = cursor.fetchone()
        duplicate = result is None

        conn.commit()
        conn.close()

        if duplicate:
            logger.debug("Duplicate point ignored: %s", point.id)
        else:
            logger.debug("Ingested point: %s [%s/%s]", point.id, point.machine, point.metric)

        return IngestResponse(status="ok", id=point.id, duplicate=duplicate)

    except Exception as e:
        logger.error("Ingest error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/kpis", response_model=KPIResponse)
async def get_kpis(
    tenant: str = Query(default="acme", description="Tenant ID"),
    plant: str = Query(default="plant-01", description="Plant ID"),
    minutes: int = Query(default=10, ge=1, le=60, description="Time window in minutes"),
):
    """
    Get aggregated KPIs for the last N minutes.

    Returns averages for temp, vibration_rms, energy_kw, and fault count.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cursor.execute(
            """
            SELECT
                AVG(CASE WHEN metric = 'temp' THEN value END) AS avg_temp,
                AVG(CASE WHEN metric = 'vibration_rms' THEN value END) AS avg_vibration_rms,
                AVG(CASE WHEN metric = 'energy_kw' THEN value END) AS avg_energy_kw,
                SUM(CASE WHEN metric = 'good_count' THEN value ELSE 0 END)::INTEGER AS total_good_count,
                SUM(CASE WHEN metric = 'bad_count' THEN value ELSE 0 END)::INTEGER AS total_bad_count,
                COUNT(CASE WHEN metric = 'state' AND value = 2 THEN 1 END)::INTEGER AS fault_count,
                COUNT(*)::INTEGER AS total_points
            FROM telemetry
            WHERE tenant = %s
              AND plant = %s
              AND ts > NOW() - INTERVAL '%s minutes'
            """,
            (tenant, plant, minutes),
        )

        row = cursor.fetchone()
        conn.close()

        return KPIResponse(
            period_minutes=minutes,
            avg_temp=round(row["avg_temp"], 2) if row["avg_temp"] else None,
            avg_vibration_rms=round(row["avg_vibration_rms"], 3) if row["avg_vibration_rms"] else None,
            avg_energy_kw=round(row["avg_energy_kw"], 2) if row["avg_energy_kw"] else None,
            total_good_count=row["total_good_count"],
            total_bad_count=row["total_bad_count"],
            fault_count=row["fault_count"],
            total_points=row["total_points"],
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    except Exception as e:
        logger.error("KPI query error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/series", response_model=TimeSeriesResponse)
async def get_time_series(
    metric: str = Query(..., description="Metric name (temp, vibration_rms, energy_kw)"),
    tenant: str = Query(default="acme", description="Tenant ID"),
    plant: str = Query(default="plant-01", description="Plant ID"),
    line: Optional[str] = Query(default=None, description="Filter by line"),
    machine: Optional[str] = Query(default=None, description="Filter by machine"),
    minutes: int = Query(default=30, ge=1, le=1440, description="Time window in minutes"),
    bucket_seconds: int = Query(default=10, ge=1, le=3600, description="Bucket size in seconds"),
):
    """
    Get bucketed time series data for a specific metric.

    Returns time-bucketed aggregates (avg, min, max, count) for charting.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Build query with optional filters
        query = """
            SELECT
                time_bucket(INTERVAL '%s seconds', ts) AS bucket,
                AVG(value) AS avg_value,
                MIN(value) AS min_value,
                MAX(value) AS max_value,
                COUNT(*)::INTEGER AS count
            FROM telemetry
            WHERE tenant = %s
              AND plant = %s
              AND metric = %s
              AND ts > NOW() - INTERVAL '%s minutes'
        """
        params = [bucket_seconds, tenant, plant, metric, minutes]

        if line:
            query += " AND line = %s"
            params.append(line)

        if machine:
            query += " AND machine = %s"
            params.append(machine)

        query += " GROUP BY bucket ORDER BY bucket ASC"

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        points = [
            TimeSeriesPoint(
                bucket=row["bucket"].isoformat(),
                avg_value=round(row["avg_value"], 3),
                min_value=round(row["min_value"], 3),
                max_value=round(row["max_value"], 3),
                count=row["count"],
            )
            for row in rows
        ]

        return TimeSeriesResponse(
            metric=metric,
            line=line,
            machine=machine,
            bucket_seconds=bucket_seconds,
            points=points,
        )

    except Exception as e:
        logger.error("Time series query error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/fault/{cmd}", response_model=FaultCommand)
async def get_fault_command(
    cmd: str,
    value: bool = Query(default=True, description="Enable (true) or disable (false) the fault"),
):
    """
    Generate a fault injection command payload.

    Returns the JSON payload to publish to MQTT for triggering faults.
    Supported commands: bearing_fault, energy_spike, network_outage
    """
    valid_commands = ["bearing_fault", "energy_spike", "network_outage"]

    if cmd not in valid_commands:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid command. Valid commands: {', '.join(valid_commands)}",
        )

    return FaultCommand(cmd=cmd, value=value)


@app.get("/stats")
async def get_stats(
    tenant: str = Query(default="acme", description="Tenant ID"),
    plant: str = Query(default="plant-01", description="Plant ID"),
):
    """Get database statistics and recent data overview."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Total points
        cursor.execute(
            "SELECT COUNT(*) as total FROM telemetry WHERE tenant = %s AND plant = %s",
            (tenant, plant),
        )
        total = cursor.fetchone()["total"]

        # Points in last hour
        cursor.execute(
            """
            SELECT COUNT(*) as recent FROM telemetry
            WHERE tenant = %s AND plant = %s AND ts > NOW() - INTERVAL '1 hour'
            """,
            (tenant, plant),
        )
        recent = cursor.fetchone()["recent"]

        # Distinct lines/machines
        cursor.execute(
            """
            SELECT
                COUNT(DISTINCT line) as lines,
                COUNT(DISTINCT machine) as machines,
                COUNT(DISTINCT metric) as metrics
            FROM telemetry
            WHERE tenant = %s AND plant = %s
            """,
            (tenant, plant),
        )
        counts = cursor.fetchone()

        # Latest timestamp
        cursor.execute(
            """
            SELECT MAX(ts) as latest FROM telemetry
            WHERE tenant = %s AND plant = %s
            """,
            (tenant, plant),
        )
        latest = cursor.fetchone()["latest"]

        conn.close()

        return {
            "tenant": tenant,
            "plant": plant,
            "total_points": total,
            "points_last_hour": recent,
            "distinct_lines": counts["lines"],
            "distinct_machines": counts["machines"],
            "distinct_metrics": counts["metrics"],
            "latest_timestamp": latest.isoformat() if latest else None,
            "queried_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        logger.error("Stats query error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Run with: uvicorn main:app --reload
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
