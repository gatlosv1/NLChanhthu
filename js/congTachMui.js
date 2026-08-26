import { waitForAuth, watchAuthState } from './auth.js';
import { db } from './firebase.js';
import { getUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';
import { requirePageAccess } from './pageAccess.js';
import { showToast } from './utils.js';
import { collection, deleteDoc, doc, getDoc, onSnapshot, query, orderBy, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const COLLECTION = 'congTachMui';
const CATALOG_REF = doc(db, 'settings', 'congTachMuiCatalog');
const fields = ['stt', 'processDisplay', 'productionDate', 'totalBtp', 'totalTime', 'totalProductivity', 'morningBtp', 'morningPeople', 'morningHours', 'morningTime', 'morningProductivity', 'afternoonBtp', 'afternoonPeople', 'afternoonHours', 'afternoonTime', 'afternoonProductivity', 'eveningBtp', 'eveningPeople', 'eveningHours', 'eveningTime', 'eveningProductivity'];
const labels = ['STT', 'Công đoạn', 'Ngày tháng', 'Tổng BTP', 'Tổng Thời gian', 'Tổng Năng suất', 'Ca sáng BTP', 'Ca sáng Số người', 'Ca sáng Số giờ', 'Ca sáng Thời gian', 'Ca sáng Năng suất', 'Ca chiều BTP', 'Ca chiều Số người', 'Ca chiều Số giờ', 'Ca chiều Thời gian', 'Ca chiều Năng suất', 'Ca tối BTP', 'Ca tối Số người', 'Ca tối Số giờ', 'Ca tối Thời gian', 'Ca tối Năng suất'];
const byId = (id) => document.getElementById(id);
const productionDate = byId('productionDate');
const teamSelect = byId('teamSelect');
const processOne = byId('processOne');
const processTwo = byId('processTwo');
const itemType = byId('itemType');
const note = byId('note');
const activeShift = byId('activeShift');
const shiftPeople = byId('shiftPeople');
const shiftHours = byId('shiftHours');
const shiftBtp = byId('shiftBtp');
let table;
let currentUser;
let currentRole = 'staff';
let currentProfile = {};
let catalog = { teams: [{ id: 'dong-goi', name: 'Tổ Đóng gói' }], processes: ['Đóng gói 1'], types: ['IQF'] };
let stopRows;
let manuallySelectedShift = false;

function vietnamNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
    return result;
  }, {});
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}
function dateValue(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function productivity(btp, time) { return time > 0 ? (btp / time).toFixed(2) : ''; }
function shiftInfo(date) { const minutes = date.getHours() * 60 + date.getMinutes(); if (minutes >= 420 && minutes < 750) return ['Ca sáng', 'morning']; if (minutes >= 750 && minutes < 1050) return ['Ca chiều', 'afternoon']; if (minutes >= 1080 || minutes < 30) return ['Ca tối', 'evening']; return ['Ngoài ca', 'morning']; }
function calculate(row) {
  const shiftRows = ['morning', 'afternoon', 'evening'];
  shiftRows.forEach((shift) => { row[`${shift}Time`] = number(row[`${shift}People`]) * number(row[`${shift}Hours`]); row[`${shift}Productivity`] = productivity(number(row[`${shift}Btp`]), number(row[`${shift}Time`])); });
  row.totalBtp = shiftRows.reduce((sum, shift) => sum + number(row[`${shift}Btp`]), 0);
  row.totalTime = shiftRows.reduce((sum, shift) => sum + number(row[`${shift}Time`]), 0);
  row.totalProductivity = row.totalTime > 0 ? row.totalBtp / row.totalTime : 0;
  return row;
}
function processDisplay(row) {
  const firstProcess = [row.itemType, row.processOne].filter(Boolean).join(' ');
  const processParts = [firstProcess, row.processTwo].filter(Boolean);
  const display = processParts.join(' + ');
  return row.note ? `${display} (${row.note})` : display;
}
function emptyRow() { const shift = activeShift.value || shiftInfo(vietnamNow())[1]; const row = { id: `${currentUser.uid}-${Date.now()}`, stt: table.getDataCount() + 1, productionDate: productionDate.value, processOne: processOne.value, processTwo: processTwo.value, itemType: itemType.value, note: note.value.trim(), morningBtp: '', morningPeople: '', morningHours: '', afternoonBtp: '', afternoonPeople: '', afternoonHours: '', eveningBtp: '', eveningPeople: '', eveningHours: '', activeShift: shift }; row[`${shift}Btp`] = shiftBtp.value || ''; row[`${shift}People`] = shiftPeople.value || ''; row[`${shift}Hours`] = shiftHours.value || ''; return calculate(row); }
function renderOptions(select, values, placeholder) { select.replaceChildren(new Option(placeholder, '')); values.forEach((value) => select.appendChild(new Option(value.name || value, value.id || value))); }
function renderCatalog() { renderOptions(teamSelect, catalog.teams, '-- Chọn tổ --'); renderOptions(processOne, catalog.processes, '-- Chọn công đoạn --'); renderOptions(processTwo, catalog.processes, '-- Chọn công đoạn --'); renderOptions(itemType, catalog.types, '-- Chọn loại --'); const allowedTeam = currentRole === 'admin' ? '' : currentProfile.teamId || ''; if (allowedTeam) teamSelect.value = allowedTeam; teamSelect.disabled = currentRole !== 'admin'; const list = byId('catalogList'); if (list) list.textContent = `Tổ: ${catalog.teams.map((team) => `${team.id} - ${team.name}`).join(', ')} | Công đoạn: ${catalog.processes.join(', ')} | Loại: ${catalog.types.join(', ')}`; byId('teamBadge').textContent = teamSelect.options[teamSelect.selectedIndex]?.text || 'Chưa chọn tổ'; }
function initTable() { const columns = fields.map((field, index) => ({ title: labels[index], field, width: field === 'processDisplay' ? 190 : 105, frozen: index < 3, editor: ['morningBtp', 'morningPeople', 'morningHours', 'afternoonBtp', 'afternoonPeople', 'afternoonHours', 'eveningBtp', 'eveningPeople', 'eveningHours'].includes(field) ? 'number' : false, editable: () => currentRole === 'admin' || Boolean(currentUser), formatter: (cell) => { const value = cell.getValue(); return typeof value === 'number' && field.toLowerCase().includes('productivity') ? value : value ?? ''; } }));
  columns.forEach((column) => { if (['stt', 'processDisplay', 'productionDate', 'totalBtp', 'totalTime', 'totalProductivity', 'morningTime', 'morningProductivity', 'afternoonTime', 'afternoonProductivity', 'eveningTime', 'eveningProductivity'].includes(column.field)) column.editable = false; });
  table = new Tabulator('#congTachMuiTable', { data: [], columns, layout: 'fitDataFill', movableColumns: true, selectable: 1, clipboard: true, history: true, rowHeight: 38, renderComplete: updateSummary });
  table.on('cellEdited', (cell) => { const row = cell.getRow().getData(); calculate(row); cell.getRow().update(row); updateSummary(); });
}
function applyRows(rows) { table.setData(rows.map((row, index) => calculate({ ...row, stt: index + 1, processDisplay: processDisplay(row) }))); updateSummary(); }
function loadRows() { if (stopRows) stopRows(); const selectedTeam = teamSelect.value; const rowsRef = query(collection(db, COLLECTION), orderBy('createdAt', 'asc')); stopRows = onSnapshot(rowsRef, (snapshot) => { const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((row) => row.teamId === selectedTeam || currentRole === 'admin' && (!selectedTeam || row.teamId === selectedTeam)); applyRows(rows); }, (error) => showToast(error.message || 'Không thể tải dữ liệu Công tách múi.', 'error')); }
async function loadCatalog() { const snapshot = await getDoc(CATALOG_REF); if (snapshot.exists()) catalog = { ...catalog, ...snapshot.data() }; renderCatalog(); }
async function addOfficialRow() {
  if (!productionDate.value) { showToast('Vui lòng chọn ngày tháng.', 'info'); return; }
  if (!activeShift.value) { showToast('Vui lòng chọn ca.', 'info'); return; }
  const selectedTeam = teamSelect.value;
  if (!selectedTeam) { showToast('Vui lòng chọn tổ.', 'info'); return; }
  if (!processOne.value) { showToast('Vui lòng chọn công đoạn.', 'info'); return; }

  const existingRow = table.getData().find((row) => row.productionDate === productionDate.value
    && row.processOne === processOne.value
    && row.processTwo === processTwo.value
    && row.itemType === itemType.value);
  const row = existingRow ? { ...existingRow } : emptyRow();
  const shift = activeShift.value || shiftInfo(vietnamNow())[1];
  row.activeShift = shift;
  row[`${shift}Btp`] = shiftBtp.value || row[`${shift}Btp`] || '';
  row[`${shift}People`] = shiftPeople.value || row[`${shift}People`] || '';
  row[`${shift}Hours`] = shiftHours.value || row[`${shift}Hours`] || '';
  calculate(row);

  try {
    await setDoc(doc(db, COLLECTION, row.id), {
      ...row,
      teamId: selectedTeam,
      ownerId: currentUser.uid,
      processDisplay: processDisplay(row),
      createdAt: existingRow?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    showToast(existingRow ? 'Đã cập nhật ca vào dòng hiện tại.' : 'Đã thêm dòng chính thức.', 'success');
  } catch (error) {
    showToast(error.message || 'Không thể lưu dòng dữ liệu.', 'error');
  }
}
function updateSummary() { const rows = table ? table.getData() : []; byId('totalBtp').textContent = rows.reduce((sum, row) => sum + number(row.totalBtp), 0).toFixed(2); byId('totalTime').textContent = rows.reduce((sum, row) => sum + number(row.totalTime), 0).toFixed(2); const time = rows.reduce((sum, row) => sum + number(row.totalTime), 0); byId('totalProductivity').textContent = productivity(number(byId('totalBtp').textContent), time) || '0'; byId('draftRows').textContent = rows.length; }
function refreshClock() { const now = vietnamNow(); const [shiftLabel, shift] = shiftInfo(now); const realtimeText = now.toLocaleString('vi-VN'); const clock = byId('realtimeClock'); const topClock = byId('topRealtimeClock'); if (clock) clock.textContent = realtimeText; if (topClock) topClock.textContent = realtimeText; productionDate.value = dateValue(now); if (!manuallySelectedShift) activeShift.value = shift; shiftBtp.setAttribute('placeholder', `BTP ${shiftLabel}`); shiftPeople.setAttribute('placeholder', `Số người ${shiftLabel}`); shiftHours.setAttribute('placeholder', `Số giờ ${shiftLabel}`); }
byId('addRowBtn').addEventListener('click', addOfficialRow);
byId('deleteRowBtn').addEventListener('click', async () => {
  if (currentRole !== 'admin') { showToast('Chỉ admin mới được xóa dòng.', 'info'); return; }
  const selectedRows = table.getSelectedRows();
  if (!selectedRows.length) { showToast('Vui lòng chọn dòng cần xóa.', 'info'); return; }
  try {
    await Promise.all(selectedRows.map((row) => {
      const rowId = row.getData().id;
      return rowId ? deleteDoc(doc(db, COLLECTION, rowId)) : null;
    }));
    showToast('Đã xóa dòng khỏi Firebase.', 'success');
  } catch (error) {
    showToast(error.message || 'Không thể xóa dòng khỏi Firebase.', 'error');
  }
});
byId('refreshBtn').addEventListener('click', loadRows);
activeShift.addEventListener('change', () => { manuallySelectedShift = true; });
teamSelect.addEventListener('change', () => { byId('teamBadge').textContent = teamSelect.options[teamSelect.selectedIndex]?.text || 'Chưa chọn tổ'; loadRows(); });
watchAuthState(async (user) => { if (!user) { window.location.href = './login.html'; return; } currentUser = user; const access = await requirePageAccess(user, 'congTachMui'); currentProfile = access.profile || {}; currentRole = access.role; byId('deleteRowBtn').classList.toggle('d-none', currentRole !== 'admin'); await loadCatalog(); initTable(); loadRows(); refreshClock(); setInterval(refreshClock, 1000); });
