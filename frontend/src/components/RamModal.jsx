import { useEffect, useState } from 'react';

export default function RamModal({ system, token, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/system/ram-processes', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  async function killProcess(pids) {
    const r = await fetch('/api/system/kill-process', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pids }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Kill failed');
    setTimeout(load, 600);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

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
      <div className="bg-gray-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">RAM Usage</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">All processes by memory</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="text-xs px-3 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600"
            >
              Refresh
            </button>
            <button onClick={onClose} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl leading-none px-1">×</button>
          </div>
        </div>

        <div className="overflow-y-auto overscroll-contain flex-1 p-5 space-y-5">
          {/* Summary bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
              <span>Memory breakdown — {formatBytes(total)} total</span>
              <span className="text-violet-400 font-medium">{system.memory?.percent}% used</span>
            </div>
            {/* Stacked bar */}
            <div className="h-4 bg-white dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-violet-600 transition-all duration-500"
                style={{ width: `${(used / total) * 100}%` }}
                title={`Used: ${formatBytes(used)}`}
              />
              <div
                className="h-full bg-slate-200 dark:bg-slate-600 transition-all duration-500"
                style={{ width: `${(buffCache / total) * 100}%` }}
                title={`Buff/Cache: ${formatBytes(buffCache)}`}
              />
            </div>
            <div className="flex gap-4 text-xs">
              <LegendDot color="bg-violet-500" label="Used" value={formatBytes(used)} />
              <LegendDot color="bg-slate-300 dark:bg-slate-500" label="Buff/Cache" value={formatBytes(buffCache)} />
              <LegendDot color="bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600" label="Available" value={formatBytes(available)} valueClass="text-emerald-400" />
            </div>
          </div>

          {/* Process list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                By Process {data?.processes && <span className="text-slate-500 dark:text-slate-500 normal-case font-normal">({data.processes.length} total)</span>}
              </div>
            </div>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter processes..."
              className="w-full mb-3 px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
            />
            {loading ? (
              <div className="text-slate-600 dark:text-slate-400 text-sm text-center py-8">Loading...</div>
            ) : !data?.processes?.length ? (
              <div className="text-slate-500 dark:text-slate-500 text-sm text-center py-8">No data</div>
            ) : (
              <div className="space-y-2">
                {data.processes
                  .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
                  .map((proc, i) => (
                    <ProcessRow key={i} proc={proc} total={total} onKill={killProcess} />
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KillDialog({ name, pids, onConfirm, onCancel }) {
  const [killing, setKilling] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setKilling(true);
    setError(null);
    try {
      await onConfirm(pids);
      onCancel();
    } catch (e) {
      setError(e.message || 'Kill failed');
      setKilling(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={() => !killing && onCancel()}
    >
      <div
        className="bg-gray-50 dark:bg-slate-900 border border-red-200 dark:border-red-800/60 rounded-2xl p-5 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-700 flex items-center justify-center text-red-400 text-sm font-bold shrink-0">!</span>
          <h3 className="text-slate-900 dark:text-white font-semibold">Force Kill Process</h3>
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-sm mb-1">
          Kill <span className="text-slate-900 dark:text-white font-semibold">{name}</span>?
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">
          {pids.length === 1 ? `PID ${pids[0]}` : `${pids.length} PIDs: ${pids.slice(0, 5).join(', ')}${pids.length > 5 ? '…' : ''}`}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-600 mb-4">This will send SIGKILL. Any unsaved state will be lost.</p>
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={killing}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={killing}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-700 hover:bg-red-600 text-slate-900 dark:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {killing ? 'Killing…' : 'Force Kill'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProcessRow({ proc, total, onKill }) {
  const [expanded, setExpanded] = useState(false);
  const [killTarget, setKillTarget] = useState(null);
  const pct = Math.min((proc.rss / total) * 100, 100);
  const color = pct > 15 ? 'bg-red-500' : pct > 8 ? 'bg-yellow-500' : pct > 3 ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-500';
  const canExpand = proc.count > 1;

  return (
    <div>
      <div
        className={`flex items-center gap-3 ${canExpand ? 'cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg px-1 -mx-1' : ''}`}
        onClick={() => canExpand && setExpanded(e => !e)}
      >
        <div className="w-32 shrink-0">
          <div className="flex items-center gap-1">
            {canExpand && (
              <span className="text-slate-500 dark:text-slate-500 text-xs w-3">{expanded ? '▾' : '▸'}</span>
            )}
            <div className="text-sm text-slate-900 dark:text-white font-medium truncate">{proc.name}</div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-500 pl-4">
            {proc.count > 1 ? `${proc.count} processes` : `PID ${proc.pids[0]}`}
            {proc.cpu > 0 && <span className="ml-1.5 text-blue-400">{proc.cpu.toFixed(1)}% cpu</span>}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="h-2 bg-white dark:bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-2 rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 w-16 text-right shrink-0">
          {formatBytes(proc.rss)}
        </div>
        <button
          onClick={e => { e.stopPropagation(); setKillTarget({ name: proc.name, pids: proc.pids }); }}
          className="text-xs px-2 py-0.5 rounded border border-red-200 dark:border-red-800/70 bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors shrink-0 ml-1"
          title="Force kill"
        >
          Kill
        </button>
      </div>

      {expanded && (
        <div className="ml-4 mt-1 mb-1 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
          {proc.items.sort((a, b) => b.rss - a.rss).map(item => (
            <div key={item.pid} className="flex items-center gap-3 py-0.5">
              <div className="w-28 shrink-0">
                <div className="text-xs text-slate-600 dark:text-slate-400 font-mono">PID {item.pid}</div>
                <div className="text-xs text-slate-500 dark:text-slate-600 truncate">{item.cmd}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="h-1.5 bg-white dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full ${color} opacity-60`}
                    style={{ width: `${Math.min((item.rss / proc.rss) * pct, 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.cpu > 0 && <span className="text-xs text-blue-400">{item.cpu.toFixed(1)}%</span>}
                <span className="text-xs text-slate-600 dark:text-slate-400 w-14 text-right">{formatBytes(item.rss)}</span>
                <button
                  onClick={() => setKillTarget({ name: `${proc.name} (PID ${item.pid})`, pids: [item.pid] })}
                  className="text-xs px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800/70 bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors shrink-0"
                  title="Force kill this PID"
                >
                  Kill
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {killTarget && (
        <KillDialog
          name={killTarget.name}
          pids={killTarget.pids}
          onConfirm={onKill}
          onCancel={() => setKillTarget(null)}
        />
      )}
    </div>
  );
}

function LegendDot({ color, label, value, valueClass = 'text-slate-700 dark:text-slate-300' }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
      <span className="text-slate-600 dark:text-slate-400">{label}:</span>
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
