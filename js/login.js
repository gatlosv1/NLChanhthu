import { loginWithEmailPassword, resetPassword, watchAuthState } from './auth.js';
import { ensureUserDocument } from './userService.js';
import { hideLoading, showLoading, showToast } from './utils.js';

const form = document.getElementById('loginForm');
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const messageBox = document.getElementById('messageBox');

watchAuthState((user) => {
  if (user) {
    window.location.href = './dashboard.html';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = passwordInput.value;
  const rememberMe = document.getElementById('rememberMe').checked;
  messageBox.innerHTML = '';

  if (!email || !password) {
    showToast('Vui lòng nhập email và mật khẩu.', 'error');
    return;
  }

  showLoading();
  try {
    const credential = await loginWithEmailPassword(email, password, rememberMe);
    await ensureUserDocument();
    showToast(`Đăng nhập thành công. Chào ${credential.user.email}`, 'success');
    window.location.href = './dashboard.html';
  } catch (error) {
    showToast(mapError(error), 'error');
  } finally {
    hideLoading();
  }
});

togglePassword.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePassword.textContent = isPassword ? 'Ẩn' : 'Hiện';
});

forgotPasswordLink.addEventListener('click', async (event) => {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  if (!email) {
    showToast('Nhập email trước khi gửi link reset password.', 'info');
    return;
  }

  showLoading();
  try {
    await resetPassword(email);
    showToast('Email reset mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư.', 'success');
  } catch (error) {
    showToast(mapError(error), 'error');
  } finally {
    hideLoading();
  }
});

function mapError(error) {
  switch (error.code) {
    case 'auth/invalid-email':
      return 'Email không hợp lệ.';
    case 'auth/user-not-found':
      return 'Không tìm thấy người dùng với email này.';
    case 'auth/wrong-password':
      return 'Mật khẩu không đúng.';
    case 'auth/too-many-requests':
      return 'Quá nhiều lần thử. Hãy thử lại sau.';
    default:
      return error.message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
  }
}
