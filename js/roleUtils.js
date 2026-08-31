const DEV_EMAILS = ['gatlosv1@gmail.com'];
const ADMIN_EMAILS = ['admin@company.com', 'admin@example.com'];

export function isDevLikeEmail(email = '') {
  const normalizedEmail = (email || '').trim().toLowerCase();
  return DEV_EMAILS.includes(normalizedEmail) || normalizedEmail.startsWith('dev') || normalizedEmail.includes('dev');
}

// Kiểm tra email có thuộc nhóm quản trị viên như admin@example.com hoặc chứa từ admin.
export function isAdminLikeEmail(email = '') {
  const normalizedEmail = (email || '').trim().toLowerCase();

  return (
    ADMIN_EMAILS.includes(normalizedEmail) ||
    normalizedEmail.startsWith('admin') ||
    normalizedEmail.includes('admin')
  );
}
// Xác định vai trò ban đầu dựa trên role trong Firestore hoặc email.
export function resolveInitialRole(email, existingRole = '') {
  const normalizedExistingRole = (existingRole || '').trim().toLowerCase();

  if (normalizedExistingRole === 'dev') {
    return 'dev';
  }

  if (normalizedExistingRole === 'admin') {
    return 'admin';
  }

  if (normalizedExistingRole === 'staff') {
    return 'staff';
  }

  if (isDevLikeEmail(email)) {
    return 'dev';
  }

  return isAdminLikeEmail(email) ? 'admin' : 'staff';
}



