import { useEffect, useState } from 'react';

export default function SettingsModal({ token, onClose }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setForm)
      .catch(() => setError('Failed to load settings'));
  }, [token]);

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
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="font-semibold text-white">Alert Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none px-1">×</button>
        </div>

        <div className="p-4 space-y-5">
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
