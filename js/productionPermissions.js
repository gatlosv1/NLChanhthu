export function isAuthenticatedUser(user) {
  return Boolean(user?.uid);
}

export function canEditProductionRows(user, currentRole = 'staff') {
  return isAuthenticatedUser(user) || currentRole === 'admin';
}

export function canDeleteProductionRows(currentRole = 'staff') {
  return currentRole === 'admin';
}
