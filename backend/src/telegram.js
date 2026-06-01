async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'your_bot_token_here') {
    console.warn('[telegram] Bot token not configured — skipping');
    return;
  }

  const chatId = process.env.TELEGRAM_CHAT_ID || '';
  if (!chatId) {
    console.warn('[telegram] TELEGRAM_CHAT_ID not set — skipping');
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }

  console.log('[telegram] Message sent');
}

async function sendTelegramTempAlert(temp, type) {
  const isHot = type === 'hot';
  const text = isHot
    ? `🔥 <b>Pi Temperature Alert</b>\n\nCPU temperature reached <b>${temp}°C</b> (threshold: ${process.env.TEMP_ALERT_THRESHOLD || 60}°C)\n\n<a href="https://app-stats.money-matriz.co.in">Open Dashboard</a>`
    : `✅ <b>Pi Temperature Recovered</b>\n\nCPU temperature back to <b>${temp}°C</b>`;
  await sendTelegram(text);
  console.log(`[telegram] Sent temp ${type} alert — ${temp}°C`);
}

async function sendTelegramProcessAlert(name, status, link) {
  const isCrash = status === 'stopped' || status === 'errored';
  const linkLine = link ? `\n<a href="${link}">Open App</a>` : '';
  const text = isCrash
    ? `🔴 <b>Process Down: ${name}</b>\n\nStatus: <code>${status}</code>${linkLine}\n<a href="https://app-stats.money-matriz.co.in">Dashboard</a>`
    : `🟢 <b>Process Recovered: ${name}</b>\n\nStatus: <code>${status}</code>${linkLine}`;
  await sendTelegram(text);
  console.log(`[telegram] Sent process alert — ${name} is ${status}`);
}

async function sendTelegramWithChatId(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'your_bot_token_here') throw new Error('Bot token not configured');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
}

module.exports = { sendTelegramTempAlert, sendTelegramProcessAlert, sendTelegramWithChatId };
