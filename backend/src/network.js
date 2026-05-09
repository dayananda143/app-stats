const fs = require('fs');

const IFACE = 'wlan0';
let prev = null;
let prevTs = null;

function readNetStats() {
  try {
    const raw = fs.readFileSync('/proc/net/dev', 'utf8');
    const line = raw.split('\n').find(l => l.trim().startsWith(IFACE));
    if (!line) return null;
    const parts = line.trim().split(/\s+/);
    return { rxBytes: parseInt(parts[1]), txBytes: parseInt(parts[9]) };
  } catch { return null; }
}

// Returns { rxBps, txBps } — bytes per second since last call
function getNetworkIO() {
  const now = Date.now();
  const curr = readNetStats();
  if (!curr) return { rxBps: 0, txBps: 0 };

  let rxBps = 0, txBps = 0;
  if (prev && prevTs) {
    const dt = (now - prevTs) / 1000;
    if (dt > 0) {
      rxBps = Math.max(0, Math.round((curr.rxBytes - prev.rxBytes) / dt));
      txBps = Math.max(0, Math.round((curr.txBytes - prev.txBytes) / dt));
    }
  }
  prev = curr;
  prevTs = now;
  return { rxBps, txBps };
}

module.exports = { getNetworkIO };
