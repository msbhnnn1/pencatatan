// ====================================================================
// KONFIGURASI GOOGLE APPS SCRIPT
// Jika Anda ingin web ini online di GitHub Pages tanpa perlu menyalakan laptop,
// tempelkan URL Web App Google Apps Script Anda (yang berakhiran /exec) di sini:
// ====================================================================
const GOOGLE_SCRIPT_URL = ""; // Contoh: "https://script.google.com/macros/s/AKfycb.../exec"

let cashflowChartInstance = null;
let categoryChartInstance = null;
let allTransactions = [];
let currentBudget = 3500000;
let activeFilter = 'all';

// Kategori default
let appCategories = {
  pengeluaran: ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Lainnya'],
  pemasukan: ['Gaji', 'Bisnis / Jualan', 'Bonus', 'Investasi', 'Hadiah', 'Lainnya'],
  tabungan: ['Dana Darurat', 'Tabungan Rutin', 'Reksadana / Saham', 'Emas', 'Tabungan Liburan', 'Lainnya']
};

let activeCatType = 'pengeluaran';

// Format Angka ke Rupiah
function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(number || 0);
}

// Update opsi kategori di form
function updateCategorySelect(type) {
  const catSelect = document.getElementById('txCategory');
  const list = appCategories[type] || appCategories.pengeluaran;
  catSelect.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('');
}

// Fetch Data (Otomatis mendeteksi Google Apps Script atau server lokal)
async function fetchData() {
  try {
    if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL.trim() !== "") {
      // Ambil langsung dari Google Sheets (GitHub Pages Mode)
      const res = await fetch(GOOGLE_SCRIPT_URL);
      const data = await res.json();
      allTransactions = Array.isArray(data) ? data : (data.transactions || []);
      if (data.budget) currentBudget = data.budget;
    } else {
      // Ambil dari server lokal (Localhost Mode)
      const res = await fetch('/api/data');
      const data = await res.json();
      currentBudget = data.budget || currentBudget;
      allTransactions = data.transactions || [];
      if (data.categories) appCategories = data.categories;
    }
    renderApp();
  } catch (error) {
    console.error('Gagal mengambil data:', error);
  }
}

// Render Seluruh Aplikasi
function renderApp() {
  renderStatsAndBudget();
  renderTable();
  renderCharts();
  renderCategoryTags();
  
  const currentChecked = document.querySelector('input[name="txType"]:checked');
  if (currentChecked) {
    updateCategorySelect(currentChecked.value);
  }
}

// 1. Render Stat Cards & Budget Bar
function renderStatsAndBudget() {
  let totalIncome = 0;
  let countIncome = 0;
  let totalExpense = 0;
  let countExpense = 0;
  let totalSaving = 0;
  let countSaving = 0;

  allTransactions.forEach(t => {
    const type = (t.type || '').toLowerCase();
    const amount = Number(t.amount) || 0;
    if (type === 'pemasukan') {
      totalIncome += amount;
      countIncome++;
    } else if (type === 'tabungan') {
      totalSaving += amount;
      countSaving++;
    } else {
      totalExpense += amount;
      countExpense++;
    }
  });

  const netBalance = totalIncome - totalExpense - totalSaving;

  document.getElementById('totalIncome').innerText = formatRupiah(totalIncome);
  document.getElementById('incomeCount').innerText = `${countIncome} transaksi`;

  document.getElementById('totalExpense').innerText = formatRupiah(totalExpense);
  document.getElementById('expenseCount').innerText = `${countExpense} transaksi`;

  document.getElementById('totalSaving').innerText = formatRupiah(totalSaving);
  document.getElementById('savingCount').innerText = `${countSaving} alokasi`;

  document.getElementById('netBalance').innerText = formatRupiah(netBalance);
  const balanceStatus = document.getElementById('balanceStatus');
  if (netBalance >= 0) {
    balanceStatus.innerText = 'Arus kas surplus 📈';
    balanceStatus.style.color = '#05cd99';
  } else {
    balanceStatus.innerText = 'Arus kas defisit 📉';
    balanceStatus.style.color = '#ee5d50';
  }

  // Budget Tracker
  document.getElementById('targetBudgetVal').innerText = formatRupiah(currentBudget);
  document.getElementById('usedBudgetVal').innerText = formatRupiah(totalExpense);
  
  const remainBudget = currentBudget - totalExpense;
  const remainEl = document.getElementById('remainBudgetVal');
  remainEl.innerText = formatRupiah(remainBudget);

  const progressBar = document.getElementById('budgetProgressBar');
  const badgeStatus = document.getElementById('budgetStatusBadge');
  const percentText = document.getElementById('budgetPercentText');

  let percent = 0;
  if (currentBudget > 0) {
    percent = Math.round((totalExpense / currentBudget) * 100);
  }

  progressBar.style.width = `${Math.min(percent, 100)}%`;
  percentText.innerText = `${percent}% dari batas budget terpakai`;

  if (percent > 100) {
    progressBar.style.backgroundColor = '#ee5d50';
    badgeStatus.className = 'badge badge-danger';
    badgeStatus.innerText = 'Over Budget! ⚠️';
    remainEl.style.color = '#ee5d50';
  } else if (percent >= 80) {
    progressBar.style.backgroundColor = '#ffb547';
    badgeStatus.className = 'badge badge-warning';
    badgeStatus.innerText = 'Waspada ⚠️';
    remainEl.style.color = '#d97706';
  } else {
    progressBar.style.backgroundColor = '#05cd99';
    badgeStatus.className = 'badge badge-success';
    badgeStatus.innerText = 'Aman ✅';
    remainEl.style.color = '#1b2559';
  }
}

// 2. Render Riwayat Tabel
function renderTable() {
  const tbody = document.getElementById('transactionBody');
  tbody.innerHTML = '';

  const filtered = allTransactions.filter(t => {
    if (activeFilter === 'all') return true;
    return (t.type || 'pengeluaran').toLowerCase() === activeFilter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #a3aed0;">Belum ada data transaksi.</td></tr>`;
    return;
  }

  filtered.forEach(item => {
    const tr = document.createElement('tr');
    const type = (item.type || 'pengeluaran').toLowerCase();
    let badgeClass = 'badge-expense';
    let typeName = 'Pengeluaran';
    let amountClass = 'amount-expense';
    let prefix = '- ';

    if (type === 'pemasukan') {
      badgeClass = 'badge-income';
      typeName = 'Pemasukan';
      amountClass = 'amount-income';
      prefix = '+ ';
    } else if (type === 'tabungan') {
      badgeClass = 'badge-saving';
      typeName = 'Tabungan';
      amountClass = 'amount-saving';
      prefix = '';
    }

    const dateFormatted = item.date ? new Date(item.date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }) : '-';

    tr.innerHTML = `
      <td>${dateFormatted}</td>
      <td><span class="badge ${badgeClass}">${typeName}</span></td>
      <td><b>${item.category || '-'}</b></td>
      <td>${item.description || '-'}</td>
      <td class="${amountClass}">${prefix}${formatRupiah(item.amount)}</td>
      <td>
        <button class="btn-del" title="Hapus Transaksi" onclick="deleteTransaction(${item.id})">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 3. Render Charts
function renderCharts() {
  let totalIncome = 0;
  let totalExpense = 0;
  let totalSaving = 0;
  const expenseCategories = {};

  allTransactions.forEach(t => {
    const type = (t.type || '').toLowerCase();
    const amount = Number(t.amount) || 0;
    if (type === 'pemasukan') {
      totalIncome += amount;
    } else if (type === 'tabungan') {
      totalSaving += amount;
    } else {
      totalExpense += amount;
      const cat = t.category || 'Lainnya';
      expenseCategories[cat] = (expenseCategories[cat] || 0) + amount;
    }
  });

  const ctxCashflow = document.getElementById('cashflowChart').getContext('2d');
  if (cashflowChartInstance) cashflowChartInstance.destroy();

  cashflowChartInstance = new Chart(ctxCashflow, {
    type: 'bar',
    data: {
      labels: ['Pemasukan', 'Pengeluaran', 'Tabungan'],
      datasets: [{
        label: 'Total (Rp)',
        data: [totalIncome, totalExpense, totalSaving],
        backgroundColor: ['#05cd99', '#ee5d50', '#3965ff'],
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => 'Rp ' + (value >= 1000000 ? (value/1000000) + 'jt' : value.toLocaleString('id-ID'))
          }
        }
      }
    }
  });

  const ctxCategory = document.getElementById('categoryChart').getContext('2d');
  if (categoryChartInstance) categoryChartInstance.destroy();

  const catLabels = Object.keys(expenseCategories);
  const catData = Object.values(expenseCategories);

  categoryChartInstance = new Chart(ctxCategory, {
    type: 'doughnut',
    data: {
      labels: catLabels.length ? catLabels : ['Belum ada pengeluaran'],
      datasets: [{
        data: catData.length ? catData : [1],
        backgroundColor: catLabels.length 
          ? ['#ee5d50', '#ffb547', '#4318ff', '#6ad2ff', '#05cd99', '#a3aed0', '#707ebe', '#ec4899', '#8b5cf6']
          : ['#e9edf7'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

// 4. Render Tag Kategori
function renderCategoryTags() {
  const container = document.getElementById('categoryTagsContainer');
  if (!container) return;
  container.innerHTML = '';

  const list = appCategories[activeCatType] || [];
  if (list.length === 0) {
    container.innerHTML = `<span style="color: #a3aed0; font-size: 0.85rem;">Belum ada kategori untuk tipe ini.</span>`;
    return;
  }

  list.forEach(catName => {
    const tag = document.createElement('div');
    tag.className = 'cat-tag-pill';
    tag.innerHTML = `
      <span>${catName}</span>
      <button type="button" class="cat-tag-del" title="Hapus kategori ${catName}" onclick="removeCategory('${activeCatType}', '${catName}')">&times;</button>
    `;
    container.appendChild(tag);
  });
}

// Hapus Kategori
async function removeCategory(type, name) {
  if (!confirm(`Hapus kategori "${name}"?`)) return;
  appCategories[type] = (appCategories[type] || []).filter(c => c !== name);
  renderApp();
  if (!GOOGLE_SCRIPT_URL) {
    try {
      await fetch('/api/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name })
      });
    } catch (e) {}
  }
}

// Hapus Transaksi
async function deleteTransaction(id) {
  if (!confirm('Yakin ingin menghapus transaksi ini?')) return;
  allTransactions = allTransactions.filter(t => t.id !== id);
  renderApp();
  if (!GOOGLE_SCRIPT_URL) {
    try {
      await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    } catch (e) {}
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('txDate').value = new Date().toISOString().split('T')[0];

  document.querySelectorAll('input[name="txType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      updateCategorySelect(e.target.value);
    });
  });

  const txModal = document.getElementById('txModal');
  const openTxBtn = document.getElementById('openTxBtn');
  const closeTxBtn = document.getElementById('closeTxModal');
  const cancelTxBtn = document.getElementById('cancelTxBtn');

  openTxBtn.addEventListener('click', () => txModal.classList.add('active'));
  [closeTxBtn, cancelTxBtn].forEach(b => b.addEventListener('click', () => txModal.classList.remove('active')));

  document.getElementById('txForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.querySelector('input[name="txType"]:checked').value;
    const amount = Number(document.getElementById('txAmount').value);
    const category = document.getElementById('txCategory').value;
    const description = document.getElementById('txDesc').value;
    const date = document.getElementById('txDate').value;

    const newTx = {
      id: Date.now(),
      type,
      amount,
      category,
      description,
      date: date ? new Date(date).toISOString() : new Date().toISOString()
    };

    try {
      if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL.trim() !== "") {
        // Kirim ke Google Apps Script
        await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newTx)
        });
        allTransactions.unshift(newTx);
        renderApp();
      } else {
        // Kirim ke server lokal
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newTx)
        });
        if (res.ok) fetchData();
      }

      txModal.classList.remove('active');
      document.getElementById('txForm').reset();
      document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
    } catch (err) {
      alert('Terjadi kesalahan jaringan.');
    }
  });

  // Modal Budget
  const budgetModal = document.getElementById('budgetModal');
  const openBudgetBtn = document.getElementById('openBudgetBtn');
  const quickEditBudgetBtn = document.getElementById('quickEditBudgetBtn');
  const closeBudgetBtn = document.getElementById('closeBudgetModal');
  const cancelBudgetBtn = document.getElementById('cancelBudgetBtn');

  function openBudget() {
    document.getElementById('budgetInput').value = currentBudget;
    budgetModal.classList.add('active');
  }

  openBudgetBtn.addEventListener('click', openBudget);
  quickEditBudgetBtn.addEventListener('click', openBudget);
  [closeBudgetBtn, cancelBudgetBtn].forEach(b => b.addEventListener('click', () => budgetModal.classList.remove('active')));

  document.getElementById('budgetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const budgetVal = Number(document.getElementById('budgetInput').value);
    currentBudget = budgetVal;
    renderApp();
    budgetModal.classList.remove('active');

    if (!GOOGLE_SCRIPT_URL) {
      try {
        await fetch('/api/budget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budget: budgetVal })
        });
      } catch (e) {}
    }
  });

  // Modal Kategori
  const categoryModal = document.getElementById('categoryModal');
  const openCategoryBtn = document.getElementById('openCategoryBtn');
  const quickManageCatBtn = document.getElementById('quickManageCatBtn');
  const closeCategoryBtn = document.getElementById('closeCategoryModal');
  const doneCategoryBtn = document.getElementById('doneCategoryBtn');

  function openCategoryModal() {
    renderCategoryTags();
    categoryModal.classList.add('active');
  }

  openCategoryBtn.addEventListener('click', openCategoryModal);
  if (quickManageCatBtn) quickManageCatBtn.addEventListener('click', openCategoryModal);
  [closeCategoryBtn, doneCategoryBtn].forEach(b => b.addEventListener('click', () => categoryModal.classList.remove('active')));

  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      activeCatType = e.target.getAttribute('data-cat-type');
      renderCategoryTags();
    });
  });

  document.getElementById('addCategoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('newCategoryInput');
    const name = input.value.trim();
    if (!name) return;

    if (!appCategories[activeCatType].includes(name)) {
      appCategories[activeCatType].push(name);
    }
    input.value = '';
    renderApp();

    if (!GOOGLE_SCRIPT_URL) {
      try {
        await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: activeCatType, name })
        });
      } catch (e) {}
    }
  });

  // Filter Tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      activeFilter = e.target.getAttribute('data-filter');
      renderTable();
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', fetchData);

  [txModal, budgetModal, categoryModal].forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('active');
    });
  });

  fetchData();
});
