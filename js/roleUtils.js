const ADMIN_EMAILS = ['gatlosv1@gmail.com', 'admin@company.com', 'admin@example.com'];
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

  if (normalizedExistingRole === 'admin') {
    return 'admin';
  }

  if (normalizedExistingRole === 'staff') {
    return 'staff';
  }

  return isAdminLikeEmail(email) ? 'admin' : 'staff';
}



