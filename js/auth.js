import { auth } from './firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

// Đăng nhập bằng email và mật khẩu, có thể ghi nhớ phiên đăng nhập.
export async function loginWithEmailPassword(email, password, rememberMe = true) {
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

// Đăng nhập ẩn danh bằng Firebase Auth.
export async function loginAnonymously() {
  return signInAnonymously(auth);
}

// Tạo tài khoản mới bằng email và mật khẩu.
export async function signUpWithEmailPassword(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

// Gửi email đặt lại mật khẩu cho người dùng.
export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// Đăng xuất khỏi Firebase Auth.
export async function logout() {
  return signOut(auth);
}

// Lắng nghe thay đổi trạng thái đăng nhập của người dùng.
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

// Trả về user hiện tại đang đăng nhập.
export function getCurrentUser() {
  return auth.currentUser;
}

// Trả về UID của user hiện tại.
export function getCurrentUserId() {
  return auth.currentUser?.uid || null;
}
