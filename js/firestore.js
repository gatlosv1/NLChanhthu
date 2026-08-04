import { db } from './firebase.js';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const USERS_COLLECTION = 'users';

// Tạo hoặc cập nhật hồ sơ người dùng trong collection users.
export async function createOrUpdateUserProfile(uid, payload) {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await setDoc(userRef, {
    ...payload,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// Lấy hồ sơ người dùng dựa trên UID.
export async function getUserProfile(uid) {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const snapshot = await getDoc(userRef);
  return snapshot.exists() ? snapshot.data() : null;
}

// Chuẩn hóa vai trò về admin hoặc staff.
export function normalizeUserRole(role = '') {
  const normalizedRole = (role || '').trim().toLowerCase();
  return normalizedRole === 'admin' ? 'admin' : 'staff';
}

// Lấy vai trò của người dùng từ hồ sơ Firestore.
export async function getUserRole(uid) {
  const profile = await getUserProfile(uid);
  return normalizeUserRole(profile?.role);
}

// Cập nhật thông tin hồ sơ người dùng.
export async function updateUserProfile(uid, payload) {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

// Trả về reference của collection users.
export async function getUsersCollection() {
  return collection(db, USERS_COLLECTION);
}

// Lấy toàn bộ hồ sơ người dùng để dùng cho dashboard quản lý.
export async function getAllUsersProfiles() {
  const snapshot = await getDocs(collection(db, USERS_COLLECTION));
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

// Xóa hồ sơ người dùng khỏi Firestore.
export async function deleteUserProfile(uid) {
  await deleteDoc(doc(db, USERS_COLLECTION, uid));
}
