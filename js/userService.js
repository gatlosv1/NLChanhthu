import { getCurrentUser, waitForAuth } from './auth.js';
import { createOrUpdateUserProfile, getUserProfile, updateUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';

// Đảm bảo hồ sơ người dùng tồn tại trong Firestore và cập nhật vai trò nếu cần.
export async function ensureUserDocument() {
  const authUser = await waitForAuth();
  if (!authUser) return null;

  console.log('Current User:', authUser);
  console.log('UID:', authUser?.uid);
  console.log('Current Role:', resolveInitialRole(authUser?.email));

  const existing = await getUserProfile(authUser.uid);
  const resolvedRole = resolveInitialRole(authUser.email, existing?.role);

  if (!existing) {
    await createOrUpdateUserProfile(authUser.uid, {
      name: authUser.displayName || 'Nhân viên',
      email: authUser.email,
      role: resolvedRole,
      department: 'Chưa phân phòng',
      avatar: '',
      createdAt: new Date()
    });
  } else if (!existing.role || existing.role !== resolvedRole) {
    await updateUserProfile(authUser.uid, {
      role: resolvedRole,
      email: authUser.email,
      name: existing.name || authUser.displayName || 'Nhân viên'
    });
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
