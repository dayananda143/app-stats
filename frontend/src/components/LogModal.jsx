import { useEffect, useRef, useState, useCallback } from 'react';

export default function LogModal({ name, token, onClose }) {
  const [logs, setLogs] = useState({ out: [], err: [] });
  const [tab, setTab] = useState('out');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const [search, setSearch] = useState('');
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const pollerRef = useRef(null);
  const lastCountRef = useRef({ out: 0, err: 0 });

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const fetchLogs = useCallback(async (initial = false) => {
    try {
      const res = await fetch(`/api/processes/${encodeURIComponent(name)}/logs?lines=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLogs(prev => {
        const outNew = data.out?.length !== lastCountRef.current.out;
        const errNew = data.err?.length !== lastCountRef.current.err;
        lastCountRef.current = { out: data.out?.length || 0, err: data.err?.length || 0 };
        return (outNew || errNew || initial) ? data : prev;
      });
      if (initial) setLoading(false);
    } catch { if (initial) setLoading(false); }
  }, [name, token]);

  useEffect(() => {
    fetchLogs(true);
  }, [fetchLogs]);

  useEffect(() => {
    if (!streaming) { clearInterval(pollerRef.current); return; }
    pollerRef.current = setInterval(() => fetchLogs(false), 2000);
    return () => clearInterval(pollerRef.current);
  }, [streaming, fetchLogs]);

  // Auto-scroll to bottom when new lines arrive (only if streaming)
  useEffect(() => {
    if (streaming) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, tab, streaming]);

  const downloadLog = async (type) => {
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/processes/${encodeURIComponent(name)}/logs/download?type=${type}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${name}-${type}.log`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
    setDownloading(false);
  };

  const allLines = tab === 'out' ? logs.out || [] : logs.err || [];
  const lines = search ? allLines.filter(l => l.toLowerCase().includes(search.toLowerCase())) : allLines;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-white">{name}</h2>
            {streaming && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
              <button onClick={() => setTab('out')} className={`px-3 py-1 ${tab === 'out' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                stdout ({logs.out?.length || 0})
              </button>
              <button onClick={() => setTab('err')} className={`px-3 py-1 ${tab === 'err' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                stderr ({logs.err?.length || 0})
              </button>
            </div>
            <button
              onClick={() => setStreaming(s => !s)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${streaming ? 'border-emerald-700 bg-emerald-900/30 text-emerald-400' : 'border-slate-600 bg-slate-800 text-slate-400'}`}
            >
              {streaming ? '⏸ Pause' : '▶ Resume'}
            </button>
            <button
              onClick={() => downloadLog(tab)}
              disabled={downloading || loading}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-600 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-50 transition-colors"
            >
              {downloading ? '…' : '↓ Download'}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none px-1">×</button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-4 py-2 border-b border-slate-700">
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter logs…"
              className="flex-1 bg-transparent text-xs text-slate-300 placeholder-slate-600 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-300 text-xs">
                ✕ <span className="text-slate-600">{lines.length}/{allLines.length}</span>
              </button>
            )}
          </div>
        </div>

        {/* Log body */}
        <div ref={containerRef} className="flex-1 overflow-y-auto overscroll-contain p-4 font-mono text-xs bg-slate-950 rounded-b-2xl">
          {loading ? (
            <div className="text-slate-400 text-center py-8">Loading logs…</div>
          ) : lines.length === 0 ? (
            <div className="text-slate-500 text-center py-8">No log lines found.</div>
          ) : (
            <div className="space-y-0.5">
              {lines.map((line, i) => <LogLine key={i} line={line} isErr={tab === 'err'} />)}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogLine({ line, isErr }) {
  const isError = isErr || /error|Error|ERRO|fatal|FATAL/i.test(line);
  const isWarn = /warn|WARN/i.test(line);
  const isInfo = /info|INFO/i.test(line);
  const color = isError ? 'text-red-400' : isWarn ? 'text-yellow-400' : isInfo ? 'text-blue-400' : 'text-slate-300';
  return <div className={`${color} leading-5 break-all whitespace-pre-wrap`}>{line}</div>;
}
