import { getCurrentUser, watchAuthState } from './auth.js';
import { getUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';
import { ensureDefaultSettings, listenToSettings, saveSettingsDocument, SETTING_KEYS } from './settings.js';
import { showToast } from './utils.js';
import { db } from './firebase.js';
import { doc, getDoc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { logActivity } from './activityLog.js';

const congTachMuiCatalogRef = doc(db, 'settings', 'congTachMuiCatalog');
let congTachMuiCatalog = { teams: [], processes: [], types: [], shifts: [] };

const forms = {
  [SETTING_KEYS.nhaCungCap]: document.getElementById('nhaCungCapForm'),
  [SETTING_KEYS.vungNguyenLieu]: document.getElementById('vungNguyenLieuForm'),
  [SETTING_KEYS.loaiNguyenLieu]: document.getElementById('loaiNguyenLieuForm'),
  [SETTING_KEYS.loaiSanPham]: document.getElementById('loaiSanPhamForm')
};

const lists = {
  [SETTING_KEYS.nhaCungCap]: document.getElementById('nhaCungCapList'),
  [SETTING_KEYS.vungNguyenLieu]: document.getElementById('vungNguyenLieuList'),
  [SETTING_KEYS.loaiNguyenLieu]: document.getElementById('loaiNguyenLieuList'),
  [SETTING_KEYS.loaiSanPham]: document.getElementById('loaiSanPhamList')
};

let currentRole = 'staff';
let settingsState = {};
let stopSettingsListener = null;
let stopCongTachMuiCatalogListener = null;

function renderCongTachMuiCatalog() {
  const teamsList = document.getElementById('congTachMuiTeamsList');
  const processesList = document.getElementById('congTachMuiProcessesList');
  const typesList = document.getElementById('congTachMuiTypesList');
  const shiftsList = document.getElementById('congTachMuiShiftsList');
  if (!teamsList) return;
  const render = (container, values, formatter) => {
    container.replaceChildren(...(values.length ? values.map((value) => { const item = document.createElement('div'); item.className = 'list-group-item'; item.textContent = formatter(value); return item; }) : [Object.assign(document.createElement('div'), { className: 'list-group-item text-muted', textContent: 'Chưa có mục nào.' })]));
  };
  render(teamsList, congTachMuiCatalog.teams, (team) => `${team.id} - ${team.name}`);
  render(processesList, congTachMuiCatalog.processes, (value) => value);
  render(typesList, congTachMuiCatalog.types, (value) => value);
  render(shiftsList, congTachMuiCatalog.shifts, (shift) => `${shift.id} - ${shift.name}`);
}

async function saveCongTachMuiCatalog() {
  await setDoc(congTachMuiCatalogRef, congTachMuiCatalog, { merge: true });
  logActivity({ action: 'save', page: 'settings', detail: 'Cập nhật danh mục Công tách múi' });
}

function setupCongTachMuiCatalog() {
  if (stopCongTachMuiCatalogListener) stopCongTachMuiCatalogListener();
  stopCongTachMuiCatalogListener = onSnapshot(congTachMuiCatalogRef, (snapshot) => {
    if (snapshot.exists()) congTachMuiCatalog = { ...congTachMuiCatalog, ...snapshot.data() };
    renderCongTachMuiCatalog();
  });
  document.getElementById('congTachMuiTeamsForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const team = { id: String(data.get('id')).trim(), name: String(data.get('name')).trim() };
    if (congTachMuiCatalog.teams.some((item) => item.id === team.id)) { showToast('ID tổ đã tồn tại.', 'error'); return; }
    congTachMuiCatalog.teams.push(team); await saveCongTachMuiCatalog(); event.currentTarget.reset(); showToast('Đã thêm tổ Công tách múi.', 'success');
  });
  [['congTachMuiProcessesForm', 'processes'], ['congTachMuiTypesForm', 'types']].forEach(([formId, key]) => document.getElementById(formId)?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('value')).trim();
    if (congTachMuiCatalog[key].includes(value)) { showToast('Mục này đã tồn tại.', 'error'); return; }
    congTachMuiCatalog[key].push(value); await saveCongTachMuiCatalog(); event.currentTarget.reset(); showToast('Đã thêm mục Công tách múi.', 'success');
  }));
  document.getElementById('congTachMuiShiftsForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const shift = { id: String(data.get('id')).trim(), name: String(data.get('name')).trim() };
    if (congTachMuiCatalog.shifts.some((item) => item.id === shift.id)) { showToast('Mã ca đã tồn tại.', 'error'); return; }
    congTachMuiCatalog.shifts.push(shift); await saveCongTachMuiCatalog(); event.currentTarget.reset(); showToast('Đã thêm ca Công tách múi.', 'success');
  });
  getDoc(congTachMuiCatalogRef).then((snapshot) => { if (!snapshot.exists()) saveCongTachMuiCatalog(); });
}

function updateCongTachMuiRealtimeDate() {
  const target = document.getElementById('congTachMuiRealtimeDate');
  if (!target) return;
  target.value = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full' }).format(new Date());
}

updateCongTachMuiRealtimeDate();
setInterval(updateCongTachMuiRealtimeDate, 1000);
// Hàm hiển thị danh sách.
function renderList(key, items) {
  const container = lists[key];
  if (!container) return;
  if (!items.length) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'text-muted';
    emptyMessage.textContent = 'Chưa có mục nào.';
    container.replaceChildren(emptyMessage);
    return;
  }

  const rows = items.map((item, index) => {
    const row = document.createElement('div');
    row.className = 'list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2';

    const details = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'fw-semibold';
    name.textContent = `${item.ma || '-'} - ${item.ten || '-'}`;
    const position = document.createElement('div');
    position.className = 'small text-muted';
    position.textContent = `#${index + 1}`;
    details.append(name, position);

    const actions = document.createElement('div');
    actions.className = 'd-flex gap-2';
    const editButton = document.createElement('button');
    editButton.className = 'btn btn-outline-primary btn-sm';
    editButton.type = 'button';
    editButton.dataset.action = 'edit';
    editButton.dataset.key = key;
    editButton.dataset.index = index;
    editButton.textContent = 'Sửa';
    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn btn-outline-danger btn-sm';
    deleteButton.type = 'button';
    deleteButton.dataset.action = 'delete';
    deleteButton.dataset.key = key;
    deleteButton.dataset.index = index;
    deleteButton.textContent = 'Xóa';
    actions.append(editButton, deleteButton);

    row.append(details, actions);
    return row;
  });
  container.replaceChildren(...rows);
}
// Hàm hiển thị toàn bộ danh sách.
function renderAll() {
  Object.entries(lists).forEach(([key, container]) => {
    renderList(key, settingsState[key] || []);
  });
}
// Hàm thiết lập quyền truy cập.
function setAccess(isAdmin) {
  if (!isAdmin) {
    const accessPage = document.createElement('div');
    accessPage.className = 'min-vh-100 d-flex align-items-center justify-content-center bg-light';
    const content = document.createElement('div');
    content.className = 'text-center p-4';
    const title = document.createElement('h2');
    title.className = 'h4 fw-bold mb-2';
    title.textContent = 'Không có quyền truy cập';
    const message = document.createElement('p');
    message.className = 'text-muted mb-3';
    message.textContent = 'Chỉ admin mới được phép quản lý danh mục.';
    const dashboardLink = document.createElement('a');
    dashboardLink.href = './dashboard.html';
    dashboardLink.className = 'btn btn-primary';
    dashboardLink.textContent = 'Quay về Dashboard';
    content.append(title, message, dashboardLink);
    accessPage.appendChild(content);
    document.body.replaceChildren(accessPage);
    return;
  }

  Object.values(forms).forEach((form) => form?.classList.remove('d-none'));
  Object.values(lists).forEach((container) => container?.classList.remove('opacity-50'));
}
// Hàm xử lý gửi biểu mẫu.
async function handleSubmit(key, event) {
  event.preventDefault();
  if (currentRole !== 'admin') {
    showToast('Bạn không có quyền chỉnh sửa danh mục.', 'error');
    return;
  }
  const form = forms[key];
  const data = new FormData(form);
  const ma = String(data.get('ma') || '').trim();
  const ten = String(data.get('ten') || '').trim();
  if (!ma || !ten) {
    showToast('Vui lòng nhập mã và tên.', 'error');
    return;
  }

  const items = [...(settingsState[key] || []), { ma, ten }];
  const saved = await saveSettingsDocument(key, items);
  if (!saved) {
    showToast('Không thể lưu vào Firebase. Vui lòng kiểm tra quyền truy cập.', 'error');
    return;
  }
  form.reset();
  logActivity({ action: 'save', page: 'settings', detail: `Thêm mục danh mục ${key}` });
  showToast('Đã thêm mục mới.', 'success');
}
// Hàm xử lý xóa mục.
async function handleDelete(key, index) {
  if (currentRole !== 'admin') {
    showToast('Bạn không có quyền chỉnh sửa danh mục.', 'error');
    return;
  }
  const items = [...(settingsState[key] || [])];
  items.splice(index, 1);
  const saved = await saveSettingsDocument(key, items);
  if (!saved) {
    showToast('Không thể lưu vào Firebase. Vui lòng kiểm tra quyền truy cập.', 'error');
    return;
  }
  showToast('Đã xóa mục.', 'success');
  logActivity({ action: 'delete', page: 'settings', detail: `Xóa mục danh mục ${key}` });
}
// Hàm xử lý chỉnh sửa mục.
async function handleEdit(key, index) {
  if (currentRole !== 'admin') {
    showToast('Bạn không có quyền chỉnh sửa danh mục.', 'error');
    return;
  }
  const items = [...(settingsState[key] || [])];
  const item = items[index];
  const ma = window.prompt('Nhập mã mới', item?.ma || '');
  if (ma === null) return;
  const ten = window.prompt('Nhập tên mới', item?.ten || '');
  if (ten === null) return;
  items[index] = { ma: ma.trim(), ten: ten.trim() };
  const saved = await saveSettingsDocument(key, items);
  if (!saved) {
    showToast('Không thể lưu vào Firebase. Vui lòng kiểm tra quyền truy cập.', 'error');
    return;
  }
  showToast('Đã cập nhật mục.', 'success');
  logActivity({ action: 'edit', page: 'settings', detail: `Sửa mục danh mục ${key}` });
}
// Hàm khởi tạo.
async function initialize() {
  await ensureDefaultSettings();
  stopSettingsListener = listenToSettings((state) => {
    settingsState = state;
    renderAll();
  });

  Object.entries(forms).forEach(([key, form]) => {
    form?.addEventListener('submit', (event) => handleSubmit(key, event));
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, key, index } = button.dataset;
    if (action === 'delete') handleDelete(key, Number(index));
    if (action === 'edit') handleEdit(key, Number(index));
  });

  watchAuthState(async (user) => {
    if (!user) {
      currentRole = 'staff';
      setAccess(false);
      return;
    }

    const profile = await getUserProfile(user.uid);
    currentRole = resolveInitialRole(user.email, profile?.role);
    setAccess(currentRole === 'admin');
    if (currentRole === 'admin') setupCongTachMuiCatalog();

    if (!user) {
      showToast('Vui lòng đăng nhập để dữ liệu được lưu vào Firebase.', 'info');
    }
  });
}

initialize();




