import { watchAuthState, getCurrentUser } from './auth.js';
import { createOrUpdateUserProfile, getUserProfile, updateUserProfile, deleteUserProfile, getAllUsersProfiles } from './firestore.js';
import { auth } from './firebase.js';
import { sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { hideLoading, showLoading, showToast } from './utils.js';
import { resolveInitialRole } from './roleUtils.js';

const greeting = document.getElementById('dashboardGreeting');
const currentUserName = document.getElementById('currentUserName');
const currentUserEmail = document.getElementById('currentUserEmail');
const currentUserRole = document.getElementById('currentUserRole');
const currentUserDepartment = document.getElementById('currentUserDepartment');
const avatarPreview = document.getElementById('avatarPreview');
const adminActions = document.getElementById('adminActions');
const manageUsersMenu = document.getElementById('manageUsersMenu');
const createUserForm = document.getElementById('createUserForm');
const createUserStatus = document.getElementById('createUserStatus');
const createUserResult = document.getElementById('createUserResult');
const userTableBody = document.getElementById('userTableBody');
const userEditPanel = document.getElementById('userEditPanel');
const editUserForm = document.getElementById('editUserForm');
const editUserId = document.getElementById('editUserId');
const editUserName = document.getElementById('editUserName');
const editUserRole = document.getElementById('editUserRole');
const editUserDepartment = document.getElementById('editUserDepartment');
const editUserPassword = document.getElementById('editUserPassword');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const userActionStatus = document.getElementById('userActionStatus');
const userManagementSection = document.getElementById('userManagementSection');

const FIREBASE_API_KEY = 'AIzaSyAFQQ5yvXsA5B3etXDM_k0g6-HcEjDEpGo';
let currentRole = 'staff';
let activeUsersLoadToken = 0;
// Tạo mật khẩu ngẫu nhiên cho tài khoản mới khi cần.
function generatePassword(length = 12) {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}
// Tránh lỗi hiển thị HTML khi render dữ liệu người dùng vào bảng.
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Tạo người dùng trên Firebase Authentication rồi lưu hồ sơ vào Firestore.
async function createFirebaseUser(email, password, displayName, role, department) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Không thể tạo tài khoản Firebase.');
  }

  const uid = data.localId;
  await createOrUpdateUserProfile(uid, {
    name: displayName || email.split('@')[0],
    email,
    role,
    department: department || 'Chưa phân phòng',
    avatar: '',
    createdAt: new Date().toISOString()
  });

  return { uid, password };
}
// Tải danh sách người dùng và render vào bảng quản lý.
async function loadUsers() {
  if (!userTableBody) return;

  const loadToken = ++activeUsersLoadToken;
  userTableBody.innerHTML = '<tr><td colspan="6" class="text-muted">Đang tải...</td></tr>';
  try {
    const users = await getAllUsersProfiles();
    if (loadToken !== activeUsersLoadToken) {
      return;
    }

    if (!users.length) {
      userTableBody.innerHTML = '<tr><td colspan="6" class="text-muted">Chưa có tài khoản nào.</td></tr>';
      return;
    }

    userTableBody.innerHTML = users.map((user) => {
      const isAdmin = user.role === 'admin';
      const actionButtons = `<button class="btn btn-sm btn-outline-primary me-2" data-action="edit" data-user-id="${escapeHtml(user.id)}">Sửa</button>
           <button class="btn btn-sm btn-outline-danger me-2" data-action="delete" data-user-id="${escapeHtml(user.id)}">Xóa</button>
           <button class="btn btn-sm btn-outline-secondary" data-action="reset" data-user-id="${escapeHtml(user.id)}">Đặt lại mật khẩu</button>`;

      return `
        <tr>
          <td>${escapeHtml(user.email || '-')}</td>
          <td>${escapeHtml(user.name || '-')}</td>
          <td>${escapeHtml(user.password || '-')}</td>
          <td>${escapeHtml(isAdmin ? 'Admin' : 'Staff')}</td>
          <td>${escapeHtml(user.department || 'Chưa phân phòng')}</td>
          <td>${actionButtons}</td>
        </tr>`;
    }).join('');
  } catch (error) {
    if (loadToken !== activeUsersLoadToken) {
      return;
    }
    userTableBody.innerHTML = '<tr><td colspan="6" class="text-muted">Không thể tải danh sách tài khoản.</td></tr>';
    userActionStatus.textContent = error.message || 'Không thể tải dữ liệu.';
  }
}
// Hiển thị panel chỉnh sửa thông tin người dùng.
function showEditPanel(user) {
  if (!userEditPanel || !editUserForm) return;
  editUserId.value = user.id;
  editUserName.value = user.name || '';
  editUserRole.value = user.role || 'staff';
  editUserDepartment.value = user.department || '';
  editUserPassword.value = '';
  userEditPanel.classList.remove('d-none');
}
// Ẩn panel chỉnh sửa sau khi hoàn tất hoặc hủy thao tác.
function hideEditPanel() {
  if (!userEditPanel) return;
  userEditPanel.classList.add('d-none');
  editUserForm.reset();
}

createUserForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (currentRole !== 'admin') {
    showToast('Chỉ admin mới được tạo tài khoản.', 'error');
    return;
  }

  const emailInput = document.getElementById('createUserEmail');
  const passwordInput = document.getElementById('createUserPassword');
  const nameInput = document.getElementById('createUserName');
  const roleInput = document.getElementById('createUserRole');
  const departmentInput = document.getElementById('createUserDepartment');

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim() || generatePassword();
  const displayName = nameInput.value.trim();
  const role = roleInput.value;
  const department = departmentInput.value.trim();

  if (!email) {
    showToast('Vui lòng nhập email.', 'error');
    return;
  }

  createUserStatus.textContent = 'Đang tạo tài khoản...';
  createUserResult.classList.add('d-none');
  createUserResult.textContent = '';

  try {
    await createFirebaseUser(email, password, displayName, role, department);
    createUserStatus.textContent = 'Tạo tài khoản thành công.';
    createUserResult.classList.remove('d-none');
    createUserResult.innerHTML = `Tài khoản <strong>${email}</strong> đã được tạo. Mật khẩu: <strong>${password}</strong>`;
    createUserForm.reset();
    createUserStatus.textContent = 'Tạo tài khoản thành công.';
    await loadUsers();
  } catch (error) {
    createUserStatus.textContent = error.message || 'Không thể tạo tài khoản.';
    createUserResult.classList.remove('d-none');
    createUserResult.className = 'alert alert-danger mb-0';
    createUserResult.textContent = error.message || 'Không thể tạo tài khoản.';
  }
});

watchAuthState(async (user) => {
  if (!user) {
    window.location.href = './login.html';
    return;
  }

  activeUsersLoadToken += 1;
  showLoading();
  try {
    const profile = await getUserProfile(user.uid);
    renderProfile(user, profile);
    if (currentRole === 'admin') {
      userManagementSection?.classList.remove('d-none');
      await loadUsers();
    } else {
      userManagementSection?.classList.add('d-none');
    }
  } catch (error) {
    showToast(error.message || 'Không thể tải hồ sơ.', 'error');
  } finally {
    hideLoading();
  }
});
// Hiển thị thông tin hồ sơ người dùng trên dashboard.
function renderProfile(user, profile) {
  const role = resolveInitialRole(user?.email, profile?.role);
  currentRole = role;
  const department = profile?.department || 'Chưa phân phòng';
  const name = profile?.name || user.displayName || 'Nhân viên';

  greeting.textContent = `Dashboard - ${name}`;
  currentUserName.textContent = name;
  currentUserEmail.textContent = user.email || '-';
  currentUserRole.textContent = role === 'admin' ? 'Admin' : 'Staff';
  currentUserDepartment.textContent = department;
  avatarPreview.textContent = name.charAt(0).toUpperCase();

  const isAdmin = role === 'admin';
  const adminMenuItems = document.querySelectorAll('.admin-only');
  adminMenuItems.forEach((item) => {
    item.classList.toggle('is-hidden', !isAdmin);
  });
  manageUsersMenu?.classList.toggle('is-hidden', !isAdmin);

  const actions = isAdmin
    ? [
        'Quản lý User',
        'Quản lý dữ liệu',
        'Import Excel',
        'Export Excel',
        'Nhật ký hoạt động'
      ]
    : ['Nhập liệu dữ liệu', 'Chỉnh sửa dữ liệu'];

  adminActions.innerHTML = actions
    .map((action) => `<button class="btn btn-outline-secondary w-100 text-start">${action}</button>`)
    .join('');
}

userTableBody?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const userId = button.getAttribute('data-user-id');
  const action = button.getAttribute('data-action');

  if (!userId) return;

  if (currentRole !== 'admin') {
    showToast('Chỉ admin mới được quản lý tài khoản.', 'error');
    return;
  }

  if (action === 'edit') {
    const user = (await getAllUsersProfiles()).find((item) => item.id === userId);
    if (user) {
      showEditPanel(user);
      userActionStatus.textContent = `Đang chỉnh sửa: ${user.email || user.name || userId}`;
    }
    return;
  }

  if (action === 'delete') {
    const confirmed = window.confirm('Bạn có chắc muốn xóa tài khoản này khỏi danh sách quản lý?');
    if (!confirmed) return;
    try {
      await deleteUserProfile(userId);
      userActionStatus.textContent = 'Đã xóa tài khoản khỏi danh sách quản lý.';
      await loadUsers();
    } catch (error) {
      userActionStatus.textContent = error.message || 'Không thể xóa tài khoản.';
    }
    return;
  }

  if (action === 'reset') {
    const user = (await getAllUsersProfiles()).find((item) => item.id === userId);
    if (!user?.email) {
      userActionStatus.textContent = 'Không có email để gửi đặt lại mật khẩu.';
      return;
    }

    const defaultPassword = user.role === 'admin' ? 'AdminCT@2026' : 'Chanhthustaff@2026';

    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: user.email
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Không thể gửi email đặt lại mật khẩu.');
      }

      await updateUserProfile(user.id, {
        password: defaultPassword
      });

      userActionStatus.textContent = `Đã đặt lại mật khẩu cho ${user.email} về ${defaultPassword}.`;
      await loadUsers();
    } catch (error) {
      userActionStatus.textContent = error.message || 'Không thể đặt lại mật khẩu.';
    }
  }
});

editUserForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const userId = editUserId.value;
  if (!userId) return;

  if (currentRole !== 'admin') {
    showToast('Chỉ admin mới được chỉnh sửa tài khoản.', 'error');
    return;
  }

  try {
    const updatePayload = {
      name: editUserName.value.trim(),
      role: editUserRole.value,
      department: editUserDepartment.value.trim() || 'Chưa phân phòng'
    };

    const newPassword = editUserPassword.value.trim();
    if (newPassword) {
      updatePayload.password = newPassword;
    }

    await updateUserProfile(userId, updatePayload);
    userActionStatus.textContent = newPassword
      ? 'Đã cập nhật thông tin tài khoản và mật khẩu.'
      : 'Đã cập nhật thông tin tài khoản.';
    hideEditPanel();
    await loadUsers();
  } catch (error) {
    userActionStatus.textContent = error.message || 'Không thể cập nhật thông tin.';
  }
});

cancelEditBtn?.addEventListener('click', () => {
  hideEditPanel();
  userActionStatus.textContent = '';
});




