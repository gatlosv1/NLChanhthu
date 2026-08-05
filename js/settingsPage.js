import { getCurrentUser, watchAuthState } from './auth.js';
import { getUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';
import { ensureDefaultSettings, listenToSettings, saveSettingsDocument, SETTING_KEYS } from './settings.js';
import { showToast } from './utils.js';

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

function renderList(key, items) {
  const container = lists[key];
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<div class="text-muted">Chưa có mục nào.</div>';
    return;
  }

  container.innerHTML = items.map((item, index) => `
    <div class="list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div>
        <div class="fw-semibold">${item.ma || '-'} - ${item.ten || '-'}</div>
        <div class="small text-muted">#${index + 1}</div>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-primary btn-sm" type="button" data-action="edit" data-key="${key}" data-index="${index}">Sửa</button>
        <button class="btn btn-outline-danger btn-sm" type="button" data-action="delete" data-key="${key}" data-index="${index}">Xóa</button>
      </div>
    </div>
  `).join('');
}

function renderAll() {
  Object.entries(lists).forEach(([key, container]) => {
    renderList(key, settingsState[key] || []);
  });
}

function setAccess(isAdmin) {
  const canManage = isAdmin || Boolean(getCurrentUser());
  Object.values(forms).forEach((form) => form?.classList.toggle('d-none', !canManage));
  Object.values(lists).forEach((container) => container?.classList.toggle('opacity-50', !canManage));
}

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
  showToast('Đã thêm mục mới.', 'success');
}

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
}

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
}

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
    if (currentRole !== 'admin' && user) {
      setAccess(true);
    }

    if (!user) {
      showToast('Vui lòng đăng nhập để dữ liệu được lưu vào Firebase.', 'info');
    }
  });
}

initialize();
