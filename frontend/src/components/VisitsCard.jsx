import { useEffect, useState } from 'react';

const APP_COLORS = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-violet-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
];

function shortHost(host) {
  return host.replace(/\.money-matriz\.co\.in$/, '').replace(/\.co\.in$/, '');
}

export default function VisitsCard({ token }) {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(14);
  const [metric, setMetric] = useState('requests'); // 'requests' | 'unique_ips'
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/visits?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(rows => {
        if (!Array.isArray(rows)) { setError('No data'); return; }
        setData(rows);
        setError(null);
      })
      .catch(() => setError('Failed to load'));
  }, [days, token]);

  if (error) return null;
  if (!data) return null;
  if (data.length === 0) return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
      <p className="text-xs text-slate-500 dark:text-slate-500">No visit data yet — nginx log parsing starts now.</p>
    </div>
  );

  // Build: hosts[], dates[], matrix[host][date] = value
  const hosts = [...new Set(data.map(r => r.host))].filter(h => !h.includes('127.0.0.1'));
  const dates = [...new Set(data.map(r => r.date))].sort();
  const matrix = {};
  hosts.forEach(h => { matrix[h] = {}; });
  data.forEach(r => {
    if (matrix[r.host]) matrix[r.host][r.date] = r[metric];
  });

  // Totals per host (for sort + bar widths)
  const totals = hosts.map(h => ({ host: h, total: dates.reduce((s, d) => s + (matrix[h][d] || 0), 0) }));
  totals.sort((a, b) => b.total - a.total);
  const maxTotal = totals[0]?.total || 1;

  // Show last N dates as columns (cap at 10 for readability)
  const visibleDates = dates.slice(-10);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700/60 gap-2 flex-wrap">
        <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">App Visits</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
            {[['requests','Requests'],['unique_ips','Unique IPs']].map(([v, l]) => (
              <button key={v} onClick={() => setMetric(v)}
                className={`px-2.5 py-1 transition-colors ${metric === v ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-2.5 py-1 transition-colors ${days === d ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        {totals.map(({ host, total }, i) => {
          const color = APP_COLORS[i % APP_COLORS.length];
          const barPct = Math.round((total / maxTotal) * 100);
          const recentVals = visibleDates.map(d => matrix[host][d] || 0);
          const recentMax = Math.max(...recentVals, 1);

          return (
            <div key={host}>
              {/* App name + total bar */}
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate flex-1">{shortHost(host)}</span>
                <span className="text-xs text-slate-500 dark:text-slate-500 shrink-0">{total.toLocaleString()}</span>
              </div>
              {/* Mini spark bars for the last N days */}
              <div className="flex items-end gap-px h-8 pl-4">
                {recentVals.map((v, idx) => {
                  const h = recentMax > 0 ? Math.max(Math.round((v / recentMax) * 28), v > 0 ? 2 : 0) : 0;
                  return (
                    <div key={idx} title={`${visibleDates[idx]}: ${v}`}
                      className={`flex-1 rounded-sm transition-all ${color} opacity-80`}
                      style={{ height: `${h}px` }} />
                  );
                })}
              </div>
              {/* Date labels — only first and last */}
              {i === totals.length - 1 && visibleDates.length > 1 && (
                <div className="flex justify-between pl-4 mt-0.5">
                  <span className="text-[10px] text-slate-400 dark:text-slate-600">{visibleDates[0]?.slice(5)}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-600">{visibleDates[visibleDates.length - 1]?.slice(5)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
