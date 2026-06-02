import { useEffect, useState } from 'react';

export default function DiskModal({ system, token, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/disk/breakdown', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const total = system?.disk?.size || 1;
  const used  = system?.disk?.used || 0;
  const free  = system?.disk?.free || 0;
  const pct   = system?.disk?.use  || 0;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Disk Usage</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Largest directories in /home/raspbi</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="text-xs px-3 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600">
              Refresh
            </button>
            <button onClick={onClose} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl leading-none px-1">×</button>
          </div>
        </div>

        <div className="overflow-y-auto overscroll-contain flex-1 p-5 space-y-5">
          {/* Summary */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
              <span>{formatBytes(total)} total · SD Card</span>
              <span className="text-emerald-400 font-medium">{pct}% used</span>
            </div>
            <div className="h-4 bg-white dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className={`h-full transition-all duration-500 ${pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-sm ${pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-emerald-500'}`} />
                <span className="text-slate-600 dark:text-slate-400">Used:</span>
                <span className="text-slate-700 dark:text-slate-300">{formatBytes(used)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600" />
                <span className="text-slate-600 dark:text-slate-400">Free:</span>
                <span className="text-emerald-400">{formatBytes(free)}</span>
              </div>
            </div>
          </div>

          {/* Directory list */}
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3">By Directory</div>
            {loading ? (
              <div className="text-slate-600 dark:text-slate-400 text-sm text-center py-8">Scanning...</div>
            ) : !data?.entries?.length ? (
              <div className="text-slate-500 dark:text-slate-500 text-sm text-center py-8">No data</div>
            ) : (
              <div className="space-y-2">
                {data.entries.map((entry, i) => (
                  <DiskRow key={i} entry={entry} total={total} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiskRow({ entry, total }) {
  const pct = Math.min((entry.bytes / total) * 100, 100);
  const color = pct > 20 ? 'bg-red-500' : pct > 10 ? 'bg-yellow-500' : pct > 3 ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-500';
  const isDotfile = entry.name.startsWith('.');

  return (
    <div className="flex items-center gap-3">
      <div className="w-36 shrink-0">
        <div className={`text-sm font-medium truncate ${isDotfile ? 'text-slate-600 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
          {entry.name}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-500 truncate">{entry.path}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-2 bg-white dark:bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-2 rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="text-sm font-medium text-slate-700 dark:text-slate-300 w-16 text-right shrink-0">
        {formatBytes(entry.bytes)}
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
