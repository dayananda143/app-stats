const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendTempAlert(temp, type) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PASS === 'your_app_password_here') {
    console.warn('[mailer] SMTP not configured — skipping email');
    return;
  }

  const isHot = type === 'hot';
  const subject = isHot
    ? `🔥 Pi Temperature Alert: ${temp}°C`
    : `✅ Pi Temperature Recovered: ${temp}°C`;

  const html = isHot ? `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:24px;border-radius:12px;border:1px solid #ef4444">
      <h2 style="color:#ef4444;margin:0 0 8px">🔥 Temperature Warning</h2>
      <p style="color:#94a3b8;margin:0 0 16px">Your Raspberry Pi CPU temperature has exceeded the threshold.</p>
      <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="font-size:36px;font-weight:bold;color:#ef4444">${temp}°C</div>
        <div style="color:#94a3b8;font-size:14px">Threshold: ${process.env.TEMP_ALERT_THRESHOLD || 60}°C</div>
      </div>
      <p style="color:#94a3b8;font-size:13px">Check your dashboard at <a href="https://app-stats.money-matriz.co.in" style="color:#6366f1">app-stats.money-matriz.co.in</a></p>
      <p style="color:#475569;font-size:12px;margin-top:16px">Sent by App Stats Monitor · Raspberry Pi</p>
    </div>
  ` : `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:24px;border-radius:12px;border:1px solid #22c55e">
      <h2 style="color:#22c55e;margin:0 0 8px">✅ Temperature Recovered</h2>
      <p style="color:#94a3b8;margin:0 0 16px">Your Raspberry Pi CPU temperature is back to normal.</p>
      <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="font-size:36px;font-weight:bold;color:#22c55e">${temp}°C</div>
        <div style="color:#94a3b8;font-size:14px">Back below ${process.env.TEMP_ALERT_THRESHOLD || 60}°C</div>
      </div>
      <p style="color:#475569;font-size:12px;margin-top:16px">Sent by App Stats Monitor · Raspberry Pi</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"App Stats Monitor" <${process.env.SMTP_USER}>`,
    to: process.env.ALERT_TO,
    subject,
    html,
  });

  console.log(`[mailer] Sent ${type} alert — ${temp}°C`);
}

async function sendProcessAlert(name, status, link) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PASS === 'your_app_password_here') return;

  const isCrash = status === 'stopped' || status === 'errored';
  const subject = isCrash
    ? `🔴 Process Down: ${name}`
    : `🟢 Process Recovered: ${name}`;

  const color  = isCrash ? '#ef4444' : '#22c55e';
  const border = isCrash ? '#ef4444' : '#22c55e';
  const icon   = isCrash ? '🔴' : '🟢';
  const linkHtml = link
    ? `<p style="color:#94a3b8;font-size:13px">Open app: <a href="${link}" style="color:#6366f1">${link}</a></p>`
    : '';

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:24px;border-radius:12px;border:1px solid ${border}">
      <h2 style="color:${color};margin:0 0 8px">${icon} Process ${isCrash ? 'Crashed' : 'Recovered'}</h2>
      <p style="color:#94a3b8;margin:0 0 16px">${isCrash ? 'A process has gone down on your Raspberry Pi.' : 'A process has come back online.'}</p>
      <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="font-size:24px;font-weight:bold;color:${color}">${name}</div>
        <div style="color:#94a3b8;font-size:14px;margin-top:4px">Status: ${status}</div>
      </div>
      ${linkHtml}
      <p style="color:#94a3b8;font-size:13px">Dashboard: <a href="https://app-stats.money-matriz.co.in" style="color:#6366f1">app-stats.money-matriz.co.in</a></p>
      <p style="color:#475569;font-size:12px;margin-top:16px">Sent by App Stats Monitor · Raspberry Pi</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"App Stats Monitor" <${process.env.SMTP_USER}>`,
    to: process.env.ALERT_TO,
    subject,
    html,
  });

  console.log(`[mailer] Sent process alert — ${name} is ${status}`);
}

module.exports = { sendTempAlert, sendProcessAlert };
