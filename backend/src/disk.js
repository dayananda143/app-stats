const fs = require('fs');

// Try common Pi disk device names in priority order
const DEVICES = ['mmcblk0', 'sda', 'nvme0n1'];

let prev = null;
let prevTs = null;

function readDiskStats() {
  try {
    const raw = fs.readFileSync('/proc/diskstats', 'utf8');
    for (const dev of DEVICES) {
      const line = raw.split('\n').find(l => l.trim().split(/\s+/)[2] === dev);
      if (!line) continue;
      const parts = line.trim().split(/\s+/);
      // fields: [0]=major [1]=minor [2]=name [3]=reads [4]=reads_merged
      // [5]=sectors_read [6]=ms_reading [7]=writes [8]=writes_merged
      // [9]=sectors_written  — 1 sector = 512 bytes
      return {
        device: dev,
        readSectors:  parseInt(parts[5]),
        writeSectors: parseInt(parts[9]),
      };
    }
    return null;
  } catch { return null; }
}

// Returns { readBps, writeBps } — bytes per second since last call
function getDiskIO() {
  const now = Date.now();
  const curr = readDiskStats();
  if (!curr) return { readBps: 0, writeBps: 0 };

  let readBps = 0, writeBps = 0;
  if (prev && prevTs && prev.device === curr.device) {
    const dt = (now - prevTs) / 1000;
    if (dt > 0) {
      readBps  = Math.max(0, Math.round(((curr.readSectors  - prev.readSectors)  * 512) / dt));
      writeBps = Math.max(0, Math.round(((curr.writeSectors - prev.writeSectors) * 512) / dt));
    }
  }
  prev = curr;
  prevTs = now;
  return { readBps, writeBps };
}

module.exports = { getDiskIO };
