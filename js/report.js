import { watchAuthState } from './auth.js';
import { db } from './firebase.js';
import { requirePageAccess } from './pageAccess.js';
import { showToast } from './utils.js';
import { setTeamDisplayNameMap, getRowTeam as resolveRowTeam } from './reportTeamDisplay.js';
import { collection, doc, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const COLLECTIONS = [
  { name: 'production', label: 'Phần trăm BTP' },
  { name: 'nhapLieuSanXuat', label: 'Năng suất sản xuất' },
  { name: 'congTachMui', label: 'Năng xuất tách múi' }
];
const MAX_RANGE_DAYS = 90;

const totalBtpEl = document.getElementById('totalBtp');
const avgProductivityEl = document.getElementById('avgProductivity');
const totalTimeEl = document.getElementById('totalTime');
const totalRowsEl = document.getElementById('totalRows');
const activeGroupsEl = document.getElementById('activeGroups');
const reportTimestampEl = document.getElementById('reportTimestamp');
const dailyTableBody = document.getElementById('dailyTableBody');
const refreshBtn = document.getElementById('refreshBtn');
const fromDateInput = document.getElementById('fromDate');
const toDateInput = document.getElementById('toDate');
const teamFilterEl = document.getElementById('teamFilter');
const processFilterEl = document.getElementById('processFilter');
const sourceFilterEl = document.getElementById('sourceFilter');
const applyReportFiltersBtn = document.getElementById('applyReportFilters');
const exportReportBtn = document.getElementById('exportReportBtn');

let reportChart;
let processChart;
let teamChart;
let shiftChart;
let allRows = [];
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

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return {
    from: formatDateInput(start),
    to: formatDateInput(end)
  };
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function getRowDateValue(row) {
  const directDate = row?.productionDate || row?.date || row?.ngay || row?.createdAt;

  if (!directDate) return null;

  if (directDate instanceof Date && !Number.isNaN(directDate.getTime())) {
    return directDate;
  }

  if (directDate && typeof directDate?.toDate === 'function') {
    const fromTimestamp = directDate.toDate();
    if (!Number.isNaN(fromTimestamp.getTime())) return fromTimestamp;
  }

  if (typeof directDate === 'string') {
    const value = directDate.trim();
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parsed = new Date(`${value}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      const [day, month, year] = value.split('/').map(Number);
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    if (/^\d{2}\/\d{2}\/\d{2}$/.test(value)) {
      const [day, month, yearShort] = value.split('/').map(Number);
      let year = yearShort;
      if (year < 100) {
        year = year >= 50 ? 1900 + year : 2000 + year;
      }
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function getRowSourceLabel(row) {
  return row.__source || row.source || 'production';
}

function getRowBtp(row) {
  return numberValue(
    row.totalBtp ??
    row.btp ??
    row.kgA ??
    row.kgB ??
    row.kgC ??
    row.kgCNoSeed ??
    (Number(row.morningBtp || 0) + Number(row.afternoonBtp || 0) + Number(row.eveningBtp || 0))
  );
}

function getRowTime(row) {
  return numberValue(
    row.totalTime ??
    row.thoiGian ??
    row.time ??
    row.hours ??
    ((Number(row.morningTime || 0) + Number(row.afternoonTime || 0) + Number(row.eveningTime || 0)))
  );
}

function getRowTeam(row) {
  return resolveRowTeam(row);
}

function getRowProcess(row) {
  return row.processDisplay || row.processOne || row.processTwo || row.itemType || row.process || row.note || 'Chưa phân loại';
}

function getShiftTotals(row) {
  const morning = numberValue(row.morningBtp ?? row.caSangBtp ?? row.shiftMorningBtp ?? row.shiftBtp);
  const afternoon = numberValue(row.afternoonBtp ?? row.caChieuBtp ?? row.shiftAfternoonBtp ?? 0);
  const evening = numberValue(row.eveningBtp ?? row.caToiBtp ?? row.shiftEveningBtp ?? 0);
  return {
    'Ca sáng': morning,
    'Ca chiều': afternoon,
    'Ca tối': evening
  };
}

function populateSelectOptions(select, values, placeholder) {
  if (!select) return;
  const entries = [...new Set(values.filter(Boolean))];
  select.innerHTML = `<option value="all">${placeholder}</option>`;
  entries.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

async function loadCatalogOptions() {
  const catalogNames = ['congTachMuiCatalog', 'nhapLieuSanXuatCatalog'];
  const teamValues = [];
  const processValues = [];
  const displayTeams = [];

  // Duyệt qua từng danh mục trong Firestore
  // Lấy tên tổ và tên công đoạn
  for (const catalogName of catalogNames) {
    try {
      const snapshot = await getDoc(doc(db, 'settings', catalogName));
      if (!snapshot.exists()) continue;
      const data = snapshot.data() || {};
      if (Array.isArray(data.teams)) {
        data.teams.forEach((team) => {
          const teamId = team?.id || team;
          const teamName = team?.name || teamId;
          if (teamName) teamValues.push(teamName);
          if (teamId) {
            displayTeams.push({ id: teamId, name: teamName });
          }
        });
      }
      if (Array.isArray(data.processes)) {
        data.processes.forEach((process) => processValues.push(process.name || process.id || process));
      }
      if (Array.isArray(data.types)) {
        data.types.forEach((type) => processValues.push(type.name || type.id || type));
      }
    } catch (error) {
      console.warn('[Report] Could not load catalog', catalogName, error);
    }
  }

  setTeamDisplayNameMap(displayTeams);

  const allTeams = teamValues.length ? teamValues : ['Tổ 1', 'Tổ 2', 'Tổ 3'];
  const allProcesses = processValues.length ? processValues : ['Đóng gói', 'Xử lý', 'Phối trộn', 'Bảo quản'];

  populateSelectOptions(teamFilterEl, allTeams, 'Tất cả');
  populateSelectOptions(processFilterEl, allProcesses, 'Tất cả');
}

// Tải toàn bộ dữ liệu từ 3 collection báo cáo
// Gắn thêm nguồn để sau này lọc theo nguồn
async function loadDataset() {
  const snapshots = await Promise.all(COLLECTIONS.map(async ({ name }) => {
    try {
      const snapshot = await getDocs(collection(db, name));
      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        __source: name,
        ...docSnap.data()
      }));
    } catch (error) {
      console.warn(`[Report] Could not load ${name}`, error);
      return [];
    }
  }));

  allRows = snapshots.flat();
  return allRows;
}

function getCurrentFilters() {
  return {
    from: fromDateInput?.value || getDefaultDateRange().from,
    to: toDateInput?.value || getDefaultDateRange().to,
    team: teamFilterEl?.value || 'all',
    process: processFilterEl?.value || 'all',
    source: sourceFilterEl?.value || 'all'
  };
}

function validateRange(from, to) {
  const startDate = parseDateInput(from);
  const endDate = parseDateInput(to);
  if (!startDate || !endDate) return { valid: false, message: 'Vui lòng chọn đúng khoảng ngày.' };
  if (startDate > endDate) return { valid: false, message: 'Từ ngày không thể lớn hơn đến ngày.' };
  const diffDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
  if (diffDays > MAX_RANGE_DAYS) return { valid: false, message: `Khoảng thời gian tối đa là ${MAX_RANGE_DAYS} ngày.` };
  return { valid: true, diffDays };
}

// Lọc danh sách dữ liệu theo bộ lọc đang chọn
// Kiểm tra ngày, nguồn, tổ và công đoạn
function filterRows(rows, filters) {
  const source = filters.source || 'all';
  const team = (filters.team || 'all').trim();
  const process = (filters.process || 'all').trim();
  const from = parseDateInput(filters.from);
  const to = parseDateInput(filters.to);

  return rows.filter((row) => {
    const rowDate = getRowDateValue(row);
    if (!rowDate) return false;
    const dayKey = formatDateInput(rowDate);
    const dayDate = parseDateInput(dayKey);
    if (!dayDate) return false;
    // Bỏ qua dòng ngoài khoảng ngày đã chọn
    if (from && dayDate < from) return false;
    if (to && dayDate > to) return false;

    // Bỏ qua dòng không đúng nguồn dữ liệu
    if (source !== 'all' && getRowSourceLabel(row) !== source) return false;

    // So khớp tên tổ hoặc id tổ cũ
    if (team !== 'all') {
      const selectedTeam = normalizeKey(team);
      const rowTeam = normalizeKey(getRowTeam(row));
      const rowTeamId = normalizeKey(row?.teamId || row?.team || '');
      if (rowTeam !== selectedTeam && rowTeamId !== selectedTeam) return false;
    }

    // Bỏ qua dòng không đúng công đoạn đã chọn
    if (process !== 'all' && normalizeKey(getRowProcess(row)) !== normalizeKey(process)) return false;

    return true;
  });
}

// Nhóm dữ liệu theo từng ngày trong khoảng lọc
// Tính tổng BTP, thời gian và năng suất
function aggregateByDate(rows) {
  const range = { from: parseDateInput(getCurrentFilters().from), to: parseDateInput(getCurrentFilters().to) };
  const start = range.from || new Date();
  const end = range.to || new Date();

  const bucket = new Map();
  const current = new Date(start);
  while (current <= end) {
    const key = formatDateInput(current);
    bucket.set(key, { label: formatShortDate(current), btp: 0, time: 0, rows: 0, productivity: 0 });
    current.setDate(current.getDate() + 1);
  }

  rows.forEach((row) => {
    const rowDate = getRowDateValue(row);
    if (!rowDate) return;
    const key = formatDateInput(rowDate);
    if (!bucket.has(key)) {
      bucket.set(key, { label: formatShortDate(rowDate), btp: 0, time: 0, rows: 0, productivity: 0 });
    }
    const entry = bucket.get(key);
    const rowBtp = getRowBtp(row);
    const rowTime = getRowTime(row);
    entry.btp += rowBtp;
    entry.time += rowTime;
    entry.rows += 1;
  });

  return [...bucket.entries()]
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      btp: entry.btp,
      time: entry.time,
      rows: entry.rows,
      productivity: entry.time > 0 ? entry.btp / entry.time : 0
    }))
    .sort((left, right) => (left.key > right.key ? 1 : -1));
}

// Nhóm dữ liệu theo 4 loại BTP chính trong collection production
// Sử dụng để thay thế biểu đồ "Theo công đoạn" bằng tỷ lệ BTP A/B/C/C Không hạt
function aggregateProductionBtpBreakdown(rows) {
  const totals = {
    'BTP A': 0,
    'BTP B': 0,
    'BTP C có hạt': 0,
    'BTP C Không hạt': 0
  };

  rows
    .filter((row) => getRowSourceLabel(row) === 'production')
    .forEach((row) => {
      totals['BTP A'] += numberValue(row.kgA ?? 0);
      totals['BTP B'] += numberValue(row.kgB ?? 0);
      totals['BTP C có hạt'] += numberValue(row.kgC ?? 0);
      totals['BTP C Không hạt'] += numberValue(row.kgCNoSeed ?? 0);
    });

  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return [{ name: 'Không có dữ liệu', value: 1 }];
  }

  return [
    { name: 'BTP A', value: totals['BTP A'] },
    { name: 'BTP B', value: totals['BTP B'] },
    { name: 'BTP C có hạt', value: totals['BTP C có hạt'] },
    { name: 'BTP C Không hạt', value: totals['BTP C Không hạt'] }
  ];
}

// Tính trung bình BTP theo tuần của từng kho trong collection production
function aggregateWarehouseWeeklyAverage(rows) {
  const weekTotals = new Map();

  rows.forEach((row) => {
    const rowDate = getRowDateValue(row);
    if (!rowDate) return;

    const warehouse = String(row?.warehouse || row?.kho || 'Chưa phân loại').trim() || 'Chưa phân loại';
    const current = new Date(rowDate);
    const day = current.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(current);
    weekStart.setDate(current.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    const weekKey = `${formatDateInput(weekStart)}|${warehouse}`;
    const warehouseMap = weekTotals.get(warehouse) || new Map();
    const totalThisWeek = warehouseMap.get(weekKey) || 0;
    warehouseMap.set(weekKey, totalThisWeek + getRowBtp(row));
    weekTotals.set(warehouse, warehouseMap);
  });

  const warehouseAverages = [...weekTotals.entries()].map(([warehouse, byWeek]) => {
    const weeklyTotals = [...byWeek.values()];
    const average = weeklyTotals.length ? weeklyTotals.reduce((sum, value) => sum + value, 0) / weeklyTotals.length : 0;
    return { name: warehouse, value: average };
  });

  const visible = warehouseAverages.filter((entry) => entry.value > 0).sort((left, right) => right.value - left.value);
  return visible.length ? visible : [{ name: 'Không có dữ liệu', value: 1 }];
}

// Nhóm dữ liệu theo từng tổ
// Lấy tối đa 8 tổ có BTP cao nhất
function aggregateByTeam(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = getRowTeam(row);
    const current = map.get(key) || { name: key, value: 0 };
    current.value += getRowBtp(row);
    map.set(key, current);
  });
  return [...map.values()].sort((left, right) => right.value - left.value).slice(0, 8);
}

// Tính tổng BTP theo từng công đoạn
// Dùng để vẽ biểu đồ cột theo công đoạn theo ngày đang lọc
function aggregateByProcess(rows) {
  const totals = new Map();

  rows.forEach((row) => {
    const processName = String(getRowProcess(row) || 'Chưa phân loại').trim() || 'Chưa phân loại';
    const current = totals.get(processName) || 0;
    totals.set(processName, current + getRowBtp(row));
  });

  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value);
}

// Tạo dữ liệu biểu đồ đường theo từng tổ
// Chỉ lấy dữ liệu tách múi trong khoảng ngày đã chọn
function buildTeamTrendChartData(rows, filters) {
  const start = parseDateInput(filters.from) || new Date();
  const end = parseDateInput(filters.to) || new Date();
  const labels = [];
  const current = new Date(start);
  while (current <= end) {
    labels.push({ key: formatDateInput(current), label: formatShortDate(current) });
    current.setDate(current.getDate() + 1);
  }

  const teamMap = new Map();
  rows.forEach((row) => {
    const date = getRowDateValue(row);
    if (!date) return;
    const rowDateKey = formatDateInput(date);
    if (date < start || date > end) return;
    const teamName = getRowTeam(row) || 'Chưa phân nhóm';
    const teamKey = String(teamName);
    if (!teamMap.has(teamKey)) {
      teamMap.set(teamKey, new Map());
    }
    const value = getRowProductivityValue(row);
    const bucket = teamMap.get(teamKey);
    bucket.set(rowDateKey, (bucket.get(rowDateKey) || 0) + value);
  });

  const catalogTeams = Array.from(teamFilterEl?.options || [])
    .map((option) => String(option.value || '').trim())
    .filter((value) => value && value !== 'all');

  const datasets = catalogTeams.map((teamName, index) => {
    const values = teamMap.get(teamName) || new Map();
    return {
      label: teamName,
      data: labels.map((day) => values.get(day.key) ?? 0),
      borderColor: TEAM_COLORS[index % TEAM_COLORS.length],
      backgroundColor: TEAM_COLORS[index % TEAM_COLORS.length],
      borderWidth: 2,
      tension: 0,
      pointRadius: 4,
      pointHoverRadius: 5,
      fill: false
    };
  });

  return { labels: labels.map((day) => day.label), datasets };
}

// Bảng màu riêng cho từng tổ trên biểu đồ
const TEAM_COLORS = ['#1267d6', '#1da76e', '#f57c1f', '#6f42c1', '#ef4444', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9', '#22c55e'];

// Lấy giá trị năng xuất ưu tiên từ một dòng
// Ưu tiên totalProductivity, sau đó mới đến totalBtp nếu không có giá trị năng suất
function getRowProductivityValue(row) {
  if (row?.totalProductivity !== undefined && row?.totalProductivity !== null && row?.totalProductivity !== '') {
    return numberValue(row.totalProductivity);
  }
  if (row?.totalBtp !== undefined && row?.totalBtp !== null && row?.totalBtp !== '') {
    const totalTime = numberValue(row?.totalTime ?? 0);
    if (totalTime > 0) {
      return numberValue(row.totalBtp / totalTime);
    }
    return numberValue(row.totalBtp);
  }
  return numberValue(row?.btp ?? row?.kgA ?? row?.kgB ?? row?.kgC ?? row?.kgCNoSeed ?? 0);
}

// Tính và hiển thị các chỉ số KPI tổng quan
// Dựa trên dữ liệu đã lọc
function renderMetrics(rows) {
  let totalBtp = 0;
  let totalTime = 0;
  let totalRows = 0;
  const groups = new Set();

  rows.forEach((row) => {
    totalBtp += getRowBtp(row);
    totalTime += getRowTime(row);
    totalRows += 1;
    groups.add(getRowTeam(row));
  });

  totalBtpEl.textContent = formatNumber(totalBtp, 2);
  avgProductivityEl.textContent = totalTime > 0 ? formatNumber(totalBtp / totalTime, 2) : '0.00';
  totalTimeEl.textContent = formatNumber(totalTime, 2);
  totalRowsEl.textContent = formatNumber(totalRows, 0);
  activeGroupsEl.textContent = formatNumber(groups.size, 0);
}

// Hiển thị bảng chi tiết dữ liệu theo ngày
function renderDailyTable(dailyData) {
  if (!dailyTableBody) return;

  if (!dailyData.length) {
    dailyTableBody.innerHTML = '<tr><td colspan="5" class="text-muted">Không có dữ liệu trong khoảng lọc hiện tại.</td></tr>';
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

// Hủy biểu đồ cũ trước khi vẽ biểu đồ mới
function destroyChart(chart) {
  if (chart) chart.destroy();
}

// Vẽ lại toàn bộ 4 biểu đồ của trang báo cáo
// Dữ liệu truyền vào đã được lọc sẵn
function drawCharts(dailyData, processData, teamData, shiftData, teamTrendData = null) {
  const trendCtx = document.getElementById('trendChart');
  const processCtx = document.getElementById('processChart');
  const teamCtx = document.getElementById('teamChart');
  const shiftCtx = document.getElementById('shiftChart');

  destroyChart(reportChart);
  destroyChart(processChart);
  destroyChart(teamChart);
  destroyChart(shiftChart);

  if (trendCtx) {
    const trendLabels = teamTrendData?.labels || dailyData.map((entry) => entry.label);
    const trendDatasets = teamTrendData?.datasets && teamTrendData.datasets.length
      ? teamTrendData.datasets
      : [
          {
            label: 'BTP',
            data: dailyData.map((entry) => entry.btp),
            borderColor: '#1267d6',
            backgroundColor: 'rgba(18, 103, 214, 0.12)',
            tension: 0,
            fill: true,
            pointRadius: 4
          }
        ];

    reportChart = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: trendDatasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              title: (items) => {
                const index = items[0]?.dataIndex ?? 0;
                return `Ngày: ${trendLabels[index] || ''}`;
              },
              label: (context) => {
                const teamName = context.dataset.label || 'Tổ';
                const value = context.parsed.y ?? 0;
                return `${teamName} - ${formatNumber(value, 2)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Năng xuất' }
          },
          x: {
            title: { display: true, text: 'Ngày' }
          }
        }
      }
    });
  }

  if (processCtx) {
    const chartLabels = processData.map((entry) => entry.name);
    const chartValues = processData.map((entry) => entry.value);
    const chartColors = ['#1267d6', '#1da76e', '#f57c1f', '#6f42c1', '#ef4444', '#0ea5e9', '#14b8a6', '#f59e0b'];

    const isEmpty = !chartValues.length;

    processChart = new Chart(processCtx, {
      type: 'doughnut',
      data: {
        labels: isEmpty ? ['Không có dữ liệu'] : chartLabels,
        datasets: [{
          label: 'BTP',
          data: isEmpty ? [1] : chartValues,
          backgroundColor: isEmpty ? ['#1267d6'] : chartLabels.map((_, index) => chartColors[index % chartColors.length])
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '45%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              generateLabels: (chart) => {
                const dataset = chart.data.datasets[0];
                if (isEmpty) {
                  return [{ text: 'Không có dữ liệu', fillStyle: '#1267d6', strokeStyle: '#1267d6', lineWidth: 0, hidden: false, index: 0 }];
                }
                return chart.data.labels.map((label, index) => ({
                  text: label,
                  fillStyle: dataset.backgroundColor[index] || '#1267d6',
                  strokeStyle: dataset.backgroundColor[index] || '#1267d6',
                  lineWidth: 0,
                  hidden: false,
                  index
                }));
              }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => isEmpty ? 'Không có dữ liệu' : `${context.label}: ${formatNumber(context.parsed, 2)}`
            }
          }
        }
      }
    });
  }

  if (teamCtx) {
    teamChart = new Chart(teamCtx, {
      type: 'bar',
      data: {
        labels: teamData.map((entry) => entry.name),
        datasets: [{
          label: 'BTP',
          data: teamData.map((entry) => entry.value),
          backgroundColor: ['#1267d6', '#1da76e', '#f57c1f', '#6f42c1', '#f59e0b', '#10b981', '#ec4899', '#64748b']
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    });
  }

  if (shiftCtx) {
    shiftChart = new Chart(shiftCtx, {
      type: 'bar',
      data: {
        labels: shiftData.map((entry) => entry.name),
        datasets: [{
          label: 'Tổng BTP',
          data: shiftData.map((entry) => entry.value),
          backgroundColor: ['#1267d6', '#1da76e', '#f57c1f', '#6f42c1', '#f59e0b', '#0ea5e9', '#14b8a6', '#ef4444']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ${formatNumber(context.parsed.y, 2)}`
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Công đoạn' }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Tổng BTP' }
          }
        }
      }
    });
  }
}

// Xuất dữ liệu đang lọc ra file CSV
// Dùng để tải về máy người dùng
function exportCsv(rows) {
  const header = ['Ngày', 'Nguồn', 'Tổ', 'Công đoạn', 'BTP', 'Thời gian', 'Năng suất'];
  const entries = rows.map((row) => [
    formatDateInput(getRowDateValue(row) || new Date()),
    getRowSourceLabel(row),
    getRowTeam(row),
    getRowProcess(row),
    getRowBtp(row),
    getRowTime(row),
    getRowTime(row) > 0 ? getRowBtp(row) / getRowTime(row) : 0
  ]);

  const csv = [header, ...entries]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = 'report-filtered.csv';
  link.click();
  URL.revokeObjectURL(url);
}

// Hàm chính: lọc dữ liệu và vẽ lại toàn bộ báo cáo
// Kiểm tra khoảng ngày trước khi xử lý
async function renderCurrentReport() {
  const filters = getCurrentFilters();
  const validation = validateRange(filters.from, filters.to);
  if (!validation.valid) {
    showToast(validation.message, 'error');
    return;
  }

  const filteredRows = filterRows(allRows, filters);
  const productionRows = filterRows(allRows.filter((row) => getRowSourceLabel(row) === 'production'), filters);
  const nhapLieuRows = filterRows(allRows.filter((row) => getRowSourceLabel(row) === 'nhapLieuSanXuat'), filters);
  const congTachMuiRows = filterRows(allRows.filter((row) => getRowSourceLabel(row) === 'congTachMui'), filters);
  const dailyData = aggregateByDate(filteredRows);
  const processData = aggregateProductionBtpBreakdown(productionRows);
  const teamData = aggregateByTeam(filteredRows);
  const shiftData = aggregateByProcess(filteredRows);
  const teamTrendData = buildTeamTrendChartData(congTachMuiRows, filters);

  renderMetrics(filteredRows);
  renderDailyTable(dailyData);
  drawCharts(dailyData, processData, teamData, shiftData, teamTrendData);

  if (reportTimestampEl) {
    const now = new Date();
    reportTimestampEl.textContent = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(now);
  }
}

// Khởi tạo trang báo cáo khi mới tải
// Đặt khoảng ngày mặc định rồi tải dữ liệu
async function initializeReport() {
  const defaultRange = getDefaultDateRange();
  fromDateInput.value = defaultRange.from;
  toDateInput.value = defaultRange.to;
  await loadCatalogOptions();
  await loadDataset();
  await renderCurrentReport();
}

applyReportFiltersBtn?.addEventListener('click', async (event) => {
  event.preventDefault();
  await renderCurrentReport();
});

exportReportBtn?.addEventListener('click', async () => {
  const filters = getCurrentFilters();
  const validation = validateRange(filters.from, filters.to);
  if (!validation.valid) {
    showToast(validation.message, 'error');
    return;
  }
  exportCsv(filterRows(allRows, filters));
  showToast('Đã xuất dữ liệu báo cáo đang lọc.', 'success');
});

refreshBtn?.addEventListener('click', async () => {
  await loadDataset();
  await renderCurrentReport();
});

watchAuthState(async (user) => {
  if (!user) {
    window.location.href = './login.html';
    return;
  }

  try {
    await requirePageAccess(user, 'report');
    await initializeReport();
  } catch (error) {
    console.error('[Report] Access error', error);
  }
});
