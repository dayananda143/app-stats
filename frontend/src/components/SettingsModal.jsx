import { useEffect, useState, useRef } from 'react';

export default function SettingsModal({ token, onClose }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
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
      .then(r => r.json())
      .then(setForm)
      .catch(() => setError('Failed to load settings'));
    fetch('/api/auth/webauthn/registered')
      .then(r => r.json())
      .then(d => setFaceIdRegistered(d.registered))
      .catch(() => {});
  }, [token]);

  const removeFaceId = async () => {
    if (!confirm('Remove Face ID from this account? You will need to use your password to log in.')) return;
    setRemovingFaceId(true);
    try {
      await fetch('/api/auth/webauthn/credential', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setFaceIdRegistered(false);
    } catch {}
    setRemovingFaceId(false);
  };

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="font-semibold text-white">Alert Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none px-1">×</button>
        </div>

        <div className="overflow-y-auto overscroll-contain p-4 space-y-5">
          {!form ? (
            <div className="text-slate-400 text-center py-6">Loading…</div>
          ) : (
            <>
              <Section title="Temperature Alerts">
                <Field label="High threshold (°C)" hint="Email fires when temp exceeds this">
                  <NumberInput value={form.tempThreshold} onChange={v => update('tempThreshold', v)} min={40} max={90} />
                </Field>
                <Field label="Recovery threshold (°C)" hint="Alert clears when temp drops below this">
                  <NumberInput value={form.tempRecovery} onChange={v => update('tempRecovery', v)} min={35} max={85} />
                </Field>
              </Section>

              <Section title="General">
                <Field label="Cooldown (minutes)" hint="Minimum time between repeated alerts">
                  <NumberInput value={form.alertCooldownMinutes} onChange={v => update('alertCooldownMinutes', v)} min={1} max={120} />
                </Field>
                <Field label="Alert email">
                  <input
                    type="email"
                    value={form.alertEmail || ''}
                    onChange={e => update('alertEmail', e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </Field>
                <Field label="Process crash alerts">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => update('processAlerts', !form.processAlerts)}
                      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${form.processAlerts ? 'bg-indigo-600' : 'bg-slate-600'}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.processAlerts ? 'translate-x-4' : ''}`} />
                    </div>
                    <span className="text-sm text-slate-300">{form.processAlerts ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </Field>
              </Section>

              <Section title="Process CPU / RAM Alerts">
                <Field label="CPU alert threshold (%)" hint="Alert when any process exceeds this CPU %">
                  <div className="flex items-center gap-3">
                    <NumberInput value={form.cpuAlertThreshold} onChange={v => update('cpuAlertThreshold', v)} min={10} max={100} />
                    <Toggle value={form.cpuAlertEnabled} onChange={v => update('cpuAlertEnabled', v)} />
                  </div>
                </Field>
                <Field label="RAM alert threshold (MB)" hint="Alert when any process exceeds this memory">
                  <div className="flex items-center gap-3">
                    <NumberInput value={form.ramAlertThresholdMb} onChange={v => update('ramAlertThresholdMb', v)} min={50} max={2000} />
                    <Toggle value={form.ramAlertEnabled} onChange={v => update('ramAlertEnabled', v)} />
                  </div>
                </Field>
                <Field label="Stuck: CPU % / minutes" hint="Alert when a process holds high CPU for this long">
                  <div className="flex items-center gap-2">
                    <NumberInput value={form.stuckCpuThreshold} onChange={v => update('stuckCpuThreshold', v)} min={50} max={100} />
                    <span className="text-slate-500 text-sm shrink-0">for</span>
                    <NumberInput value={form.stuckMinutes} onChange={v => update('stuckMinutes', v)} min={1} max={60} />
                    <span className="text-slate-500 text-sm shrink-0">min</span>
                    <Toggle value={form.stuckAlertEnabled} onChange={v => update('stuckAlertEnabled', v)} />
                  </div>
                </Field>
              </Section>

              <Section title="System RAM Alert">
                <Field label="System RAM threshold (%)" hint="Alert when Pi RAM usage exceeds this">
                  <div className="flex items-center gap-3">
                    <NumberInput value={form.sysRamAlertPercent} onChange={v => update('sysRamAlertPercent', v)} min={50} max={99} />
                    <Toggle value={form.sysRamAlertEnabled} onChange={v => update('sysRamAlertEnabled', v)} />
                  </div>
                </Field>
              </Section>

              <Section title="Memory Leak Detector">
                <Field label="Enable leak detection">
                  <Toggle value={form.memLeakEnabled ?? true} onChange={v => update('memLeakEnabled', v)} />
                </Field>
                <Field label="Detection window (minutes)" hint="How long RAM must climb before alerting">
                  <NumberInput value={form.memLeakWindowMinutes ?? 30} onChange={v => update('memLeakWindowMinutes', v)} min={10} max={120} />
                </Field>
                <Field label="Growth threshold (%)" hint="Minimum RAM increase over the window to trigger">
                  <NumberInput value={form.memLeakGrowthPercent ?? 20} onChange={v => update('memLeakGrowthPercent', v)} min={5} max={100} />
                </Field>
              </Section>

              <Section title="Disk Space Alert">
                <Field label="Disk usage threshold (%)" hint="Alert when root disk usage exceeds this">
                  <div className="flex items-center gap-3">
                    <NumberInput value={form.diskAlertPercent ?? 90} onChange={v => update('diskAlertPercent', v)} min={50} max={99} />
                    <Toggle value={form.diskAlertEnabled ?? true} onChange={v => update('diskAlertEnabled', v)} />
                  </div>
                </Field>
              </Section>

              <Section title="SSL Certificate Alerts">
                <Field label="Warn at 14 / 7 / 1 days before expiry" hint="Checks run every 12 hours">
                  <Toggle value={form.sslAlertEnabled ?? true} onChange={v => update('sslAlertEnabled', v)} />
                </Field>
                <Field label="Domains to monitor">
                  <div className="space-y-2">
                    {(form.sslDomains || []).map((d, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={d}
                          onChange={e => {
                            const next = [...(form.sslDomains || [])];
                            next[i] = e.target.value;
                            update('sslDomains', next);
                          }}
                          placeholder="example.com"
                          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={() => update('sslDomains', (form.sslDomains || []).filter((_, j) => j !== i))}
                          className="px-3 py-2 text-xs rounded-lg border border-red-800 bg-red-900/20 text-red-400 hover:bg-red-900/40 transition-colors"
                        >✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => update('sslDomains', [...(form.sslDomains || []), ''])}
                      className="w-full py-1.5 text-xs rounded-lg border border-dashed border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
                    >+ Add domain</button>
                  </div>
                </Field>
              </Section>

              <Section title="Public IP Change Alert">
                <Field label="Alert when public IP changes" hint="Checks every 15 min via api.ipify.org">
                  <Toggle value={form.publicIpAlertEnabled ?? true} onChange={v => update('publicIpAlertEnabled', v)} />
                </Field>
              </Section>

              <Section title="Telegram Notifications">
                <div className="text-xs text-slate-500 mb-3 leading-relaxed">
                  Set <code className="text-slate-300 bg-slate-800 px-1 rounded">TELEGRAM_BOT_TOKEN</code> in <code className="text-slate-300 bg-slate-800 px-1 rounded">.env</code> via{' '}
                  <span className="text-slate-400">@BotFather</span>. Get your Chat ID from{' '}
                  <span className="text-slate-400">@userinfobot</span>.
                </div>
                <Field label="Enable Telegram alerts">
                  <Toggle value={form.telegramEnabled || false} onChange={v => update('telegramEnabled', v)} />
                </Field>
                <Field label="Chat ID" hint="Your Telegram user or group chat ID">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.telegramChatId || ''}
                      onChange={e => update('telegramChatId', e.target.value)}
                      placeholder="e.g. 123456789"
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={async () => {
                        if (!form.telegramChatId) return;
                        setTelegramTesting(true);
                        setTelegramTestResult(null);
                        try {
                          const res = await fetch('/api/telegram/test', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chatId: form.telegramChatId }),
                          });
                          const data = await res.json();
                          setTelegramTestResult(data.ok ? 'ok' : data.error || 'error');
                        } catch {
                          setTelegramTestResult('error');
                        }
                        setTelegramTesting(false);
                        setTimeout(() => setTelegramTestResult(null), 4000);
                      }}
                      disabled={telegramTesting || !form.telegramChatId}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
                    >
                      {telegramTesting ? '…' : 'Test'}
                    </button>
                  </div>
                  {telegramTestResult && (
                    <div className={`text-xs mt-1.5 ${telegramTestResult === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {telegramTestResult === 'ok' ? '✓ Message sent! Check your Telegram.' : `✗ ${telegramTestResult}`}
                    </div>
                  )}
                </Field>
              </Section>

              <Section title="Security">
                <div className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-xl">
                  <div>
                    <div className="text-sm text-slate-300">Face ID</div>
                    <div className={`text-xs mt-0.5 ${faceIdRegistered ? 'text-emerald-400' : 'text-slate-500'}`}>
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
              </Section>

              {error && <div className="text-red-400 text-xs">{error}</div>}

              <button
                onClick={save}
                disabled={saving}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  saved ? 'bg-emerald-700 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-sm text-slate-300 block mb-1.5">{label}</label>
      {children}
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${value ? 'bg-indigo-600' : 'bg-slate-600'}`}>
      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
    </div>
  );
}

function NumberInput({ value, onChange, min, max }) {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      min={min}
      max={max}
      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
    />
  );
}
