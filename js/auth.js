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

let authReadyPromise = null;
// Thiết lập promise chờ auth sẵn sàng để tái sử dụng trong các hàm khác.
function setAuthReadyPromise(promise) {
  authReadyPromise = promise;
  return promise;
}
// Chờ cho đến khi Firebase Auth sẵn sàng và trả về người dùng hiện tại nếu đã đăng nhập.
export function waitForAuth() {
  if (authReadyPromise) {
    return authReadyPromise;
  }

  const promise = new Promise((resolve, reject) => {
    if (!auth) {
      reject(new Error('Firebase Auth chÆ°a sáºµn sÃ ng. Vui lÃ²ng táº£i láº¡i trang hoáº·c kiá»ƒm tra cáº¥u hÃ¬nh Firebase.'));
      return;
    }

    const existingUser = auth.currentUser;
    if (existingUser) {
      resolve(existingUser);
      return;
    }

    try {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      }, (error) => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });

  return setAuthReadyPromise(promise);
}
// Đăng nhập bằng email và mật khẩu, có thể ghi nhớ phiên đăng nhập.
export async function loginWithEmailPassword(email, password, rememberMe = true) {
  if (!auth) {
    throw new Error('Firebase Auth chÆ°a sáºµn sÃ ng. Vui lÃ²ng táº£i láº¡i trang hoáº·c kiá»ƒm tra cáº¥u hÃ¬nh Firebase.');
  }

  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}
// Đăng nhập ẩn danh bằng Firebase Auth.
export async function loginAnonymously() {
  if (!auth) {
    throw new Error('Firebase Auth chÆ°a sáºµn sÃ ng. Vui lÃ²ng táº£i láº¡i trang hoáº·c kiá»ƒm tra cáº¥u hÃ¬nh Firebase.');
  }
  return signInAnonymously(auth);
}
// Tạo tài khoản mới bằng email và mật khẩu.
export async function signUpWithEmailPassword(email, password) {
  if (!auth) {
    throw new Error('Firebase Auth chÆ°a sáºµn sÃ ng. Vui lÃ²ng táº£i láº¡i trang hoáº·c kiá»ƒm tra cáº¥u hÃ¬nh Firebase.');
  }
  return createUserWithEmailAndPassword(auth, email, password);
}
// Gửi email đặt lại mật khẩu cho người dùng.
export async function resetPassword(email) {
  if (!auth) {
    throw new Error('Firebase Auth chÆ°a sáºµn sÃ ng. Vui lÃ²ng táº£i láº¡i trang hoáº·c kiá»ƒm tra cáº¥u hÃ¬nh Firebase.');
  }
  return sendPasswordResetEmail(auth, email);
}
// Đăng xuất khỏi Firebase Auth.
export async function logout() {
  if (!auth) {
    return;
  }
  return signOut(auth);
}
// Lắng nghe thay đổi trạng thái đăng nhập của người dùng.
export function watchAuthState(callback) {
  if (!auth) {
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
// Trả về người dùng hiện tại đang đăng nhập.
export function getCurrentUser() {
  return auth?.currentUser || null;
}
// Trả về UID của người dùng hiện tại.
export function getCurrentUserId() {
  return auth?.currentUser?.uid || null;
}




