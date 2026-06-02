import { useState } from 'react';

const TYPE_STYLES = {
  LAN:       { badge: 'bg-blue-900/40 text-blue-300 border-blue-800',       dot: 'bg-blue-400'     },
  WiFi:      { badge: 'bg-cyan-900/40 text-cyan-300 border-cyan-800',       dot: 'bg-cyan-400'     },
  Tailscale: { badge: 'bg-violet-900/40 text-violet-300 border-violet-800', dot: 'bg-violet-400'   },
  VPN:       { badge: 'bg-amber-900/40 text-amber-300 border-amber-800',    dot: 'bg-amber-400'    },
  Other:     { badge: 'bg-slate-100/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600',    dot: 'bg-slate-400'    },
};

function CopyableIp({ ip }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(ip).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      title="Copy IP"
      className="font-mono text-sm text-slate-900 dark:text-white hover:text-indigo-300 transition-colors"
    >
      {copied ? <span className="text-emerald-400 text-xs">✓ copied</span> : ip}
    </button>
  );
}

export default function ConnectivityCard({ system }) {
  if (!system) return null;
  const { publicIp, interfaces = [] } = system;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
      <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3">Connectivity</div>
      <div className="space-y-2.5">

        {/* Public IP */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-xs text-slate-600 dark:text-slate-400 shrink-0">Public</span>
          </div>
          <div className="flex items-center gap-2">
            {publicIp
              ? <CopyableIp ip={publicIp} />
              : <span className="text-xs text-slate-500 dark:text-slate-500">Detecting…</span>}
            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-900/30 text-emerald-300 border-emerald-800 shrink-0">WAN</span>
          </div>
        </div>

        {interfaces.length > 0 && <div className="border-t border-slate-200/60 dark:border-slate-700/60" />}

        {/* Local interfaces */}
        {interfaces.map(iface => {
          const s = TYPE_STYLES[iface.type] || TYPE_STYLES.Other;
          return (
            <div key={iface.name} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                <span className="text-xs text-slate-600 dark:text-slate-400 truncate">{iface.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CopyableIp ip={iface.ip} />
                <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${s.badge}`}>{iface.type}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
