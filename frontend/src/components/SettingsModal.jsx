import { useEffect, useState } from 'react';

const TABS = ['Thresholds', 'Notifications', 'Security'];

export default function SettingsModal({ token, onClose }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Thresholds');
  const [faceIdRegistered, setFaceIdRegistered] = useState(false);
  const [removingFaceId, setRemovingFaceId] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setForm).catch(() => setError('Failed to load settings'));
    fetch('/api/auth/webauthn/registered')
      .then(r => r.json()).then(d => setFaceIdRegistered(d.registered)).catch(() => {});
  }, [token]);

  const removeFaceId = async () => {
    if (!confirm('Remove Face ID from this account? You will need to use your password to log in.')) return;
    setRemovingFaceId(true);
    try {
      await fetch('/api/auth/webauthn/credential', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setFaceIdRegistered(false);
    } catch {}
    setRemovingFaceId(false);
  };

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const save = async () => {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h2 className="font-semibold text-slate-900 dark:text-white">Settings</h2>
          <button onClick={onClose} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl leading-none px-1">×</button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-2 bg-slate-100/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 shrink-0">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t ? 'bg-indigo-600 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >{t}</button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {!form ? (
            <div className="text-slate-600 dark:text-slate-400 text-center py-10">Loading…</div>
          ) : (
            <div className="p-4 space-y-4">
              {tab === 'Thresholds' && <ThresholdsTab form={form} update={update} />}
              {tab === 'Notifications' && <NotificationsTab form={form} update={update} token={token} telegramTesting={telegramTesting} setTelegramTesting={setTelegramTesting} telegramTestResult={telegramTestResult} setTelegramTestResult={setTelegramTestResult} />}
              {tab === 'Security' && <SecurityTab form={form} update={update} faceIdRegistered={faceIdRegistered} removingFaceId={removingFaceId} removeFaceId={removeFaceId} />}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 shrink-0 space-y-2">
          {error && <div className="text-red-400 text-xs">{error}</div>}
          <button
            onClick={save}
            disabled={saving || !form}
            className={`w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
              saved ? 'bg-emerald-700 text-slate-900 dark:text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-slate-900 dark:text-white'
            }`}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Thresholds tab ───────────────────────────────────────────────────────────
function ThresholdsTab({ form, update }) {
  return (
    <>
      <Group label="General">
        <Row label="Alert cooldown" right={<><Num value={form.alertCooldownMinutes} onChange={v => update('alertCooldownMinutes', v)} min={1} max={120} /><Unit>min</Unit></>} />
        <Row label="Alert email" right={
          <input type="email" value={form.alertEmail || ''} onChange={e => update('alertEmail', e.target.value)}
            placeholder="you@example.com"
            className="w-44 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
        } />
        <Row label="Process crashes" right={<Toggle value={form.processAlerts} onChange={v => update('processAlerts', v)} />} />
      </Group>

      <Group label="Temperature">
        <Row label="High threshold" right={<><Num value={form.tempThreshold} onChange={v => update('tempThreshold', v)} min={40} max={90} /><Unit>°C</Unit></>} />
        <Row label="Recovery at" right={<><Num value={form.tempRecovery} onChange={v => update('tempRecovery', v)} min={35} max={85} /><Unit>°C</Unit></>} />
      </Group>

      <Group label="Process CPU / RAM">
        <Row label="CPU threshold" right={<><Num value={form.cpuAlertThreshold} onChange={v => update('cpuAlertThreshold', v)} min={10} max={100} /><Unit>%</Unit><Toggle value={form.cpuAlertEnabled} onChange={v => update('cpuAlertEnabled', v)} /></>} />
        <Row label="RAM threshold" right={<><Num value={form.ramAlertThresholdMb} onChange={v => update('ramAlertThresholdMb', v)} min={50} max={2000} /><Unit>MB</Unit><Toggle value={form.ramAlertEnabled} onChange={v => update('ramAlertEnabled', v)} /></>} />
        <Row label="Stuck CPU" right={
          <div className="flex items-center gap-1.5">
            <Num value={form.stuckCpuThreshold} onChange={v => update('stuckCpuThreshold', v)} min={50} max={100} />
            <Unit>%</Unit>
            <span className="text-slate-500 dark:text-slate-600 text-xs">for</span>
            <Num value={form.stuckMinutes} onChange={v => update('stuckMinutes', v)} min={1} max={60} />
            <Unit>min</Unit>
            <Toggle value={form.stuckAlertEnabled} onChange={v => update('stuckAlertEnabled', v)} />
          </div>
        } />
      </Group>

      <Group label="System">
        <Row label="System RAM" right={<><Num value={form.sysRamAlertPercent} onChange={v => update('sysRamAlertPercent', v)} min={50} max={99} /><Unit>%</Unit><Toggle value={form.sysRamAlertEnabled} onChange={v => update('sysRamAlertEnabled', v)} /></>} />
        <Row label="Disk usage" right={<><Num value={form.diskAlertPercent ?? 90} onChange={v => update('diskAlertPercent', v)} min={50} max={99} /><Unit>%</Unit><Toggle value={form.diskAlertEnabled ?? true} onChange={v => update('diskAlertEnabled', v)} /></>} />
      </Group>

      <Group label="Memory Leak">
        <Row label="Detect leaks" right={<Toggle value={form.memLeakEnabled ?? true} onChange={v => update('memLeakEnabled', v)} />} />
        <Row label="Window" right={<><Num value={form.memLeakWindowMinutes ?? 30} onChange={v => update('memLeakWindowMinutes', v)} min={10} max={120} /><Unit>min</Unit></>} />
        <Row label="Min growth" right={<><Num value={form.memLeakGrowthPercent ?? 20} onChange={v => update('memLeakGrowthPercent', v)} min={5} max={100} /><Unit>%</Unit></>} />
      </Group>
    </>
  );
}

// ─── Notifications tab ────────────────────────────────────────────────────────
function NotificationsTab({ form, update, token, telegramTesting, setTelegramTesting, telegramTestResult, setTelegramTestResult }) {
  return (
    <Group label="Telegram">
      <div className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed mb-1">
        Token set via <code className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 px-1 rounded">TELEGRAM_BOT_TOKEN</code> in <code className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 px-1 rounded">.env</code>
      </div>
      <Row label="Enable" right={<Toggle value={form.telegramEnabled || false} onChange={v => update('telegramEnabled', v)} />} />
      <div className="space-y-1.5 pt-1">
        <label className="text-xs text-slate-600 dark:text-slate-400">Chat ID</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={form.telegramChatId || ''}
            onChange={e => update('telegramChatId', e.target.value)}
            placeholder="e.g. 123456789"
            className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={async () => {
              if (!form.telegramChatId) return;
              setTelegramTesting(true); setTelegramTestResult(null);
              try {
                const res = await fetch('/api/telegram/test', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId: form.telegramChatId }),
                });
                const data = await res.json();
                setTelegramTestResult(data.ok ? 'ok' : data.error || 'error');
              } catch { setTelegramTestResult('error'); }
              setTelegramTesting(false);
              setTimeout(() => setTelegramTestResult(null), 4000);
            }}
            disabled={telegramTesting || !form.telegramChatId}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
          >
            {telegramTesting ? '…' : 'Test'}
          </button>
        </div>
        {telegramTestResult && (
          <div className={`text-xs ${telegramTestResult === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
            {telegramTestResult === 'ok' ? '✓ Message sent! Check your Telegram.' : `✗ ${telegramTestResult}`}
          </div>
        )}
      </div>
    </Group>
  );
}

// ─── Security tab ─────────────────────────────────────────────────────────────
function SecurityTab({ form, update, faceIdRegistered, removingFaceId, removeFaceId }) {
  return (
    <>
      <Group label="SSL Certificates">
        <Row label="Expiry alerts" hint="Warns at 14 / 7 / 1 days, checks every 12h" right={<Toggle value={form.sslAlertEnabled ?? true} onChange={v => update('sslAlertEnabled', v)} />} />
        <div className="space-y-2 pt-1">
          <label className="text-xs text-slate-600 dark:text-slate-400">Domains to monitor</label>
          {(form.sslDomains || []).map((d, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text" value={d}
                onChange={e => { const next = [...(form.sslDomains || [])]; next[i] = e.target.value; update('sslDomains', next); }}
                placeholder="example.com"
                className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => update('sslDomains', (form.sslDomains || []).filter((_, j) => j !== i))}
                className="px-3 py-2 text-xs rounded-lg border border-red-800 bg-red-900/20 text-red-400 hover:bg-red-900/40 transition-colors"
              >✕</button>
            </div>
          ))}
          <button
            onClick={() => update('sslDomains', [...(form.sslDomains || []), ''])}
            className="w-full py-1.5 text-xs rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
          >+ Add domain</button>
        </div>
      </Group>

      <Group label="Network">
        <Row label="Public IP change alert" hint="Checks every 15 min" right={<Toggle value={form.publicIpAlertEnabled ?? true} onChange={v => update('publicIpAlertEnabled', v)} />} />
      </Group>

      <Group label="Authentication">
        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-sm text-slate-700 dark:text-slate-300">Face ID</div>
            <div className={`text-xs mt-0.5 ${faceIdRegistered ? 'text-emerald-400' : 'text-slate-500 dark:text-slate-500'}`}>
              {faceIdRegistered ? '✓ Enabled on this account' : 'Not set up'}
            </div>
          </div>
          {faceIdRegistered && (
            <button
              onClick={removeFaceId}
              disabled={removingFaceId}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-800 bg-red-900/30 text-red-400 hover:bg-red-900/50 disabled:opacity-50 transition-colors"
            >
              {removingFaceId ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      </Group>
    </>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────
function Group({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-widest mb-2">{label}</div>
      <div className="bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-3 py-1 space-y-0 divide-y divide-slate-200/40 dark:divide-slate-700/40">
        {children}
      </div>
    </div>
  );
}

function Row({ label, hint, right }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
        {hint && <div className="text-[11px] text-slate-500 dark:text-slate-500 leading-tight mt-0.5">{hint}</div>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">{right}</div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${value ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-600'}`}>
      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
    </div>
  );
}

function Num({ value, onChange, min, max }) {
  return (
    <input type="number" value={value} onChange={e => onChange(parseFloat(e.target.value))} min={min} max={max}
      className="w-16 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white text-center focus:outline-none focus:border-indigo-500" />
  );
}

function Unit({ children }) {
  return <span className="text-xs text-slate-500 dark:text-slate-500 shrink-0">{children}</span>;
}
