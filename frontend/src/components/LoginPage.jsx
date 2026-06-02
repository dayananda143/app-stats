import { useEffect, useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export default function LoginPage({ onLogin }) {
  const [step, setStep]           = useState('login');   // 'login' | 'enroll'
  const [pendingToken, setPending] = useState('');
  const [serverHasCred, setServerHasCred] = useState(false);

  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [faceLoading, setFaceLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  // Check server for any registered credential on mount
  useEffect(() => {
    fetch('/api/auth/webauthn/registered')
      .then(r => r.json())
      .then(d => setServerHasCred(d.registered))
      .catch(() => {});
  }, []);

  const webAuthnSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;

  // ── Password login ──────────────────────────────────────────────────────────
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }

      // Offer Face ID enrollment if supported and not yet registered
      if (webAuthnSupported && !serverHasCred) {
        setPending(data.token);
        setStep('enroll');
      } else {
        localStorage.setItem('app-stats-token', data.token);
        onLogin(data.token);
      }
    } catch {
      setError('Could not reach server');
    } finally {
      setLoading(false);
    }
  };

  // ── Face ID login ───────────────────────────────────────────────────────────
  const loginWithFaceId = async () => {
    setError('');
    setFaceLoading(true);
    try {
      const optRes = await fetch('/api/auth/webauthn/auth/options', { method: 'POST' });
      if (!optRes.ok) { setError('No Face ID credential found'); return; }
      const options = await optRes.json();

      const authResp = await startAuthentication(options);

      const verRes = await fetch('/api/auth/webauthn/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authResp),
      });
      const data = await verRes.json();
      if (!verRes.ok) throw new Error(data.error || 'Face ID failed');

      localStorage.setItem('app-stats-token', data.token);
      onLogin(data.token);
    } catch (err) {
      if (err.name === 'NotAllowedError') setError('Face ID was cancelled');
      else setError(err.message || 'Face ID failed');
    } finally {
      setFaceLoading(false);
    }
  };

  // ── Enroll Face ID ──────────────────────────────────────────────────────────
  const enrollFaceId = async () => {
    setError('');
    setEnrolling(true);
    try {
      const optRes = await fetch('/api/auth/webauthn/register/options', {
        method: 'POST',
        headers: { Authorization: `Bearer ${pendingToken}` },
      });
      if (!optRes.ok) throw new Error('Could not start Face ID setup');
      const options = await optRes.json();

      const regResp = await startRegistration(options);

      const verRes = await fetch('/api/auth/webauthn/register/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${pendingToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(regResp),
      });
      const data = await verRes.json();
      if (!verRes.ok) throw new Error(data.error || 'Setup failed');

      setServerHasCred(true);
      localStorage.setItem('app-stats-token', pendingToken);
      onLogin(pendingToken);
    } catch (err) {
      if (err.name === 'NotAllowedError') setError('Face ID was cancelled');
      else setError(err.message || 'Setup failed');
    } finally {
      setEnrolling(false);
    }
  };

  const skipEnroll = () => {
    localStorage.setItem('app-stats-token', pendingToken);
    onLogin(pendingToken);
  };

  // ── Enroll screen ───────────────────────────────────────────────────────────
  if (step === 'enroll') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-6 pt-[env(safe-area-inset-top)]">
        <div className="w-full max-w-sm text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700 flex items-center justify-center">
            <FaceIdIcon className="w-12 h-12 text-indigo-400" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">Enable Face ID</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
            Sign in instantly next time using Face ID instead of your password.
          </p>

          {error && (
            <div className="text-xs text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-4 text-left">
              {error}
            </div>
          )}

          <button
            onClick={enrollFaceId}
            disabled={enrolling}
            className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 mb-3"
          >
            <FaceIdIcon className="w-5 h-5" />
            {enrolling ? 'Setting up…' : 'Enable Face ID'}
          </button>

          <button
            onClick={skipEnroll}
            className="w-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white py-3 text-sm transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  // ── Login screen ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-4 pt-[env(safe-area-inset-top)]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl font-bold text-white mb-3">A</div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">App Stats</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Raspberry Pi Monitor</p>
        </div>

        {/* Face ID button — shown if server has a registered credential */}
        {webAuthnSupported && serverHasCred && (
          <button
            onClick={loginWithFaceId}
            disabled={faceLoading}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 active:bg-slate-200 dark:active:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-indigo-600 text-slate-900 dark:text-white font-medium py-4 rounded-2xl text-sm transition-colors mb-5 disabled:opacity-60"
          >
            <FaceIdIcon className="w-6 h-6 text-indigo-400" />
            {faceLoading ? 'Checking Face ID…' : 'Sign in with Face ID'}
          </button>
        )}

        {/* Divider */}
        {webAuthnSupported && serverHasCred && (
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700" />
            <span className="text-xs text-slate-500 dark:text-slate-500">or use password</span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700" />
          </div>
        )}

        {/* Password form */}
        <form onSubmit={submit} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus={!serverHasCred}
              autoCapitalize="none"
              autoCorrect="off"
              required
              className="w-full bg-gray-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Enter username"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-gray-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-3 pr-10 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1"
                tabIndex={-1}
              >
                {showPass ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 dark:text-slate-600 mt-5">Raspberry Pi · App Stats Monitor</p>
      </div>
    </div>
  );
}

function FaceIdIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Corner brackets */}
      <path d="M14 4H8a4 4 0 00-4 4v6" />
      <path d="M34 4h6a4 4 0 014 4v6" />
      <path d="M14 44H8a4 4 0 01-4-4v-6" />
      <path d="M34 44h6a4 4 0 004-4v-6" />
      {/* Eyes */}
      <circle cx="17" cy="21" r="2" fill="currentColor" stroke="none" />
      <circle cx="31" cy="21" r="2" fill="currentColor" stroke="none" />
      {/* Nose */}
      <path d="M24 22v5" />
      {/* Smile */}
      <path d="M17 33c1.8 2.5 5.2 4 7 4s5.2-1.5 7-4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
    </svg>
  );
}
