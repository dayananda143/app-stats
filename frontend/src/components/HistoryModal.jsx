import { useEffect, useState } from 'react';

async function downloadExport(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : 'export';
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export default function HistoryModal({ name, token, onClose }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('cpu');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    fetch(`/api/processes/${encodeURIComponent(name)}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(rows => { setData(rows); setLoading(false); })
      .catch(() => setLoading(false));
  }, [name, token]);

  const values = tab === 'cpu' ? data.map(d => d.cpu) : data.map(d => d.memory);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-slate-900 dark:text-white">{name}</h2>
            <span className="text-xs text-slate-600 dark:text-slate-400">24h history</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 text-xs">
              {[['cpu', 'CPU %'], ['mem', 'Memory']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-1 ${tab === key ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {!loading && data.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => downloadExport(`/api/export/process/${encodeURIComponent(name)}?format=csv`, token)}
                  className="text-xs px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
                >CSV</button>
                <button
                  onClick={() => downloadExport(`/api/export/process/${encodeURIComponent(name)}?format=json`, token)}
                  className="text-xs px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
                >JSON</button>
              </div>
            )}
            <button onClick={onClose} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl leading-none px-1">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          {loading ? (
            <div className="text-slate-600 dark:text-slate-400 text-center py-10">Loading…</div>
          ) : data.length < 2 ? (
            <div className="text-slate-500 dark:text-slate-500 text-center py-10 text-sm">
              Not enough data yet.<br />Check back in a few minutes.
            </div>
          ) : (
            <>
              <TimeSeriesChart
                data={data}
                getY={tab === 'cpu' ? d => d.cpu : d => d.memory}
                color={tab === 'cpu' ? '#3b82f6' : '#8b5cf6'}
                yFormatter={tab === 'cpu' ? v => `${v.toFixed(0)}%` : v => formatBytes(v)}
                maxY={tab === 'cpu' ? 100 : undefined}
              />
              <StatsSummary
                values={values}
                formatter={tab === 'cpu' ? v => `${v.toFixed(1)}%` : v => formatBytes(v)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsSummary({ values, formatter }) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return (
    <div className="grid grid-cols-3 gap-3">
      {[['Min', min], ['Avg', avg], ['Max', max]].map(([label, val]) => (
        <div key={label} className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-600 dark:text-slate-400">{label}</div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{formatter(val)}</div>
        </div>
      ))}
    </div>
  );
}

function TimeSeriesChart({ data, getY, color, yFormatter, maxY: forcedMaxY }) {
  const W = 560, H = 120;
  const PAD = { top: 10, right: 8, bottom: 24, left: 48 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const tFirst = data[0].ts, tLast = data[data.length - 1].ts;
  const tRange = Math.max(tLast - tFirst, 1);
  const rawMax = Math.max(...data.map(getY), 0.001);
  const maxY = forcedMaxY || rawMax;

  const toX = ts => PAD.left + ((ts - tFirst) / tRange) * cW;
  const toY = v => PAD.top + cH - Math.min(v / maxY, 1) * cH;

  const linePoints = data.map(d => `${toX(d.ts).toFixed(1)},${toY(getY(d)).toFixed(1)}`).join(' ');
  const baseline = PAD.top + cH;
  const areaPoints = `${toX(data[0].ts).toFixed(1)},${baseline} ${linePoints} ${toX(data[data.length - 1].ts).toFixed(1)},${baseline}`;

  const hourMs = 3600000;
  const tRangeH = tRange / hourMs;
  const tickEvery = tRangeH > 20 ? 6 * hourMs : tRangeH > 8 ? 2 * hourMs : hourMs;
  const timeTicks = [];
  let t = Math.ceil(tFirst / tickEvery) * tickEvery;
  while (t <= tLast) { timeTicks.push({ t, x: toX(t) }); t += tickEvery; }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    y: toY(maxY * f),
    label: yFormatter ? yFormatter(maxY * f) : (maxY * f).toFixed(0),
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-slate-200/40 dark:bg-slate-950/40" style={{ height: `${H}px` }}>
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={tick.y} x2={W - PAD.right} y2={tick.y} stroke="#1e293b" strokeWidth="1" />
          <text x={PAD.left - 4} y={tick.y + 3.5} textAnchor="end" fontSize="8.5" fill="#475569">{tick.label}</text>
        </g>
      ))}
      {timeTicks.map((tick, i) => (
        <g key={i}>
          <line x1={tick.x} y1={PAD.top} x2={tick.x} y2={PAD.top + cH} stroke="#1e293b" strokeWidth="1" />
          <text x={tick.x} y={H - 5} textAnchor="middle" fontSize="8.5" fill="#475569">
            {new Date(tick.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </text>
        </g>
      ))}
      <polygon points={areaPoints} fill={color} opacity="0.12" />
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
