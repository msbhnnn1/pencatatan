let chartInstance = null;

// Format Angka ke Rupiah
function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(number);
}

// Fetch Data dari API Backend
async function fetchExpenses() {
  try {
    const response = await fetch('/api/expenses');
    const expenses = await response.json();
    renderDashboard(expenses);
  } catch (error) {
    console.error('Gagal mengambil data:', error);
  }
}

// Render Data ke Table & Chart
function renderDashboard(expenses) {
  const tbody = document.getElementById('transactionBody');
  tbody.innerHTML = '';

  let totalAmount = 0;
  const categories = {};

  expenses.forEach((item) => {
    totalAmount += item.amount;

    // Hitung total per kategori untuk chart
    categories[item.category] = (categories[item.category] || 0) + item.amount;

    // Render baris tabel
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(item.date).toLocaleDateString('id-ID')}</td>
      <td><span class="badge">${item.category}</span></td>
      <td>${item.description || '-'}</td>
      <td><b>${formatRupiah(item.amount)}</b></td>
    `;
    tbody.appendChild(tr);
  });

  // Update Stat Cards
  document.getElementById('totalAmount').innerText = formatRupiah(totalAmount);
  document.getElementById('totalCount').innerText = expenses.length;

  // Render Chart
  renderChart(categories);
}

// Render Doughnut Chart (Chart.js)
function renderChart(categories) {
  const ctx = document.getElementById('categoryChart').getContext('2d');

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(categories),
      datasets: [{
        data: Object.values(categories),
        backgroundColor: ['#4318FF', '#6AD2FF', '#EFF4FB', '#FFB547', '#39B818'],
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

// Event Listeners
document.getElementById('refreshBtn').addEventListener('click', fetchExpenses);

// Load data saat pertama buka
fetchExpenses();
