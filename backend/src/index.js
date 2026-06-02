const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const pm2 = require('pm2');
const si = require('systeminformation');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const db = require('./db');
const os = require('os');
const { getNetworkIO } = require('./network');
const { getDiskIO } = require('./disk');
const settings = require('./settings');
const { sendTempAlert, sendProcessAlert } = require('./mailer');
const { sendTelegramTempAlert, sendTelegramProcessAlert, sendTelegramWithChatId } = require('./telegram');
const { checkAllCerts, getNewAlerts } = require('./ssl');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// ─── Auth ────────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(header.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const LINKS_PATH = path.join(__dirname, 'links.json');
const NOTES_PATH = path.join(__dirname, 'notes.json');

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } }
function saveJSON(p, data) { fs.writeFileSync(p, JSON.stringify(data, null, 2)); }

function os_uptime() {
  try { return parseFloat(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]); } catch { return 0; }
}

function cpu_temp() {
  try {
    const raw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    return Math.round(parseInt(raw.trim()) / 100) / 10;
  } catch { return null; }
}

function cpu_throttle() {
  return new Promise(resolve => {
    exec('vcgencmd get_throttled', (err, stdout) => {
      if (err) return resolve(null);
      const match = stdout.match(/throttled=(0x[0-9a-fA-F]+)/);
      if (!match) return resolve(null);
      const val = parseInt(match[1], 16);
      resolve({
        raw: match[1],
        underVoltage:    !!(val & 0x1),
        freqCapped:      !!(val & 0x2),
        throttled:       !!(val & 0x4),
        softTempLimit:   !!(val & 0x8),
        underVoltageOccurred: !!(val & 0x10000),
        freqCappedOccurred:   !!(val & 0x20000),
        throttledOccurred:    !!(val & 0x40000),
        ok: val === 0,
      });
    });
  });
}

function nginx_stats() {
  return new Promise(resolve => {
    exec('curl -s http://127.0.0.1:8080/nginx_status', (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const active = parseInt((stdout.match(/Active connections:\s*(\d+)/) || [])[1]) || 0;
      const nums   = stdout.match(/\s(\d+)\s+(\d+)\s+(\d+)/);
      const rw     = stdout.match(/Reading:\s*(\d+)\s+Writing:\s*(\d+)\s+Waiting:\s*(\d+)/);
      resolve({
        active,
        accepts:  nums ? parseInt(nums[1]) : 0,
        handled:  nums ? parseInt(nums[2]) : 0,
        requests: nums ? parseInt(nums[3]) : 0,
        reading:  rw ? parseInt(rw[1]) : 0,
        writing:  rw ? parseInt(rw[2]) : 0,
        waiting:  rw ? parseInt(rw[3]) : 0,
      });
    });
  });
}

// DB sizes: PostgreSQL + SQLite files
const DB_MAP = {
  'moneymatriz-backend': { type: 'postgres', db: 'moneymatriz', user: 'moneymatriz', pass: 'mm_secure_2024' },
  'cooking-recipes-backend': { type: 'sqlite', file: '/home/raspbi/Documents/projects/cooking-recipes/backend/data/recipes.db' },
  'expenses-backend':        { type: 'sqlite', file: '/home/raspbi/Documents/projects/expenses/backend/data/expenses.db' },
  'stock-backend':           { type: 'sqlite', file: '/home/raspbi/Documents/projects/stock-portfolio/backend/data/portfolio.db' },
};

function getDbSize(name) {
  const cfg = DB_MAP[name];
  if (!cfg) return Promise.resolve(null);
  if (cfg.type === 'sqlite') {
    return new Promise(resolve => {
      try { resolve({ type: 'sqlite', bytes: fs.statSync(cfg.file).size, file: cfg.file }); }
      catch { resolve(null); }
    });
  }
  if (cfg.type === 'postgres') {
    return new Promise(resolve => {
      exec(
        `PGPASSWORD=${cfg.pass} psql -U ${cfg.user} -h localhost -d ${cfg.db} -t -c "SELECT pg_database_size('${cfg.db}');" 2>/dev/null`,
        (err, stdout) => {
          if (err) return resolve(null);
          const bytes = parseInt(stdout.trim());
          resolve(isNaN(bytes) ? null : { type: 'postgres', bytes, db: cfg.db });
        }
      );
    });
  }
  return Promise.resolve(null);
}

function getListeningPorts() {
  return new Promise(resolve => {
    exec('ss -tlnp', (err, stdout) => {
      if (err) return resolve({});
      const map = {};
      (stdout || '').split('\n').forEach(line => {
        const pidMatch  = line.match(/pid=(\d+)/);
        const portMatch = line.match(/:(\d+)\s/);
        if (pidMatch && portMatch) {
          const pid = parseInt(pidMatch[1]), port = parseInt(portMatch[1]);
          if (!map[pid]) map[pid] = port;
        }
      });
      resolve(map);
    });
  });
}

function logAlert(type, title, detail) {
  db.prepare('INSERT INTO alerts (ts, type, title, detail) VALUES (?, ?, ?, ?)').run(Date.now(), type, title, detail || null);
}

// ─── Alert state ─────────────────────────────────────────────────────────────
const processStates = {};
const processResourceAlerts = {}; // { name: { cpuHighAt, cpuAlerted, ramHighAt, ramAlerted, stuckSince, stuckAlerted } }
let tempAlertState = 'normal';
let lastTempAlertAt = 0;
let sysRamAlertState = 'normal';
let lastSysRamAlertAt = 0;
let diskAlertState = 'normal';
let lastDiskAlertAt = 0;
let lastKnownPublicIp = null;

// ─── Express + Socket.io ─────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.use((socket, next) => {
  try { jwt.verify(socket.handshake.auth.token, JWT_SECRET); next(); }
  catch { next(new Error('Unauthorized')); }
});

app.use(cors());
app.use(express.json());

// ─── Health check (no auth) ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ─── Public: login ────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username !== process.env.ADMIN_USERNAME || !bcrypt.compareSync(password, process.env.ADMIN_PASSWORD_HASH || ''))
    return res.status(401).json({ error: 'Invalid username or password' });
  res.json({ token: jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' }) });
});

// ─── WebAuthn / Face ID ───────────────────────────────────────────────────────
const RP_ID     = process.env.RP_ID     || 'localhost';
const ORIGIN    = process.env.ORIGIN    || 'http://localhost:5173';
const RP_NAME   = 'App Stats';

// In-memory challenge store (single-user app, short-lived)
const challengeStore = new Map();

// Registration Step 1: get options (requires valid JWT — user already logged in)
app.post('/api/auth/webauthn/register/options', requireAuth, async (req, res) => {
  try {
    const username = req.user.username;
    const existing = db.prepare('SELECT credential_id FROM webauthn_credentials WHERE username = ?').all(username);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: Buffer.from(username, 'utf8'),
      userName: username,
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({
        id: Buffer.from(c.credential_id, 'base64url'),
        type: 'public-key',
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
    });

    challengeStore.set(`reg:${username}`, options.challenge);
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registration Step 2: verify and store
app.post('/api/auth/webauthn/register/verify', requireAuth, async (req, res) => {
  try {
    const username = req.user.username;
    const expectedChallenge = challengeStore.get(`reg:${username}`);
    if (!expectedChallenge) return res.status(400).json({ error: 'No challenge found — start registration again' });

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    if (!verification.verified) return res.status(400).json({ error: 'Verification failed' });

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    db.prepare(`
      INSERT OR REPLACE INTO webauthn_credentials (username, credential_id, public_key, counter, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      username,
      Buffer.from(credentialID).toString('base64url'),
      Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
      Date.now(),
    );

    challengeStore.delete(`reg:${username}`);
    res.json({ verified: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Authentication Step 1: get options (public — no JWT needed yet)
app.post('/api/auth/webauthn/auth/options', async (req, res) => {
  try {
    const username = process.env.ADMIN_USERNAME;
    const credentials = db.prepare('SELECT credential_id FROM webauthn_credentials WHERE username = ?').all(username);

    if (!credentials.length) return res.status(404).json({ error: 'No Face ID credential registered on this device' });

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credentials.map(c => ({
        id: Buffer.from(c.credential_id, 'base64url'),
        type: 'public-key',
        transports: ['internal'],
      })),
      userVerification: 'required',
    });

    challengeStore.set('auth', options.challenge);
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Authentication Step 2: verify and return JWT (public)
app.post('/api/auth/webauthn/auth/verify', async (req, res) => {
  try {
    const expectedChallenge = challengeStore.get('auth');
    if (!expectedChallenge) return res.status(400).json({ error: 'No challenge found — try again' });

    const credentialId = req.body.id;
    const credential = db.prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?').get(credentialId);
    if (!credential) return res.status(400).json({ error: 'Credential not found' });

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      authenticator: {
        credentialID: Buffer.from(credential.credential_id, 'base64url'),
        credentialPublicKey: Buffer.from(credential.public_key, 'base64url'),
        counter: credential.counter,
      },
    });

    if (!verification.verified) return res.status(400).json({ error: 'Verification failed' });

    // Update replay-attack counter
    db.prepare('UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?')
      .run(verification.authenticationInfo.newCounter, credential.credential_id);

    challengeStore.delete('auth');

    const token = jwt.sign({ username: credential.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove Face ID credential (requires JWT)
app.delete('/api/auth/webauthn/credential', requireAuth, (req, res) => {
  db.prepare('DELETE FROM webauthn_credentials WHERE username = ?').run(req.user.username);
  res.json({ ok: true });
});

// Check if any credential is registered (public — so login page knows to show Face ID button)
app.get('/api/auth/webauthn/registered', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as n FROM webauthn_credentials WHERE username = ?')
    .get(process.env.ADMIN_USERNAME).n;
  res.json({ registered: count > 0 });
});

app.use('/api', requireAuth);

// ─── Settings ─────────────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => res.json(settings.load()));
app.put('/api/settings', (req, res) => {
  try { settings.save(req.body); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Public IP ───────────────────────────────────────────────────────────────
app.get('/api/system/public-ip', requireAuth, (req, res) => {
  res.json({ ip: lastKnownPublicIp });
});

// ─── SSL cert status ─────────────────────────────────────────────────────────
app.get('/api/ssl/status', requireAuth, async (req, res) => {
  const cfg = settings.load();
  if (!cfg.sslDomains || cfg.sslDomains.length === 0) return res.json([]);
  try {
    const results = await checkAllCerts(cfg.sslDomains);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Telegram test ───────────────────────────────────────────────────────────
app.post('/api/telegram/test', requireAuth, async (req, res) => {
  const { chatId } = req.body;
  if (!chatId) return res.status(400).json({ error: 'chatId required' });
  try {
    await sendTelegramWithChatId(chatId, '✅ <b>App Stats</b> — Telegram notifications are working!');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Alerts history ──────────────────────────────────────────────────────────
app.get('/api/alerts', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const rows = db.prepare('SELECT * FROM alerts ORDER BY ts DESC LIMIT ?').all(limit);
  res.json(rows);
});
app.delete('/api/alerts', (req, res) => {
  db.prepare('DELETE FROM alerts').run();
  res.json({ ok: true });
});

// ─── Links + Notes ────────────────────────────────────────────────────────────
app.get('/api/links', (req, res) => res.json(loadJSON(LINKS_PATH)));
app.put('/api/links', (req, res) => { try { saveJSON(LINKS_PATH, req.body); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/notes', (req, res) => res.json(loadJSON(NOTES_PATH)));
app.put('/api/notes', (req, res) => { try { saveJSON(NOTES_PATH, req.body); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Processes ────────────────────────────────────────────────────────────────
app.get('/api/processes', async (req, res) => {
  try {
    const [list, portMap] = await Promise.all([pm2List(), getListeningPorts()]);
    const links = loadJSON(LINKS_PATH), notes = loadJSON(NOTES_PATH);
    const procs = list.map(p => ({
      ...formatProcess(p),
      link: links[p.name] || null,
      note: notes[p.name] || null,
      port: portMap[p.pid] || null,
      history: history[p.name] || [],
    }));
    res.json(procs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/processes/:name/restart', (req, res) => pm2.restart(req.params.name, err => err ? res.status(500).json({ error: err.message }) : res.json({ ok: true })));
app.post('/api/processes/:name/stop',    (req, res) => pm2.stop(req.params.name,    err => err ? res.status(500).json({ error: err.message }) : res.json({ ok: true })));
app.post('/api/processes/:name/start',   (req, res) => pm2.restart(req.params.name, err => err ? res.status(500).json({ error: err.message }) : res.json({ ok: true })));

// GET logs
app.get('/api/processes/:name/logs', async (req, res) => {
  try {
    const list = await pm2List();
    const proc = list.find(p => p.name === req.params.name);
    if (!proc) return res.status(404).json({ error: 'Process not found' });
    const lines = parseInt(req.query.lines) || 100;
    const readLog = p => new Promise(resolve => {
      if (!p || !fs.existsSync(p)) return resolve([]);
      exec(`tail -n ${lines} "${p}"`, (err, stdout) => resolve(err ? [] : stdout.split('\n').filter(Boolean)));
    });
    const [out, err2] = await Promise.all([readLog(proc.pm2_env.pm_out_log_path), readLog(proc.pm2_env.pm_err_log_path)]);
    res.json({ out, err: err2, logPath: proc.pm2_env.pm_out_log_path, errPath: proc.pm2_env.pm_err_log_path });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Download full log file
app.get('/api/processes/:name/logs/download', async (req, res) => {
  try {
    const list = await pm2List();
    const proc = list.find(p => p.name === req.params.name);
    if (!proc) return res.status(404).json({ error: 'Process not found' });
    const type = req.query.type === 'err' ? 'pm_err_log_path' : 'pm_out_log_path';
    const logPath = proc.pm2_env[type];
    if (!logPath || !fs.existsSync(logPath)) return res.status(404).json({ error: 'Log file not found' });
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}-${req.query.type || 'out'}.log"`);
    res.setHeader('Content-Type', 'text/plain');
    fs.createReadStream(logPath).pipe(res);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 24h process history
app.get('/api/processes/:name/history', (req, res) => {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = db.prepare('SELECT ts, cpu, memory, status FROM process_history WHERE name = ? AND ts > ? ORDER BY ts ASC').all(req.params.name, since);
  res.json(rows);
});

// 24h system history
app.get('/api/system/history', (req, res) => {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = db.prepare('SELECT ts, cpu, mem_used, temp, net_in, net_out, disk_read, disk_write FROM system_history WHERE ts > ? ORDER BY ts ASC').all(since);
  res.json(rows);
});

// Export system history as CSV or JSON download
app.get('/api/export/system', (req, res) => {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = db.prepare('SELECT ts, cpu, mem_used, temp, net_in, net_out, disk_read, disk_write FROM system_history WHERE ts > ? ORDER BY ts ASC').all(since);
  const fmt = req.query.format === 'csv' ? 'csv' : 'json';
  const date = new Date().toISOString().slice(0, 10);
  if (fmt === 'csv') {
    const header = 'timestamp,datetime,cpu_percent,memory_bytes,temp_celsius,net_in_bps,net_out_bps,disk_read_bps,disk_write_bps';
    const body = rows.map(r =>
      `${r.ts},${new Date(r.ts).toISOString()},${r.cpu},${r.mem_used},${r.temp ?? ''},${r.net_in ?? ''},${r.net_out ?? ''},${r.disk_read ?? ''},${r.disk_write ?? ''}`
    ).join('\n');
    res.setHeader('Content-Disposition', `attachment; filename="system-history-${date}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    return res.send(header + '\n' + body);
  }
  res.setHeader('Content-Disposition', `attachment; filename="system-history-${date}.json"`);
  res.json(rows.map(r => ({ ...r, datetime: new Date(r.ts).toISOString() })));
});

// Export process history as CSV or JSON download
app.get('/api/export/process/:name', (req, res) => {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = db.prepare('SELECT ts, cpu, memory, status FROM process_history WHERE name = ? AND ts > ? ORDER BY ts ASC').all(req.params.name, since);
  const fmt = req.query.format === 'csv' ? 'csv' : 'json';
  const date = new Date().toISOString().slice(0, 10);
  const name = req.params.name;
  if (fmt === 'csv') {
    const header = 'timestamp,datetime,cpu_percent,memory_bytes,status';
    const body = rows.map(r =>
      `${r.ts},${new Date(r.ts).toISOString()},${r.cpu},${r.memory},${r.status}`
    ).join('\n');
    res.setHeader('Content-Disposition', `attachment; filename="${name}-history-${date}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    return res.send(header + '\n' + body);
  }
  res.setHeader('Content-Disposition', `attachment; filename="${name}-history-${date}.json"`);
  res.json(rows.map(r => ({ ...r, datetime: new Date(r.ts).toISOString() })));
});

// ─── System ───────────────────────────────────────────────────────────────────
app.get('/api/system', async (req, res) => {
  try {
    const [cpu, mem, disk, osInfo, throttle, nginx] = await Promise.all([
      si.currentLoad(), si.mem(), si.fsSize(), si.osInfo(), cpu_throttle(), nginx_stats(),
    ]);
    res.json({
      cpu: Math.round(cpu.currentLoad * 10) / 10,
      memory: { total: mem.total, used: mem.used, free: mem.free, percent: Math.round((mem.used / mem.total) * 100) },
      disk: disk.filter(d => d.mount === '/').map(d => ({ size: d.size, used: d.used, free: d.size - d.used, use: d.use, mount: d.mount }))[0] || null,
      uptime: os_uptime(), temp: cpu_temp(), throttle, nginx,
      platform: osInfo.platform, hostname: osInfo.hostname,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/system/ram-processes', (req, res) => {
  exec('ps aux --sort=-%mem --no-headers', (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    let memAvailable = 0;
    try { const m = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/); if (m) memAvailable = parseInt(m[1]) * 1024; } catch {}
    const processes = (stdout || '').trim().split('\n').map(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[1]), cpu = parseFloat(parts[2]);
      const rss = parseInt(parts[5]) * 1024, cmd = parts.slice(10).join(' ');
      let name = cmd;
      if (cmd.includes('chromium-browser')) name = 'Chromium';
      else if (cmd.includes('/code') || cmd.includes('vscode')) name = 'VSCode';
      else if (cmd.includes('claude')) name = 'Claude Code';
      else if (cmd.includes('node') || cmd.includes('npm')) { const m = cmd.match(/([a-z0-9_-]+)\/src\/index\.js/i); name = m ? m[1] + ' (node)' : 'Node.js'; }
      else if (cmd.includes('cloudflared')) name = 'Cloudflare Tunnel';
      else if (cmd.includes('nginx')) name = 'nginx';
      else if (cmd.includes('postgres')) name = 'PostgreSQL';
      else name = cmd.split(' ')[0].split('/').pop() || cmd.slice(0, 30);
      return { pid, name, cpu, rss, cmd: cmd.slice(0, 80) };
    }).filter(p => p.rss > 0);
    const grouped = {};
    processes.forEach(p => {
      if (!grouped[p.name]) grouped[p.name] = { name: p.name, rss: 0, cpu: 0, count: 0, pids: [], items: [] };
      grouped[p.name].rss += p.rss; grouped[p.name].cpu += p.cpu; grouped[p.name].count++;
      grouped[p.name].pids.push(p.pid);
      grouped[p.name].items.push({ pid: p.pid, rss: p.rss, cpu: p.cpu, cmd: p.cmd });
    });
    res.json({ processes: Object.values(grouped).sort((a, b) => b.rss - a.rss), memAvailable });
  });
});

app.post('/api/system/clear-cache', (req, res) => {
  exec('sync && echo 3 | sudo tee /proc/sys/vm/drop_caches', (err, _out, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true });
  });
});

app.post('/api/system/kill-process', (req, res) => {
  const { pids } = req.body || {};
  if (!Array.isArray(pids) || pids.length === 0) return res.status(400).json({ error: 'pids required' });
  const valid = pids.filter(p => Number.isInteger(p) && p > 0);
  if (!valid.length) return res.status(400).json({ error: 'Invalid PIDs' });
  exec(`kill -9 ${valid.join(' ')}`, (err, _out, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true, killed: valid });
  });
});

app.get('/api/disk/breakdown', (req, res) => {
  exec('du -sb /home/raspbi/.[^.]* /home/raspbi/* 2>/dev/null | sort -rn | head -15', (err, stdout) => {
    const entries = (stdout || '').trim().split('\n').filter(Boolean).map(line => {
      const [bytes, ...p] = line.split('\t');
      const fullPath = p.join('\t');
      return { path: fullPath, name: fullPath.split('/').pop(), bytes: parseInt(bytes) };
    }).filter(e => e.bytes > 0);
    res.json({ entries });
  });
});

// ─── Hardware ─────────────────────────────────────────────────────────────────
const MANF_IDS = {
  '0x000001': 'Panasonic', '0x000002': 'Toshiba', '0x000003': 'SanDisk',
  '0x000006': 'Ritek', '0x000018': 'Infineon', '0x00001b': 'Samsung',
  '0x00001d': 'AData', '0x000028': 'Lexar', '0x000041': 'Kingston',
  '0x000074': 'Transcend', '0x000082': 'Sony',
};

function readSys(p) { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; } }

app.get('/api/hardware/sd', (req, res) => {
  try {
    const name   = readSys('/sys/block/mmcblk0/device/name');
    const manfid = readSys('/sys/block/mmcblk0/device/manfid');
    const raw    = readSys('/sys/block/mmcblk0/stat');
    if (!name || !raw) return res.json(null);
    const s = raw.split(/\s+/).map(Number);
    // columns: read_ios, read_merges, read_sectors, read_ticks, write_ios, write_merges, write_sectors, ...
    res.json({
      name,
      manufacturer: manfid ? (MANF_IDS[manfid] || `ID ${manfid}`) : null,
      gbRead:    +(s[2]  * 512 / 1e9).toFixed(1),
      gbWritten: +(s[6]  * 512 / 1e9).toFixed(1),
      readOps:   s[0],
      writeOps:  s[4],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/hardware/cpu-freq', (req, res) => {
  const curKhz = parseInt(readSys('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq'));
  const maxKhz = parseInt(readSys('/sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq'));
  const minKhz = parseInt(readSys('/sys/devices/system/cpu/cpu0/cpufreq/scaling_min_freq'));
  const governor = readSys('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor');
  res.json({
    currentMhz: isNaN(curKhz) ? null : Math.round(curKhz / 1000),
    maxMhz:     isNaN(maxKhz) ? null : Math.round(maxKhz / 1000),
    minMhz:     isNaN(minKhz) ? null : Math.round(minKhz / 1000),
    governor,
    atMax: !isNaN(curKhz) && !isNaN(maxKhz) ? curKhz >= maxKhz * 0.99 : null,
  });
});

app.get('/api/hardware/gpio', (req, res) => {
  exec('raspi-gpio get 2>/dev/null', { timeout: 5000 }, (err, stdout) => {
    if (err || !stdout) return res.json({ pins: [] });
    const pins = [];
    for (const line of stdout.split('\n')) {
      const m = line.match(/GPIO\s+(\d+):\s+level=(\d+)\s+fsel=\d+\s+func=(\S+)(?:\s+pull=(\S+))?/);
      if (m) pins.push({ gpio: parseInt(m[1]), level: parseInt(m[2]), func: m[3], pull: m[4] || null });
    }
    res.json({ pins });
  });
});

app.get('/api/hardware/usb', (req, res) => {
  exec('lsusb 2>/dev/null', { timeout: 5000 }, (err, stdout) => {
    if (err || !stdout) return res.json({ devices: [] });
    const devices = stdout.trim().split('\n').filter(Boolean).map(line => {
      const m = line.match(/Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+([0-9a-f:]+)\s+(.*)/i);
      return m ? { bus: m[1], device: m[2], id: m[3], name: m[4].trim() } : null;
    }).filter(Boolean);
    res.json({ devices });
  });
});

let updatesCache = null, updatesCachedAt = 0;
let installInProgress = false;

app.get('/api/system/updates', (req, res) => {
  if (updatesCache && Date.now() - updatesCachedAt < 10 * 60 * 1000) return res.json(updatesCache);
  exec('apt list --upgradable 2>/dev/null', { timeout: 30000 }, (_err, stdout) => {
    const packages = (stdout || '').trim().split('\n')
      .filter(l => l.includes('[upgradable'))
      .map(l => {
        const m = l.match(/^([^/]+)\/(\S+)\s+(\S+)\s+(\S+)\s+\[upgradable/);
        return m ? { name: m[1], suite: m[2], version: m[3], arch: m[4] } : null;
      }).filter(Boolean);
    const security = packages.filter(p => p.suite.includes('security')).length;
    updatesCache = { count: packages.length, security, packages, cachedAt: Date.now() };
    updatesCachedAt = Date.now();
    res.json(updatesCache);
  });
});

// Stream apt-get install output
app.post('/api/system/updates/install', (req, res) => {
  if (installInProgress) return res.status(409).json({ error: 'An installation is already running' });
  const { packages } = req.body || {};
  if (!Array.isArray(packages) || packages.length === 0) return res.status(400).json({ error: 'No packages specified' });

  // Whitelist: valid Debian package name chars only
  const safe = packages.map(p => p.replace(/[^a-z0-9_.+:-]/gi, '').slice(0, 80)).filter(Boolean);
  if (!safe.length) return res.status(400).json({ error: 'Invalid package names' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  installInProgress = true;
  const send = obj => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {} };

  const child = spawn('sudo', ['apt-get', 'install', '-y', ...safe], {
    env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' },
  });

  child.stdout.on('data', d => send({ line: d.toString() }));
  child.stderr.on('data', d => send({ line: d.toString(), isErr: true }));
  child.on('error', err => {
    installInProgress = false;
    send({ line: `spawn error: ${err.message}\n`, isErr: true });
    send({ done: true, code: 1 });
    res.end();
  });
  child.on('close', code => {
    const finish = () => {
      installInProgress = false;
      updatesCache = null;
      updatesCachedAt = 0;
      send({ done: true, code });
      res.end();
    };
    if (code !== 0) return finish();
    // Verify what dpkg actually recorded for the installed packages
    const vCmd = "dpkg-query -W -f='${Package}\\t${Version}\\t${db:Status-Status}\\n' " + safe.join(' ');
    exec(vCmd, { timeout: 5000 }, (_, vOut) => {
      send({ line: '\n─── Installed versions ───\n' });
      (vOut || '').trim().split('\n').filter(Boolean).forEach(line => {
        const [pkg, ver, status] = line.split('\t');
        send({ line: `✓  ${pkg}  →  ${ver}  (${status || 'installed'})\n` });
      });
      finish();
    });
  });

  // If client disconnects mid-install, let apt finish — don't kill it.
  // Just mark the response as gone so send() calls are silently swallowed.
  req.on('close', () => { /* intentionally no-op: apt must be allowed to complete */ });
});

// ─── PM2 internals ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3006;
const MAX_HISTORY = 60;
const history = {};

function ensureHistory(name) { if (!history[name]) history[name] = []; }

function pm2Connect() {
  return new Promise((resolve, reject) => pm2.connect(true, err => err ? reject(err) : resolve()));
}
function pm2List() {
  return new Promise((resolve, reject) => pm2.list((err, list) => err ? reject(err) : resolve(list)));
}
function formatProcess(p) {
  return {
    name: p.name, pmId: p.pm_id, pid: p.pid, status: p.pm2_env.status,
    cpu: p.monit ? p.monit.cpu : 0, memory: p.monit ? p.monit.memory : 0,
    uptime: p.pm2_env.pm_uptime, restarts: p.pm2_env.restart_time,
    createdAt: p.pm2_env.created_at, logOutPath: p.pm2_env.pm_out_log_path,
    logErrPath: p.pm2_env.pm_err_log_path, execMode: p.pm2_env.exec_mode,
    version: p.pm2_env.version, instances: p.pm2_env.instances || 1,
  };
}

// ─── Network interfaces ───────────────────────────────────────────────────────
function getLocalInterfaces() {
  const ifaces = os.networkInterfaces();
  const result = [];
  for (const [name, addresses] of Object.entries(ifaces)) {
    if (/^(lo|docker|br-|veth)/.test(name)) continue;
    const ipv4 = addresses.find(a => a.family === 'IPv4' && !a.internal);
    if (!ipv4) continue;
    let type = 'Other';
    if (/^(eth|enp|ens|eno)\d/.test(name)) type = 'LAN';
    else if (/^(wlan|wlp)\d/.test(name)) type = 'WiFi';
    else if (/^tailscale/.test(name)) type = 'Tailscale';
    else if (/^tun/.test(name)) type = 'VPN';
    result.push({ name, type, ip: ipv4.address });
  }
  return result;
}

// ─── Disk + history caches ───────────────────────────────────────────────────
let cachedDisk = null;
async function refreshDisk() {
  try {
    const disks = await si.fsSize();
    const root = disks.find(d => d.mount === '/');
    if (root) cachedDisk = { size: root.size, used: root.used, free: root.size - root.used, use: root.use, mount: root.mount };
  } catch {}
}

let lastHistoryWrite = 0;

// ─── Broadcast ───────────────────────────────────────────────────────────────
async function broadcastStats() {
  try {
    const [list, cpu, mem, throttle, nginx] = await Promise.all([
      pm2List(), si.currentLoad(), si.mem(), cpu_throttle(), nginx_stats(),
    ]);
    const netIO  = getNetworkIO();
    const diskIO = getDiskIO();
    const now    = Date.now();
    const cfg    = settings.load();
    const [links, notes, portMap] = [loadJSON(LINKS_PATH), loadJSON(NOTES_PATH), await getListeningPorts()];

    // Fetch DB sizes in parallel
    const dbSizeResults = await Promise.all(list.map(p => getDbSize(p.name)));
    const dbSizeMap = {};
    list.forEach((p, i) => { if (dbSizeResults[i]) dbSizeMap[p.name] = dbSizeResults[i]; });

    const processes = list.map(p => {
      const fmt = formatProcess(p);
      fmt.link = links[p.name] || null;
      fmt.note = notes[p.name] || null;
      fmt.port = portMap[p.pid] || null;
      fmt.dbSize = dbSizeMap[p.name] || null;
      ensureHistory(p.name);
      history[p.name].push({ ts: now, cpu: fmt.cpu, mem: fmt.memory });
      if (history[p.name].length > MAX_HISTORY) history[p.name].shift();
      fmt.history = history[p.name];

      // Crash / recovery alert
      const prev = processStates[p.name], curr = fmt.status;
      if (prev && prev !== curr) {
        const isCrash = curr === 'stopped' || curr === 'errored';
        const isRecovery = curr === 'online' && (prev === 'stopped' || prev === 'errored');
        if (cfg.processAlerts && (isCrash || isRecovery)) {
          sendProcessAlert(p.name, curr, fmt.link).catch(e => console.error('[mailer]', e.message));
          if (cfg.telegramEnabled && cfg.telegramChatId) {
            process.env.TELEGRAM_CHAT_ID = cfg.telegramChatId;
            sendTelegramProcessAlert(p.name, curr, fmt.link).catch(e => console.error('[telegram]', e.message));
          }
          logAlert(isCrash ? 'crash' : 'recovery', `${p.name} ${isCrash ? 'crashed' : 'recovered'}`, `Status: ${prev} → ${curr}`);
        }
      }
      processStates[p.name] = curr;
      return fmt;
    });

    const temp = cpu_temp();
    const systemStats = {
      cpu: Math.round(cpu.currentLoad * 10) / 10,
      memory: { total: mem.total, used: mem.used, free: mem.free, percent: Math.round((mem.used / mem.total) * 100) },
      disk: cachedDisk,
      uptime: os_uptime(),
      temp, throttle, nginx,
      network: netIO,
      disk_io: diskIO,
      publicIp: lastKnownPublicIp,
      interfaces: getLocalInterfaces(),
    };

    // Temperature alert
    const alertNow = Date.now();
    const cooldownMs = (cfg.alertCooldownMinutes || 15) * 60 * 1000;
    if (temp !== null) {
      if (temp >= cfg.tempThreshold && tempAlertState === 'normal' && alertNow - lastTempAlertAt > cooldownMs) {
        tempAlertState = 'hot'; lastTempAlertAt = alertNow;
        sendTempAlert(temp, 'hot').catch(e => console.error('[mailer]', e.message));
        if (cfg.telegramEnabled && cfg.telegramChatId) {
          process.env.TELEGRAM_CHAT_ID = cfg.telegramChatId;
          sendTelegramTempAlert(temp, 'hot').catch(e => console.error('[telegram]', e.message));
        }
        logAlert('temp_high', `CPU temperature ${temp}°C`, `Threshold: ${cfg.tempThreshold}°C`);
      } else if (temp <= cfg.tempRecovery && tempAlertState === 'hot') {
        tempAlertState = 'normal'; lastTempAlertAt = alertNow;
        sendTempAlert(temp, 'recovered').catch(e => console.error('[mailer]', e.message));
        if (cfg.telegramEnabled && cfg.telegramChatId) {
          process.env.TELEGRAM_CHAT_ID = cfg.telegramChatId;
          sendTelegramTempAlert(temp, 'recovered').catch(e => console.error('[telegram]', e.message));
        }
        logAlert('temp_ok', `CPU temperature recovered ${temp}°C`, null);
      }
    }

    // Process CPU / RAM / stuck alerts
    processes.forEach(p => {
      if (!processResourceAlerts[p.name]) processResourceAlerts[p.name] = { cpuHighAt: null, cpuAlerted: false, ramHighAt: null, ramAlerted: false, stuckSince: null, stuckAlerted: false };
      const rs = processResourceAlerts[p.name];
      if (p.status !== 'online') { Object.assign(rs, { cpuHighAt: null, cpuAlerted: false, ramHighAt: null, ramAlerted: false, stuckSince: null, stuckAlerted: false }); return; }

      // CPU threshold
      if (cfg.cpuAlertEnabled) {
        const thr = cfg.cpuAlertThreshold || 80;
        if (p.cpu > thr) {
          if (!rs.cpuHighAt) rs.cpuHighAt = alertNow;
          if (!rs.cpuAlerted && alertNow - rs.cpuHighAt > cooldownMs) {
            rs.cpuAlerted = true;
            logAlert('cpu_high', `${p.name} CPU high: ${p.cpu.toFixed(1)}%`, `Threshold: ${thr}%`);
          }
        } else { rs.cpuHighAt = null; rs.cpuAlerted = false; }
      }

      // RAM threshold
      if (cfg.ramAlertEnabled) {
        const thrBytes = (cfg.ramAlertThresholdMb || 400) * 1024 * 1024;
        if (p.memory > thrBytes) {
          if (!rs.ramHighAt) rs.ramHighAt = alertNow;
          if (!rs.ramAlerted && alertNow - rs.ramHighAt > cooldownMs) {
            rs.ramAlerted = true;
            logAlert('ram_high', `${p.name} RAM high: ${(p.memory / 1024 / 1024).toFixed(0)}MB`, `Threshold: ${cfg.ramAlertThresholdMb}MB`);
          }
        } else { rs.ramHighAt = null; rs.ramAlerted = false; }
      }

      // Stuck process (sustained high CPU)
      if (cfg.stuckAlertEnabled) {
        const sthrCpu = cfg.stuckCpuThreshold || 85;
        const sthrMs = (cfg.stuckMinutes || 5) * 60 * 1000;
        if (p.cpu > sthrCpu) {
          if (!rs.stuckSince) rs.stuckSince = alertNow;
          if (!rs.stuckAlerted && alertNow - rs.stuckSince > sthrMs) {
            rs.stuckAlerted = true;
            logAlert('stuck', `${p.name} may be stuck`, `CPU ${p.cpu.toFixed(1)}% for ${cfg.stuckMinutes}+ min`);
          }
        } else { rs.stuckSince = null; rs.stuckAlerted = false; }
      }
    });

    // System RAM alert
    if (cfg.sysRamAlertEnabled) {
      const ramPct = systemStats.memory?.percent || 0;
      const sysRamThr = cfg.sysRamAlertPercent || 85;
      if (ramPct >= sysRamThr && sysRamAlertState === 'normal' && alertNow - lastSysRamAlertAt > cooldownMs) {
        sysRamAlertState = 'high'; lastSysRamAlertAt = alertNow;
        logAlert('sys_ram_high', `System RAM high: ${ramPct}%`, `Threshold: ${sysRamThr}%`);
      } else if (ramPct < sysRamThr - 5 && sysRamAlertState === 'high') {
        sysRamAlertState = 'normal';
        logAlert('sys_ram_ok', `System RAM recovered: ${ramPct}%`, null);
      }
    }

    // Disk space alert
    if (cfg.diskAlertEnabled && cachedDisk) {
      const diskPct = Math.round(cachedDisk.use);
      const diskThr = cfg.diskAlertPercent || 90;
      const freeGb = (cachedDisk.free / 1024 ** 3).toFixed(1);
      if (diskPct >= diskThr && diskAlertState === 'normal' && alertNow - lastDiskAlertAt > cooldownMs) {
        diskAlertState = 'high'; lastDiskAlertAt = alertNow;
        logAlert('disk_high', `Disk usage high: ${diskPct}%`, `Free: ${freeGb}GB  Threshold: ${diskThr}%`);
        if (cfg.telegramEnabled && cfg.telegramChatId) {
          process.env.TELEGRAM_CHAT_ID = cfg.telegramChatId;
          sendTelegramWithChatId(cfg.telegramChatId,
            `💾 <b>Disk Space Alert</b>\n\nUsage: <b>${diskPct}%</b> (threshold: ${diskThr}%)\nFree: ${freeGb} GB\n\n<a href="https://app-stats.money-matriz.co.in">Dashboard</a>`
          ).catch(e => console.error('[telegram]', e.message));
        }
      } else if (diskPct < diskThr - 5 && diskAlertState === 'high') {
        diskAlertState = 'normal';
        logAlert('disk_ok', `Disk usage recovered: ${diskPct}%`, `Free: ${freeGb}GB`);
      }
    }

    // Write to SQLite once per minute
    if (now - lastHistoryWrite > 60000) {
      lastHistoryWrite = now;
      const insertProc = db.prepare('INSERT INTO process_history (name, ts, cpu, memory, status) VALUES (?, ?, ?, ?, ?)');
      processes.forEach(p => insertProc.run(p.name, now, p.cpu, p.memory, p.status));
      db.prepare('INSERT INTO system_history (ts, cpu, mem_used, temp, net_in, net_out, disk_read, disk_write) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(now, systemStats.cpu, mem.used, temp, netIO.rxBps, netIO.txBps, diskIO.readBps, diskIO.writeBps);
    }

    const alertCount = db.prepare('SELECT COUNT(*) as n FROM alerts').get().n;
    io.emit('stats', { processes, system: systemStats, alertCount });
  } catch (err) {
    console.error('[broadcast]', err.message);
  }
}

io.on('connection', socket => broadcastStats());

async function checkPublicIp() {
  const cfg = settings.load();
  if (!cfg.publicIpAlertEnabled) return;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const { ip } = await res.json();
    if (lastKnownPublicIp === null) {
      lastKnownPublicIp = ip;
      console.log(`[ip] Public IP initialised: ${ip}`);
      return;
    }
    if (ip !== lastKnownPublicIp) {
      const prev = lastKnownPublicIp;
      lastKnownPublicIp = ip;
      logAlert('ip_change', `Public IP changed: ${prev} → ${ip}`, null);
      if (cfg.telegramEnabled && cfg.telegramChatId) {
        sendTelegramWithChatId(cfg.telegramChatId,
          `🌐 <b>Public IP Changed</b>\n\n<b>Old:</b> <code>${prev}</code>\n<b>New:</b> <code>${ip}</code>\n\nUpdate your DNS if needed.`
        ).catch(e => console.error('[telegram]', e.message));
      }
      console.log(`[ip] Public IP changed: ${prev} → ${ip}`);
    }
  } catch (e) {
    console.warn('[ip] Check failed:', e.message);
  }
}

async function runSslChecks() {
  const cfg = settings.load();
  if (!cfg.sslAlertEnabled || !cfg.sslDomains || cfg.sslDomains.length === 0) return;
  const results = await checkAllCerts(cfg.sslDomains);
  const alerts = getNewAlerts(results);
  for (const a of alerts) {
    const urgency = a.milestone === 1 ? '🚨' : a.milestone === 7 ? '⚠️' : '🔔';
    const msg = `${urgency} <b>SSL Cert Expiring: ${a.hostname}</b>\n\nExpires in <b>${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'}</b>\nExpiry: ${new Date(a.expiry).toDateString()}`;
    logAlert('ssl_expiry', `SSL expiry: ${a.hostname} in ${a.daysLeft}d`, `Milestone: ${a.milestone}d warning`);
    if (cfg.telegramEnabled && cfg.telegramChatId) {
      sendTelegramWithChatId(cfg.telegramChatId, msg).catch(e => console.error('[telegram]', e.message));
    }
    console.log(`[ssl] Alert fired for ${a.hostname} — ${a.daysLeft} days left`);
  }
}

pm2Connect().then(() => {
  refreshDisk();
  setInterval(refreshDisk, 30000);
  setInterval(broadcastStats, 3000);
  runSslChecks();
  setInterval(runSslChecks, 12 * 60 * 60 * 1000); // every 12h
  checkPublicIp();
  setInterval(checkPublicIp, 15 * 60 * 1000); // every 15 min
  server.listen(PORT, () => console.log(`App Stats backend running on port ${PORT}`));
}).catch(err => { console.error('PM2 connect failed:', err); process.exit(1); });
