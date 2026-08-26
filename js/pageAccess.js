import { getUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';

export async function requirePageAccess(user, pageKey) {
  const profile = await getUserProfile(user.uid);
  const role = resolveInitialRole(user.email, profile?.role);
  if (role === 'admin') return { profile, role };

  const permissions = Array.isArray(profile?.pagePermissions) ? profile.pagePermissions : [];
  if (!permissions.includes(pageKey)) {
    window.location.href = './dashboard.html';
    throw new Error('Bạn không có quyền truy cập trang này.');
  }
  return { profile, role };
}
