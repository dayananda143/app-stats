import { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import SystemStats from './components/SystemStats';
import ProcessCard from './components/ProcessCard';
import LogModal from './components/LogModal';
import RamModal from './components/RamModal';
import DiskModal from './components/DiskModal';
import HistoryModal from './components/HistoryModal';
import AlertsModal from './components/AlertsModal';
import SettingsModal from './components/SettingsModal';
import SystemHistoryModal from './components/SystemHistoryModal';
import HardwareSection from './components/HardwareSection';
import ConnectivityCard from './components/ConnectivityCard';
import LoginPage from './components/LoginPage';
import BackupModal from './components/BackupModal';
import VisitsCard from './components/VisitsCard';

const SOCKET_URL = typeof window !== 'undefined' && window.location.port === '5173'
  ? 'http://localhost:3006'
  : window.location.origin;

function authFetch(url, options = {}, token) {
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('app-stats-token'));
  const [processes, setProcesses] = useState([]);
  const [system, setSystem] = useState(null);
  const [connected, setConnected] = useState(false);
  const [serverDown, setServerDown] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const healthPoller = useRef(null);
  const [logModal, setLogModal] = useState(null);
  const [ramModal, setRamModal] = useState(false);
  const [diskModal, setDiskModal] = useState(false);
  const [historyModal, setHistoryModal] = useState(null);
  const [alertsModal, setAlertsModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [systemHistoryModal, setSystemHistoryModal] = useState(false);
  const [backupModal, setBackupModal] = useState(false);
  const [actionState, setActionState] = useState({});
  const [alertCount, setAlertCount] = useState(0);
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('sort-by') || 'name');
  const [sortDir, setSortDir] = useState(() => localStorage.getItem('sort-dir') || 'asc');
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light');
  const prevStatuses = useRef({});

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const unreadAlerts = Math.max(0, alertCount - parseInt(localStorage.getItem('alerts-seen-count') || '0'));

  const openAlerts = () => {
    localStorage.setItem('alerts-seen-count', alertCount);
    setAlertsModal(true);
  };

  const logout = () => {
    localStorage.removeItem('app-stats-token');
    setToken(null);
    setProcesses([]);
    setSystem(null);
  };

  useEffect(() => {
    if (!token) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
    });
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
        setServerDown(!res.ok);
      } catch {
        setServerDown(true);
      }
    };
    const startHealthPolling = () => {
      clearInterval(healthPoller.current);
      checkHealth(); // immediate — no waiting for first interval
      healthPoller.current = setInterval(checkHealth, 5000);
    };
    const stopHealthPolling = () => clearInterval(healthPoller.current);

    socket.on('connect_error', (err) => {
      if (err.message === 'Unauthorized') logout();
      startHealthPolling();
    });
    socket.on('connect', () => { setConnected(true); setServerDown(false); stopHealthPolling(); });
    socket.on('disconnect', () => { setConnected(false); startHealthPolling(); });
    socket.on('stats', (data) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        data.processes.forEach(proc => {
          const prev = prevStatuses.current[proc.name];
          const curr = proc.status;
          if (prev && prev !== curr) {
            const isCrash = curr === 'stopped' || curr === 'errored';
            const isRecovery = curr === 'online' && (prev === 'stopped' || prev === 'errored');
            if (isCrash) new Notification(`${proc.name} crashed`, { body: `Status: ${curr}`, icon: '/apple-touch-icon.png' });
            else if (isRecovery) new Notification(`${proc.name} recovered`, { body: 'Back online', icon: '/apple-touch-icon.png' });
          }
          prevStatuses.current[proc.name] = curr;
        });
      } else {
        data.processes.forEach(p => { prevStatuses.current[p.name] = p.status; });
      }
      setProcesses(data.processes);
      setSystem(data.system);
      if (data.alertCount !== undefined) setAlertCount(data.alertCount);
      setLastUpdated(new Date());
    });
    return () => { socket.disconnect(); stopHealthPolling(); };
  }, [token]);

  const doAction = useCallback(async (name, action) => {
    setActionState(prev => ({ ...prev, [name]: action }));
    try {
      await authFetch(`/api/processes/${encodeURIComponent(name)}/${action}`, { method: 'POST' }, token);
    } catch (e) { console.error(e); }
    finally { setTimeout(() => setActionState(prev => ({ ...prev, [name]: null })), 2000); }
  }, [token]);

  if (!token) return <LoginPage onLogin={setToken} />;
  if (serverDown) return <OfflinePage />;

  const onlineCount = processes.filter(p => p.status === 'online').length;

  const cycleSort = (field) => {
    const newDir = sortBy === field && sortDir === 'asc' ? 'desc' : 'asc';
    setSortBy(field); setSortDir(newDir);
    localStorage.setItem('sort-by', field); localStorage.setItem('sort-dir', newDir);
  };

  const statusOrder = { online: 0, launching: 1, stopping: 2, stopped: 3, errored: 4 };
  const sorted = [...processes].sort((a, b) => {
    let v = 0;
    if (sortBy === 'cpu')    v = (a.cpu || 0) - (b.cpu || 0);
    if (sortBy === 'memory') v = (a.memory || 0) - (b.memory || 0);
    if (sortBy === 'status') v = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (sortBy === 'name')   v = a.name.localeCompare(b.name);
    return sortDir === 'asc' ? v : -v;
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      {/* Header — safe area top for iPhone notch */}
      <div className="border-b border-slate-100 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
          {/* Logo + title */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900 dark:text-white leading-tight">App Stats</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 hidden sm:block">Process Monitor</p>
            </div>
          </div>

          {/* Right side nav */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 mr-1">
              <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className="text-xs text-slate-600 dark:text-slate-400 hidden sm:block">{connected ? 'Live' : 'Off'}</span>
            </div>

            {/* Alerts with unread badge */}
            <IconBtn onClick={openAlerts} title="Alert History">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadAlerts > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
                    {unreadAlerts > 99 ? '99+' : unreadAlerts}
                  </span>
                )}
              </div>
            </IconBtn>

            {/* Theme toggle */}
            <IconBtn onClick={() => setDark(d => !d)} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {dark ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </IconBtn>

            {/* Backup */}
            <IconBtn onClick={() => setBackupModal(true)} title="Database Backups">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.068 5.952A4.5 4.5 0 0117.25 19.5H6.75z" />
              </svg>
            </IconBtn>

            {/* Settings */}
            <IconBtn onClick={() => setSettingsModal(true)} title="Settings">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </IconBtn>

            {/* Sign out */}
            <IconBtn onClick={logout} title="Sign out">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </IconBtn>
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {/* Summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <SummaryCard label="Processes" value={processes.length} icon="⚙️" />
          <SummaryCard label="Online" value={onlineCount} icon="🟢" valueClass="text-emerald-400" />
          <SummaryCard label="Stopped" value={processes.length - onlineCount} icon="🔴" valueClass="text-red-400" />
          <DiskSummaryCard system={system} onClick={() => system?.disk && setDiskModal(true)} />
        </div>

        {/* System stats */}
        {system && (
          <SystemStats system={system} onRamClick={() => setRamModal(true)} onHistoryClick={() => setSystemHistoryModal(true)} token={token} />
        )}

        {/* Connectivity */}
        {system && <ConnectivityCard system={system} />}

        {/* Hardware section */}
        <HardwareSection token={token} />

        {/* App visit counts */}
        <VisitsCard token={token} />

        {/* Process grid */}
        <div>
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Processes <span className="text-slate-500 dark:text-slate-600 font-normal normal-case tracking-normal">({processes.length})</span>
            </h2>
            <div className="flex items-center gap-1">
              {['name','status','cpu','memory'].map(f => (
                <button key={f} onClick={() => cycleSort(f)}
                  className={`px-2 py-1 text-xs rounded-lg border transition-colors ${sortBy === f ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  {f}{sortBy === f ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {sorted.map(proc => (
              <ProcessCard
                key={proc.name}
                proc={proc}
                actionState={actionState[proc.name]}
                token={token}
                onRestart={() => doAction(proc.name, 'restart')}
                onStop={() => doAction(proc.name, 'stop')}
                onStart={() => doAction(proc.name, 'start')}
                onLogs={() => setLogModal({ name: proc.name })}
                onHistory={() => setHistoryModal(proc.name)}
              />
            ))}
          </div>
        </div>
      </div>

      {logModal && <LogModal name={logModal.name} token={token} onClose={() => setLogModal(null)} />}
      {ramModal && system && <RamModal system={system} token={token} onClose={() => setRamModal(false)} />}
      {diskModal && system && <DiskModal system={system} token={token} onClose={() => setDiskModal(false)} />}
      {historyModal && <HistoryModal name={historyModal} token={token} onClose={() => setHistoryModal(null)} />}
      {alertsModal && (
        <AlertsModal
          token={token}
          onClose={() => setAlertsModal(false)}
          onCleared={() => {
            setAlertCount(0);
            localStorage.setItem('alerts-seen-count', '0');
          }}
        />
      )}
      {settingsModal && <SettingsModal token={token} onClose={() => setSettingsModal(false)} />}
      {backupModal && <BackupModal token={token} onClose={() => setBackupModal(false)} />}
      {systemHistoryModal && <SystemHistoryModal token={token} onClose={() => setSystemHistoryModal(false)} />}
    </div>
  );
}

function IconBtn({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors"
    >
      {children}
    </button>
  );
}

function SummaryCard({ label, value, icon, valueClass = 'text-slate-900 dark:text-white' }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
        <span className="text-sm">{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function DiskSummaryCard({ system, onClick }) {
  const used = system?.disk?.used || 0;
  const free = system?.disk?.free || 0;
  const total = system?.disk?.size || 1;
  const percent = system?.disk?.use || 0;
  const pctColor = percent > 90 ? 'bg-red-500' : percent > 75 ? 'bg-yellow-500' : 'bg-emerald-500';
  const textColor = percent > 90 ? 'text-red-400' : percent > 75 ? 'text-yellow-400' : 'text-emerald-400';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700 cursor-pointer active:bg-slate-200 dark:active:bg-slate-750 hover:border-emerald-200 dark:border-emerald-700 transition-colors" onClick={onClick}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-600 dark:text-slate-400">Disk</span>
        <span className="text-xs text-slate-500 dark:text-slate-500">↗</span>
      </div>
      <div className={`text-lg sm:text-xl font-bold ${textColor}`}>{formatBytes(used)}</div>
      <div className="text-xs text-slate-500 dark:text-slate-500 mb-1.5">{percent}% of {formatBytes(total)}</div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
        <div className={`h-1.5 rounded-full transition-all duration-700 ${pctColor}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function OfflinePage() {
  const [secs, setSecs] = useState(30);
  useEffect(() => {
    const t = setInterval(() => setSecs(s => {
      if (s <= 1) { window.location.reload(); return 30; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl">
        {/* Icon */}
        <div className="relative w-20 h-20 mx-auto mb-8">
          <div className="w-20 h-20 rounded-2xl bg-indigo-600 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-slate-900 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
            </svg>
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-red-500 rounded-full border-4 border-slate-100 dark:border-slate-800 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-slate-900 dark:text-white" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Server is Offline</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-8">
          App Stats can't be reached right now. The backend may be restarting or temporarily unavailable.
        </p>

        {/* Pulsing status */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span className="text-xs text-slate-500 dark:text-slate-500">Retrying in <span className="text-slate-700 dark:text-slate-300 font-semibold">{secs}s</span></span>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-sm py-3 rounded-xl transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Try Again
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
