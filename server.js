require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());

// Melayani file statis Front-End
app.use(express.static(path.join(__dirname, 'public')));

// Database sementara (In-Memory fallback)
let monthlyBudget = 3500000;

let customCategories = {
  pengeluaran: ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Lainnya'],
  pemasukan: ['Gaji', 'Bisnis / Jualan', 'Bonus', 'Investasi', 'Hadiah', 'Lainnya'],
  tabungan: ['Dana Darurat', 'Tabungan Rutin', 'Reksadana / Saham', 'Emas', 'Tabungan Liburan', 'Lainnya']
};

let transactions = [
  { id: 1, type: 'pemasukan', amount: 5000000, category: 'Gaji', description: 'Gaji Bulanan', date: new Date().toISOString() },
  { id: 2, type: 'tabungan', amount: 1000000, category: 'Dana Darurat', description: 'Tabungan Rutin', date: new Date().toISOString() },
  { id: 3, type: 'pengeluaran', amount: 35000, category: 'Makanan', description: 'Nasi Padang Komplit', date: new Date().toISOString() },
  { id: 4, type: 'pengeluaran', amount: 20000, category: 'Transportasi', description: 'Bensin Motor', date: new Date().toISOString() }
];

// Helper: Simpan Transaksi ke Google Sheets
async function saveToGoogleSheet(tx) {
  const sheetUrl = process.env.GOOGLE_SHEET_URL;
  if (!sheetUrl) return;

  try {
    await axios.post(sheetUrl, tx, {
      headers: { 'Content-Type': 'application/json' },
      maxRedirects: 5
    });
    console.log(`[Google Sheets] Transaksi ${tx.id} berhasil disimpan ke Spreadsheet!`);
  } catch (err) {
    console.error('[Google Sheets] Gagal menyimpan ke Spreadsheet:', err.message);
  }
}

// Helper: Tarik Transaksi dari Google Sheets saat inisialisasi
async function syncFromGoogleSheet() {
  const sheetUrl = process.env.GOOGLE_SHEET_URL;
  if (!sheetUrl) return;

  try {
    const res = await axios.get(sheetUrl, { maxRedirects: 5 });
    if (Array.isArray(res.data) && res.data.length > 0) {
      transactions = res.data;
      console.log(`[Google Sheets] Berhasil sinkron ${transactions.length} transaksi dari Spreadsheet!`);
    }
  } catch (err) {
    console.error('[Google Sheets] Gagal mengambil data awal dari Spreadsheet:', err.message);
  }
}

// Helper: Kirim Balasan ke Telegram Bot
async function sendTelegramMessage(chatId, text) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(url, { chat_id: chatId, text: text, parse_mode: 'HTML' });
  } catch (err) {
    console.error('Gagal kirim pesan ke Telegram:', err.message);
  }
}

// ----------------------------------------------------
// 1. ENDPOINT WEBHOOK TELEGRAM
// ----------------------------------------------------
app.post('/webhook', async (req, res) => {
  const message = req.body.message;

  if (!message || !message.text) {
    return res.sendStatus(200);
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  // Sambut pengguna saat kirim /start atau /help
  if (text.startsWith('/start') || text.startsWith('/help')) {
    const welcome = `👋 <b>Selamat Datang di FinTrack Bot!</b>

Kirim catatan keuangan dengan format mudah:

💸 <b>Pengeluaran (Default):</b>
<code>35000 Makanan Nasi Padang</code>
atau: <code>keluar 35000 Makanan Nasi Padang</code>

💵 <b>Pemasukan:</b>
<code>masuk 1000000 Gaji Bonus Projek</code>
atau: <code>+1000000 Gaji Bonus</code>

🏦 <b>Tabungan:</b>
<code>tabung 500000 Investasi Saham / Emas</code>

🎯 <b>Set Target Budget Bulanan:</b>
<code>budget 3000000</code>`;

    await sendTelegramMessage(chatId, welcome);
    return res.sendStatus(200);
  }

  const parts = text.split(/\s+/);
  const firstWord = parts[0].toLowerCase();

  // 1. Atur Budget: contoh "budget 4000000"
  if (firstWord === 'budget') {
    const rawVal = (parts[1] || '').replace(/\./g, '');
    const newBudget = parseInt(rawVal, 10);
    if (!isNaN(newBudget) && newBudget > 0) {
      monthlyBudget = newBudget;
      await sendTelegramMessage(
        chatId,
        `🎯 <b>Budget Bulanan Berhasil Diubah!</b>\nTarget: Rp ${monthlyBudget.toLocaleString('id-ID')}`
      );
    } else {
      await sendTelegramMessage(chatId, '❌ Format salah. Contoh: <code>budget 3500000</code>');
    }
    return res.sendStatus(200);
  }

  // 2. Transaksi (Pengeluaran, Pemasukan, Tabungan)
  let type = 'pengeluaran';
  let amountStr = '';
  let category = 'Lainnya';
  let description = '-';

  if (firstWord === 'masuk' || firstWord.startsWith('+')) {
    type = 'pemasukan';
    amountStr = (firstWord.startsWith('+') ? firstWord.slice(1) : (parts[1] || '')).replace(/\./g, '');
    const shift = firstWord.startsWith('+') ? 1 : 2;
    category = parts[shift] || 'Pendapatan';
    description = parts.slice(shift + 1).join(' ') || '-';
  } else if (firstWord === 'tabung' || firstWord === 'nabung' || firstWord === 'simpan') {
    type = 'tabungan';
    amountStr = (parts[1] || '').replace(/\./g, '');
    category = parts[2] || 'Tabungan';
    description = parts.slice(3).join(' ') || '-';
  } else if (firstWord === 'keluar' || firstWord.startsWith('-')) {
    type = 'pengeluaran';
    amountStr = (firstWord.startsWith('-') ? firstWord.slice(1) : (parts[1] || '')).replace(/\./g, '');
    const shift = firstWord.startsWith('-') ? 1 : 2;
    category = parts[shift] || 'Lainnya';
    description = parts.slice(shift + 1).join(' ') || '-';
  } else {
    amountStr = parts[0].replace(/\./g, '');
    category = parts[1] || 'Lainnya';
    description = parts.slice(2).join(' ') || '-';
  }

  const amount = parseInt(amountStr, 10);

  if (isNaN(amount) || amount <= 0) {
    await sendTelegramMessage(
      chatId,
      `❌ <b>Format tidak dikenali!</b>\n\nContoh:\n• <code>35000 Makanan Nasi Padang</code> (Pengeluaran)\n• <code>masuk 500000 Gaji Bonus</code> (Pemasukan)\n• <code>tabung 200000 Tabungan Dana Darurat</code> (Tabungan)\n• <code>budget 3000000</code> (Atur Budget)`
    );
    return res.sendStatus(200);
  }

  // Tambah otomatis ke list kategori jika belum ada
  if (customCategories[type] && !customCategories[type].includes(category)) {
    customCategories[type].push(category);
  }

  const newTx = {
    id: Date.now(),
    type: type,
    amount: amount,
    category: category,
    description: description,
    date: new Date().toISOString()
  };

  transactions.unshift(newTx);

  // Simpan langsung ke Google Sheets secara asinkron
  saveToGoogleSheet(newTx);

  const typeLabel = type === 'pemasukan' ? '💵 Pemasukan' : (type === 'tabungan' ? '🏦 Tabungan' : '💸 Pengeluaran');
  const replyText = `✅ <b>Berhasil Dicatat!</b>\n\n🏷️ <b>Tipe:</b> ${typeLabel}\n💰 <b>Nominal:</b> Rp ${amount.toLocaleString('id-ID')}\n📂 <b>Kategori:</b> ${category}\n📝 <b>Catatan:</b> ${description}`;
  
  await sendTelegramMessage(chatId, replyText);
  res.sendStatus(200);
});

// ----------------------------------------------------
// 2. REST API FRONT-END
// ----------------------------------------------------
app.get('/api/data', (req, res) => {
  res.json({
    budget: monthlyBudget,
    categories: customCategories,
    transactions: transactions
  });
});

app.get('/api/expenses', (req, res) => {
  res.json(transactions);
});

// Tambah Transaksi langsung dari Web
app.post('/api/transactions', (req, res) => {
  const { type, amount, category, description, date } = req.body;
  const numAmount = parseInt(amount, 10);

  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({ error: 'Nominal tidak valid' });
  }

  const newTx = {
    id: Date.now(),
    type: type || 'pengeluaran',
    amount: numAmount,
    category: category || 'Umum',
    description: description || '-',
    date: date ? new Date(date).toISOString() : new Date().toISOString()
  };

  const txType = newTx.type;
  if (customCategories[txType] && !customCategories[txType].includes(newTx.category)) {
    customCategories[txType].push(newTx.category);
  }

  transactions.unshift(newTx);

  // Simpan juga ke Google Sheets
  saveToGoogleSheet(newTx);

  res.status(201).json(newTx);
});

// Hapus Transaksi dari Web
app.delete('/api/transactions/:id', (req, res) => {
  const txId = parseInt(req.params.id, 10);
  transactions = transactions.filter(t => t.id !== txId);
  res.json({ success: true });
});

// Update Target Budget dari Web
app.post('/api/budget', (req, res) => {
  const { budget } = req.body;
  const numBudget = parseInt(budget, 10);

  if (!isNaN(numBudget) && numBudget >= 0) {
    monthlyBudget = numBudget;
    return res.json({ success: true, budget: monthlyBudget });
  }
  res.status(400).json({ error: 'Nilai budget tidak valid' });
});

// ----------------------------------------------------
// 3. API KELOLA KATEGORI
// ----------------------------------------------------
app.get('/api/categories', (req, res) => {
  res.json(customCategories);
});

app.post('/api/categories', (req, res) => {
  const { type, name } = req.body;
  const cleanName = (name || '').trim();

  if (!type || !customCategories[type] || !cleanName) {
    return res.status(400).json({ error: 'Tipe atau nama kategori tidak valid' });
  }

  if (!customCategories[type].includes(cleanName)) {
    customCategories[type].push(cleanName);
  }

  res.json({ success: true, categories: customCategories });
});

app.delete('/api/categories', (req, res) => {
  const { type, name } = req.body;
  const cleanName = (name || '').trim();

  if (!type || !customCategories[type] || !cleanName) {
    return res.status(400).json({ error: 'Tipe atau nama kategori tidak valid' });
  }

  customCategories[type] = customCategories[type].filter(c => c !== cleanName);
  res.json({ success: true, categories: customCategories });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
  // Sinkronisasi awal dari Google Sheets jika URL sudah ada di .env
  await syncFromGoogleSheet();
});
