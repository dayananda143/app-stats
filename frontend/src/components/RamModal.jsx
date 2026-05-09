import { useEffect, useState } from 'react';

export default function RamModal({ system, token, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/system/ram-processes', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const total = system.memory?.total || 1;
  const used = system.memory?.used || 0;
  const free = system.memory?.free || 0;
  const available = data?.memAvailable || (total - used);
  const buffCache = total - used - free;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="font-semibold text-white">RAM Usage</h2>
            <p className="text-xs text-slate-400 mt-0.5">Top processes by memory</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="text-xs px-3 py-1 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600"
            >
              Refresh
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none px-1">×</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Summary bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Memory breakdown — {formatBytes(total)} total</span>
              <span className="text-violet-400 font-medium">{system.memory?.percent}% used</span>
            </div>
            {/* Stacked bar */}
            <div className="h-4 bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-violet-600 transition-all duration-500"
                style={{ width: `${(used / total) * 100}%` }}
                title={`Used: ${formatBytes(used)}`}
              />
              <div
                className="h-full bg-slate-600 transition-all duration-500"
                style={{ width: `${(buffCache / total) * 100}%` }}
                title={`Buff/Cache: ${formatBytes(buffCache)}`}
              />
            </div>
            <div className="flex gap-4 text-xs">
              <LegendDot color="bg-violet-500" label="Used" value={formatBytes(used)} />
              <LegendDot color="bg-slate-500" label="Buff/Cache" value={formatBytes(buffCache)} />
              <LegendDot color="bg-slate-700 border border-slate-600" label="Available" value={formatBytes(available)} valueClass="text-emerald-400" />
            </div>
          </div>

          {/* Process list */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">By Process</div>
            {loading ? (
              <div className="text-slate-400 text-sm text-center py-8">Loading...</div>
            ) : !data?.processes?.length ? (
              <div className="text-slate-500 text-sm text-center py-8">No data</div>
            ) : (
              <div className="space-y-2">
                {data.processes.map((proc, i) => (
                  <ProcessRow key={i} proc={proc} total={total} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcessRow({ proc, total }) {
  const pct = Math.min((proc.rss / total) * 100, 100);
  const color = pct > 15 ? 'bg-red-500' : pct > 8 ? 'bg-yellow-500' : pct > 3 ? 'bg-violet-500' : 'bg-slate-500';

  return (
    <div className="flex items-center gap-3 group">
      <div className="w-32 shrink-0">
        <div className="text-sm text-white font-medium truncate">{proc.name}</div>
        <div className="text-xs text-slate-500">
          {proc.count > 1 ? `${proc.count} processes` : `PID ${proc.pids[0]}`}
          {proc.cpu > 0 && <span className="ml-1.5 text-blue-400">{proc.cpu.toFixed(1)}% cpu</span>}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-2 rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="text-sm font-medium text-slate-300 w-16 text-right shrink-0">
        {formatBytes(proc.rss)}
      </div>
    </div>
  );
}

function LegendDot({ color, label, value, valueClass = 'text-slate-300' }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
      <span className="text-slate-400">{label}:</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
