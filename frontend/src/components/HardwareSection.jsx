import { useEffect, useRef, useState } from 'react';

export default function HardwareSection({ token }) {
  const [sd, setSd] = useState(null);
  const [cpuFreq, setCpuFreq] = useState(null);
  const [gpio, setGpio] = useState(null);
  const [usb, setUsb] = useState(null);
  const [updates, setUpdates] = useState(null);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showGpio, setShowGpio] = useState(false);
  const [updatesModal, setUpdatesModal] = useState(false);

  const authFetch = url => fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

  const fetchHardware = async () => {
    setRefreshing(true);
    const [sdRes, freqRes, gpioRes, usbRes] = await Promise.allSettled([
      authFetch('/api/hardware/sd'),
      authFetch('/api/hardware/cpu-freq'),
      authFetch('/api/hardware/gpio'),
      authFetch('/api/hardware/usb'),
    ]);
    if (sdRes.status === 'fulfilled') setSd(sdRes.value);
    if (freqRes.status === 'fulfilled') setCpuFreq(freqRes.value);
    if (gpioRes.status === 'fulfilled') setGpio(gpioRes.value);
    if (usbRes.status === 'fulfilled') setUsb(usbRes.value);
    setRefreshing(false);
  };

  const checkUpdates = async () => {
    setLoadingUpdates(true);
    try { setUpdates(await authFetch('/api/system/updates')); } catch {}
    setLoadingUpdates(false);
  };

  const handleInstallDone = (installedPkgNames) => {
    // Immediately remove installed packages from the card count
    setUpdates(prev => {
      if (!prev) return prev;
      const remaining = prev.packages.filter(p => !installedPkgNames.includes(p.name));
      return {
        ...prev,
        packages: remaining,
        count: remaining.length,
        security: remaining.filter(p => p.suite.includes('security')).length,
      };
    });
    // Background re-check to stay in sync with actual apt state
    authFetch('/api/system/updates').then(data => setUpdates(data)).catch(() => {});
  };

  useEffect(() => { fetchHardware(); }, [token]);

  const activeGpio = gpio?.pins.filter(p => p.func !== 'INPUT') || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Hardware</h2>
        <button
          onClick={fetchHardware}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <SdCard sd={sd} />
        <CpuFreqCard cpuFreq={cpuFreq} />
        <UpdatesCard
          updates={updates}
          loading={loadingUpdates}
          onCheck={checkUpdates}
          onView={() => setUpdatesModal(true)}
        />
        <UsbCard usb={usb} />
      </div>

      {gpio && gpio.pins.length > 0 && (
        <div className="mt-2 sm:mt-3">
          <button
            onClick={() => setShowGpio(v => !v)}
            className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white py-1 transition-colors"
          >
            <span className={`inline-block transition-transform duration-150 ${showGpio ? 'rotate-90' : ''}`}>▶</span>
            GPIO Pins ({gpio.pins.length})
            {activeGpio.length > 0
              ? <span className="text-blue-400">{activeGpio.length} active</span>
              : <span className="text-slate-500 dark:text-slate-600">all INPUT</span>
            }
          </button>
          {showGpio && <GpioTable pins={gpio.pins} />}
        </div>
      )}

      {updatesModal && updates && (
        <UpdatesModal
          updates={updates}
          token={token}
          onClose={() => setUpdatesModal(false)}
          onInstallDone={handleInstallDone}
        />
      )}
    </div>
  );
}

// ─── Hardware cards ────────────────────────────────────────────────────────────

function SdCard({ sd }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4">
      <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">SD Card</div>
      {!sd ? (
        <div className="text-slate-500 dark:text-slate-500 text-xs animate-pulse">Loading…</div>
      ) : (
        <>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">{sd.name}</div>
          {sd.manufacturer && <div className="text-xs text-slate-500 dark:text-slate-500 mb-2">{sd.manufacturer}</div>}
          <div className="space-y-1 mt-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-500">Written</span>
              <span className="text-amber-400 font-medium">{sd.gbWritten} GB</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-500">Read</span>
              <span className="text-cyan-400 font-medium">{sd.gbRead} GB</span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-600 text-right">since boot</div>
          </div>
        </>
      )}
    </div>
  );
}

function CpuFreqCard({ cpuFreq }) {
  const pct = cpuFreq ? Math.round((cpuFreq.currentMhz / cpuFreq.maxMhz) * 100) : 0;
  const barColor = pct >= 95 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-blue-500';
  const textColor = pct >= 95 ? 'text-red-400' : pct >= 60 ? 'text-yellow-400' : 'text-blue-400';
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4">
      <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">CPU Freq</div>
      {!cpuFreq ? (
        <div className="text-slate-500 dark:text-slate-500 text-xs animate-pulse">Loading…</div>
      ) : (
        <>
          <div className={`text-sm font-semibold ${textColor} mb-1`}>{cpuFreq.currentMhz} MHz</div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full mb-2">
            <div className={`h-1.5 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-500">Max</span>
              <span className="text-slate-700 dark:text-slate-300">{cpuFreq.maxMhz} MHz</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-500">Min</span>
              <span className="text-slate-700 dark:text-slate-300">{cpuFreq.minMhz} MHz</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-500">Gov</span>
              <span className="text-slate-700 dark:text-slate-300">{cpuFreq.governor}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function UpdatesCard({ updates, loading, onCheck, onView }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-600 dark:text-slate-400">Updates</span>
        <button
          onClick={onCheck}
          disabled={loading}
          title="Refresh"
          className="text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      </div>
      {loading ? (
        <div className="text-slate-500 dark:text-slate-500 text-xs animate-pulse">Checking…</div>
      ) : !updates ? (
        <button
          onClick={onCheck}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
        >
          Check now
        </button>
      ) : (
        <>
          <div className={`text-2xl font-bold mb-0.5 ${updates.count > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {updates.count}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">{updates.count === 0 ? 'Up to date' : 'available'}</div>
          {updates.security > 0 && (
            <div className="text-xs text-red-400 font-medium mb-2">{updates.security} security</div>
          )}
          {updates.count > 0 && (
            <button onClick={onView} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              View &amp; update →
            </button>
          )}
        </>
      )}
    </div>
  );
}

function UsbCard({ usb }) {
  const devices = usb?.devices.filter(d => !d.name.toLowerCase().includes('root hub')) || [];
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4">
      <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">USB Devices</div>
      {!usb ? (
        <div className="text-slate-500 dark:text-slate-500 text-xs animate-pulse">Loading…</div>
      ) : devices.length === 0 ? (
        <div className="text-slate-500 dark:text-slate-500 text-sm">None</div>
      ) : (
        <>
          <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{devices.length} connected</div>
          <div className="space-y-1">
            {devices.map((d, i) => (
              <div key={i} className="text-xs text-slate-600 dark:text-slate-400 truncate" title={d.name}>
                {d.name.replace(/,\s*Inc\.?/gi, '').replace(/\s+\([^)]*\)$/, '').trim().slice(0, 26)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── GPIO table ────────────────────────────────────────────────────────────────

function GpioTable({ pins }) {
  const funcColor = f => f === 'INPUT' ? 'text-slate-500 dark:text-slate-500' : f === 'OUTPUT' ? 'text-blue-400' : 'text-orange-400';
  const levelColor = (level, func) => func === 'INPUT' ? 'text-slate-500 dark:text-slate-600' : level === 1 ? 'text-emerald-400' : 'text-slate-500 dark:text-slate-500';
  return (
    <div className="mt-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="grid grid-cols-4 text-[10px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span>GPIO</span><span>Function</span><span>Level</span><span>Pull</span>
      </div>
      <div className="max-h-52 overflow-y-auto overscroll-contain">
        {pins.map(pin => (
          <div
            key={pin.gpio}
            className={`grid grid-cols-4 text-xs px-3 py-1.5 border-b border-slate-200/40 dark:border-slate-700/40 last:border-0 ${pin.func !== 'INPUT' ? 'bg-slate-100/30 dark:bg-slate-700/30' : ''}`}
          >
            <span className="text-slate-600 dark:text-slate-400 font-mono">{pin.gpio}</span>
            <span className={funcColor(pin.func)}>{pin.func}</span>
            <span className={levelColor(pin.level, pin.func)}>{pin.level === 1 ? 'HIGH' : 'LOW'}</span>
            <span className="text-slate-500 dark:text-slate-500">{pin.pull || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Updates modal ────────────────────────────────────────────────────────────

function UpdatesModal({ updates, token, onClose, onInstallDone }) {
  // installState: null | { packages, lines, running, code }
  const [installState, setInstallState] = useState(null);
  // Local copy so we can remove installed packages immediately without waiting for apt
  const [packages, setPackages] = useState(updates.packages);
  const logRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [installState?.lines?.length]);

  const startInstall = async (packages) => {
    setInstallState({ packages, lines: [], running: true, code: null });

    try {
      const res = await fetch('/api/system/updates/install', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        setInstallState(prev => ({
          ...prev,
          lines: [...(prev?.lines || []), `Error: ${err.error}\n`],
          running: false,
          code: 1,
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop();
        for (const event of events) {
          for (const raw of event.split('\n')) {
            if (!raw.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(raw.slice(6));
              if (data.done) {
                const code = data.code ?? 0;
                setInstallState(prev => ({ ...prev, running: false, code }));
                if (code === 0) {
                  setPackages(prev => prev.filter(p => !packages.includes(p.name)));
                  onInstallDone?.(packages);
                }
              } else if (data.line) {
                setInstallState(prev => ({ ...prev, lines: [...(prev?.lines || []), data.line] }));
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      setInstallState(prev => ({
        ...prev,
        lines: [...(prev?.lines || []), `Error: ${e.message}\n`],
        running: false,
        code: 1,
      }));
    }
  };

  const security = packages.filter(p => p.suite.includes('security'));
  const other = packages.filter(p => !p.suite.includes('security'));
  const allPackageNames = packages.map(p => p.name);

  const success = installState && !installState.running && installState.code === 0;
  const failed  = installState && !installState.running && installState.code !== 0;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && !installState?.running && onClose()}
    >
      <div className="bg-gray-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">
              {installState ? (installState.running ? 'Installing…' : success ? 'Install complete' : 'Install failed') : 'Pending Updates'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
              {installState
                ? installState.packages.length === allPackageNames.length
                  ? `Updating all ${allPackageNames.length} packages`
                  : `Updating: ${installState.packages.join(', ')}`
                : `${packages.length} packages · ${new Date(updates.cachedAt).toLocaleTimeString()}`
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Update All — only show on package list view */}
            {!installState && allPackageNames.length > 0 && (
              <button
                onClick={() => startInstall(allPackageNames)}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-slate-900 dark:text-white font-medium transition-colors"
              >
                Update All
              </button>
            )}
            {/* Back button after install finishes */}
            {installState && !installState.running && (
              <button
                onClick={() => setInstallState(null)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                ← Back to list
              </button>
            )}
            <button
              onClick={onClose}
              disabled={installState?.running}
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl leading-none px-1 disabled:opacity-30"
            >×</button>
          </div>
        </div>

        {/* Body: package list OR install log */}
        {!installState ? (
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
            {security.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">
                  Security ({security.length})
                </div>
                {security.map(p => (
                  <PackageRow key={p.name} pkg={p} onUpdate={() => startInstall([p.name])} />
                ))}
              </div>
            )}
            {other.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Other ({other.length})
                </div>
                {other.map(p => (
                  <PackageRow key={p.name} pkg={p} onUpdate={() => startInstall([p.name])} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Status bar */}
            <div className={`shrink-0 flex items-center gap-2 px-4 py-2 text-xs border-b border-slate-100 dark:border-slate-800 ${
              installState.running ? 'text-slate-600 dark:text-slate-400' :
              success ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {installState.running && (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
              )}
              {success && <span>✓</span>}
              {failed  && <span>✗</span>}
              <span>
                {installState.running ? 'Running apt-get install…' :
                 success ? 'Completed successfully' :
                 `Failed (exit code ${installState.code})`}
              </span>
            </div>
            {/* Log output */}
            <div
              ref={logRef}
              className="flex-1 overflow-y-auto overscroll-contain p-3 font-mono text-[11px] leading-relaxed bg-slate-200/60 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 whitespace-pre-wrap"
            >
              {installState.lines.map((line, i) => (
                <span key={i} className={aptLineClass(line)}>{line}</span>
              ))}
              {installState.running && <span className="animate-pulse text-slate-500 dark:text-slate-500">▌</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function aptLineClass(line) {
  const t = line.trimStart();
  if (!t || t === '\n') return 'text-slate-600 dark:text-slate-700';
  if (/^✓/.test(t)) return 'text-emerald-300 font-semibold';
  if (/^─/.test(t)) return 'text-slate-500 dark:text-slate-500';
  if (/^(E:|Err:)/i.test(t)) return 'text-red-400';
  if (/^(W:|WARNING|N:|Note:)/i.test(t)) return 'text-slate-500 dark:text-slate-600';
  if (/^(Reading |Building |Scanning |Listing |Selecting |Preparing |update-alternatives|Processing triggers)/i.test(t)) return 'text-slate-500 dark:text-slate-600';
  if (/^(Unpacking |Setting up |Get:\d|Fetched |Download)/i.test(t)) return 'text-emerald-400';
  return 'text-slate-700 dark:text-slate-300';
}

function PackageRow({ pkg, onUpdate }) {
  const isSecurity = pkg.suite.includes('security');
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0 group">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-sm font-mono truncate ${isSecurity ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
          {pkg.name}
        </span>
        <span className="text-[10px] text-slate-500 dark:text-slate-600 shrink-0">{pkg.version}</span>
      </div>
      <button
        onClick={onUpdate}
        className="shrink-0 ml-3 text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 opacity-0 group-hover:opacity-100 transition-all"
      >
        Update
      </button>
    </div>
  );
}
