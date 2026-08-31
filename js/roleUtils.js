const DEV_EMAILS = ['gatlosv1@gmail.com'];
const ADMIN_EMAILS = ['admin@company.com', 'admin2@company.com', 'admin@example.com'];

export function normalizeUserRole(role = '') {
  const normalizedRole = (role || '').trim().toLowerCase();
  if (normalizedRole === 'dev') return 'dev';
  if (normalizedRole === 'admin') return 'admin';
  return 'staff';
}

export function isDevLikeEmail(email = '') {
  const normalizedEmail = (email || '').trim().toLowerCase();
  return DEV_EMAILS.includes(normalizedEmail) || normalizedEmail.startsWith('dev') || normalizedEmail.includes('dev');
}

export function isAdminLikeEmail(email = '') {
  const normalizedEmail = (email || '').trim().toLowerCase();
  return (
    ADMIN_EMAILS.includes(normalizedEmail) ||
    normalizedEmail.startsWith('admin') ||
    normalizedEmail.includes('admin')
  );
}

export function isPrivilegedRole(role = '') {
  const normalizedRole = normalizeUserRole(role);
  return normalizedRole === 'admin' || normalizedRole === 'dev';
}

export function resolveInitialRole(email, existingRole = '') {
  const normalizedExistingRole = normalizeUserRole(existingRole);
  const fixedDevEmail = isDevLikeEmail(email);
  const fixedAdminEmail = isAdminLikeEmail(email);

  if (fixedDevEmail || normalizedExistingRole === 'dev') {
    return 'dev';
  }

  if (fixedAdminEmail || normalizedExistingRole === 'admin') {
    return 'admin';
  }

  if (normalizedExistingRole === 'staff') {
    return 'staff';
  }

  return 'staff';
}



