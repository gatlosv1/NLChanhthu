import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-analytics.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';
// Cấu hình ứng dụng web Firebase.
const defaultAuthDomain = 'quanlynlchanhthu.firebaseapp.com';
const currentHostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const isLocalHost = currentHostname === 'localhost' || currentHostname === '127.0.0.1' || currentHostname === '0.0.0.0';
const authDomain = isLocalHost ? currentHostname : defaultAuthDomain;

const firebaseConfig = {
  apiKey: 'AIzaSyAFQQ5yvXsA5B3etXDM_k0g6-HcEjDEpGo',
  authDomain,
  projectId: 'quanlynlchanhthu',
  storageBucket: 'quanlynlchanhthu.firebasestorage.app',
  messagingSenderId: '776184745772',
  appId: '1:776184745772:web:464fb620d55626daee6689',
  measurementId: 'G-M2FGGW25WL'
};

let app;
let analytics = null;
let auth;
let db;
let storage;

try {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  analytics = typeof window !== 'undefined' && typeof window.gtag !== 'undefined' ? getAnalytics(app) : null;
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} catch (error) {
  console.warn('Firebase initialization warning:', error);
  app = getApps()[0] || null;
  auth = app ? getAuth(app) : null;
  db = app ? getFirestore(app) : null;
  storage = app ? getStorage(app) : null;
}

export { app, analytics, auth, db, storage };
export default app;



