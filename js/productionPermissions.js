// hàm xử lý kiểm tra người dùng đã xác thực.
export function isAuthenticatedUser(user) {
  return Boolean(user?.uid);
}
// hàm kiểm tra quyền chỉnh sửa dòng sản xuất.
export function canEditProductionRows(user, currentRole = 'staff') {
  return isAuthenticatedUser(user) || currentRole === 'admin' || currentRole === 'dev';
}
// hàm kiểm tra quyền xóa dòng sản xuất.
export function canDeleteProductionRows(currentRole = 'staff') {
  return currentRole === 'admin' || currentRole === 'dev';
}




