import { db } from './firebase.js';
import { waitForAuth } from './auth.js';
import {
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
    { ma: '002', ten: 'Công ty B' },
    { ma: '009', ten: 'CTBT' }
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

function notifySettingsChanged(key = null) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem('catalog-sync', JSON.stringify({ key, ts: Date.now() }));
  } catch (error) {
    console.warn('[Settings] localStorage sync notification failed', error);
  }

  window.dispatchEvent(new CustomEvent('catalog-updated', { detail: { key } }));
}

function getDefaultSettingsState() {
  return Object.fromEntries(
    Object.values(SETTING_KEYS).map((key) => [key, normalizeItems(DEFAULT_SETTINGS[key])])
  );
}

function normalizeSettingsState(state = {}) {
  return Object.fromEntries(
    Object.values(SETTING_KEYS).map((key) => [key, normalizeItems(state?.[key] ?? DEFAULT_SETTINGS[key])])
  );
}

export async function ensureDefaultSettings() {
  const authUser = await waitForAuth();
  if (!authUser) {
    console.warn('[Settings] skipped default setup because no authenticated user is available');
    return getDefaultSettingsState();
  }

  const keys = Object.values(SETTING_KEYS);
  for (const key of keys) {
    const ref = buildDocRef(key);
    try {
      console.log('[Firestore] getDoc', ref.path);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        const defaultItems = normalizeItems(DEFAULT_SETTINGS[key]);
        console.log('[Firestore] setDoc', ref.path);
        await setDoc(ref, { danhSach: defaultItems }, { merge: true });
        notifySettingsChanged(key);
      }
    } catch (error) {
      console.warn(`[Settings] fallback used for ${ref.path}`, error);
      try {
        await setDoc(ref, { danhSach: normalizeItems(DEFAULT_SETTINGS[key]) }, { merge: true });
      } catch (createError) {
        console.warn(`[Settings] create fallback failed for ${ref.path}`, createError);
      }
    }
  }

  return getDefaultSettingsState();
}

export function listenToSettings(callback) {
  const keys = Object.values(SETTING_KEYS);
  const unsubscribes = [];
  const state = getDefaultSettingsState();

  callback(normalizeSettingsState(state));

  keys.forEach((key) => {
    const ref = buildDocRef(key);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const rawItems = snapshot.exists() ? snapshot.data()?.danhSach : null;
      state[key] = normalizeItems(rawItems ?? DEFAULT_SETTINGS[key]);
      callback(normalizeSettingsState(state));
    }, (error) => {
      console.error('[Firestore] onSnapshot failed', error);
      state[key] = normalizeItems(DEFAULT_SETTINGS[key]);
      callback(normalizeSettingsState(state));
    });
    unsubscribes.push(unsubscribe);
  });

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
}

export function getSettingOptions(settingsState, key) {
  return Array.isArray(settingsState?.[key]) ? settingsState[key] : normalizeItems(DEFAULT_SETTINGS[key]);
}

export function getSettingDisplayValue(settingsState, key, value) {
  const match = getSettingOptions(settingsState, key).find((item) => item.ma === String(value));
  return match ? `${match.ma} - ${match.ten}` : value;
}

export async function saveSettingsDocument(key, items) {
  const authUser = await waitForAuth();
  if (!authUser) {
    console.warn('[Settings] skipped save because no authenticated user is available');
    return false;
  }

  const ref = buildDocRef(key);
  try {
    console.log('[Firestore] setDoc', ref.path);
    await setDoc(ref, {
      danhSach: normalizeItems(items)
    }, { merge: true });
    notifySettingsChanged(key);
    return true;
  } catch (error) {
    console.error('[Settings] saveSettingsDocument failed', error);
    return false;
  }
}
