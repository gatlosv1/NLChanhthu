export function shouldAttemptLegacyAccountRecovery(errorCode, profile = {}) {
  const safeProfile = profile || {};
  const hasLegacyPassword = typeof safeProfile.password === 'string' && safeProfile.password.trim().length > 0;
  const isCredentialsError = errorCode === 'auth/invalid-login-credentials' || errorCode === 'auth/wrong-password' || errorCode === 'auth/user-not-found';
  return isCredentialsError && hasLegacyPassword;
}
