# Virtual Smart Factory

A production-grade Edge-to-Cloud IoT demonstration showcasing industrial telemetry ingestion, store-and-forward buffering, and real-time analytics.

**[Live Dashboard](http://localhost:3000)** | **[API Docs](http://localhost:8000/docs)** | **[Architecture](#architecture)**

---

## Overview

This project simulates a smart factory with:
- **3 Production Lines** with 9 machines generating telemetry
- **Edge Agent** with local MQTT broker and SQLite store-and-forward buffer
- **Cloud Platform** with FastAPI, TimescaleDB, and Next.js dashboard
- **Fault Injection** for demonstrating resilience (bearing fault, energy spike, network outage)

Perfect for portfolio demonstrations and interview showcases.

---

## Architecture

```mermaid
flowchart TB
    subgraph Edge["🏭 Edge (Factory Site)"]
        SIM[Simulated Machines<br/>3 Lines × 3 Machines]
        AGENT[Edge Agent<br/>Python]
        MQTT[Mosquitto<br/>MQTT Broker]
        BUFFER[(SQLite<br/>Buffer)]

        SIM -->|telemetry| AGENT
        AGENT -->|publish| MQTT
        AGENT -->|persist| BUFFER
    end

    subgraph Cloud["☁️ Cloud (SaaS Platform)"]
        API[FastAPI<br/>Ingest + Query]
        TSDB[(TimescaleDB<br/>Hypertable)]
        WEB[Next.js<br/>Dashboard]

        API -->|write| TSDB
        TSDB -->|query| API
        API -->|REST| WEB
    end

    AGENT -->|HTTP POST /ingest| API
    BUFFER -.->|backfill| API
    MQTT -->|commands| AGENT

    style Edge fill:#1e3a5f,stroke:#3b82f6
    style Cloud fill:#1e3a5f,stroke:#22c55e
```

### Data Flow

1. **Telemetry Generation**: Edge agent simulates 6 metrics per machine every 2 seconds
2. **Local Publishing**: Points published to MQTT with hierarchical topics
3. **Buffering**: All points persisted to SQLite before cloud upload
4. **Cloud Ingestion**: HTTP POST to FastAPI with UUID-based idempotency
5. **Storage**: TimescaleDB hypertable with automatic time-partitioning
6. **Visualization**: Next.js dashboard polls KPIs every 5 seconds

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- (Optional) `mosquitto-clients` for fault injection commands

### Run Locally

```bash
# 1. Start Cloud Stack (TimescaleDB + API + Dashboard)
cd cloud
docker compose up --build -d

# 2. Start Edge Stack (MQTT + Agent)
cd ../edge
docker compose up --build

# 3. Open Dashboard
open http://localhost:3000
```

The dashboard should show live data within ~30 seconds.

### Stop Everything

```bash
# Stop edge (Ctrl+C if running in foreground, or:)
cd edge && docker compose down

# Stop cloud
cd cloud && docker compose down -v  # -v removes volumes
```

---

## Fault Injection Demo

Trigger faults via MQTT commands from the `edge` directory:

### Bearing Fault (Temperature + Vibration Spike)

```bash
# Enable - watch temp rise 15-25°C, vibration increase 5-10 mm/s
mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" \
  -m '{"cmd":"bearing_fault","value":true}'

# Disable
mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" \
  -m '{"cmd":"bearing_fault","value":false}'
```

### Energy Spike

```bash
# Enable - energy consumption multiplied by 2.5-4x
mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" \
  -m '{"cmd":"energy_spike","value":true}'

# Disable
mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" \
  -m '{"cmd":"energy_spike","value":false}'
```

### Network Outage (Store-and-Forward Demo)

```bash
# Enable - edge buffers locally, cloud stops receiving
mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" \
  -m '{"cmd":"network_outage","value":true}'

# Watch edge agent logs show buffer growing
# Wait 30-60 seconds...

# Disable - backfill begins, buffered points sent in order
mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" \
  -m '{"cmd":"network_outage","value":false}'
```

---

## Project Structure

```
virtual-smart-factory/
├── edge/                          # Edge "Factory Site"
│   ├── docker-compose.yml
│   ├── mosquitto/
│   │   └── mosquitto.conf
│   └── agent/
│       ├── Dockerfile
│       ├── requirements.txt
│       └── main.py               # Core edge agent
│
├── cloud/                         # Cloud "SaaS Platform"
│   ├── docker-compose.yml
│   ├── db/
│   │   └── init.sql              # TimescaleDB schema
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── main.py               # FastAPI service
│   └── web/
│       ├── Dockerfile
│       ├── package.json
│       └── src/app/              # Next.js pages
│
└── README.md
```

---

## API Reference

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ingest` | Ingest telemetry point (idempotent) |
| `GET` | `/kpis` | Aggregated KPIs for last N minutes |
| `GET` | `/series` | Time-bucketed series for charting |
| `GET` | `/stats` | Database statistics |
| `GET` | `/health` | Health check |
| `POST` | `/fault/{cmd}` | Generate fault command payload |

### Telemetry Schema

```json
{
  "ts": "2024-01-15T10:30:00.123Z",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant": "acme",
  "plant": "plant-01",
  "line": "line-01",
  "machine": "cnc-01",
  "metric": "temp",
  "value": 47.5,
  "unit": "°C",
  "q": 100
}
```

### MQTT Topic Format

```
v1/{tenant}/{plant}/{line}/{machine}/{metric}
```

Example: `v1/acme/plant-01/line-01/cnc-01/temp`

---

## Cloud Deployment

### Option 1: Vercel + Render + Neon

**1. Database (Neon/TimescaleDB Cloud)**

```bash
# Create Neon project or TimescaleDB Cloud instance
# Run init.sql to create schema
# Note the connection string
```

**2. API (Render)**

```bash
# Create Web Service from cloud/api
# Set environment variables:
DATABASE_URL=postgresql://user:pass@host:5432/db
CORS_ORIGINS=https://your-vercel-app.vercel.app
```

**3. Dashboard (Vercel)**

```bash
cd cloud/web
vercel deploy

# Set environment variable:
NEXT_PUBLIC_API_BASE=https://your-render-api.onrender.com
```

### Option 2: Fly.io

```bash
# Deploy API
cd cloud/api
fly launch
fly secrets set DATABASE_URL=...

# Deploy Web
cd ../web
fly launch
```

### Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `DATABASE_URL` | API | PostgreSQL connection string |
| `CORS_ORIGINS` | API | Allowed origins (comma-separated) |
| `NEXT_PUBLIC_API_BASE` | Web | API base URL |
| `CLOUD_API_URL` | Edge | Cloud API URL for ingestion |
| `MQTT_HOST` | Edge | MQTT broker hostname |

---

## Interview Talking Points

### Store-and-Forward Pattern
> "Industrial networks are unreliable. Every point is persisted to SQLite before cloud upload. During outages, data accumulates locally. When connectivity returns, we backfill chronologically. UUID-based idempotency makes retries safe."

### Idempotent Ingestion
> "Each point has a UUID generated at the edge. The database uses ON CONFLICT DO NOTHING with UUID as primary key. This enables at-least-once delivery without duplicates."

### Multi-Tenant Topic Design
> "The topic hierarchy v1/tenant/plant/line/machine/metric enables fine-grained subscriptions. A plant manager subscribes to their plant; a line operator to their line. The v1 prefix allows schema evolution."

### Time-Series Optimization
> "TimescaleDB hypertables auto-partition by time for efficient range queries. Continuous aggregates pre-compute rollups. Retention policies prevent unbounded growth."

### Production Readiness
> "For production: add MQTT TLS + auth, API JWT/OAuth2, rate limiting, connection pooling, horizontal scaling, and observability with metrics/tracing."

---

## Demo Checklist

- [ ] Start cloud stack, verify TimescaleDB healthy
- [ ] Start edge stack, see MQTT connection logs
- [ ] Open dashboard, see live KPIs updating
- [ ] Navigate to Architecture page, explain data flow
- [ ] Trigger bearing_fault, watch temp/vibration spike
- [ ] Trigger energy_spike, watch energy KPI change
- [ ] Trigger network_outage, watch buffer grow in logs
- [ ] Restore network, watch backfill complete
- [ ] Show API docs at /docs
- [ ] Discuss production considerations

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Edge Agent | Python 3.11, paho-mqtt |
| Edge Buffer | SQLite |
| Message Broker | Eclipse Mosquitto |
| Cloud API | FastAPI, Uvicorn |
| Time-Series DB | TimescaleDB (PostgreSQL) |
| Dashboard | Next.js 14, React, Tailwind CSS |
| Charts | Recharts |
| Data Fetching | SWR |
| Containerization | Docker, Docker Compose |

---

## License

MIT License - Use freely for portfolios, demos, and learning.

---

Built with care for showcasing industrial IoT architecture patterns.
