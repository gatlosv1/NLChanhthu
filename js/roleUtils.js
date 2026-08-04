const ADMIN_EMAILS = ['gatlosv1@gmail.com', 'admin@company.com', 'admin@example.com'];

export function isAdminLikeEmail(email = '') {
  const normalizedEmail = (email || '').trim().toLowerCase();

  return (
    ADMIN_EMAILS.includes(normalizedEmail) ||
    normalizedEmail.startsWith('admin') ||
    normalizedEmail.includes('admin')
  );
}

export function resolveInitialRole(email, existingRole = '') {
  const normalizedExistingRole = (existingRole || '').trim().toLowerCase();

  if (normalizedExistingRole === 'admin') {
    return 'admin';
  }

  if (normalizedExistingRole === 'staff') {
    return 'staff';
  }

  return isAdminLikeEmail(email) ? 'admin' : 'staff';
}
