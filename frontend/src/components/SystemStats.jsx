import { useState } from 'react';

export default function SystemStats({ system, onRamClick, onHistoryClick, token }) {
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
        <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">System</h2>
        <div className="flex items-center gap-2">
          <button onClick={onHistoryClick} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
            History
          </button>
          <button
            onClick={clearCache}
            disabled={clearing}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
              cleared
                ? 'border-emerald-700 bg-emerald-900/30 text-emerald-400'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {clearing ? 'Clearing…' : cleared ? '✓ Cleared' : 'Clear Cache'}
          </button>
        </div>
      </div>

      {/* Main stats — 2-col on mobile, 5-col on desktop. Uptime spans 2 cols on mobile. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        <GaugeCard
          label="CPU"
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
        {/* Uptime: full-width on mobile (col-span-2) so it doesn't sit orphaned */}
        <div className="col-span-2 sm:col-span-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 flex sm:block items-center gap-4">
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Uptime</div>
            <div className="text-sm font-semibold text-cyan-400">{formatUptime(system.uptime)}</div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-500">{system.hostname || ''}</div>
        </div>
      </div>

      {/* Secondary stats — 2 cols on mobile, 4 on sm+ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-2 sm:mt-3">
        <CompactCard label="Network">
          {system.network ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-cyan-400 font-medium">↓ {formatSpeed(system.network.rxBps)}</span>
              <span className="text-violet-400 font-medium">↑ {formatSpeed(system.network.txBps)}</span>
            </div>
          ) : <span className="text-slate-500 dark:text-slate-500">—</span>}
        </CompactCard>

        <CompactCard label="Disk I/O">
          {system.disk_io ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-emerald-400 font-medium">R {formatSpeed(system.disk_io.readBps)}</span>
              <span className="text-amber-400 font-medium">W {formatSpeed(system.disk_io.writeBps)}</span>
            </div>
          ) : <span className="text-slate-500 dark:text-slate-500">—</span>}
        </CompactCard>

        <CompactCard label="nginx">
          {system.nginx ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-emerald-400 font-medium">{system.nginx.active} conn</span>
              <span className="text-slate-500 dark:text-slate-500 text-xs">R:{system.nginx.reading} W:{system.nginx.writing}</span>
            </div>
          ) : <span className="text-slate-500 dark:text-slate-500">—</span>}
        </CompactCard>

        <CompactCard label="Pi">
          {system.throttle ? (
            <span className={`font-medium ${system.throttle.ok ? 'text-emerald-400' : 'text-orange-400'}`}>
              {system.throttle.ok ? '✓ OK' : '⚠ Warn'}
            </span>
          ) : <span className="text-slate-500 dark:text-slate-500">—</span>}
        </CompactCard>
      </div>
    </div>
  );
}

function CompactCard({ label, children }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-2 sm:p-3">
      <div className="text-xs text-slate-600 dark:text-slate-400 mb-1.5">{label}</div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

function GaugeCard({ label, value, subValue, percent, color, textColor, onClick, clickable }) {
  const clamp = Math.min(Math.max(percent || 0, 0), 100);
  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 transition-colors ${clickable ? 'cursor-pointer active:bg-slate-200 dark:active:bg-slate-750 hover:border-violet-500' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
        {clickable && <span className="text-xs text-slate-500 dark:text-slate-500">↗</span>}
      </div>
      <div className={`text-sm font-semibold ${textColor} mb-1.5 sm:mb-2`}>{subValue || value}</div>
      {subValue && <div className="text-xs text-slate-500 dark:text-slate-500 mb-1.5 hidden sm:block">{value}</div>}
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
        <div className={`h-1.5 rounded-full transition-all duration-700 ${color}`} style={{ width: `${clamp}%` }} />
      </div>
    </div>
  );
}

function TempCard({ temp }) {
  const color = temp === null ? 'text-slate-500 dark:text-slate-500'
    : temp >= 80 ? 'text-red-400'
    : temp >= 70 ? 'text-orange-400'
    : temp >= 60 ? 'text-yellow-400'
    : 'text-emerald-400';
  const barColor = temp === null ? 'bg-slate-200 dark:bg-slate-600'
    : temp >= 80 ? 'bg-red-500'
    : temp >= 70 ? 'bg-orange-500'
    : temp >= 60 ? 'bg-yellow-500'
    : 'bg-emerald-500';
  const warning = temp !== null && temp >= 80;
  const pct = temp !== null ? Math.min((temp / 100) * 100, 100) : 0;
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border p-3 sm:p-4 transition-colors ${warning ? 'border-red-700' : 'border-slate-200 dark:border-slate-700'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-600 dark:text-slate-400">Temp</span>
        {warning && <span className="text-xs text-red-400 animate-pulse">HOT</span>}
      </div>
      <div className={`text-sm font-semibold ${color} mb-1.5 sm:mb-2`}>
        {temp !== null ? `${temp}°C` : '—'}
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
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
  if (bps < 1024) return `${bps}B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)}KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)}MB/s`;
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
