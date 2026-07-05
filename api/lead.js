// Vercel serverless function: приём заявки с лендинга → Telegram + Google Sheets
const { google } = require('googleapis');

function clip(v, n) { return (v == null ? '' : String(v)).slice(0, n); }

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // honeypot — боты заполняют скрытое поле
  if (body.company) return res.status(200).json({ ok: true });

  const name = clip(body.name, 200).trim();
  const phone = clip(body.phone, 60).trim();
  if (!name || !phone) return res.status(400).json({ ok: false, error: 'name/phone required' });

  const count = clip(body.count, 100);
  const category = clip(body.category, 200);
  const system = clip(body.system, 100);
  const comment = clip(body.comment, 1000);
  const source = clip(body.source || 'catalogpro.kz', 120);
  const ua = clip(req.headers['user-agent'], 300);
  const now = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });

  // 1) Telegram — мгновенное уведомление
  try {
    const text =
      `🆕 Заявка НКТ (catalogpro.kz)\n\n` +
      `👤 ${name}\n📞 ${phone}\n` +
      `📦 Товаров: ${count || '—'}\n🏷 Категория: ${category || '—'}\n` +
      `🧾 Система учёта: ${system || '—'}\n💬 ${comment || '—'}\n\n` +
      `🌐 ${source}\n🕒 ${now}`;
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TG_CHAT_ID, text })
    });
  } catch (e) { console.error('telegram', e); }

  // 2) Google Sheets — лог заявок
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.JWT(creds.client_email, null, creds.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: `'${process.env.SHEET_TAB}'!A:I`,
      valueInputOption: 'RAW',
      requestBody: { values: [[now, name, phone, count, category, system, comment, source, ua]] }
    });
  } catch (e) {
    console.error('sheets', e);
    // заявка уже ушла в Telegram — считаем успехом, лог в Sheets вторичен
    return res.status(200).json({ ok: true, sheet: false });
  }

  return res.status(200).json({ ok: true });
};
