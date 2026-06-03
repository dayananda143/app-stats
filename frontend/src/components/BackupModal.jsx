import { useState, useRef, useEffect } from 'react';

const TARGETS = [
  { key: 'portfolio',        label: 'Stock Portfolio', type: 'SQLite',     icon: '📈' },
  { key: 'expenses',         label: 'Expenses',        type: 'SQLite',     icon: '💰' },
  { key: 'app-stats',        label: 'App Stats',       type: 'SQLite',     icon: '📊' },
  { key: 'moneymatriz',      label: 'Money Matriz',    type: 'PostgreSQL', icon: '🏦' },
  { key: 'cooking-recipes',  label: 'Cooking Recipes', type: 'SQLite',     icon: '🍳' },
];

export default function BackupModal({ token, onClose }) {
  const [status, setStatus]   = useState({}); // { [key]: 'idle'|'running'|'ok'|'error' }
  const [logs, setLogs]       = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [lastRun, setLastRun] = useState({});
  const logRef = useRef(null);

  useEffect(() => {
    fetch('/api/backup/log', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setLastRun(d.lastRun || {})).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  async function runBackup(target) {
    setActiveKey(target);
    setLogs([]);
    setStatus(s => ({ ...s, [target]: 'running' }));

    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const data = part.replace(/^data: /, '').trim();
          if (!data) continue;
          try {
            const obj = JSON.parse(data);
            if (obj.line) setLogs(l => [...l, { text: obj.line, err: !!obj.isErr }]);
            if (obj.done) {
              const ok = obj.code === 0;
              setStatus(s => ({ ...s, [target]: ok ? 'ok' : 'error' }));
              if (ok) {
                fetch('/api/backup/log', { headers: { Authorization: `Bearer ${token}` } })
                  .then(r => r.json()).then(d => setLastRun(d.lastRun || {})).catch(() => {});
              }
            }
          } catch {}
        }
      }
    } catch (e) {
      setLogs(l => [...l, { text: `Error: ${e.message}`, err: true }]);
      setStatus(s => ({ ...s, [target]: 'error' }));
    }
  }

  const isRunning = Object.values(status).includes('running');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Database Backups</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Upload to Google Drive · Keep last 7</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {/* Backup All button */}
          <button
            disabled={isRunning}
            onClick={() => runBackup('all')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {status['all'] === 'running' ? (
              <><Spinner /> Backing up all…</>
            ) : (
              <><CloudIcon /> Backup All</>
            )}
          </button>

          {/* Individual targets */}
          <div className="grid grid-cols-1 gap-2">
            {TARGETS.map(t => {
              const s = status[t.key];
              const running = s === 'running';
              const ok      = s === 'ok';
              const err     = s === 'error';
              return (
                <div key={t.key} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${activeKey === t.key ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40'}`}>
                  <span className="text-xl shrink-0">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{t.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t.type}</p>
                    {lastRun[t.key] && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        Last: {fmtTs(lastRun[t.key])}
                      </p>
                    )}
                  </div>
                  {ok  && <span className="text-emerald-500 text-xs font-medium">✓ Done</span>}
                  {err && <span className="text-red-500 text-xs font-medium">✗ Failed</span>}
                  <button
                    disabled={isRunning}
                    onClick={() => runBackup(t.key)}
                    className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1"
                  >
                    {running ? <><Spinner />Running…</> : 'Backup'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Log output */}
          {logs.length > 0 && (
            <div ref={logRef} className="bg-slate-900 dark:bg-black rounded-xl p-3 h-40 overflow-y-auto font-mono text-xs space-y-0.5">
              {logs.map((l, i) => (
                <div key={i} className={l.err ? 'text-red-400' : 'text-slate-300'}>{l.text.trimEnd()}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtTs(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function Spinner() {
  return (
    <svg className="animate-spin w-3 h-3 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.068 5.952A4.5 4.5 0 0117.25 19.5H6.75z" />
    </svg>
  );
}
