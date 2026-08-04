import { getCurrentUser } from './auth.js';
import { createOrUpdateUserProfile, getUserProfile, updateUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';

export async function ensureUserDocument() {
  const currentUser = getCurrentUser();
  if (!currentUser) return null;

  const existing = await getUserProfile(currentUser.uid);
  const resolvedRole = resolveInitialRole(currentUser.email, existing?.role);

  if (!existing) {
    await createOrUpdateUserProfile(currentUser.uid, {
      name: currentUser.displayName || 'Nhân viên',
      email: currentUser.email,
      role: resolvedRole,
      department: 'Chưa phân phòng',
      avatar: '',
      createdAt: new Date()
    });
  } else if (!existing.role || existing.role !== resolvedRole) {
    await updateUserProfile(currentUser.uid, {
      role: resolvedRole,
      email: currentUser.email,
      name: existing.name || currentUser.displayName || 'Nhân viên'
    });
  }

  return getUserProfile(currentUser.uid);
}

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
