import { getCurrentUser } from './auth.js';
import { createOrUpdateUserProfile, getUserProfile, updateUserProfile } from './firestore.js';

export async function ensureUserDocument() {
  const currentUser = getCurrentUser();
  if (!currentUser) return null;

  const existing = await getUserProfile(currentUser.uid);
  if (!existing) {
    await createOrUpdateUserProfile(currentUser.uid, {
      name: currentUser.displayName || 'Nhân viên',
      email: currentUser.email,
      role: 'staff',
      department: 'Chưa phân phòng',
      avatar: '',
      createdAt: new Date()
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
