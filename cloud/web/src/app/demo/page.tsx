'use client';

import { useState } from 'react';

export default function DemoScript() {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(id);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const CommandBlock = ({
    id,
    title,
    command,
    description,
  }: {
    id: string;
    title: string;
    command: string;
    description: string;
  }) => (
    <div className="bg-factory-dark rounded-lg p-4 border border-gray-600">
      <div className="flex items-center justify-between mb-2">
        <span className="text-factory-accent font-semibold">{title}</span>
        <button
          onClick={() => copyToClipboard(command, id)}
          className="text-xs px-2 py-1 bg-factory-card rounded hover:bg-gray-600 transition-colors"
        >
          {copiedCommand === id ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap break-all">
        {command}
      </pre>
      <p className="text-gray-500 text-sm mt-2">{description}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Demo Script</h1>
        <p className="text-gray-400 mt-1">
          Step-by-step guide for showcasing the Virtual Smart Factory
        </p>
      </div>

      {/* Quick Start */}
      <div className="bg-factory-card rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
          <span className="text-2xl mr-2">🚀</span> Quick Start
        </h2>
        <div className="space-y-4">
          <CommandBlock
            id="cloud"
            title="1. Start Cloud Stack"
            command="cd cloud && docker compose up --build -d"
            description="Starts TimescaleDB, FastAPI, and the web dashboard"
          />
          <CommandBlock
            id="edge"
            title="2. Start Edge Stack"
            command="cd edge && docker compose up --build"
            description="Starts Mosquitto MQTT broker and the edge agent"
          />
          <CommandBlock
            id="dashboard"
            title="3. Open Dashboard"
            command="open http://localhost:3000"
            description="Opens the web dashboard (or visit manually)"
          />
        </div>
      </div>

      {/* Demo Checklist */}
      <div className="bg-factory-card rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
          <span className="text-2xl mr-2">✅</span> Interview Demo Checklist
        </h2>
        <div className="space-y-3 text-gray-300">
          {[
            'Show dashboard with live KPIs updating (5s interval)',
            'Explain the edge-to-cloud data flow using Architecture page',
            'Demonstrate bearing fault injection → watch temp/vibration spike',
            'Demonstrate energy spike → watch energy KPI change',
            'Demonstrate network outage → show store-and-forward buffering',
            'Restore network → show backfill completing (buffer drains)',
            'Show API docs at /docs (FastAPI auto-generated)',
            'Explain idempotency with UUID primary keys',
            'Discuss production considerations (auth, TLS, scaling)',
          ].map((item, i) => (
            <label key={i} className="flex items-start cursor-pointer group">
              <input type="checkbox" className="mt-1 mr-3 accent-factory-accent" />
              <span className="group-hover:text-white transition-colors">{item}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Fault Injection Commands */}
      <div className="bg-factory-card rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
          <span className="text-2xl mr-2">⚡</span> Fault Injection Commands
        </h2>
        <p className="text-gray-400 mb-4">
          Use these commands to trigger fault scenarios. Run from the <code className="text-factory-accent">edge</code> directory
          or any machine with mosquitto-clients installed.
        </p>

        <div className="space-y-6">
          {/* Bearing Fault */}
          <div>
            <h3 className="text-lg font-semibold text-factory-warning mb-3">
              🔥 Bearing Fault (Temperature + Vibration Spike)
            </h3>
            <div className="grid gap-3">
              <CommandBlock
                id="bearing-on"
                title="Enable Bearing Fault"
                command={`mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" -m '{"cmd":"bearing_fault","value":true}'`}
                description="Simulates a failing bearing: temperature rises 15-25°C, vibration increases 5-10 mm/s"
              />
              <CommandBlock
                id="bearing-off"
                title="Disable Bearing Fault"
                command={`mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" -m '{"cmd":"bearing_fault","value":false}'`}
                description="Returns to normal operation"
              />
            </div>
          </div>

          {/* Energy Spike */}
          <div>
            <h3 className="text-lg font-semibold text-factory-warning mb-3">
              ⚡ Energy Spike
            </h3>
            <div className="grid gap-3">
              <CommandBlock
                id="energy-on"
                title="Enable Energy Spike"
                command={`mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" -m '{"cmd":"energy_spike","value":true}'`}
                description="Simulates abnormal power draw: energy consumption multiplied by 2.5-4x"
              />
              <CommandBlock
                id="energy-off"
                title="Disable Energy Spike"
                command={`mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" -m '{"cmd":"energy_spike","value":false}'`}
                description="Returns to normal energy consumption"
              />
            </div>
          </div>

          {/* Network Outage */}
          <div>
            <h3 className="text-lg font-semibold text-factory-warning mb-3">
              🌐 Network Outage (Store-and-Forward Demo)
            </h3>
            <div className="grid gap-3">
              <CommandBlock
                id="network-on"
                title="Simulate Network Outage"
                command={`mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" -m '{"cmd":"network_outage","value":true}'`}
                description="Edge agent stops sending to cloud, points buffer locally in SQLite"
              />
              <CommandBlock
                id="network-off"
                title="Restore Network"
                command={`mosquitto_pub -h localhost -t "v1/acme/plant-01/cmd" -m '{"cmd":"network_outage","value":false}'`}
                description="Backfill begins: buffered points sent to cloud in chronological order"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Talking Points */}
      <div className="bg-factory-card rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
          <span className="text-2xl mr-2">💬</span> Interview Talking Points
        </h2>
        <div className="space-y-4 text-gray-300">
          <div>
            <h3 className="font-semibold text-factory-accent">Store-and-Forward Pattern</h3>
            <p className="text-sm mt-1">
              &quot;Industrial environments have unreliable networks. The edge agent persists every
              data point to SQLite before attempting cloud upload. During outages, data
              accumulates locally. When connectivity returns, we backfill in order,
              ensuring zero data loss. The UUID-based idempotency means duplicate sends
              during backfill are safely ignored.&quot;
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-factory-accent">Idempotent Ingestion</h3>
            <p className="text-sm mt-1">
              &quot;Each telemetry point has a UUID generated at the edge. The cloud database
              uses this as the primary key with ON CONFLICT DO NOTHING. This makes
              retries safe and enables at-least-once delivery semantics without
              duplicating data.&quot;
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-factory-accent">Multi-Tenant Topic Design</h3>
            <p className="text-sm mt-1">
              &quot;The MQTT topic hierarchy (v1/tenant/plant/line/machine/metric) enables
              fine-grained subscriptions. A plant manager could subscribe to their
              entire plant while a line operator subscribes to just their line.
              The v1 prefix allows for schema evolution.&quot;
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-factory-accent">Time-Series Optimization</h3>
            <p className="text-sm mt-1">
              &quot;TimescaleDB hypertables automatically partition data by time, making
              time-range queries efficient. Continuous aggregates pre-compute rollups
              for dashboards. Retention policies automatically prune old data,
              preventing unbounded growth.&quot;
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-factory-accent">Production Readiness</h3>
            <p className="text-sm mt-1">
              &quot;For production, I&apos;d add: MQTT authentication with TLS, API auth via
              JWT/OAuth2, rate limiting on ingestion, connection pooling, horizontal
              scaling with multiple edge agents, and observability with metrics/tracing.&quot;
            </p>
          </div>
        </div>
      </div>

      {/* Useful Links */}
      <div className="bg-factory-card rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
          <span className="text-2xl mr-2">🔗</span> Useful Links
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 bg-factory-dark rounded-lg hover:bg-gray-700 transition-colors"
          >
            <div className="text-factory-accent font-semibold">API Documentation</div>
            <div className="text-gray-500 text-sm">FastAPI auto-generated OpenAPI docs</div>
          </a>
          <a
            href="http://localhost:8000/health"
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 bg-factory-dark rounded-lg hover:bg-gray-700 transition-colors"
          >
            <div className="text-factory-accent font-semibold">Health Check</div>
            <div className="text-gray-500 text-sm">API and database health status</div>
          </a>
          <a
            href="http://localhost:8000/stats"
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 bg-factory-dark rounded-lg hover:bg-gray-700 transition-colors"
          >
            <div className="text-factory-accent font-semibold">Database Stats</div>
            <div className="text-gray-500 text-sm">Total points, lines, machines</div>
          </a>
          <a
            href="http://localhost:8000/kpis"
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 bg-factory-dark rounded-lg hover:bg-gray-700 transition-colors"
          >
            <div className="text-factory-accent font-semibold">Raw KPI Data</div>
            <div className="text-gray-500 text-sm">JSON response from /kpis endpoint</div>
          </a>
        </div>
      </div>
    </div>
  );
}
