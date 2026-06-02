import { useEffect, useMemo, useRef, useState } from 'react';

const STATUS_COLORS = {
  online: 'bg-emerald-400',
  stopped: 'bg-slate-300 dark:bg-slate-500',
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

const displayName = (name) => name.replace(/-backend$/, '');

export default function ProcessCard({ proc, actionState, onRestart, onStop, onStart, onLogs, onHistory, token }) {
  const isOnline = proc.status === 'online';
  const isStopped = proc.status === 'stopped' || proc.status === 'errored';
  const loading = !!actionState;

  const cpuHistory = useMemo(() => (proc.history || []).map(h => h.cpu), [proc.history]);
  const memHistory = useMemo(() => (proc.history || []).map(h => h.mem), [proc.history]);
  const hasMemLeak = useMemo(() => detectMemLeak(proc.history), [proc.history]);

  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('collapsed-' + proc.name) || 'false'); } catch { return false; }
  });
  const [note, setNote] = useState(proc.note || '');
  const [editingNote, setEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('collapsed-' + proc.name, JSON.stringify(next));
  };

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
    <div className={`bg-white dark:bg-slate-800 rounded-xl border p-3 sm:p-4 flex flex-col gap-3 transition-colors ${hasMemLeak ? 'border-yellow-200 dark:border-yellow-700' : 'border-slate-200 dark:border-slate-700'}`}>

      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate max-w-[140px] sm:max-w-none">{displayName(proc.name)}</h3>
            <span className={`text-xs px-1.5 py-0.5 rounded-full border flex items-center gap-1 shrink-0 ${
              isOnline
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-400'
                : 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[proc.status] || 'bg-slate-400'}`} />
              {proc.status}
            </span>
            {proc.port && (
              <span className="text-xs px-1.5 py-0.5 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-100/50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 shrink-0">
                :{proc.port}
              </span>
            )}
            {proc.dbSize && (
              <span className="text-xs px-1.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-400 shrink-0">
                DB {formatBytes(proc.dbSize.bytes)}
              </span>
            )}
            {hasMemLeak && (
              <span className="text-xs px-1.5 py-0.5 rounded-full border border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-400 shrink-0">
                ⚠ leak?
              </span>
            )}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-500">
            <span>PID {proc.pid || '—'}</span>
            <span>#{proc.pmId}</span>
          </div>

          {/* Link */}
          {proc.link && (
            <a
              href={proc.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1 text-xs text-indigo-400 hover:underline truncate max-w-full"
              onClick={e => e.stopPropagation()}
            >
              {proc.link.replace('https://', '')}
            </a>
          )}
        </div>

        {/* Right: restarts + uptime + collapse */}
        <div className="flex items-start gap-2 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-500 text-right">
            <div>{proc.restarts}↺</div>
            {isOnline && proc.uptime && (
              <div className="text-slate-600 dark:text-slate-400">{formatUptime(Date.now() - proc.uptime)}</div>
            )}
          </div>
          <button onClick={toggleCollapsed} className="text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
          label="RAM"
          value={formatBytes(proc.memory || 0)}
          percent={((proc.memory || 0) / (512 * 1024 * 1024)) * 100}
          color="bg-violet-500"
          history={memHistory}
          sparkColor="#8b5cf6"
          active={isOnline}
        />
      </div>}

      {/* Note */}
      {!collapsed && <div className="text-xs">
        {editingNote ? (
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={() => saveNote(note)}
            onKeyDown={e => e.key === 'Escape' && (setEditingNote(false), setNote(proc.note || ''))}
            placeholder="Add a note…"
            rows={2}
            className="w-full bg-gray-50 dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none resize-none text-xs"
            autoFocus
          />
        ) : (
          <div
            className="flex items-start gap-1.5 cursor-pointer min-h-[28px] py-1"
            onClick={() => setEditingNote(true)}
          >
            <span className="text-slate-500 dark:text-slate-600 mt-0.5">✎</span>
            <span className={note ? 'text-slate-600 dark:text-slate-400' : 'text-slate-500 dark:text-slate-600 italic'}>
              {savingNote ? 'Saving…' : note || 'Add note…'}
            </span>
          </div>
        )}
      </div>}

      {/* Actions */}
      <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
        {confirmAction ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-700 dark:text-slate-300 flex-1">
              {confirmAction === 'restart' && 'Restart '}
              {confirmAction === 'stop' && 'Stop '}
              {confirmAction === 'start' && 'Start '}
              <span className="font-semibold text-slate-900 dark:text-white">{displayName(proc.name)}</span>?
            </span>
            <button
              onClick={() => {
                setConfirmAction(null);
                if (confirmAction === 'restart') onRestart();
                else if (confirmAction === 'stop') onStop();
                else if (confirmAction === 'start') onStart();
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-slate-900 dark:text-white transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmAction(null)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-1.5 sm:gap-2 flex-wrap">
            {isOnline && (
              <ActionBtn onClick={() => setConfirmAction('restart')} disabled={loading} className="bg-amber-100 dark:bg-amber-900/40 text-amber-400 border-amber-200 dark:border-amber-800 active:bg-amber-200 dark:active:bg-amber-900/80">
                {actionState === 'restart' ? '…' : 'Restart'}
              </ActionBtn>
            )}
            {isOnline && (
              <ActionBtn onClick={() => setConfirmAction('stop')} disabled={loading} className="bg-red-100 dark:bg-red-900/40 text-red-400 border-red-200 dark:border-red-800 active:bg-red-200 dark:active:bg-red-900/80">
                {actionState === 'stop' ? '…' : 'Stop'}
              </ActionBtn>
            )}
            {isStopped && (
              <ActionBtn onClick={() => setConfirmAction('start')} disabled={loading} className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-400 border-emerald-200 dark:border-emerald-800 active:bg-emerald-200 dark:active:bg-emerald-900/80">
                {actionState === 'start' ? '…' : 'Start'}
              </ActionBtn>
            )}
            <ActionBtn onClick={onHistory} disabled={loading} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600">
              History
            </ActionBtn>
            <ActionBtn onClick={onLogs} disabled={loading} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 ml-auto">
              Logs
            </ActionBtn>
            {proc.link && (
              <a
                href={proc.link}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-400 active:bg-indigo-200 dark:active:bg-indigo-900/80 transition-colors"
              >
                Open ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBlock({ label, value, percent, color, history, sparkColor, active }) {
  const clampedPercent = Math.min(Math.max(percent, 0), 100);
  return (
    <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500 dark:text-slate-500">{label}</span>
        <span className={`text-xs font-medium ${active ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-500'}`}>{value}</span>
      </div>
      <div className="h-1 bg-slate-100 dark:bg-slate-700 rounded-full mb-2">
        <div className={`h-1 rounded-full transition-all duration-500 ${color}`} style={{ width: `${clampedPercent}%` }} />
      </div>
      {/* Responsive sparkline — fills full width */}
      <Sparkline data={history} color={sparkColor} />
    </div>
  );
}

function Sparkline({ data, color = '#3b82f6' }) {
  if (!data || data.length < 2) return <svg width="100%" height="20" />;
  const W = 100, H = 20;
  const max = Math.max(...data, 0.001);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (v / max) * H * 0.9 + H * 0.05;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

function ActionBtn({ children, onClick, disabled, className }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
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
