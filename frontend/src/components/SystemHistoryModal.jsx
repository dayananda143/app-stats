import { useEffect, useState } from 'react';

export default function SystemHistoryModal({ token, onClose }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('cpu');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    fetch('/api/system/history', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(rows => { setData(rows); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const tabs = [
    { key: 'cpu',  label: 'CPU %',    unit: '%',  color: '#3b82f6', getValue: d => d.cpu },
    { key: 'ram',  label: 'RAM (GB)', unit: 'GB', color: '#8b5cf6', getValue: d => +(d.mem_used / 1024 / 1024 / 1024).toFixed(2) },
    { key: 'temp', label: 'Temp °C',  unit: '°C', color: '#f97316', getValue: d => d.temp },
  ];
  const current = tabs.find(t => t.key === tab);
  const values = data.filter(d => current.getValue(d) !== null).map(current.getValue);
  const timestamps = data.filter(d => current.getValue(d) !== null).map(d => d.ts);

  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const latest = values.length ? values[values.length - 1] : null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="font-semibold text-white">System History <span className="text-slate-500 font-normal text-sm">24h</span></h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none px-1">×</button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          {/* Tab buttons */}
          <div className="flex gap-2">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${tab === t.key ? 'border-indigo-600 bg-indigo-900/40 text-indigo-300' : 'border-slate-700 text-slate-400 hover:text-white'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-slate-400 text-center py-16">Loading…</div>
          ) : data.length === 0 ? (
            <div className="text-slate-500 text-center py-16 text-sm">No history yet — data is recorded once per minute.</div>
          ) : (
            <>
              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Current', val: latest },
                  { label: 'Min',     val: min },
                  { label: 'Avg',     val: avg },
                  { label: 'Max',     val: max },
                ].map(s => (
                  <div key={s.label} className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center">
                    <div className="text-xs text-slate-400 mb-1">{s.label}</div>
                    <div className="text-sm font-semibold text-white">
                      {s.val !== null && s.val !== undefined ? `${s.val.toFixed(1)}${current.unit}` : '—'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                <TimeSeriesChart data={values} timestamps={timestamps} color={current.color} unit={current.unit} min={min} max={max} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TimeSeriesChart({ data, timestamps, color, unit, min, max }) {
  if (!data || data.length < 2) return <div className="text-slate-500 text-center py-8 text-sm">Not enough data yet.</div>;

  const W = 500, H = 120, PAD = { top: 8, right: 8, bottom: 24, left: 36 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;
  const range = max - min || 1;
  const pad = range * 0.1;
  const yMin = Math.max(0, min - pad), yMax = max + pad;

  const toX = i => PAD.left + (i / (data.length - 1)) * iW;
  const toY = v => PAD.top + iH - ((v - yMin) / (yMax - yMin)) * iH;

  const pts = data.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const area = `${PAD.left},${PAD.top + iH} ` + pts + ` ${PAD.left + iW},${PAD.top + iH}`;

  const yTicks = 4;
  const xTicks = 6;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', height: 140 }}>
      {/* Y grid + labels */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = yMin + ((yMax - yMin) * i) / yTicks;
        const y = toY(val);
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={PAD.left + iW} y2={y} stroke="#334155" strokeWidth="1" />
            <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#64748b">{val.toFixed(1)}</text>
          </g>
        );
      })}

      {/* X time labels */}
      {Array.from({ length: xTicks + 1 }, (_, i) => {
        const idx = Math.round((i / xTicks) * (data.length - 1));
        const x = toX(idx);
        const ts = timestamps[idx];
        const label = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return (
          <text key={i} x={x} y={H - 4} textAnchor="middle" fontSize="9" fill="#64748b">{label}</text>
        );
      })}

      {/* Area fill */}
      <polygon points={area} fill={color} fillOpacity="0.12" />
      {/* Line */}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
