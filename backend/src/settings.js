const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../data/settings.json');

const DEFAULTS = {
  tempThreshold: 60,
  tempRecovery: 55,
  alertCooldownMinutes: 15,
  alertEmail: process.env.ALERT_TO || '',
  processAlerts: true,
  cpuAlertEnabled: true,
  cpuAlertThreshold: 80,
  ramAlertEnabled: true,
  ramAlertThresholdMb: 400,
  sysRamAlertEnabled: true,
  sysRamAlertPercent: 85,
  stuckAlertEnabled: true,
  stuckCpuThreshold: 85,
  stuckMinutes: 5,
  telegramEnabled: false,
  telegramChatId: '',
  diskAlertEnabled: true,
  diskAlertPercent: 90,
  sslAlertEnabled: true,
  sslDomains: [],
  publicIpAlertEnabled: true,
  memLeakEnabled: true,
  memLeakWindowMinutes: 30,
  memLeakGrowthPercent: 20,
};

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ ...load(), ...data }, null, 2));
}

module.exports = { load, save };
