import { getCurrentUser, waitForAuth } from './auth.js';
import { createOrUpdateUserProfile, getUserProfile, updateUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';

const DEFAULT_PAGE_ACCESS = {
  dev: ['dashboard', 'profile', 'label', 'production', 'nhapLieuSanXuat', 'report', 'congTachMui', 'settings', 'history', 'devManager'],
  admin: ['dashboard', 'profile', 'label', 'production', 'nhapLieuSanXuat', 'report', 'congTachMui', 'settings', 'history'],
  staff: ['dashboard', 'profile', 'label', 'production', 'nhapLieuSanXuat', 'report', 'congTachMui', 'history']
};

export async function ensureUserDocument() {
  const authUser = await waitForAuth();
  if (!authUser) return null;

  const existing = await getUserProfile(authUser.uid);
  const resolvedRole = resolveInitialRole(authUser.email, existing?.role);
  const defaultPagePermissions = DEFAULT_PAGE_ACCESS[resolvedRole] || DEFAULT_PAGE_ACCESS.staff;

  const baseProfile = {
    name: existing?.name || authUser.displayName || 'Nhân viên',
    email: authUser.email,
    role: resolvedRole,
    department: resolvedRole === 'dev' ? 'Developer' : resolvedRole === 'admin' ? 'Quản trị' : (existing?.department || 'Chưa phân phòng'),
    pagePermissions: defaultPagePermissions,
    permissions: resolvedRole === 'dev'
      ? ['view', 'add', 'edit', 'delete', 'export', 'import', 'manageUsers', 'manageSettings', 'viewAllHistory', 'maintenance']
      : resolvedRole === 'admin'
        ? ['view', 'add', 'edit', 'delete', 'export', 'import', 'manageUsers', 'manageSettings', 'viewAllHistory']
        : ['view', 'add'],
    teamId: existing?.teamId || '',
    avatar: existing?.avatar || '',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!existing) {
    await createOrUpdateUserProfile(authUser.uid, baseProfile);
  } else {
    const hasMismatch = existing.role !== resolvedRole || JSON.stringify(existing.pagePermissions || []) !== JSON.stringify(defaultPagePermissions);
    if (!existing.role || hasMismatch) {
      await updateUserProfile(authUser.uid, baseProfile);
    }
  }

  return getUserProfile(authUser.uid);
}
// Lưu các thông tin hồ sơ cơ bản của người dùng.
export async function saveProfile({ name, department, avatar }) {
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error('Bạn chưa đăng nhập.');

  const payload = {
    name,
    department
  };

  if (avatar) {
    payload.avatar = avatar;
  }

  await updateUserProfile(currentUser.uid, payload);
  return getUserProfile(currentUser.uid);
}



