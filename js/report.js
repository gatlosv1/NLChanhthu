import { watchAuthState } from './auth.js';
import { db } from './firebase.js';
import { requirePageAccess } from './pageAccess.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const COLLECTIONS = ['production', 'congTachMui', 'nhapLieuSanXuat'];
const DAY_COUNT = 7;

const totalBtpEl = document.getElementById('totalBtp');
const avgProductivityEl = document.getElementById('avgProductivity');
const totalRowsEl = document.getElementById('totalRows');
const activeGroupsEl = document.getElementById('activeGroups');
const reportTimestampEl = document.getElementById('reportTimestamp');
const dailyTableBody = document.getElementById('dailyTableBody');
const refreshBtn = document.getElementById('refreshBtn');

let reportChart;
let processChart;
let teamChart;

function numberValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatNumber(value, digits = 2) {
  return Number(value || 0).toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
}

function buildLast7Days() {
  const days = [];
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let index = DAY_COUNT - 1; index >= 0; index -= 1) {
    const date = new Date(base);
    date.setDate(base.getDate() - index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    days.push({ key, label: formatShortDate(date), timestamp: date.getTime() });
  }
  return days;
}

function getRowDateValue(row) {
  const directDate = row?.productionDate || row?.date || row?.ngay || row?.createdAt;
  if (directDate && typeof directDate === 'string' && directDate.length >= 8) {
    const parsed = new Date(directDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (directDate && typeof directDate?.toDate === 'function') {
    return directDate.toDate();
  }
  if (row?.createdAt && typeof row.createdAt === 'string') {
    const parsed = new Date(row.createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function aggregateByDate(rows) {
  const days = buildLast7Days();
  const bucket = new Map(days.map((day) => [day.key, { label: day.label, btp: 0, time: 0, rows: 0 }]));

  rows.forEach((row) => {
    const date = getRowDateValue(row);
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (!bucket.has(key)) {
      bucket.set(key, { label: formatShortDate(date), btp: 0, time: 0, rows: 0 });
    }

    const record = bucket.get(key);
    record.btp += numberValue(row.totalBtp || row.btp || row.kgA || row.kgB || row.kgC || row.kgCNoSeed);
    record.time += numberValue(row.totalTime || row.thoiGian || row.time || row.hours);
    record.rows += 1;
  });

  return days.map((day) => {
    const entry = bucket.get(day.key) || { label: day.label, btp: 0, time: 0, rows: 0 };
    return {
      label: entry.label,
      btp: entry.btp,
      time: entry.time,
      productivity: entry.time > 0 ? entry.btp / entry.time : 0,
      rows: entry.rows
    };
  });
}

function aggregateByProcess(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.processDisplay || row.processOne || row.processTwo || row.itemType || row.process || 'Chưa phân loại';
    const current = map.get(key) || { name: key, value: 0 };
    current.value += numberValue(row.totalBtp || row.btp || row.kgA || row.kgB || row.kgC || row.kgCNoSeed);
    map.set(key, current);
  });

  return [...map.values()].sort((left, right) => right.value - left.value).slice(0, 6);
}

function aggregateByTeam(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const teamName = row.teamId || row.team || row.group || row.teamName || 'Chưa phân nhóm';
    const current = map.get(teamName) || { name: teamName, value: 0 };
    current.value += numberValue(row.totalBtp || row.btp || row.kgA || row.kgB || row.kgC || row.kgCNoSeed);
    map.set(teamName, current);
  });
  return [...map.values()].sort((left, right) => right.value - left.value).slice(0, 6);
}

async function loadDataset() {
  const snapshots = await Promise.all(COLLECTIONS.map(async (collectionName) => {
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (error) {
      console.warn(`[Report] Could not load ${collectionName}`, error);
      return [];
    }
  }));

  return snapshots.flat();
}

function renderMetrics(rows) {
  let totalBtp = 0;
  let totalTime = 0;
  let totalRows = 0;
  const groups = new Set();

  rows.forEach((row) => {
    totalBtp += numberValue(row.totalBtp || row.btp || row.kgA || row.kgB || row.kgC || row.kgCNoSeed);
    totalTime += numberValue(row.totalTime || row.thoiGian || row.time || row.hours);
    totalRows += 1;

    const groupKey = row.teamId || row.team || row.group || row.processDisplay || row.processOne || row.processTwo || 'Chưa phân loại';
    groups.add(groupKey);
  });

  totalBtpEl.textContent = formatNumber(totalBtp, 2);
  avgProductivityEl.textContent = totalTime > 0 ? formatNumber(totalBtp / totalTime, 2) : '0.00';
  totalRowsEl.textContent = formatNumber(totalRows, 0);
  activeGroupsEl.textContent = formatNumber(groups.size, 0);
}

function renderDailyTable(dailyData) {
  if (!dailyTableBody) return;

  if (!dailyData.length) {
    dailyTableBody.innerHTML = '<tr><td colspan="5" class="text-muted">Không có dữ liệu trong 7 ngày gần nhất.</td></tr>';
    return;
  }

  dailyTableBody.innerHTML = dailyData
    .map((day) => `
      <tr>
        <td>${day.label}</td>
        <td>${formatNumber(day.btp, 2)}</td>
        <td>${formatNumber(day.time, 2)}</td>
        <td>${formatNumber(day.productivity, 2)}</td>
        <td>${formatNumber(day.rows, 0)}</td>
      </tr>
    `)
    .join('');
}

function drawCharts(dailyData, processData, teamData) {
  const trendCtx = document.getElementById('trendChart');
  const processCtx = document.getElementById('processChart');
  const teamCtx = document.getElementById('teamChart');

  if (reportChart) reportChart.destroy();
  if (processChart) processChart.destroy();
  if (teamChart) teamChart.destroy();

  reportChart = new Chart(trendCtx, {
    type: 'line',
    data: {
      labels: dailyData.map((entry) => entry.label),
      datasets: [
        {
          label: 'BTP',
          data: dailyData.map((entry) => entry.btp),
          borderColor: '#1267d6',
          backgroundColor: 'rgba(18, 103, 214, 0.12)',
          tension: 0.35,
          fill: true,
          pointRadius: 4
        },
        {
          label: 'Năng suất',
          data: dailyData.map((entry) => entry.productivity),
          borderColor: '#1da76e',
          backgroundColor: 'rgba(29, 167, 110, 0.12)',
          tension: 0.35,
          fill: false,
          pointRadius: 4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => `${value}` }
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { callback: (value) => `${value}` }
        }
      }
    }
  });

  processChart = new Chart(processCtx, {
    type: 'bar',
    data: {
      labels: processData.map((entry) => entry.name),
      datasets: [{
        label: 'BTP',
        data: processData.map((entry) => entry.value),
        backgroundColor: ['#1267d6', '#1da76e', '#f57c1f', '#6f42c1', '#ef4444', '#0ea5e9']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });

  teamChart = new Chart(teamCtx, {
    type: 'doughnut',
    data: {
      labels: teamData.map((entry) => entry.name),
      datasets: [{
        data: teamData.map((entry) => entry.value),
        backgroundColor: ['#1267d6', '#1da76e', '#f57c1f', '#6f42c1', '#f59e0b', '#10b981']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

async function loadReport() {
  const rows = await loadDataset();
  const dailyData = aggregateByDate(rows);
  const processData = aggregateByProcess(rows);
  const teamData = aggregateByTeam(rows);

  renderMetrics(rows);
  renderDailyTable(dailyData);
  drawCharts(dailyData, processData, teamData);

  if (reportTimestampEl) {
    const now = new Date();
    reportTimestampEl.textContent = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(now);
  }
}

watchAuthState(async (user) => {
  if (!user) {
    window.location.href = './login.html';
    return;
  }

  try {
    await requirePageAccess(user, 'report');
    await loadReport();
  } catch (error) {
    console.error('[Report] Access error', error);
  }
});

refreshBtn?.addEventListener('click', () => {
  loadReport();
});
