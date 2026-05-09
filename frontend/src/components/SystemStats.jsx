import { useState } from 'react';

export default function SystemStats({ system, onRamClick, token }) {
  const memPercent = system.memory?.percent || 0;
  const diskPercent = system.disk?.use || 0;
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const clearCache = async () => {
    setClearing(true);
    setCleared(false);
    try {
      await fetch('/api/system/clear-cache', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setCleared(true);
      setTimeout(() => setCleared(false), 3000);
    } catch {}
    setClearing(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">System</h2>
        <button
          onClick={clearCache}
          disabled={clearing}
          className={`text-xs px-3 py-1 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            cleared
              ? 'border-emerald-700 bg-emerald-900/30 text-emerald-400'
              : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500 hover:text-white'
          }`}
        >
          {clearing ? 'Clearing…' : cleared ? '✓ Cache Cleared' : 'Clear RAM Cache'}
        </button>
      </div>

      {/* Main stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <GaugeCard
          label="CPU Load"
          value={`${system.cpu}%`}
          percent={system.cpu}
          color={system.cpu > 80 ? 'bg-red-500' : system.cpu > 50 ? 'bg-yellow-500' : 'bg-blue-500'}
          textColor={system.cpu > 80 ? 'text-red-400' : system.cpu > 50 ? 'text-yellow-400' : 'text-blue-400'}
        />
        <GaugeCard
          label="RAM"
          value={`${formatBytes(system.memory?.used)} / ${formatBytes(system.memory?.total)}`}
          subValue={`${memPercent}%`}
          percent={memPercent}
          color={memPercent > 85 ? 'bg-red-500' : memPercent > 70 ? 'bg-yellow-500' : 'bg-violet-500'}
          textColor={memPercent > 85 ? 'text-red-400' : memPercent > 70 ? 'text-yellow-400' : 'text-violet-400'}
          onClick={onRamClick}
          clickable
        />
        {system.disk && (
          <GaugeCard
            label="Disk"
            value={`${formatBytes(system.disk.used)} / ${formatBytes(system.disk.size)}`}
            subValue={`${system.disk.use}%`}
            percent={diskPercent}
            color={diskPercent > 90 ? 'bg-red-500' : diskPercent > 75 ? 'bg-yellow-500' : 'bg-emerald-500'}
            textColor={diskPercent > 90 ? 'text-red-400' : diskPercent > 75 ? 'text-yellow-400' : 'text-emerald-400'}
          />
        )}
        <TempCard temp={system.temp} />
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="text-xs text-slate-400 mb-1">Uptime</div>
          <div className="text-sm font-semibold text-cyan-400">{formatUptime(system.uptime)}</div>
          <div className="text-xs text-slate-500 mt-1">{system.hostname || ''}</div>
        </div>
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <NetworkCard network={system.network} />
        {system.nginx && <NginxCard nginx={system.nginx} />}
        <ThrottleCard throttle={system.throttle} />
      </div>
    </div>
  );
}

function NetworkCard({ network }) {
  if (!network) return null;
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <div className="text-xs text-slate-400 mb-2">Network I/O</div>
      <div className="flex gap-6">
        <div>
          <div className="text-xs text-slate-500 mb-0.5">↓ Down</div>
          <div className="text-sm font-semibold text-cyan-400">{formatSpeed(network.rxBps)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-0.5">↑ Up</div>
          <div className="text-sm font-semibold text-violet-400">{formatSpeed(network.txBps)}</div>
        </div>
      </div>
    </div>
  );
}

function NginxCard({ nginx }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <div className="text-xs text-slate-400 mb-2">nginx</div>
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-sm font-semibold text-emerald-400">{nginx.active}</span>
        <span className="text-xs text-slate-500">active connections</span>
      </div>
      <div className="flex gap-3 text-xs text-slate-500">
        <span>R: {nginx.reading}</span>
        <span>W: {nginx.writing}</span>
        <span>W8: {nginx.waiting}</span>
      </div>
      <div className="text-xs text-slate-600 mt-1">{nginx.requests.toLocaleString()} total req</div>
    </div>
  );
}

function ThrottleCard({ throttle }) {
  if (!throttle) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="text-xs text-slate-400 mb-2">Pi Status</div>
        <div className="text-xs text-slate-500">Throttle info unavailable</div>
      </div>
    );
  }

  const activeIssues = [
    throttle.underVoltage && 'Under-voltage',
    throttle.freqCapped && 'Freq capped',
    throttle.throttled && 'CPU throttled',
    throttle.softTempLimit && 'Temp limit',
  ].filter(Boolean);

  const pastIssues = [
    throttle.underVoltageOccurred && 'UV',
    throttle.freqCappedOccurred && 'FC',
    throttle.throttledOccurred && 'TH',
  ].filter(Boolean);

  return (
    <div className={`bg-slate-800 rounded-xl border p-4 ${throttle.ok ? 'border-slate-700' : 'border-orange-700'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400">Pi Status</span>
        <span className={`text-xs font-medium ${throttle.ok ? 'text-emerald-400' : 'text-orange-400'}`}>
          {throttle.ok ? '✓ OK' : '⚠ Warning'}
        </span>
      </div>
      {activeIssues.length > 0 ? (
        <div className="space-y-0.5">
          {activeIssues.map(issue => (
            <div key={issue} className="text-xs text-orange-400">{issue}</div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-500">No throttling detected</div>
      )}
      {pastIssues.length > 0 && (
        <div className="text-xs text-slate-600 mt-1">Past: {pastIssues.join(', ')}</div>
      )}
    </div>
  );
}

function GaugeCard({ label, value, subValue, percent, color, textColor, onClick, clickable }) {
  const clamp = Math.min(Math.max(percent || 0, 0), 100);
  return (
    <div
      className={`bg-slate-800 rounded-xl border border-slate-700 p-4 transition-colors ${clickable ? 'cursor-pointer hover:border-violet-500' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">{label}</span>
        {clickable && <span className="text-xs text-slate-500">↗</span>}
      </div>
      <div className={`text-sm font-semibold ${textColor} mb-2`}>{subValue || value}</div>
      {subValue && <div className="text-xs text-slate-500 mb-2">{value}</div>}
      <div className="h-1.5 bg-slate-700 rounded-full">
        <div className={`h-1.5 rounded-full transition-all duration-700 ${color}`} style={{ width: `${clamp}%` }} />
      </div>
    </div>
  );
}

function TempCard({ temp }) {
  const color = temp === null ? 'text-slate-500'
    : temp >= 80 ? 'text-red-400'
    : temp >= 70 ? 'text-orange-400'
    : temp >= 60 ? 'text-yellow-400'
    : 'text-emerald-400';

  const barColor = temp === null ? 'bg-slate-600'
    : temp >= 80 ? 'bg-red-500'
    : temp >= 70 ? 'bg-orange-500'
    : temp >= 60 ? 'bg-yellow-500'
    : 'bg-emerald-500';

  const warning = temp !== null && temp >= 80;
  const pct = temp !== null ? Math.min((temp / 100) * 100, 100) : 0;

  return (
    <div className={`bg-slate-800 rounded-xl border p-4 transition-colors ${warning ? 'border-red-700' : 'border-slate-700'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">CPU Temp</span>
        {warning && <span className="text-xs text-red-400 animate-pulse">HOT</span>}
      </div>
      <div className={`text-sm font-semibold ${color} mb-2`}>
        {temp !== null ? `${temp}°C` : '—'}
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full">
        <div className={`h-1.5 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatSpeed(bps) {
  if (!bps) return '0 B/s';
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
