import { db } from './firebase.js';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const SETTINGS_COLLECTION = 'settings';

export const SETTING_KEYS = {
  nhaCungCap: 'nhaCungCap',
  vungNguyenLieu: 'vungNguyenLieu',
  loaiNguyenLieu: 'loaiNguyenLieu',
  loaiSanPham: 'loaiSanPham'
};

const DEFAULT_SETTINGS = {
  [SETTING_KEYS.nhaCungCap]: [
    { ma: '001', ten: 'Công ty A' },
    { ma: '002', ten: 'Công ty B' }
  ],
  [SETTING_KEYS.vungNguyenLieu]: [
    { ma: 'DN', ten: 'Đắk Nông' },
    { ma: 'DL', ten: 'Đắk Lắk' }
  ],
  [SETTING_KEYS.loaiNguyenLieu]: [
    { ma: 'M', ten: 'Múi' },
    { ma: 'TA', ten: 'Trái' },
    { ma: 'K', ten: 'Kem' }
  ],
  [SETTING_KEYS.loaiSanPham]: [
    { ma: 'RI', ten: 'RI' },
    { ma: 'DO', ten: 'DO' }
  ]
};

function normalizeItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ma: String(item.ma ?? '').trim(),
      ten: String(item.ten ?? '').trim()
    }))
    .filter((item) => item.ma || item.ten);
}

function buildDocRef(key) {
  return doc(db, SETTINGS_COLLECTION, key);
}

export async function ensureDefaultSettings() {
  const keys = Object.values(SETTING_KEYS);
  for (const key of keys) {
    const ref = buildDocRef(key);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      await setDoc(ref, {
        danhSach: normalizeItems(DEFAULT_SETTINGS[key])
      });
    }
  }
}

export function listenToSettings(callback) {
  const keys = Object.values(SETTING_KEYS);
  const unsubscribes = [];
  const state = {};

  keys.forEach((key) => {
    const ref = buildDocRef(key);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const rawItems = snapshot.data()?.danhSach || [];
      state[key] = normalizeItems(rawItems);
      callback(state);
    });
    unsubscribes.push(unsubscribe);
  });

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
}

export function getSettingOptions(settingsState, key) {
  return Array.isArray(settingsState?.[key]) ? settingsState[key] : [];
}

export function getSettingDisplayValue(settingsState, key, value) {
  const match = getSettingOptions(settingsState, key).find((item) => item.ma === String(value));
  return match ? `${match.ma} - ${match.ten}` : value;
}

export async function saveSettingsDocument(key, items) {
  const ref = buildDocRef(key);
  await setDoc(ref, {
    danhSach: normalizeItems(items)
  }, { merge: true });
}
