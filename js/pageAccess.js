import { getUserProfile } from './firestore.js';
import { resolveInitialRole } from './roleUtils.js';
import { db } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

let permissionWarningShown = false;

export const DEFAULT_PAGE_ACCESS = {
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

export async function getPageAccessConfig() {
  try {
    const ref = doc(db, 'settings', 'pageAccessControl');
    const snapshot = await getDoc(ref);
    const config = snapshot.exists() ? (snapshot.data() || {}) : {};
    return {
      ...DEFAULT_PAGE_ACCESS,
      ...(config.pages || {})
    };
  } catch (error) {
    console.warn('[PageAccess] fallback to default config', error);
    return { ...DEFAULT_PAGE_ACCESS };
  }
}

export async function isPageEnabled(pageKey) {
  const config = await getPageAccessConfig();
  return config[pageKey] !== false;
}

export function showPermissionWarning({
  title = 'Missing or insufficient permissions.',
  buttonText = 'Back to dashboard',
  redirectTo = './dashboard.html'
} = {}) {
  if (permissionWarningShown) return;

  const wrapper = document.querySelector('main');
  if (!wrapper) return;

  const existing = wrapper.querySelector('.permission-warning-panel');
  if (existing) {
    permissionWarningShown = true;
    return;
  }

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
  permissionWarningShown = true;
}

export async function requirePageAccess(user, pageKey) {
  const profile = await getUserProfile(user.uid);
  const role = resolveInitialRole(user.email, profile?.role);
  const config = await getPageAccessConfig();

  if (role === 'dev') return { profile, role };

  if (config[pageKey] === false) {
    showPermissionWarning({ title: 'Trang này đã bị tắt bởi developer.' });
    throw new Error('Trang này đang bị khóa bởi developer.');
  }

  const permissions = Array.isArray(profile?.pagePermissions) ? profile.pagePermissions : [];
  if (!permissions.includes(pageKey)) {
    showPermissionWarning();
    throw new Error('Bạn không có quyền truy cập trang này.');
  }
  return { profile, role };
}
