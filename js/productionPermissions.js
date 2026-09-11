// hàm xử lý kiểm tra người dùng đã xác thực.
export function isAuthenticatedUser(user) {
  return Boolean(user?.uid);
}
// Chỉ admin/dev được sửa ngày sản xuất.
export function canEditProductionDate(user, currentRole = 'staff') {
  return isAuthenticatedUser(user) && (currentRole === 'admin' || currentRole === 'dev');
}
// Chỉ admin/dev được sửa các dòng sản xuất.
export function canEditProductionRows(user, currentRole = 'staff') {
  return isAuthenticatedUser(user) && (currentRole === 'admin' || currentRole === 'dev');
}
// hàm kiểm tra quyền xóa dòng sản xuất.
export function canDeleteProductionRows(currentRole = 'staff') {
  return currentRole === 'admin' || currentRole === 'dev';
}




