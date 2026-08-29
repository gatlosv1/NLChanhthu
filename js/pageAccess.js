import { getUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';

export function showPermissionWarning({
  title = 'Missing or insufficient permissions.',
  buttonText = 'Back to dashboard',
  redirectTo = './dashboard.html'
} = {}) {
  const wrapper = document.querySelector('main');
  if (!wrapper) return;

  const existing = wrapper.querySelector('.permission-warning-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.className = 'permission-warning-panel';
  panel.innerHTML = `
    <div class="permission-warning-title">${title}</div>
    <button class="permission-warning-button" type="button">${buttonText}</button>
  `;

  panel.querySelector('button').addEventListener('click', () => {
    window.location.href = redirectTo;
  });

  wrapper.insertBefore(panel, wrapper.firstChild);
}

export async function requirePageAccess(user, pageKey) {
  const profile = await getUserProfile(user.uid);
  const role = resolveInitialRole(user.email, profile?.role);
  if (role === 'admin') return { profile, role };

  const permissions = Array.isArray(profile?.pagePermissions) ? profile.pagePermissions : [];
  if (!permissions.includes(pageKey)) {
    showPermissionWarning();
    throw new Error('Bạn không có quyền truy cập trang này.');
  }
  return { profile, role };
}
