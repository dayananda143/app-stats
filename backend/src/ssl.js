const tls = require('tls');

// In-memory: { hostname: 'none' | 14 | 7 | 1 }
const alertedMilestone = {};

function getCertDaysLeft(hostname) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(443, hostname, { servername: hostname, rejectUnauthorized: false });
    socket.setTimeout(10000, () => { socket.destroy(); reject(new Error('timeout')); });
    socket.on('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();
      if (!cert || !cert.valid_to) return reject(new Error('no cert'));
      const expiry = new Date(cert.valid_to);
      const daysLeft = Math.floor((expiry - Date.now()) / (1000 * 60 * 60 * 24));
      resolve({ hostname, daysLeft, expiry: expiry.toISOString() });
    });
    socket.on('error', reject);
  });
}

// Returns array of { hostname, daysLeft, expiry } for all configured domains
async function checkAllCerts(domains) {
  const results = await Promise.allSettled(domains.map(getCertDaysLeft));
  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { hostname: domains[i], daysLeft: null, error: r.reason.message }
  );
}

// Returns alerts that should be fired based on current cert status
// Mutates alertedMilestone state to avoid re-alerting same threshold
function getNewAlerts(certResults) {
  const toAlert = [];
  for (const cert of certResults) {
    if (cert.daysLeft === null) continue;
    const prev = alertedMilestone[cert.hostname] || 'none';

    if (cert.daysLeft > 14) {
      // Cert renewed — reset so future warnings fire again
      alertedMilestone[cert.hostname] = 'none';
    } else if (cert.daysLeft <= 1 && prev !== 1) {
      alertedMilestone[cert.hostname] = 1;
      toAlert.push({ ...cert, milestone: 1 });
    } else if (cert.daysLeft <= 7 && prev !== 7 && prev !== 1) {
      alertedMilestone[cert.hostname] = 7;
      toAlert.push({ ...cert, milestone: 7 });
    } else if (cert.daysLeft <= 14 && prev === 'none') {
      alertedMilestone[cert.hostname] = 14;
      toAlert.push({ ...cert, milestone: 14 });
    }
  }
  return toAlert;
}

module.exports = { checkAllCerts, getNewAlerts, getCertDaysLeft };
