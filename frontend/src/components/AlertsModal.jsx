import { useEffect, useState } from 'react';

const TYPE_CONFIG = {
  crash:        { label: 'Crash',        color: 'text-red-400',     bg: 'bg-red-900/30 border-red-800' },
  recovery:     { label: 'Recovery',     color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-800' },
  temp_high:    { label: 'Temp High',    color: 'text-orange-400',  bg: 'bg-orange-900/30 border-orange-800' },
  temp_ok:      { label: 'Temp OK',      color: 'text-blue-400',    bg: 'bg-blue-900/30 border-blue-800' },
  cpu_high:     { label: 'CPU High',     color: 'text-yellow-400',  bg: 'bg-yellow-900/30 border-yellow-800' },
  ram_high:     { label: 'RAM High',     color: 'text-purple-400',  bg: 'bg-purple-900/30 border-purple-800' },
  sys_ram_high: { label: 'Sys RAM High', color: 'text-red-400',     bg: 'bg-red-900/30 border-red-800' },
  sys_ram_ok:   { label: 'Sys RAM OK',   color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-800' },
  stuck:        { label: 'Stuck',        color: 'text-rose-400',    bg: 'bg-rose-900/30 border-rose-800' },
};

export default function AlertsModal({ token, onClose, onCleared }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch('/api/alerts?limit=200', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setAlerts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const clearAll = async () => {
    setClearing(true);
    await fetch('/api/alerts', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setAlerts([]);
    setClearing(false);
    onCleared?.();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-slate-900 dark:text-white">Alert History</h2>
            {!loading && <span className="text-xs text-slate-600 dark:text-slate-400">{alerts.length} total</span>}
          </div>
          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              <button
                onClick={clearAll}
                disabled={clearing}
                className="text-xs px-3 py-1 rounded-lg border border-red-800 bg-red-900/30 text-red-400 hover:bg-red-900/60 disabled:opacity-50 transition-colors"
              >
                {clearing ? 'Clearing…' : 'Clear All'}
              </button>
            )}
            <button onClick={onClose} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl leading-none px-1">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          {loading ? (
            <div className="text-slate-600 dark:text-slate-400 text-center py-10">Loading…</div>
          ) : alerts.length === 0 ? (
            <div className="text-slate-500 dark:text-slate-500 text-center py-10 text-sm">No alerts recorded.</div>
          ) : (
            <div className="space-y-2">
              {alerts.map(alert => {
                const cfg = TYPE_CONFIG[alert.type] || { label: alert.type, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600' };
                return (
                  <div key={alert.id} className="flex items-start gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className={`text-xs px-2 py-0.5 rounded border ${cfg.bg} ${cfg.color} shrink-0 mt-0.5 whitespace-nowrap`}>
                      {cfg.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-900 dark:text-white">{alert.title}</div>
                      {alert.detail && <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{alert.detail}</div>}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-500 shrink-0 text-right">
                      {new Date(alert.ts).toLocaleString([], {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
