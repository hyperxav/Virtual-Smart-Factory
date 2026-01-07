'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

interface KPIData {
  period_minutes: number;
  avg_temp: number | null;
  avg_vibration_rms: number | null;
  avg_energy_kw: number | null;
  total_good_count: number | null;
  total_bad_count: number | null;
  fault_count: number;
  total_points: number;
  timestamp: string;
}

interface TimeSeriesPoint {
  bucket: string;
  avg_value: number;
  min_value: number;
  max_value: number;
  count: number;
}

interface TimeSeriesData {
  metric: string;
  points: TimeSeriesPoint[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function KPICard({
  title,
  value,
  unit,
  icon,
  status = 'normal',
}: {
  title: string;
  value: string | number | null;
  unit: string;
  icon: string;
  status?: 'normal' | 'warning' | 'danger';
}) {
  const statusColors = {
    normal: 'text-factory-success',
    warning: 'text-factory-warning',
    danger: 'text-factory-danger',
  };

  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className={`text-3xl font-bold ${statusColors[status]}`}>
        {value !== null ? value : '—'}
      </div>
      <div className="text-gray-500 text-sm">{unit}</div>
    </div>
  );
}

function StatusIndicator({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center space-x-2">
      <div
        className={`w-3 h-3 rounded-full ${
          connected ? 'bg-factory-success status-pulse' : 'bg-factory-danger'
        }`}
      />
      <span className={connected ? 'text-factory-success' : 'text-factory-danger'}>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const [selectedMetric, setSelectedMetric] = useState('temp');

  // Fetch KPIs every 5 seconds
  const { data: kpis, error: kpiError } = useSWR<KPIData>(
    `${API_BASE}/kpis?minutes=10`,
    fetcher,
    { refreshInterval: 5000 }
  );

  // Fetch time series every 5 seconds
  const { data: series, error: seriesError } = useSWR<TimeSeriesData>(
    `${API_BASE}/series?metric=${selectedMetric}&minutes=30&bucket_seconds=10`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const isConnected = !kpiError && kpis && kpis.total_points > 0;

  // Format chart data
  const chartData =
    series?.points.map((p) => ({
      time: new Date(p.bucket).toLocaleTimeString(),
      value: p.avg_value,
      min: p.min_value,
      max: p.max_value,
    })) || [];

  // Determine status based on values
  const getTempStatus = (temp: number | null) => {
    if (temp === null) return 'normal';
    if (temp > 80) return 'danger';
    if (temp > 65) return 'warning';
    return 'normal';
  };

  const getVibrationStatus = (vib: number | null) => {
    if (vib === null) return 'normal';
    if (vib > 8) return 'danger';
    if (vib > 5) return 'warning';
    return 'normal';
  };

  const getEnergyStatus = (energy: number | null) => {
    if (energy === null) return 'normal';
    if (energy > 100) return 'danger';
    if (energy > 60) return 'warning';
    return 'normal';
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Factory Dashboard</h1>
          <p className="text-gray-400 mt-1">Real-time KPIs from 3 production lines</p>
        </div>
        <StatusIndicator connected={isConnected} />
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Avg Temperature"
          value={kpis?.avg_temp?.toFixed(1)}
          unit="°C"
          icon="🌡️"
          status={getTempStatus(kpis?.avg_temp ?? null)}
        />
        <KPICard
          title="Avg Vibration"
          value={kpis?.avg_vibration_rms?.toFixed(2)}
          unit="mm/s RMS"
          icon="📳"
          status={getVibrationStatus(kpis?.avg_vibration_rms ?? null)}
        />
        <KPICard
          title="Avg Energy"
          value={kpis?.avg_energy_kw?.toFixed(1)}
          unit="kW"
          icon="⚡"
          status={getEnergyStatus(kpis?.avg_energy_kw ?? null)}
        />
        <KPICard
          title="Fault Events"
          value={kpis?.fault_count ?? 0}
          unit="in last 10 min"
          icon="⚠️"
          status={kpis?.fault_count ? 'danger' : 'normal'}
        />
      </div>

      {/* Production Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Good Units"
          value={kpis?.total_good_count ?? 0}
          unit="produced"
          icon="✅"
        />
        <KPICard
          title="Bad Units"
          value={kpis?.total_bad_count ?? 0}
          unit="rejected"
          icon="❌"
          status={(kpis?.total_bad_count ?? 0) > 50 ? 'warning' : 'normal'}
        />
        <KPICard
          title="Data Points"
          value={kpis?.total_points ?? 0}
          unit="ingested"
          icon="📊"
        />
      </div>

      {/* Time Series Chart */}
      <div className="chart-container">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Metric Trend (Last 30 min)</h2>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="bg-factory-dark border border-gray-600 text-white rounded px-3 py-1"
          >
            <option value="temp">Temperature</option>
            <option value="vibration_rms">Vibration</option>
            <option value="energy_kw">Energy</option>
          </select>
        </div>
        <div className="h-80">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="time"
                  stroke="#9ca3af"
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#fff' }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#colorValue)"
                  name={selectedMetric}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-4xl mb-2">📈</div>
                <p>Waiting for data...</p>
                <p className="text-sm mt-1">Start the edge agent to see metrics</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats Footer */}
      <div className="text-center text-gray-500 text-sm">
        <p>
          Last updated: {kpis?.timestamp ? new Date(kpis.timestamp).toLocaleString() : '—'}
        </p>
        <p className="mt-1">
          Tenant: <span className="text-gray-400">acme</span> | Plant:{' '}
          <span className="text-gray-400">plant-01</span>
        </p>
      </div>
    </div>
  );
}
