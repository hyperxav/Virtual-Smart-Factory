-- Virtual Smart Factory - TimescaleDB Schema
-- ============================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Main telemetry table (will become hypertable)
CREATE TABLE IF NOT EXISTS telemetry (
    id UUID PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL,
    tenant TEXT NOT NULL,
    plant TEXT NOT NULL,
    line TEXT NOT NULL,
    machine TEXT NOT NULL,
    metric TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit TEXT NOT NULL,
    q INTEGER DEFAULT 100,
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable (partitioned by time)
SELECT create_hypertable('telemetry', 'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_plant
    ON telemetry (tenant, plant, ts DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_line_machine
    ON telemetry (line, machine, ts DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_metric
    ON telemetry (metric, ts DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_composite
    ON telemetry (tenant, plant, line, machine, metric, ts DESC);

-- Continuous aggregate for KPIs (optional, for production scale)
-- This pre-computes 1-minute rollups for faster KPI queries

CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', ts) AS bucket,
    tenant,
    plant,
    line,
    machine,
    metric,
    AVG(value) AS avg_value,
    MIN(value) AS min_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count
FROM telemetry
GROUP BY bucket, tenant, plant, line, machine, metric
WITH NO DATA;

-- Refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('telemetry_1m',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE
);

-- Retention policy (keep 30 days of raw data)
SELECT add_retention_policy('telemetry', INTERVAL '30 days', if_not_exists => TRUE);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO vsf;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO vsf;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Virtual Smart Factory database initialized successfully';
END $$;
