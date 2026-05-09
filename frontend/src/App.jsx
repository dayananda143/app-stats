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
import LoginPage from './components/LoginPage';

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
  const [lastUpdated, setLastUpdated] = useState(null);
  const [logModal, setLogModal] = useState(null);
  const [ramModal, setRamModal] = useState(false);
  const [diskModal, setDiskModal] = useState(false);
  const [historyModal, setHistoryModal] = useState(null);
  const [alertsModal, setAlertsModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [actionState, setActionState] = useState({});
  const prevStatuses = useRef({});

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

    socket.on('connect_error', (err) => {
      if (err.message === 'Unauthorized') logout();
    });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('stats', (data) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        data.processes.forEach(proc => {
          const prev = prevStatuses.current[proc.name];
          const curr = proc.status;
          if (prev && prev !== curr) {
            const isCrash = curr === 'stopped' || curr === 'errored';
            const isRecovery = curr === 'online' && (prev === 'stopped' || prev === 'errored');
            if (isCrash) {
              new Notification(`${proc.name} crashed`, { body: `Status changed to ${curr}`, icon: '/favicon.ico' });
            } else if (isRecovery) {
              new Notification(`${proc.name} recovered`, { body: 'Process is back online', icon: '/favicon.ico' });
            }
          }
          prevStatuses.current[proc.name] = curr;
        });
      } else {
        data.processes.forEach(p => { prevStatuses.current[p.name] = p.status; });
      }

      setProcesses(data.processes);
      setSystem(data.system);
      setLastUpdated(new Date());
    });

    return () => socket.disconnect();
  }, [token]);

  const doAction = useCallback(async (name, action) => {
    setActionState(prev => ({ ...prev, [name]: action }));
    try {
      await authFetch(`/api/processes/${encodeURIComponent(name)}/${action}`, { method: 'POST' }, token);
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setActionState(prev => ({ ...prev, [name]: null })), 2000);
    }
  }, [token]);

  if (!token) return <LoginPage onLogin={setToken} />;

  const onlineCount = processes.filter(p => p.status === 'online').length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-sm font-bold">A</div>
            <div>
              <h1 className="text-base font-semibold text-white leading-tight">App Stats</h1>
              <p className="text-xs text-slate-400">Process Monitor</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {connected ? 'Live' : 'Disconnected'}
            </div>
            {lastUpdated && (
              <div className="text-xs text-slate-500 hidden md:block">
                {lastUpdated.toLocaleTimeString()}
              </div>
            )}
            <NavBtn onClick={() => setAlertsModal(true)}>Alerts</NavBtn>
            <NavBtn onClick={() => setSettingsModal(true)}>Settings</NavBtn>
            <button
              onClick={logout}
              className="text-xs px-3 py-1 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Total Processes" value={processes.length} icon="⚙️" />
          <SummaryCard label="Online" value={onlineCount} icon="🟢" valueClass="text-emerald-400" />
          <SummaryCard label="Stopped" value={processes.length - onlineCount} icon="🔴" valueClass="text-red-400" />
          <DiskSummaryCard system={system} onClick={() => system?.disk && setDiskModal(true)} />
        </div>

        {/* System stats */}
        {system && (
          <SystemStats
            system={system}
            onRamClick={() => setRamModal(true)}
            token={token}
          />
        )}

        {/* Process grid */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Processes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {processes.map(proc => (
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

      {logModal && (
        <LogModal name={logModal.name} token={token} onClose={() => setLogModal(null)} />
      )}
      {ramModal && system && (
        <RamModal system={system} token={token} onClose={() => setRamModal(false)} />
      )}
      {diskModal && system && (
        <DiskModal system={system} token={token} onClose={() => setDiskModal(false)} />
      )}
      {historyModal && (
        <HistoryModal name={historyModal} token={token} onClose={() => setHistoryModal(null)} />
      )}
      {alertsModal && (
        <AlertsModal token={token} onClose={() => setAlertsModal(false)} />
      )}
      {settingsModal && (
        <SettingsModal token={token} onClose={() => setSettingsModal(false)} />
      )}
    </div>
  );
}

function NavBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors hidden sm:block"
    >
      {children}
    </button>
  );
}

function SummaryCard({ label, value, icon, valueClass = 'text-white' }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">{label}</span>
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
    <div
      className="bg-slate-800 rounded-xl p-4 border border-slate-700 cursor-pointer hover:border-emerald-700 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">Disk Space</span>
        <span className="text-xs text-slate-500">↗</span>
      </div>
      <div className={`text-xl font-bold ${textColor}`}>{formatBytes(used)} used</div>
      <div className="text-xs text-slate-400 mt-0.5">{formatBytes(free)} free</div>
      <div className="text-xs text-slate-500 mb-2">{percent}% of {formatBytes(total)}</div>
      <div className="h-1.5 bg-slate-700 rounded-full">
        <div className={`h-1.5 rounded-full transition-all duration-700 ${pctColor}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
