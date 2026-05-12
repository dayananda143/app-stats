import { useEffect, useRef, useState } from 'react';

export default function LogModal({ name, token, onClose }) {
  const [logs, setLogs] = useState({ out: [], err: [] });
  const [tab, setTab] = useState('out');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const bottomRef = useRef(null);

  // Prevent background scroll on iOS while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/processes/${encodeURIComponent(name)}/logs?lines=150`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { setLogs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [name, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [logs, tab]);

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
      a.href = url;
      a.download = `${name}-${type}.log`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
    setDownloading(false);
  };

  const lines = tab === 'out' ? logs.out || [] : logs.err || [];

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-white">{name}</h2>
            <span className="text-xs text-slate-400">logs</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
              <button
                onClick={() => setTab('out')}
                className={`px-3 py-1 ${tab === 'out' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                stdout ({logs.out?.length || 0})
              </button>
              <button
                onClick={() => setTab('err')}
                className={`px-3 py-1 ${tab === 'err' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                stderr ({logs.err?.length || 0})
              </button>
            </div>
            <button
              onClick={() => downloadLog(tab)}
              disabled={downloading || loading}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-600 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-50 transition-colors"
              title={`Download full ${tab === 'out' ? 'stdout' : 'stderr'} log`}
            >
              {downloading ? '…' : '↓ Download'}
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-xl leading-none px-1"
            >
              ×
            </button>
          </div>
        </div>

        {/* Log body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 font-mono text-xs bg-slate-950 rounded-b-2xl">
          {loading ? (
            <div className="text-slate-400 text-center py-8">Loading logs…</div>
          ) : lines.length === 0 ? (
            <div className="text-slate-500 text-center py-8">No log lines found.</div>
          ) : (
            <div className="space-y-0.5">
              {lines.map((line, i) => (
                <LogLine key={i} line={line} isErr={tab === 'err'} />
              ))}
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

  const color = isError
    ? 'text-red-400'
    : isWarn
    ? 'text-yellow-400'
    : isInfo
    ? 'text-blue-400'
    : 'text-slate-300';

  return (
    <div className={`${color} leading-5 break-all whitespace-pre-wrap`}>
      {line}
    </div>
  );
}
