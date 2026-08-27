import { getCurrentUser, watchAuthState } from './auth.js';
import { rtdb, db } from './firebase.js';
import { endAt, equalTo, get, limitToLast, onValue, orderByChild, orderByKey, query, ref, remove } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getVietnamDate, logActivity } from './activityLog.js';
import { getUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';
import { showToast } from './utils.js';

const body = document.getElementById('historyBody');
const status = document.getElementById('historyStatus');
const currentDate = document.getElementById('currentDate');
const exportButton = document.getElementById('exportHistoryBtn');
const cleanupButton = document.getElementById('cleanupHistoryBtn');
const oldBanner = document.getElementById('oldLogsBanner');
const exportOldButton = document.getElementById('exportOldHistoryBtn');
const MAX_VISIBLE_LOGS = 500;
let currentRole = 'staff';
let currentDay = '';
let liveLogs = [];
let stopLiveListener = null;
let rolloverTimer = null;

const actionLabel = { add: 'ADD', edit: 'EDIT', delete: 'DELETE', login: 'LOGIN', logout: 'LOGOUT', export: 'EXPORT', import: 'IMPORT', save: 'SAVE' };

function shiftDate(date, amount) { const result = new Date(`${date}T12:00:00`); result.setDate(result.getDate() + amount); return getVietnamDate(result.getTime()); }
function formatTime(timestamp) { return new Date(timestamp).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }); }
function visibleLogList() { return [...liveLogs].sort((left, right) => left.t - right.t).slice(-MAX_VISIBLE_LOGS); }
function renderLogs() {
  const logs = visibleLogList();
  body.replaceChildren(...(logs.length ? logs.map((item) => {
    const line = document.createElement('div');
    line.className = 'log-line';
    [formatTime(item.t), item.n || item.u, item.p || '-', actionLabel[item.a] || item.a || '-', item.d || ''].forEach((value, index) => {
      const part = document.createElement('span');
      part.className = ['log-time', 'log-user', 'log-page', 'log-action', 'log-detail'][index];
      part.textContent = value;
      line.appendChild(part);
    });
    return line;
  }) : [Object.assign(document.createElement('div'), { className: 'text-secondary p-3', textContent: 'Chưa có log trong ngày.' })]));
  body.scrollTop = body.scrollHeight;
  status.textContent = `LIVE  ${logs.length}/${MAX_VISIBLE_LOGS}`;
}
function downloadCsv(logs, filename) { const rows = [['Timestamp', 'User', 'Page', 'Action', 'Detail'], ...logs.map((item) => [new Date(item.t).toISOString(), item.n || item.u, item.p || '', item.a || '', item.d || ''])]; const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n'); const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
function readDay(date) { const dayRef = ref(rtdb, `logs/${date}`); const dayQuery = currentRole === 'admin' ? query(dayRef, orderByChild('t'), limitToLast(MAX_VISIBLE_LOGS)) : query(dayRef, orderByChild('u'), equalTo(getCurrentUser()?.uid || ''), limitToLast(MAX_VISIBLE_LOGS)); return get(dayQuery); }
function watchCurrentDay(date) {
  if (stopLiveListener) stopLiveListener();
  currentDay = date;
  currentDate.textContent = date;
  const dayRef = ref(rtdb, `logs/${date}`);
  const liveQuery = currentRole === 'admin' ? query(dayRef, orderByChild('t'), limitToLast(MAX_VISIBLE_LOGS)) : query(dayRef, orderByChild('u'), equalTo(getCurrentUser()?.uid || ''), limitToLast(MAX_VISIBLE_LOGS));
  stopLiveListener = onValue(liveQuery, (snapshot) => {
    liveLogs = Object.values(snapshot.val() || {});
    renderLogs();
  }, () => { status.textContent = 'OFFLINE / lỗi kết nối'; });
}
async function archiveYesterday() {
  if (currentRole !== 'admin' || !rtdb || !db) return;
  const yesterday = shiftDate(getVietnamDate(), -1);
  const archiveRef = doc(db, 'activityLogArchive', yesterday);
  if ((await getDoc(archiveRef)).exists()) return;
  const snapshot = await get(ref(rtdb, `logs/${yesterday}`));
  const logs = snapshot.val() || {};
  if (!Object.keys(logs).length) return;
  await setDoc(archiveRef, { date: yesterday, archivedAt: Date.now(), logs });
}
async function checkOldLogs() {
  if (currentRole !== 'admin') return;
  const cutoff = shiftDate(getVietnamDate(), -7);
  const snapshot = await get(query(ref(rtdb, 'logs'), orderByKey(), endAt(cutoff), limitToLast(1))).catch(() => null);
  const hasOld = snapshot?.exists() || false;
  oldBanner.classList.toggle('d-none', !hasOld);
  cleanupButton.classList.toggle('d-none', !hasOld);
}
async function cleanupOldLogs() {
  if (currentRole !== 'admin') return;
  const cutoff = shiftDate(getVietnamDate(), -7);
  const snapshot = await get(query(ref(rtdb, 'logs'), orderByKey(), endAt(cutoff))).catch(() => null);
  const oldDates = Object.keys(snapshot?.val() || {});
  await Promise.all(oldDates.map((date) => remove(ref(rtdb, `logs/${date}`))));
  oldBanner.classList.add('d-none'); cleanupButton.classList.add('d-none');
  logActivity({ action: 'delete', page: 'auth', detail: `Xóa ${oldDates.length} ngày log cũ` });
  showToast('Đã xóa log cũ hơn 7 ngày.', 'success');
}
async function exportOldLogs() { if (currentRole !== 'admin') return; const cutoff = shiftDate(getVietnamDate(), -1); const snapshot = await get(query(ref(rtdb, 'logs'), orderByKey(), endAt(cutoff))).catch(() => null); const logs = Object.values(snapshot?.val() || {}).flatMap((day) => Object.values(day || {})); downloadCsv(logs, `activity-log-old-${getVietnamDate()}.csv`); }
function bindEvents() { exportButton.addEventListener('click', () => { downloadCsv(visibleLogList(), `activity-log-${currentDay}.csv`); logActivity({ action: 'export', page: 'auth', detail: `Xuất ${liveLogs.length} log realtime` }); }); cleanupButton.addEventListener('click', cleanupOldLogs); exportOldButton?.addEventListener('click', exportOldLogs); }
async function init() { bindEvents(); watchAuthState(async (user) => { if (!user) { window.location.href = './login.html'; return; } const profile = await getUserProfile(user.uid); currentRole = resolveInitialRole(user.email, profile?.role); if (!rtdb) { status.textContent = 'RTDB chưa cấu hình'; return; } watchCurrentDay(getVietnamDate()); await archiveYesterday().catch(() => {}); await checkOldLogs(); if (rolloverTimer) clearInterval(rolloverTimer); rolloverTimer = setInterval(async () => { const today = getVietnamDate(); if (today !== currentDay) { await archiveYesterday().catch(() => {}); watchCurrentDay(today); } }, 60000); }); }
init();
