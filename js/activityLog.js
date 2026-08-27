import { getCurrentUser } from './auth.js';
import { rtdb } from './firebase.js';
import { push, ref, set } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';

const MAX_DETAIL_LENGTH = 120;
const VALID_ACTIONS = new Set(['add', 'edit', 'delete', 'login', 'logout', 'export', 'import', 'save']);
const VALID_PAGES = new Set(['congTachMui', 'production', 'settings', 'auth']);

function vietnamDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function logActivity({ action, page, detail = '' }) {
  const user = getCurrentUser();
  if (!user || !rtdb || !VALID_ACTIONS.has(action) || !VALID_PAGES.has(page)) return;

  const now = Date.now();
  const dateParts = vietnamDate(now);
  const date = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const description = String(detail).replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL_LENGTH);
  const logRef = push(ref(rtdb, `logs/${date}`));
  const payload = {
    t: now,
    u: user.uid,
    n: String(user.displayName || user.email || 'Người dùng').slice(0, 80),
    a: action,
    p: page,
    d: description
  };

  void set(logRef, payload).catch(() => {});
}

export function getVietnamDate(timestamp = Date.now()) {
  const parts = vietnamDate(timestamp);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
