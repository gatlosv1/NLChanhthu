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

export async function createOrUpdateUserProfile(uid, payload) {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await setDoc(userRef, {
    ...payload,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function getUserProfile(uid) {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const snapshot = await getDoc(userRef);
  return snapshot.exists() ? snapshot.data() : null;
}

export function normalizeUserRole(role = '') {
  const normalizedRole = (role || '').trim().toLowerCase();
  return normalizedRole === 'admin' ? 'admin' : 'staff';
}

export async function getUserRole(uid) {
  const profile = await getUserProfile(uid);
  return normalizeUserRole(profile?.role);
}

export async function updateUserProfile(uid, payload) {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

export async function getUsersCollection() {
  return collection(db, USERS_COLLECTION);
}

export async function getAllUsersProfiles() {
  const snapshot = await getDocs(collection(db, USERS_COLLECTION));
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

export async function deleteUserProfile(uid) {
  await deleteDoc(doc(db, USERS_COLLECTION, uid));
}
