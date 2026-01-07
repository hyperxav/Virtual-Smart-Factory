'use client';

export default function Architecture() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">System Architecture</h1>
        <p className="text-gray-400 mt-1">
          Edge-to-Cloud IoT solution design and component overview
        </p>
      </div>

      {/* Architecture Diagram */}
      <div className="bg-factory-card rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Data Flow Diagram</h2>
        <div className="overflow-x-auto">
          <pre className="text-sm text-gray-300 font-mono whitespace-pre">
{`
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EDGE (Factory Site)                                 │
│  ┌─────────────┐     ┌──────────────────────────────────────────────────────┐   │
│  │             │     │                    Edge Agent                         │   │
│  │  Simulated  │     │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │   │
│  │  Machines   │────▶│  │  Telemetry  │  │   SQLite    │  │    Cloud     │  │   │
│  │             │     │  │  Generator  │─▶│   Buffer    │─▶│   Uploader   │  │   │
│  │  • 3 Lines  │     │  └─────────────┘  └─────────────┘  └──────┬───────┘  │   │
│  │  • 9 Machines│     │         │                                  │         │   │
│  │  • 6 Metrics │     │         ▼                                  │         │   │
│  └─────────────┘     │  ┌─────────────┐                           │         │   │
│                      │  │    MQTT     │◀── Commands ───────────────┼─────────┼───┤
│                      │  │  Publisher  │                           │         │   │
│                      │  └─────────────┘                           │         │   │
│                      └────────────────────────────────────────────┼─────────┘   │
│                                                                    │             │
│  ┌─────────────────────────┐                                      │             │
│  │     Mosquitto MQTT      │                                      │             │
│  │    (Message Broker)     │                                      │             │
│  └─────────────────────────┘                                      │             │
└───────────────────────────────────────────────────────────────────┼─────────────┘
                                                                    │
                                          HTTP POST /ingest         │
                                          (Store-and-Forward)       │
                                                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLOUD (SaaS Platform)                               │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                            FastAPI Service                               │    │
│  │                                                                          │    │
│  │   POST /ingest ──────▶ Idempotent Write (UUID dedupe)                   │    │
│  │   GET  /kpis   ──────▶ Real-time Aggregations                           │    │
│  │   GET  /series ──────▶ Time-bucketed Queries                            │    │
│  │   POST /fault  ──────▶ Fault Command Generator                          │    │
│  │                                                                          │    │
│  └──────────────────────────────────┬──────────────────────────────────────┘    │
│                                     │                                            │
│                                     ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         TimescaleDB                                       │   │
│  │                                                                           │   │
│  │   • Hypertable: telemetry (time-partitioned)                             │   │
│  │   • Continuous Aggregate: telemetry_1m (pre-computed rollups)            │   │
│  │   • Retention Policy: 30 days                                            │   │
│  │                                                                           │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                     │                                            │
│                                     ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         Next.js Dashboard                                 │   │
│  │                                                                           │   │
│  │   • Real-time KPI tiles (5s polling)                                     │   │
│  │   • Interactive time-series charts                                        │   │
│  │   • Architecture documentation                                            │   │
│  │   • Demo script guide                                                     │   │
│  │                                                                           │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
`}
          </pre>
        </div>
      </div>

      {/* Component Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Edge Components */}
        <div className="bg-factory-card rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
            <span className="text-2xl mr-2">🏭</span> Edge Components
          </h2>
          <div className="space-y-4 text-gray-300">
            <div>
              <h3 className="font-semibold text-factory-accent">MQTT Broker (Mosquitto)</h3>
              <p className="text-sm mt-1">
                Local message broker for telemetry distribution. Enables decoupled
                communication between edge agent and potential local consumers.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-factory-accent">Edge Agent (Python)</h3>
              <p className="text-sm mt-1">
                Core edge component that simulates 9 machines across 3 production lines.
                Generates telemetry every 2 seconds with realistic noise and fault modes.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-factory-accent">SQLite Buffer</h3>
              <p className="text-sm mt-1">
                Local store-and-forward buffer. All points are persisted before cloud
                upload, ensuring zero data loss during network outages.
              </p>
            </div>
          </div>
        </div>

        {/* Cloud Components */}
        <div className="bg-factory-card rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
            <span className="text-2xl mr-2">☁️</span> Cloud Components
          </h2>
          <div className="space-y-4 text-gray-300">
            <div>
              <h3 className="font-semibold text-factory-accent">FastAPI Service</h3>
              <p className="text-sm mt-1">
                RESTful API for telemetry ingestion and analytics queries. Features
                idempotent writes using UUID primary keys for safe retries.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-factory-accent">TimescaleDB</h3>
              <p className="text-sm mt-1">
                Time-series optimized PostgreSQL. Uses hypertables for automatic
                time-partitioning and continuous aggregates for efficient KPI queries.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-factory-accent">Next.js Dashboard</h3>
              <p className="text-sm mt-1">
                Modern React dashboard with real-time updates via SWR polling.
                Responsive design with Tailwind CSS and Recharts visualization.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Key Design Decisions */}
      <div className="bg-factory-card rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
          <span className="text-2xl mr-2">🔑</span> Key Design Decisions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-300">
          <div>
            <h3 className="font-semibold text-factory-warning mb-2">Store-and-Forward</h3>
            <p className="text-sm">
              Every telemetry point is persisted to SQLite before cloud upload.
              During network outages, points accumulate locally. When connectivity
              resumes, buffered points are backfilled in chronological order.
              This ensures zero data loss for critical industrial data.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-factory-warning mb-2">Idempotent Ingestion</h3>
            <p className="text-sm">
              Each point has a UUID that serves as the primary key. The database
              uses ON CONFLICT DO NOTHING, making retries safe. Duplicate points
              from backfill are silently ignored, preventing data duplication.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-factory-warning mb-2">Multi-Tenant Topic Schema</h3>
            <p className="text-sm">
              MQTT topics follow: v1/{'{tenant}'}/{'{plant}'}/{'{line}'}/{'{machine}'}/{'{metric}'}.
              This hierarchical structure enables fine-grained subscriptions
              and scales to multiple factories with tenant isolation.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-factory-warning mb-2">Time-Series Optimization</h3>
            <p className="text-sm">
              TimescaleDB hypertables automatically partition data by time.
              Continuous aggregates pre-compute 1-minute rollups for fast KPI
              queries. Retention policies automatically prune old data.
            </p>
          </div>
        </div>
      </div>

      {/* Tech Stack */}
      <div className="bg-factory-card rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
          <span className="text-2xl mr-2">🛠️</span> Technology Stack
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: 'Python 3.11', role: 'Edge Agent' },
            { name: 'Mosquitto', role: 'MQTT Broker' },
            { name: 'SQLite', role: 'Edge Buffer' },
            { name: 'FastAPI', role: 'Cloud API' },
            { name: 'TimescaleDB', role: 'Time-Series DB' },
            { name: 'Next.js 14', role: 'Dashboard' },
            { name: 'Tailwind CSS', role: 'Styling' },
            { name: 'Docker', role: 'Containerization' },
          ].map((tech) => (
            <div key={tech.name} className="text-center p-3 bg-factory-dark rounded-lg">
              <div className="text-white font-semibold">{tech.name}</div>
              <div className="text-gray-500 text-sm">{tech.role}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Considerations */}
      <div className="bg-factory-card rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
          <span className="text-2xl mr-2">🔒</span> Security Considerations (Production)
        </h2>
        <ul className="text-gray-300 space-y-2 text-sm">
          <li className="flex items-start">
            <span className="text-factory-accent mr-2">•</span>
            <span>Enable MQTT authentication and TLS encryption</span>
          </li>
          <li className="flex items-start">
            <span className="text-factory-accent mr-2">•</span>
            <span>Add API authentication (JWT/OAuth2) for cloud endpoints</span>
          </li>
          <li className="flex items-start">
            <span className="text-factory-accent mr-2">•</span>
            <span>Implement rate limiting on ingestion endpoint</span>
          </li>
          <li className="flex items-start">
            <span className="text-factory-accent mr-2">•</span>
            <span>Use connection pooling for database connections</span>
          </li>
          <li className="flex items-start">
            <span className="text-factory-accent mr-2">•</span>
            <span>Deploy edge agent with principle of least privilege</span>
          </li>
          <li className="flex items-start">
            <span className="text-factory-accent mr-2">•</span>
            <span>Enable audit logging for all data mutations</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
