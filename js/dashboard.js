import { watchAuthState, getCurrentUser } from './auth.js';
import { createOrUpdateUserProfile, getUserProfile, updateUserProfile, deleteUserProfile, getAllUsersProfiles } from './firestore.js';
import { auth } from './firebase.js';
import { sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { hideLoading, showLoading, showToast } from './utils.js';
import { resolveInitialRole } from './roleUtils.js';
import { db } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const greeting = document.getElementById('dashboardGreeting');
const currentUserName = document.getElementById('currentUserName');
const currentUserEmail = document.getElementById('currentUserEmail');
const currentUserRole = document.getElementById('currentUserRole');
const currentUserDepartment = document.getElementById('currentUserDepartment');
const editUserTeamId = document.getElementById('editUserTeamId');
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
const editUserPassword = document.getElementById('editUserPassword');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const userActionStatus = document.getElementById('userActionStatus');
const userManagementSection = document.getElementById('userManagementSection');
const createUserTeamId = document.getElementById('createUserTeamId');
const pagePermissionLabels = {
  production: 'Phần trăm BTP',
  nhapLieuSanXuat: 'Năng suất sản xuất',
  report: 'Báo cáo',
  label: 'In nhãn',
  congTachMui: 'Năng xuất tách múi'
};
const ALL_PAGE_PERMISSIONS = ['production', 'nhapLieuSanXuat', 'report', 'label', 'congTachMui'];

const FIREBASE_API_KEY = 'AIzaSyAFQQ5yvXsA5B3etXDM_k0g6-HcEjDEpGo';
let currentRole = 'staff';
let activeUsersLoadToken = 0;
let congTachMuiTeams = [];

function getSelectedValues(select) {
  if (!select) return [];
  return select.value ? [select.value] : [];
}

function getAllPagePermissions() {
  const selects = document.querySelectorAll('.page-access-select');
  return [...selects].map((select) => select.value).filter(Boolean);
}

function applyPermissionValuesToSelectors(selectors, values = []) {
  const permissionValues = Array.isArray(values) ? values : [];
  selectors.forEach((selector, index) => {
    const select = document.getElementById(selector);
    if (!select) return;
    const value = permissionValues[index] || '';
    select.value = value;
  });
}

function toggleTeamField(teamField, contextSelector = '.page-access-select') {
  const selections = Array.from(document.querySelectorAll(contextSelector)).map((select) => select.value).filter(Boolean);
  const visible = selections.includes('congTachMui');
  teamField?.classList.toggle('d-none', !visible);
  if (!visible && teamField) teamField.value = '';
}

function formatPermissions(user) {
  const permissions = Array.isArray(user.pagePermissions) && user.pagePermissions.length
    ? user.pagePermissions
    : (user.role === 'admin' ? ALL_PAGE_PERMISSIONS : []);
  return permissions.map((key) => pagePermissionLabels[key] || key).join(', ') || user.department || 'Chưa phân quyền';
}

function applyAdminPermissions(roleValue, selectors = ['createUserPermissionOne', 'createUserPermissionTwo', 'createUserPermissionThree']) {
  const isAdmin = roleValue === 'admin';
  selectors.forEach((selector, index) => {
    const element = document.getElementById(selector);
    if (!element) return;
    if (isAdmin) {
      element.value = ALL_PAGE_PERMISSIONS[index] || '';
      return;
    }
    if (!element.value) {
      element.value = '';
    }
  });
}

function renderTeamOptions() {
  [createUserTeamId, editUserTeamId].forEach((select) => {
    if (!select) return;
    select.replaceChildren(new Option('-- Chọn tổ --', ''));
    congTachMuiTeams.forEach((team) => select.appendChild(new Option(`${team.id} - ${team.name}`, team.id)));
  });
}
// Tạo mật khẩu ngẫu nhiên cho tài khoản mới khi cần.
function generatePassword(length = 12) {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}
// Hiển thị trạng thái tải trong bảng mà không diễn giải dữ liệu thành HTML.
function renderUserTableStatus(message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 7;
  cell.className = 'text-muted';
  cell.textContent = message;
  row.appendChild(cell);
  userTableBody.replaceChildren(row);
}
// Tạo ô dữ liệu người dùng an toàn.
function createUserCell(value) {
  const cell = document.createElement('td');
  cell.textContent = value || '-';
  return cell;
}
// Tạo nút thao tác để giữ nguyên cơ chế event delegation của bảng.
function createUserActionButton(label, action, userId, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.action = action;
  button.dataset.userId = userId || '';
  button.textContent = label;
  return button;
}
// Tạo người dùng trên Firebase Authentication rồi lưu hồ sơ vào Firestore.
async function createFirebaseUser(email, password, displayName, role, department, teamId) {
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
    department: department.join(', ') || 'Chưa phân phòng',
    pagePermissions: department,
    teamId: teamId || '',
    avatar: '',
    createdAt: new Date().toISOString()
  });

  return { uid, password };
}
// Tải danh sách người dùng và render vào bảng quản lý.
async function loadUsers() {
  if (!userTableBody) return;

  const loadToken = ++activeUsersLoadToken;
  renderUserTableStatus('Đang tải...');
  try {
    const users = await getAllUsersProfiles();
    if (loadToken !== activeUsersLoadToken) {
      return;
    }

    if (!users.length) {
      renderUserTableStatus('Chưa có tài khoản nào.');
      return;
    }

    const rows = users.map((user) => {
      const isAdmin = user.role === 'admin';
      const row = document.createElement('tr');
      row.append(
        createUserCell(user.email),
        createUserCell(user.name),
        createUserCell(user.password),
        createUserCell(isAdmin ? 'Admin' : 'Staff'),
        createUserCell(formatPermissions(user)),
        createUserCell(user.teamId || 'Chưa phân tổ')
      );

      const actionsCell = document.createElement('td');
      actionsCell.append(
        createUserActionButton('Sửa', 'edit', user.id, 'btn btn-sm btn-outline-primary me-2'),
        createUserActionButton('Xóa', 'delete', user.id, 'btn btn-sm btn-outline-danger me-2'),
        createUserActionButton('Đặt lại mật khẩu', 'reset', user.id, 'btn btn-sm btn-outline-secondary')
      );
      row.appendChild(actionsCell);
      return row;
    });
    userTableBody.replaceChildren(...rows);
  } catch (error) {
    if (loadToken !== activeUsersLoadToken) {
      return;
    }
    renderUserTableStatus('Không thể tải danh sách tài khoản.');
    userActionStatus.textContent = error.message || 'Không thể tải dữ liệu.';
  }
}
// Hiển thị panel chỉnh sửa thông tin người dùng.
function showEditPanel(user) {
  if (!userEditPanel || !editUserForm) return;
  const permissionValues = Array.isArray(user.pagePermissions) && user.pagePermissions.length
    ? user.pagePermissions
    : (user.role === 'admin' ? ALL_PAGE_PERMISSIONS : []);
  editUserId.value = user.id;
  editUserName.value = user.name || '';
  editUserRole.value = user.role || 'staff';
  const permissionSelectors = ['editUserPermissionOne', 'editUserPermissionTwo', 'editUserPermissionThree'];
  applyAdminPermissions(editUserRole.value, permissionSelectors);
  permissionSelectors.forEach((selector, index) => {
    const select = document.getElementById(selector);
    if (!select) return;
    select.value = permissionValues[index] || ALL_PAGE_PERMISSIONS[index] || '';
  });
  editUserTeamId.value = user.teamId || '';
  toggleTeamField(editUserTeamId, '.page-access-select');
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
  const teamIdInput = document.getElementById('createUserTeamId');

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim() || generatePassword();
  const displayName = nameInput.value.trim();
  const role = roleInput.value;
  const department = role === 'admin' ? [...ALL_PAGE_PERMISSIONS] : getAllPagePermissions();
  const teamId = teamIdInput.value;

  if (!email) {
    showToast('Vui lòng nhập email.', 'error');
    return;
  }
  if (role !== 'admin' && !department.length) {
    showToast('Vui lòng chọn ít nhất 1 quyền truy cập trang.', 'error');
    return;
  }
  if (role !== 'admin' && new Set(department).size !== department.length) {
    showToast('Các quyền truy cập trang không được trùng nhau.', 'error');
    return;
  }
  if (role !== 'admin' && department.includes('congTachMui') && !teamId) {
    showToast('Vui lòng chọn tổ cho quyền Năng xuất tách múi.', 'error');
    return;
  }

  createUserStatus.textContent = 'Đang tạo tài khoản...';
  createUserResult.classList.add('d-none');
  createUserResult.textContent = '';

  try {
    await createFirebaseUser(email, password, displayName, role, department, teamId);
    createUserStatus.textContent = 'Tạo tài khoản thành công.';
    createUserResult.classList.remove('d-none');
    const emailElement = document.createElement('strong');
    emailElement.textContent = email;
    const passwordElement = document.createElement('strong');
    passwordElement.textContent = password;
    createUserResult.replaceChildren(
      'Tài khoản ',
      emailElement,
      ' đã được tạo. Mật khẩu: ',
      passwordElement
    );
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

document.querySelectorAll('.page-access-select').forEach((select) => {
  select.addEventListener('change', () => {
    const values = getAllPagePermissions();
    if (new Set(values).size !== values.length) {
      showToast('Mỗi quyền truy cập chỉ được chọn một lần.', 'error');
    }
    toggleTeamField(createUserTeamId, '.page-access-select');
    toggleTeamField(editUserTeamId, '.page-access-select');
  });
});

const createUserRole = document.getElementById('createUserRole');
if (createUserRole) {
  createUserRole.addEventListener('change', () => {
    applyAdminPermissions(createUserRole.value, ['createUserPermissionOne', 'createUserPermissionTwo', 'createUserPermissionThree']);
    if (createUserRole.value === 'admin') {
      createUserTeamId.value = '';
      createUserTeamId.classList.add('d-none');
    } else {
      toggleTeamField(createUserTeamId, '.page-access-select');
    }
  });
}

if (editUserRole) {
  editUserRole.addEventListener('change', () => {
    applyAdminPermissions(editUserRole.value, ['editUserPermissionOne', 'editUserPermissionTwo', 'editUserPermissionThree']);
    if (editUserRole.value === 'admin') {
      editUserTeamId.value = '';
      editUserTeamId.classList.add('d-none');
    } else {
      toggleTeamField(editUserTeamId, '.page-access-select');
    }
  });
}

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
    try {
      const catalogSnapshot = await getDoc(doc(db, 'settings', 'congTachMuiCatalog'));
      congTachMuiTeams = catalogSnapshot.exists() && Array.isArray(catalogSnapshot.data().teams)
        ? catalogSnapshot.data().teams
        : [];
      renderTeamOptions();
    } catch (error) {
      console.warn('[Dashboard] Could not load cong tach mui teams', error);
    }
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
  const permissions = Array.isArray(profile?.pagePermissions) ? profile.pagePermissions : [];
  const navLinks = document.querySelectorAll('[data-page]');
  navLinks.forEach((item) => {
    const pageKey = item.dataset.page;
    const hasAccess = isAdmin || permissions.includes(pageKey);
    item.classList.toggle('d-none', !hasAccess);
  });

  const adminMenuItems = document.querySelectorAll('.admin-only');
  adminMenuItems.forEach((item) => {
    item.classList.toggle('is-hidden', !isAdmin);
  });
  manageUsersMenu?.classList.toggle('is-hidden', !isAdmin);

  const currentPage = window.location.pathname.split('/').pop().replace(/\.html$/, '') || 'dashboard';
  const isDashboardPage = currentPage === 'dashboard';

  if (!isAdmin && !isDashboardPage && !permissions.includes(currentPage)) {
    window.location.href = './dashboard.html';
  }

  const actions = isAdmin
    ? [
        'Quản lý User',
        'Quản lý dữ liệu',
        'Import Excel',
        'Export Excel',
        'Nhật ký hoạt động'
      ]
    : ['Nhập liệu dữ liệu', 'Chỉnh sửa dữ liệu'];

  const actionButtons = actions.map((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline-secondary w-100 text-start';
    button.textContent = action;
    return button;
  });
  adminActions.replaceChildren(...actionButtons);
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
    const permissions = editUserRole.value === 'admin' ? [...ALL_PAGE_PERMISSIONS] : getAllPagePermissions();
    if (editUserRole.value !== 'admin' && !permissions.length) {
      showToast('Vui lòng chọn ít nhất 1 quyền truy cập trang.', 'error');
      return;
    }
    if (editUserRole.value !== 'admin' && new Set(permissions).size !== permissions.length) {
      showToast('Các quyền truy cập trang không được trùng nhau.', 'error');
      return;
    }
    if (editUserRole.value !== 'admin' && permissions.includes('congTachMui') && !editUserTeamId.value) {
      showToast('Vui lòng chọn tổ cho quyền Năng xuất tách múi.', 'error');
      return;
    }

    const updatePayload = {
      name: editUserName.value.trim(),
      role: editUserRole.value,
      department: permissions.join(', ') || 'Chưa phân phòng',
      pagePermissions: permissions,
      teamId: editUserRole.value === 'admin' ? '' : editUserTeamId.value
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




