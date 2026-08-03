import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-analytics.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAFQQ5yvXsA5B3etXDM_k0g6-HcEjDEpGo',
  authDomain: 'quanlynlchanhthu.firebaseapp.com',
  projectId: 'quanlynlchanhthu',
  storageBucket: 'quanlynlchanhthu.firebasestorage.app',
  messagingSenderId: '776184745772',
  appId: '1:776184745772:web:464fb620d55626daee6689',
  measurementId: 'G-M2FGGW25WL'
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, analytics, auth, db, storage };
export default app;
