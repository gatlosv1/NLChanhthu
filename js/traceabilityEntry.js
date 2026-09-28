import { db } from './firebase.js';
import { waitForAuth } from './auth.js';
import { ensureUserDocument } from './userService.js';
import { getUserProfile } from './firestore.js';
import { requirePageAccess } from './pageAccess.js';
import {
  collection,
  enableIndexedDbPersistence,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js';

const elements = {
  connection: document.getElementById('connectionStatus'),
  department: document.getElementById('departmentLabel'),
  operator: document.getElementById('operatorLabel'),
  createPanel: document.getElementById('createLotPanel'),
  createForm: document.getElementById('createLotForm'),
  newLotCode: document.getElementById('newLotCode'),
  newLotKg: document.getElementById('newLotKg'),
  newLotNote: document.getElementById('newLotNote'),
  createLotButton: document.getElementById('createLotBtn'),
  search: document.getElementById('lotSearch'),
  find: document.getElementById('findLotBtn'),
  status: document.getElementById('entryStatus'),
  queue: document.getElementById('lotQueue'),
  count: document.getElementById('queueCount'),
  title: document.getElementById('entryTitle'),
  stage: document.getElementById('stageBadge'),
  form: document.getElementById('stageEntryForm'),
  lotCode: document.getElementById('selectedLotCode'),
  inputKg: document.getElementById('inputKg'),
  acceptedKg: document.getElementById('acceptedKg'),
  rejectedKg: document.getElementById('rejectedKg'),
  rejectReason: document.getElementById('rejectReason'),
  rework: document.getElementById('createReworkLot'),
  note: document.getElementById('note'),
  save: document.getElementById('saveStageEvent')
};

const functions = getFunctions(undefined, 'asia-southeast1');
const recordStageEvent = httpsCallable(functions, 'recordStageEvent');
const createIncomingLot = httpsCallable(functions, 'createIncomingLot');
let departmentId = '';
let selectedLot = null;
let stopQueue = () => {};
let rejectReasons = [];

function resolveDepartmentId(profile) {
  if (profile?.departmentId) return profile.departmentId;
  const department = String(profile?.department || '').trim().toUpperCase();
  if (department.includes('SƠ CHẾ')) return 'PREPROCESS';
  if (department.includes('CHẾ BIẾN')) return 'PROCESSING';
  if (department.includes('CẤP ĐÔNG') || department.includes('ĐÓNG GÓI')) return 'FREEZE_PACK';
  if (department.includes('KHO')) return 'COLD_STORAGE';
  return '';
}

function setStatus(message, type = '') {
  elements.status.textContent = message;
  elements.status.className = `status${type ? ` status--${type}` : ''}`;
}

function setFormEnabled(enabled) {
  [elements.acceptedKg, elements.rejectedKg, elements.rejectReason, elements.rework, elements.note, elements.save]
    .forEach((control) => { control.disabled = !enabled; });
}

function renderQueue(lots) {
  elements.count.textContent = String(lots.length);
  elements.queue.replaceChildren();
  if (!lots.length) {
    const empty = document.createElement('p');
    empty.className = 'queue-empty';
    empty.textContent = 'Chưa có lô đang chờ tại bộ phận này.';
    elements.queue.append(empty);
    return;
  }

  lots.forEach((lot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lot-card';
    button.setAttribute('aria-current', String(selectedLot?.id === lot.id));
    const code = document.createElement('strong');
    code.textContent = lot.lotCode || lot.id;
    const details = document.createElement('span');
    details.textContent = `${lot.pendingStageId || 'Chưa xác định công đoạn'} - ${Number(lot.currentQuantityKg || 0).toLocaleString('vi-VN')} kg`;
    button.append(code, details);
    button.addEventListener('click', () => selectLot(lot));
    elements.queue.append(button);
  });
}

function selectLot(lot) {
  selectedLot = lot;
  elements.title.textContent = lot.lotCode || lot.id;
  elements.stage.textContent = lot.pendingStageId || '-';
  elements.lotCode.value = lot.lotCode || '';
  elements.inputKg.value = Number(lot.currentQuantityKg || 0);
  elements.acceptedKg.value = '';
  elements.rejectedKg.value = '0';
  elements.rejectReason.value = '';
  elements.rework.checked = false;
  elements.note.value = '';
  setFormEnabled(true);
  elements.acceptedKg.focus();
  setStatus(`Đã chọn lô ${lot.lotCode || lot.id}.`);
}

async function findLotByCode() {
  const lotCode = elements.search.value.trim().toUpperCase();
  if (!lotCode) return setStatus('Nhập hoặc quét mã lô trước.', 'error');

  const snapshot = await getDocs(query(collection(db, 'lots'), where('lotCode', '==', lotCode), limit(1)));
  if (snapshot.empty) return setStatus('Không tìm thấy mã lô.', 'error');

  const lot = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  if (lot.status !== 'waiting' || lot.pendingDepartmentId !== departmentId) {
    return setStatus('Lô không chờ xử lý tại bộ phận của bạn.', 'error');
  }
  selectLot(lot);
}

function listenQueue() {
  stopQueue();
  const queueQuery = query(
    collection(db, 'lots'),
    where('pendingDepartmentId', '==', departmentId),
    where('status', '==', 'waiting'),
    orderBy('updatedAt', 'asc'),
    limit(100)
  );
  stopQueue = onSnapshot(queueQuery, (snapshot) => {
    renderQueue(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
  }, (error) => setStatus(error.message || 'Không tải được hàng chờ.', 'error'));
}

async function loadRejectReasons() {
  const snapshot = await getDocs(query(collection(db, 'reject_reasons'), where('active', '==', true), orderBy('name', 'asc')));
  rejectReasons = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  rejectReasons.forEach((reason) => {
    const option = document.createElement('option');
    option.value = reason.id;
    option.textContent = reason.name || reason.code || reason.id;
    elements.rejectReason.append(option);
  });
}

async function initialise() {
  try {
    await enableIndexedDbPersistence(db);
  } catch (error) {
    console.warn('Offline persistence is unavailable:', error.code || error);
  }

  const user = await waitForAuth();
  if (!user) {
    window.location.href = './login.html';
    return;
  }
  const profile = await ensureUserDocument() || await getUserProfile(user.uid);
  await requirePageAccess(user, 'traceability');
  departmentId = resolveDepartmentId(profile);
  if (!departmentId && !['admin', 'dev'].includes(profile?.role)) {
    setStatus('Tài khoản chưa được gán bộ phận. Liên hệ quản lý.', 'error');
    return;
  }

  elements.operator.textContent = profile?.name || user.email || 'Nhân viên';
  elements.department.textContent = departmentId || 'Quản trị';
  const canCreateIncomingLot = departmentId === 'PREPROCESS' || ['admin', 'dev'].includes(profile?.role);
  elements.createPanel.classList.toggle('is-hidden', !canCreateIncomingLot);
  await loadRejectReasons();
  if (departmentId) listenQueue();
  else setStatus('Admin cần chọn bộ phận trước khi xử lý hàng chờ.', 'error');
}

elements.find.addEventListener('click', () => findLotByCode().catch((error) => setStatus(error.message, 'error')));
elements.search.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    elements.find.click();
  }
});
elements.rejectedKg.addEventListener('input', () => {
  const hasReject = Number(elements.rejectedKg.value || 0) > 0;
  elements.rejectReason.required = hasReject;
  if (!hasReject) elements.rework.checked = false;
});
elements.createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  elements.createLotButton.disabled = true;
  try {
    const result = await createIncomingLot({
      lotCode: elements.newLotCode.value.trim().toUpperCase(),
      initialKg: Number(elements.newLotKg.value),
      stageId: 'SORT_1',
      note: elements.newLotNote.value.trim()
    });
    elements.createForm.reset();
    elements.search.value = result.data.lotCode;
    setStatus(`Đã tạo lô ${result.data.lotCode}. Lô đã vào hàng chờ Phân loại 1.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Không thể tạo lô.', 'error');
  } finally {
    elements.createLotButton.disabled = false;
  }
});
elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedLot) return setStatus('Chọn một lô trước khi lưu.', 'error');

  const inputKg = Number(elements.inputKg.value);
  const acceptedKg = Number(elements.acceptedKg.value);
  const rejectedKg = Number(elements.rejectedKg.value);
  if (![inputKg, acceptedKg, rejectedKg].every(Number.isFinite) || acceptedKg < 0 || rejectedKg < 0 || acceptedKg + rejectedKg > inputKg) {
    return setStatus('Khối lượng đạt và loại không hợp lệ.', 'error');
  }

  elements.save.disabled = true;
  try {
    const reason = rejectReasons.find((item) => item.id === elements.rejectReason.value);
    await recordStageEvent({
      lotId: selectedLot.id,
      stageId: selectedLot.pendingStageId,
      inputKg,
      acceptedKg,
      rejectedKg,
      rejectReasonId: reason?.id || null,
      quantityDeltaKg: 0,
      rework: Boolean(elements.rework.checked && reason?.reworkEligible),
      note: elements.note.value.trim()
    });
    setStatus('Đã ghi nhận công đoạn. Hàng chờ đang làm mới.', 'success');
    selectedLot = null;
    elements.title.textContent = 'Chưa chọn lô';
    elements.stage.textContent = '-';
    elements.form.reset();
    setFormEnabled(false);
  } catch (error) {
    setStatus(error.message || 'Không thể lưu công đoạn.', 'error');
  } finally {
    elements.save.disabled = false;
  }
});
window.addEventListener('online', () => {
  elements.connection.textContent = 'Đang kết nối';
  elements.connection.classList.remove('connection--offline');
});
window.addEventListener('offline', () => {
  elements.connection.textContent = 'Đang ngoại tuyến';
  elements.connection.classList.add('connection--offline');
});

initialise().catch((error) => setStatus(error.message || 'Không thể khởi tạo màn hình.', 'error'));
