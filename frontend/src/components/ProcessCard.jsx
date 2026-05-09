import { useEffect, useMemo, useRef, useState } from 'react';

const STATUS_COLORS = {
  online: 'bg-emerald-400',
  stopped: 'bg-slate-500',
  stopping: 'bg-yellow-400',
  launching: 'bg-blue-400',
  errored: 'bg-red-400',
  'one-launch': 'bg-purple-400',
};

function detectMemLeak(history) {
  if (!history || history.length < 30) return false;
  const mems = history.map(h => h.mem);
  const half = Math.floor(mems.length / 2);
  const firstAvg = mems.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const lastAvg  = mems.slice(-half).reduce((a, b) => a + b, 0) / half;
  const minRecent = Math.min(...mems.slice(-half));
  return lastAvg > firstAvg * 1.2 && minRecent > firstAvg * 0.95;
}

export default function ProcessCard({ proc, actionState, onRestart, onStop, onStart, onLogs, onHistory, token }) {
  const isOnline = proc.status === 'online';
  const isStopped = proc.status === 'stopped' || proc.status === 'errored';
  const loading = !!actionState;

  const cpuHistory = useMemo(() => (proc.history || []).map(h => h.cpu), [proc.history]);
  const memHistory = useMemo(() => (proc.history || []).map(h => h.mem), [proc.history]);
  const hasMemLeak = useMemo(() => detectMemLeak(proc.history), [proc.history]);

  // Inline note editor
  const [note, setNote] = useState(proc.note || '');
  const [editingNote, setEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const noteRef = useRef(null);

  useEffect(() => {
    if (!editingNote) setNote(proc.note || '');
  }, [proc.note, editingNote]);

  const saveNote = async (val) => {
    setSavingNote(true);
    try {
      const existing = await fetch('/api/notes', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      await fetch('/api/notes', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...existing, [proc.name]: val }),
      });
    } catch {}
    setSavingNote(false);
    setEditingNote(false);
  };

  return (
    <div className={`bg-slate-800 rounded-xl border p-4 flex flex-col gap-3 transition-colors ${hasMemLeak ? 'border-yellow-700 hover:border-yellow-600' : 'border-slate-700 hover:border-slate-600'}`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-white truncate">{proc.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${
              isOnline
                ? 'border-emerald-800 bg-emerald-900/40 text-emerald-400'
                : 'border-slate-600 bg-slate-700 text-slate-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[proc.status] || 'bg-slate-400'}`} />
              {proc.status}
            </span>
            {proc.port && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-slate-600 bg-slate-700/50 text-slate-400">
                :{proc.port}
              </span>
            )}
            {proc.dbSize && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-indigo-800 bg-indigo-900/30 text-indigo-400" title={`${proc.dbSize.type} database`}>
                DB {formatBytes(proc.dbSize.bytes)}
              </span>
            )}
            {hasMemLeak && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-yellow-700 bg-yellow-900/30 text-yellow-400" title="Memory usage has been steadily increasing">
                ⚠ mem leak?
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            <span>PID {proc.pid || '—'}</span>
            <span>ID #{proc.pmId}</span>
            {proc.execMode && proc.execMode !== 'fork_mode' && (
              <span className="text-violet-400">{proc.execMode}</span>
            )}
          </div>
          {proc.link && (
            <a
              href={proc.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1 text-xs text-indigo-400 hover:text-indigo-300 hover:underline truncate max-w-full"
              onClick={e => e.stopPropagation()}
            >
              {proc.link.replace('https://', '')}
            </a>
          )}
        </div>
        <div className="text-xs text-slate-500 text-right shrink-0">
          <div>{proc.restarts} restarts</div>
          {isOnline && proc.uptime && (
            <div className="text-slate-400">{formatUptime(Date.now() - proc.uptime)}</div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <StatBlock
          label="CPU"
          value={`${(proc.cpu || 0).toFixed(1)}%`}
          percent={proc.cpu || 0}
          color="bg-blue-500"
          history={cpuHistory}
          sparkColor="#3b82f6"
          active={isOnline}
        />
        <StatBlock
          label="Memory"
          value={formatBytes(proc.memory || 0)}
          percent={((proc.memory || 0) / (512 * 1024 * 1024)) * 100}
          color="bg-violet-500"
          history={memHistory}
          sparkColor="#8b5cf6"
          active={isOnline}
        />
      </div>

      {/* Note */}
      <div className="text-xs">
        {editingNote ? (
          <textarea
            ref={noteRef}
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={() => saveNote(note)}
            onKeyDown={e => e.key === 'Escape' && (setEditingNote(false), setNote(proc.note || ''))}
            placeholder="Add a note…"
            rows={2}
            className="w-full bg-slate-900 border border-indigo-700 rounded-lg px-2 py-1.5 text-slate-300 placeholder-slate-600 focus:outline-none resize-none text-xs"
            autoFocus
          />
        ) : (
          <div
            className="flex items-start gap-1.5 cursor-pointer group"
            onClick={() => setEditingNote(true)}
          >
            <span className="text-slate-600 group-hover:text-slate-400 transition-colors mt-0.5">✎</span>
            <span className={note ? 'text-slate-400' : 'text-slate-600 group-hover:text-slate-500 italic'}>
              {savingNote ? 'Saving…' : note || 'Add note…'}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-slate-700 flex-wrap">
        {isOnline && (
          <ActionBtn onClick={onRestart} disabled={loading} className="bg-amber-900/40 text-amber-400 hover:bg-amber-900/70 border-amber-800">
            {actionState === 'restart' ? '…' : 'Restart'}
          </ActionBtn>
        )}
        {isOnline && (
          <ActionBtn onClick={onStop} disabled={loading} className="bg-red-900/40 text-red-400 hover:bg-red-900/70 border-red-800">
            {actionState === 'stop' ? '…' : 'Stop'}
          </ActionBtn>
        )}
        {isStopped && (
          <ActionBtn onClick={onStart} disabled={loading} className="bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/70 border-emerald-800">
            {actionState === 'start' ? '…' : 'Start'}
          </ActionBtn>
        )}
        <ActionBtn onClick={onHistory} disabled={loading} className="bg-slate-700 text-slate-300 hover:bg-slate-600 border-slate-600">
          History
        </ActionBtn>
        <ActionBtn onClick={onLogs} disabled={loading} className="bg-slate-700 text-slate-300 hover:bg-slate-600 border-slate-600 ml-auto">
          Logs
        </ActionBtn>
        {proc.link && (
          <a
            href={proc.link}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 text-xs font-medium rounded-md border border-indigo-800 bg-indigo-900/40 text-indigo-400 hover:bg-indigo-900/70 transition-colors"
          >
            Open ↗
          </a>
        )}
      </div>
    </div>
  );
}

function StatBlock({ label, value, percent, color, history, sparkColor, active }) {
  const clampedPercent = Math.min(Math.max(percent, 0), 100);
  return (
    <div className="bg-slate-900/50 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className={`text-sm font-medium ${active ? 'text-white' : 'text-slate-500'}`}>{value}</span>
      </div>
      <div className="h-1 bg-slate-700 rounded-full mb-2">
        <div className={`h-1 rounded-full transition-all duration-500 ${color}`} style={{ width: `${clampedPercent}%` }} />
      </div>
      <Sparkline data={history} color={sparkColor} width={80} height={20} />
    </div>
  );
}

function Sparkline({ data, color = '#3b82f6', width = 80, height = 20 }) {
  if (!data || data.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...data, 0.001);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * height * 0.9 + height * 0.05;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

function ActionBtn({ children, onClick, disabled, className }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(ms) {
  if (ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
