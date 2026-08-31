import { watchAuthState } from './auth.js';
import { db } from './firebase.js';
import { createOrUpdateUserProfile, getAllUsersProfiles, getUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { showToast } from './utils.js';

const pageAccessTableBody = document.getElementById('pageAccessTableBody');
const savePageAccessBtn = document.getElementById('savePageAccessBtn');
const createDevForm = document.getElementById('createDevForm');
const devStatus = document.getElementById('devStatus');
const dashboardGreeting = document.getElementById('dashboardGreeting');
const currentUserName = document.getElementById('currentUserName');
const currentUserEmail = document.getElementById('currentUserEmail');
const avatarPreview = document.getElementById('avatarPreview');

const PAGE_CONFIG = {
  dashboard: 'Dashboard',
  profile: 'Profile',
  label: 'In nhãn',
  production: 'Phần trăm BTP',
  nhapLieuSanXuat: 'Năng suất sản xuất',
  report: 'Báo cáo',
  congTachMui: 'Năng xuất tách múi',
  settings: 'Quản lý danh mục',
  history: 'Lịch sử thao tác',
  devManager: 'Developer Manager'
};

const DEFAULT_PAGE_ACCESS = {
  dashboard: true,
  profile: true,
  label: true,
  production: true,
  nhapLieuSanXuat: true,
  report: true,
  congTachMui: true,
  settings: true,
  history: true,
  devManager: true
};

let pageAccessState = { ...DEFAULT_PAGE_ACCESS };

async function loadPageAccessState() {
  try {
    const ref = doc(db, 'settings', 'pageAccessControl');
    const snapshot = await getDoc(ref);
    pageAccessState = { ...DEFAULT_PAGE_ACCESS, ...(snapshot.exists() ? (snapshot.data().pages || {}) : {}) };
    renderPageAccessTable();
  } catch (error) {
    console.warn('[DevManager] Failed to load page access state', error);
    renderPageAccessTable();
  }
}

function renderPageAccessTable() {
  if (!pageAccessTableBody) return;

  const rows = Object.entries(PAGE_CONFIG).map(([key, label]) => {
    const row = document.createElement('tr');
    const isEnabled = pageAccessState[key] !== false;

    row.innerHTML = `
      <td>${label}</td>
      <td>
        <span class="badge ${isEnabled ? 'bg-success' : 'bg-secondary'}">${isEnabled ? 'Bật' : 'Tắt'}</span>
      </td>
      <td>
        <button class="btn btn-sm ${isEnabled ? 'btn-outline-danger' : 'btn-outline-success'}" type="button" data-page-toggle="${key}">
          ${isEnabled ? 'Tắt' : 'Bật'}
        </button>
      </td>
    `;
    return row;
  });

  pageAccessTableBody.replaceChildren(...rows);
}

savePageAccessBtn?.addEventListener('click', async () => {
  try {
    const ref = doc(db, 'settings', 'pageAccessControl');
    await setDoc(ref, { pages: pageAccessState }, { merge: true });
    showToast('Đã lưu cấu hình quyền trang.', 'success');
  } catch (error) {
    showToast('Không thể lưu cấu hình.', 'error');
  }
});

pageAccessTableBody?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page-toggle]');
  if (!button) return;
  const pageKey = button.dataset.pageToggle;
  pageAccessState[pageKey] = pageAccessState[pageKey] === false;
  renderPageAccessTable();
});

createDevForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('devEmail').value.trim();
  const password = document.getElementById('devPassword').value.trim() || 'Meocutephomaique2005';
  const name = document.getElementById('devName').value.trim() || 'Developer';

  if (!email) {
    showToast('Vui lòng nhập email dev.', 'error');
    return;
  }

  devStatus.textContent = 'Đang tạo tài khoản dev...';

  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=AIzaSyAFQQ5yvXsA5B3etXDM_k0g6-HcEjDEpGo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Không thể tạo tài khoản dev.');
    }

    await createOrUpdateUserProfile(data.localId, {
      name,
      email,
      role: 'dev',
      department: 'Developer',
      pagePermissions: Object.keys(PAGE_CONFIG),
      teamId: '',
      avatar: '',
      createdAt: new Date().toISOString(),
      password
    });

    devStatus.textContent = 'Đã tạo tài khoản dev thành công.';
    createDevForm.reset();
    document.getElementById('devPassword').value = 'Meocutephomaique2005';
    showToast('Tạo tài khoản DEV thành công.', 'success');
  } catch (error) {
    devStatus.textContent = error.message || 'Không thể tạo tài khoản dev.';
    showToast(devStatus.textContent, 'error');
  }
});

watchAuthState(async (user) => {
  if (!user) {
    window.location.href = './login.html';
    return;
  }

  const profile = await getUserProfile(user.uid);
  const role = resolveInitialRole(user.email, profile?.role);

  if (role !== 'dev') {
    window.location.href = './dashboard.html';
    return;
  }

  dashboardGreeting.textContent = 'Developer Manager';
  currentUserName.textContent = profile?.name || user.displayName || 'Developer';
  currentUserEmail.textContent = user.email || '-';
  avatarPreview.textContent = 'D';

  await loadPageAccessState();
});
