import { getCurrentUser, watchAuthState } from './auth.js';
import { rtdb } from './firebase.js';
import { get, query, ref, orderByKey, orderByChild, equalTo, limitToLast, limitToFirst, endAt, remove } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';
import { getUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';
import { getVietnamDate, logActivity } from './activityLog.js';
import { showToast } from './utils.js';

const body = document.getElementById('historyBody');
const status = document.getElementById('historyStatus');
const fromDate = document.getElementById('fromDate');
const toDate = document.getElementById('toDate');
const userFilter = document.getElementById('userFilter');
const actionFilter = document.getElementById('actionFilter');
const pageFilter = document.getElementById('pageFilter');
const oldBanner = document.getElementById('oldLogsBanner');
const cleanupButton = document.getElementById('cleanupHistoryBtn');
const exportOldButton = document.getElementById('exportOldHistoryBtn');
let currentRole = 'staff';
let visibleLogs = [];

function shiftDate(date, amount) { const result = new Date(`${date}T12:00:00`); result.setDate(result.getDate() + amount); return getVietnamDate(result.getTime()); }
function dateRange() { const today = getVietnamDate(); return { from: fromDate.value || shiftDate(today, -6), to: toDate.value || today }; }
function dateList(from, to) { const dates = []; let cursor = from; while (cursor <= to && dates.length < 31) { dates.push(cursor); cursor = shiftDate(cursor, 1); } return dates; }
function actionLabel(action) { return { add: 'Thêm', edit: 'Sửa', delete: 'Xóa', login: 'Đăng nhập', logout: 'Đăng xuất', export: 'Xuất', import: 'Nhập', save: 'Lưu' }[action] || action; }
function pageLabel(page) { return { congTachMui: 'Công tách múi', production: 'Nhập liệu', settings: 'Cài đặt', auth: 'Auth' }[page] || page; }
function render() {
  const selectedUser = userFilter.value;
  const filtered = visibleLogs.filter((item) => (!selectedUser || item.u === selectedUser) && (!actionFilter.value || item.a === actionFilter.value) && (!pageFilter.value || item.p === pageFilter.value)).sort((left, right) => right.t - left.t);
  body.replaceChildren(...(filtered.length ? filtered.map((item) => { const row = document.createElement('tr'); [new Date(item.t).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }), item.n || item.u, pageLabel(item.p), actionLabel(item.a), item.d || ''].forEach((value) => { const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell); }); return row; }) : [Object.assign(document.createElement('tr'), { innerHTML: '<td colspan="5" class="text-center text-muted py-4">Không có dữ liệu</td>' })]));
  status.textContent = `${filtered.length} log`;
}
function updateUsers() { const users = [...new Map(visibleLogs.map((item) => [item.u, item])).values()].sort((left, right) => String(left.n).localeCompare(String(right.n))); const current = userFilter.value; userFilter.replaceChildren(new Option('Tất cả', '')); users.forEach((item) => userFilter.appendChild(new Option(item.n || item.u, item.u))); userFilter.value = users.some((item) => item.u === current) ? current : ''; }
async function loadHistory() {
  if (!rtdb) throw new Error('Realtime Database chưa được cấu hình.');
  const { from, to } = dateRange();
  if (!from || !to || from > to) { showToast('Khoảng ngày không hợp lệ.', 'error'); return; }
  status.textContent = 'Đang tải...';
  const currentUser = getCurrentUser();
  const snapshots = await Promise.all(dateList(from, to).map((date) => {
    const dayRef = ref(rtdb, `logs/${date}`);
    const dayQuery = currentRole === 'admin' ? query(dayRef, orderByChild('t'), limitToLast(500)) : query(dayRef, orderByChild('u'), equalTo(currentUser.uid), limitToLast(500));
    return get(dayQuery);
  }));
  visibleLogs = snapshots.flatMap((snapshot) => Object.values(snapshot.val() || {})).filter((item) => currentRole === 'admin' || item.u === currentUser?.uid);
  updateUsers(); render();
  status.textContent = `${visibleLogs.length} log trong ${snapshots.length} ngày`;
}
async function checkOldLogs() {
  if (currentRole !== 'admin') return;
  const cutoff = shiftDate(getVietnamDate(), -7);
  const snapshot = await get(query(ref(rtdb, 'logs'), orderByKey(), endAt(cutoff), limitToFirst(1))).catch(() => null);
  const hasOld = snapshot?.exists() || false;
  oldBanner.classList.toggle('d-none', !hasOld);
  cleanupButton.classList.toggle('d-none', !hasOld);
}
async function cleanupOldLogs() {
  if (currentRole !== 'admin') return;
  const cutoff = shiftDate(getVietnamDate(), -7);
  const snapshot = await get(query(ref(rtdb, 'logs'), orderByKey(), endAt(cutoff))).catch(() => null);
  const oldDates = snapshot ? Object.keys(snapshot.val() || {}) : [];
  await Promise.all(oldDates.map((date) => remove(ref(rtdb, `logs/${date}`))));
  oldBanner.classList.add('d-none'); cleanupButton.classList.add('d-none'); logActivity({ action: 'delete', page: 'auth', detail: `Xóa ${oldDates.length} ngày log cũ` }); showToast('Đã xóa log cũ hơn 7 ngày.', 'success');
}
function downloadCsv(logs, filename) { const header = ['Thời gian', 'Người dùng', 'Trang', 'Thao tác', 'Chi tiết']; const lines = [header, ...logs.map((item) => [new Date(item.t).toISOString(), item.n || item.u, pageLabel(item.p), actionLabel(item.a), item.d || ''])].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')); const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
function exportCsv() { const selectedUser = userFilter.value; const logs = visibleLogs.filter((item) => (!selectedUser || item.u === selectedUser) && (!actionFilter.value || item.a === actionFilter.value) && (!pageFilter.value || item.p === pageFilter.value)).sort((left, right) => right.t - left.t); downloadCsv(logs, `activity-log-${getVietnamDate()}.csv`); logActivity({ action: 'export', page: 'auth', detail: `Xuất ${logs.length} log đang xem` }); }
async function exportOldLogs() { if (currentRole !== 'admin') return; const cutoff = shiftDate(getVietnamDate(), -7); const snapshot = await get(query(ref(rtdb, 'logs'), orderByKey(), endAt(cutoff))).catch(() => null); const logs = snapshot ? Object.values(snapshot.val() || {}).flatMap((day) => Object.values(day || {})).sort((left, right) => right.t - left.t) : []; downloadCsv(logs, `activity-log-old-${getVietnamDate()}.csv`); logActivity({ action: 'export', page: 'auth', detail: `Tải ${logs.length} log cũ` }); }
function init() { const today = getVietnamDate(); fromDate.value = shiftDate(today, -6); toDate.value = today; document.getElementById('applyHistoryBtn').addEventListener('click', loadHistory); document.getElementById('reloadHistoryBtn').addEventListener('click', loadHistory); document.getElementById('exportHistoryBtn').addEventListener('click', exportCsv); cleanupButton.addEventListener('click', cleanupOldLogs); exportOldButton?.addEventListener('click', exportOldLogs); watchAuthState(async (user) => { if (!user) { window.location.href = './login.html'; return; } const profile = await getUserProfile(user.uid); currentRole = resolveInitialRole(user.email, profile?.role); await loadHistory(); await checkOldLogs(); }); }
init();
