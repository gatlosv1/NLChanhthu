// Nhập các hàm liên quan đến auth, Firestore và UI helper.
import { getCurrentUser, watchAuthState, waitForAuth } from './auth.js?v=20260804-8';
// Kết nối tới Firestore trong Firebase.
import { db } from './firebase.js?v=20260804-8';
// Lấy thông tin hồ sơ người dùng từ Firestore.
import { getUserProfile } from './firestore.js';
// Xác định vai trò admin/staff dựa trên email hoặc hồ sơ.
import { resolveInitialRole } from './roleUtils.js';
// Các hàm Firestore cần dùng: lấy dữ liệu, lưu dữ liệu, xóa dữ liệu.
import {
  collection,
  setDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
  onSnapshot,
  orderBy,
  query
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
// Các hàm hỗ trợ hiển thị loading, toast và thông báo.
import { hideLoading, showLoading, showToast } from './utils.js?v=20260804-8';
import { ensureDefaultSettings, getSettingOptions, listenToSettings, SETTING_KEYS } from './settings.js';
import { canDeleteProductionRows, canEditProductionRows } from './productionPermissions.js';

// Lấy các phần tử DOM từ HTML để code có thể thao tác với form, bảng và nút bấm.
const tableEl = document.getElementById('productionTable');
const quickManufacturer = document.getElementById('quickManufacturer');
const quickRegion = document.getElementById('quickRegion');
const quickProductionDate = document.getElementById('quickProductionDate');
const quickVehicle = document.getElementById('quickVehicle');
const quickMaterialKind = document.getElementById('quickMaterialKind');
const quickLot = document.getElementById('quickLot');
const quickType = document.getElementById('quickType');
const quickKgA = document.getElementById('quickKgA');
const quickKgB = document.getElementById('quickKgB');
const quickKgC = document.getElementById('quickKgC');
const quickKgCNoSeed = document.getElementById('quickKgCNoSeed');
const quickAddBtn = document.getElementById('quickAddBtn');
const deleteRowBtn = document.getElementById('deleteRowBtn');
const refreshBtn = document.getElementById('refreshBtn');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const saveBtn = document.getElementById('saveBtn');
const summaryRows = document.getElementById('summaryRows');
const summaryA = document.getElementById('summaryA');
const summaryB = document.getElementById('summaryB');
const summaryC = document.getElementById('summaryC');
const summaryCNoSeed = document.getElementById('summaryCNoSeed');

// Biến lưu trữ bảng dữ liệu và trạng thái hiện tại của trang.
let table;
let data = [];
let productionUnsubscribe = null;
let saveTimer = null;
let currentUser = null;
let authReadyPromise = null;
let isSaving = false;
let currentRole = 'staff';
let settingsState = {};
let stopSettingsListener = null;

// Cấu hình các cột hiển thị trong bảng Tabulator.
const columns = [
  { title: 'STT', field: 'stt', width: 70, frozen: true, editor: false, editable: false, formatter: (cell) => {
    const value = cell.getValue();
    return value === null || value === undefined || value === '' ? '' : value;
  } },
  { title: 'Ngày sản xuất', field: 'productionDate', width: 140, editor: 'date', editorParams: { format: 'dd/MM/yyyy' }, sorter: 'date', validator: ['required'], editable: () => canEditProductionRows(currentUser, currentRole), headerFilter: 'input', headerFilterPlaceholder: 'Lọc ngày', headerFilterLiveFilter: true },
  { title: 'Lot', field: 'lot', width: 180, editor: 'input', validator: ['required'], editable: () => canEditProductionRows(currentUser, currentRole), headerFilter: 'input', headerFilterPlaceholder: 'Lọc lot', headerFilterLiveFilter: true },
  { title: 'RI/DO', field: 'type', width: 100, editor: 'select', editorParams: { values: [] }, validator: ['required'], editable: () => canEditProductionRows(currentUser, currentRole), headerFilter: 'select', headerFilterParams: { values: [] }, headerFilterPlaceholder: 'Lọc' },
  { title: 'kg BTP A', field: 'kgA', width: 120, editor: 'number', editorParams: { min: 0, step: 0.01 }, editable: () => canEditProductionRows(currentUser, currentRole) },
  { title: '% BTP A', field: 'percentA', width: 120, editor: false, formatter: percentFormatter, editable: false },
  { title: 'kg BTP B', field: 'kgB', width: 120, editor: 'number', editorParams: { min: 0, step: 0.01 }, editable: () => canEditProductionRows(currentUser, currentRole) },
  { title: '% BTP B', field: 'percentB', width: 120, editor: false, formatter: percentFormatter, editable: false },
  { title: 'kg BTP C', field: 'kgC', width: 120, editor: 'number', editorParams: { min: 0, step: 0.01 }, editable: () => canEditProductionRows(currentUser, currentRole) },
  { title: '% BTP C', field: 'percentC', width: 120, editor: false, formatter: percentFormatter, editable: false },
  { title: 'kg BTP C Không hạt', field: 'kgCNoSeed', width: 140, editor: 'number', editorParams: { min: 0, step: 0.01 }, editable: () => canEditProductionRows(currentUser, currentRole) },
  { title: '% BTP C Không hạt', field: 'percentCNoSeed', width: 140, editor: false, formatter: percentFormatter, editable: false }
];

// Định dạng giá trị phần trăm để hiển thị trong bảng.
function percentFormatter(cell) {
  const value = cell.getValue();
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return value;
  return `${numeric}%`;
}

// Khởi tạo bảng Tabulator và gắn các sự kiện cho bảng.
function initTable() {
  const options = getSettingOptions(settingsState, SETTING_KEYS.loaiSanPham).map((item) => item.ma);
  columns[3].editorParams.values = options;
  columns[3].headerFilterParams.values = options;

  if (!tableEl) {
    console.warn('[Production] Table container not found; skipping Tabulator init');
    return;
  }

  try {
    table = new Tabulator(tableEl, {
      data: [],
      columns,
      layout: 'fitDataFill',
      movableColumns: true,
      resizableRows: true,
      selectable: 1,
      clipboard: true,
      clipboardPasteAction: 'replace',
      history: true,
      autoColumns: false,
      reactiveData: false,
      columnDefaults: {
        headerSort: true,
        resizable: true
      },
      rowContextMenu: [
        {
          label: 'Thêm dòng',
          action: () => addNewRow()
        },
        {
          label: 'Xóa dòng',
          action: () => {
            if (currentRole !== 'admin') {
              showToast('Bạn chỉ có thể nhập dữ liệu, không được xóa.', 'info');
              return;
            }
            removeSelectedRows();
          }
        },
        {
          label: 'Copy',
          action: () => table.copyToClipboard('all')
        },
        {
          label: 'Paste',
          action: () => table.pasteFromClipboard()
        }
      ],
      keybindings: {},
      rowAdded: () => autoSave(),
      rowDeleted: () => autoSave(),
      dataEdited: () => autoSave(),
      renderComplete: updateSummary
    });

    table.on('cellEdited', (cell) => {
      const field = cell.getField();
      if (['kgA', 'kgB', 'kgC'].includes(field)) {
        const rowData = cell.getRow().getData();
        updatePercentages(rowData);
        cell.getRow().update(rowData);
      }
    });

    table.on('tableBuilt', () => {
      table.setData([]);
    });
  } catch (error) {
    console.error('[Production] Tabulator init failed', error);
    tableEl.innerHTML = '<div class="text-muted p-3">Bảng dữ liệu không thể khởi tạo. Bạn vẫn có thể thêm dòng bằng form nhập nhanh.</div>';
  }
}

// Chuẩn hóa một dòng dữ liệu trước khi chèn vào bảng hoặc lưu xuống Firestore.
function normalizeRow(row, index) {
  const normalized = {
    id: row.id || `${Date.now()}-${index}`,
    firestoreId: row.firestoreId || '',
    stt: row.stt ?? index + 1,
    productionDate: row.productionDate || '',
    lot: row.lot || '',
    type: row.type || 'RI',
    kgA: row.kgA ?? '',
    percentA: row.percentA ?? '',
    kgB: row.kgB ?? '',
    percentB: row.percentB ?? '',
    kgC: row.kgC ?? '',
    kgCNoSeed: row.kgCNoSeed ?? '',
    percentC: row.percentC ?? '',
    percentCNoSeed: row.percentCNoSeed ?? '',
    materialType: row.materialType ?? '',
    manufacturer: row.manufacturer ?? '',
    region: row.region ?? '',
    vehicle: row.vehicle ?? '',
    materialKind: row.materialKind ?? ''
  };
  updatePercentages(normalized);
  return normalized;
}

// Chuyển đổi giá trị ngày sang định dạng dd/MM/yyyy để hiển thị.
function formatDateForDisplay(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Lấy chữ số cuối cùng của năm để tạo mã lot.
function getYearSuffix(year) {
  const suffix = String(year).slice(-1);
  return suffix;
}

// Tạo mã lot theo mẫu doanh nghiệp từ các ô nhập nhanh.
function generateLot({ materialType, manufacturer, region, productionDate, vehicle, materialKind }) {
  if (!materialType || !manufacturer || !region || !productionDate || !vehicle || !materialKind) return '';

  const dateObj = new Date(productionDate);
  if (Number.isNaN(dateObj.getTime())) return '';

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yearSuffix = getYearSuffix(dateObj.getFullYear());
  const manufacturerCode = String(manufacturer).trim().padStart(3, '0');
  const regionCode = String(region).trim().toUpperCase();
  const vehicleCode = String(vehicle).trim().padStart(2, '0');
  const materialCode = String(materialKind).trim().toUpperCase();

  return `${materialType}${manufacturerCode}${regionCode}${day}${month}${yearSuffix}-${vehicleCode}-${materialCode}`;
}

// Tự động điền ô Lot dựa trên các thông tin nhập nhanh.
function updateQuickLot() {
  const lot = generateLot({
    materialType: quickMaterialKind.value,
    manufacturer: quickManufacturer.value,
    region: quickRegion.value,
    productionDate: quickProductionDate.value,
    vehicle: quickVehicle.value,
    materialKind: quickMaterialKind.value
  });
  quickLot.value = lot;
}

// Chuyển đổi chuỗi phần trăm bằng cách bỏ dấu % nếu có.
function parsePercent(value) {
  if (value === null || value === undefined || value === '') return '';
  const stringValue = String(value).trim();
  if (stringValue.endsWith('%')) return stringValue.replace('%', '');
  return stringValue;
}

// Tính lại các cột phần trăm từ các giá trị kg.
function updatePercentages(rowData) {
  const total = Number(rowData.kgA || 0) + Number(rowData.kgB || 0) + Number(rowData.kgC || 0);
  if (total > 0) {
    rowData.percentA = ((Number(rowData.kgA || 0) / total) * 100).toFixed(2);
    rowData.percentB = ((Number(rowData.kgB || 0) / total) * 100).toFixed(2);
    rowData.percentC = ((Number(rowData.kgC || 0) / total) * 100).toFixed(2);
    rowData.percentCNoSeed = ((Number(rowData.kgCNoSeed || 0) / total) * 100).toFixed(2);
  } else {
    rowData.percentA = '';
    rowData.percentB = '';
    rowData.percentC = '';
    rowData.percentCNoSeed = '';
  }
  return rowData;
}



// Chuẩn hóa giá trị ngày để lưu và hiển thị đồng bộ.
function normalizeDateValue(value) {
  if (!value) return '';
  if (value instanceof Date) return formatDateForDisplay(value);
  if (typeof value === 'string') {
    if (value.includes('/')) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return formatDateForDisplay(parsed);
  }
  return value;
}

// Định dạng giá trị phần trăm số để hiển thị.
function formatPercentValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return value;
  return `${numeric}%`;
}

async function ensureUserDocument() {
  const user = await waitForAuth();
  if (!user) throw new Error('Bạn chưa đăng nhập.');
  currentUser = user;
  return user;
}

// Sắp xếp dòng dữ liệu theo thời gian tạo để bảng tải đúng thứ tự.
function sortRowsByCreatedAt(rows) {
  return [...rows].sort((a, b) => {
    const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
    const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    return aTime - bTime;
  });
}

// Tính lại số thứ tự sau khi thêm, xóa hoặc tải dữ liệu.
function reindexRows(rows) {
  return rows.map((row, index) => ({
    ...row,
    stt: row.stt ?? index + 1
  }));
}

function mapDocToRow(docItem, index) {
  const rowData = docItem.data();
  const row = {
    id: docItem.id,
    firestoreId: docItem.id,
    stt: index + 1,
    createdAt: rowData.createdAt || null,
    productionDate: rowData.productionDate || '',
    lot: rowData.lot || '',
    type: rowData.type || 'RI',
    kgA: rowData.kgA ?? '',
    percentA: rowData.percentA ?? '',
    kgB: rowData.kgB ?? '',
    percentB: rowData.percentB ?? '',
    kgC: rowData.kgC ?? '',
    kgCNoSeed: rowData.kgCNoSeed ?? '',
    percentC: rowData.percentC ?? '',
    materialType: rowData.materialType ?? '',
    manufacturer: rowData.manufacturer ?? '',
    region: rowData.region ?? '',
    vehicle: rowData.vehicle ?? '',
    materialKind: rowData.materialKind ?? ''
  };
  return updatePercentages(row);
}

function applyRowsToTable(rows) {
  data = reindexRows(rows);
  if (table) {
    table.setData(data);
    updateSummary();
  }
}

function stopProductionRealtimeListener() {
  if (productionUnsubscribe) {
    productionUnsubscribe();
    productionUnsubscribe = null;
  }
}

async function startProductionRealtimeListener() {
  stopProductionRealtimeListener();
  const authUser = await waitForAuth();
  if (!authUser) {
    return;
  }

  console.log('Current User:', authUser);
  console.log('UID:', authUser?.uid);
  console.log('Current Role:', currentRole);

  const productionRef = collection(db, 'production');
  const productionQuery = query(productionRef, orderBy('createdAt', 'asc'));
  console.log('[Firestore] onSnapshot', productionQuery);

  productionUnsubscribe = onSnapshot(productionQuery, (snapshot) => {
    const rows = snapshot.docs.map((docItem, index) => mapDocToRow(docItem, index));
    applyRowsToTable(rows);
  }, (error) => {
    console.error('[Firestore] onSnapshot failed', error);
    showToast(error.message || 'Không thể kết nối dữ liệu thời gian thực.', 'error');
  });
}

// Tải toàn bộ dữ liệu sản xuất chung từ Firestore vào bảng.
async function loadProductionData() {
  try {
    await startProductionRealtimeListener();
    updateSummary();
  } catch (error) {
    console.error('[Firestore] loadProductionData failed', error);
    showToast(error.message || 'Không thể tải dữ liệu.', 'error');
  }
}

// Phiên bản cũ giữ lại để tránh lỗi nếu cần tham khảo.
async function legacyLoadProductionData() {
  try {
    startProductionRealtimeListener();
    data = reindexRows(sortRowsByCreatedAt(snapshot.docs.map((docItem, index) => {
      const row = {
        id: docItem.id,
        firestoreId: docItem.id,
        stt: index + 1,
        createdAt: docItem.data().createdAt || null,
        productionDate: docItem.data().productionDate || '',
        lot: docItem.data().lot || '',
        type: docItem.data().type || 'RI',
        kgA: docItem.data().kgA ?? '',
        percentA: docItem.data().percentA ?? '',
        kgB: docItem.data().kgB ?? '',
        percentB: docItem.data().percentB ?? '',
        kgC: docItem.data().kgC ?? '',
        percentC: docItem.data().percentC ?? '',
        percentCNoSeed: docItem.data().percentCNoSeed ?? '',
        materialType: docItem.data().materialType ?? '',
        manufacturer: docItem.data().manufacturer ?? '',
        region: docItem.data().region ?? '',
        vehicle: docItem.data().vehicle ?? '',
        materialKind: docItem.data().materialKind ?? ''
      };
      return updatePercentages(row);
    })).map((row, index) => ({ ...row, stt: index + 1 })));
    table.setData(data);
    updateSummary();
  } catch (error) {
    showToast(error.message || 'Không thể tải dữ liệu.', 'error');
  }
}

async function ensureAdminCanWrite(actionLabel = 'thêm và đồng bộ dữ liệu') {
  const authUser = await waitForAuth();
  currentUser = authUser;

  if (authUser) {
    return true;
  }

  showToast(`Bạn cần đăng nhập để ${actionLabel}.`, 'info');
  return false;
}

// Thêm một dòng trống cục bộ để người dùng điền thông tin.
async function addNewRow() {
  if (!(await ensureAdminCanWrite('thêm dòng'))) {
    return;
  }

  const user = await ensureUserDocument();
  const newRow = {
    id: `${user.uid}-${Date.now()}`,
    stt: data.length + 1,
    productionDate: '',
    lot: '',
    type: 'RI',
    kgA: '',
    percentA: '',
    kgB: '',
    percentB: '',
    kgC: '',
    percentC: '',
    percentCNoSeed: '',
    materialType: '',
    manufacturer: '',
    region: '',
    vehicle: '',
    materialKind: ''
  };
  updatePercentages(newRow);
  data = reindexRows([...data, newRow]);
  table.setData(data);
  updateSummary();
}

// Tạo một dòng dữ liệu từ form nhập nhanh và lưu lại.
async function addQuickEntry() {
  if (!(await ensureAdminCanWrite('thêm thông tin'))) {
    return;
  }

  const generatedLot = generateLot({
    materialType: quickMaterialKind.value,
    manufacturer: quickManufacturer.value,
    region: quickRegion.value,
    productionDate: quickProductionDate.value,
    vehicle: quickVehicle.value,
    materialKind: quickMaterialKind.value
  });

  const lot = (quickLot.value || generatedLot).trim();
  if (!lot) {
    showToast('Vui lòng nhập đủ thông tin để tạo Lot.', 'error');
    return;
  }

  const newRow = {
    id: `${Date.now()}`,
    stt: data.length + 1,
    productionDate: quickProductionDate.value,
    lot,
    type: quickType.value,
    kgA: quickKgA.value || '',
    kgB: quickKgB.value || '',
    kgC: quickKgC.value || '',
    kgCNoSeed: quickKgCNoSeed.value || '',
    percentA: '',
    percentB: '',
    percentC: '',
    percentCNoSeed: '',
    materialType: quickMaterialKind.value,
    manufacturer: quickManufacturer.value,
    region: quickRegion.value,
    vehicle: quickVehicle.value,
    materialKind: quickMaterialKind.value
  };

  updatePercentages(newRow);
  data = reindexRows([...data, newRow]);
  table.setData(data);
  quickLot.value = '';
  quickProductionDate.value = '';
  quickManufacturer.value = '';
  quickRegion.value = '';
  quickVehicle.value = '';
  quickKgA.value = '';
  quickKgB.value = '';
  quickKgC.value = '';
  quickKgCNoSeed.value = '';
  quickType.value = '';
  quickMaterialKind.value = '';
  updateSummary();
  autoSave();
}

// Ẩn/hiện nút xóa dựa trên vai trò hiện tại của người dùng.
function updateRoleAccess() {
  const isAdmin = currentRole === 'admin';
  if (deleteRowBtn) {
    deleteRowBtn.disabled = !isAdmin;
    deleteRowBtn.classList.toggle('d-none', !isAdmin);
    deleteRowBtn.title = isAdmin ? 'Xóa dòng đã chọn' : 'Chỉ admin mới có quyền xóa';
  }

  if (saveBtn) {
    saveBtn.disabled = !canEditProductionRows(currentUser, currentRole);
  }
}

// Xóa các dòng được chọn khỏi bảng và khỏi Firestore nếu cần.
function removeSelectedRows() {
  if (!canDeleteProductionRows(currentRole)) {
    showToast('Bạn chỉ có thể nhập dữ liệu, không được xóa.', 'info');
    return;
  }

  const selected = table.getSelectedRows();
  if (!selected.length) {
    showToast('Vui lòng chọn dòng để xóa.', 'info');
    return;
  }

  selected.forEach(async (row) => {
    if (row.getData().firestoreId) {
      const deleteRef = doc(db, 'production', row.getData().firestoreId);
      console.log('[Firestore] deleteDoc', deleteRef.path);
      await deleteDoc(deleteRef);
    }
    table.deleteRow(row.getIndex());
  });
  data = reindexRows(table.getData());
  table.setData(data);
  updateSummary();
}

// Lưu toàn bộ dòng dữ liệu trong bảng lên collection Firestore chung.
async function saveAllRows() {
  if (isSaving) return;

  if (!(await ensureAdminCanWrite('đồng bộ dữ liệu'))) {
  await waitForAuth();
  if (!currentUser) {
    showToast('Bạn cần đăng nhập để lưu dữ liệu.', 'info');
    return;
  }

  isSaving = true;
  showLoading();
  try {
    const rows = table.getData();
    const existingIds = new Set(rows.filter((row) => row.firestoreId).map((row) => row.firestoreId));
    const updatedIds = new Set(existingIds);

    const savePromises = rows.map(async (row) => {
      if (!row.lot || !row.productionDate || !row.type) return;

      const payload = {
        productionDate: normalizeDateValue(row.productionDate),
        lot: row.lot,
        type: row.type,
        kgA: Number(row.kgA || 0),
        percentA: Number(parsePercent(row.percentA) || 0),
        kgB: Number(row.kgB || 0),
        percentB: Number(parsePercent(row.percentB) || 0),
        kgC: Number(row.kgC || 0),
        percentC: Number(parsePercent(row.percentC) || 0),
        kgCNoSeed: Number(row.kgCNoSeed || 0),
        percentCNoSeed: Number(parsePercent(row.percentCNoSeed) || 0),
        materialType: row.materialType || '',
        manufacturer: row.manufacturer || '',
        region: row.region || '',
        vehicle: row.vehicle || '',
        materialKind: row.materialKind || '',
        createdAt: row.createdAt ? row.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docId = row.firestoreId || row.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const docRef = doc(db, 'production', docId);
      console.log('[Firestore] setDoc', docRef.path);
      await setDoc(docRef, payload, { merge: true });
      row.firestoreId = docId;
      row.id = docId;
      row.createdAt = payload.createdAt;
      updatedIds.add(docId);
    });

    await Promise.all(savePromises);

    const productionCollection = collection(db, 'production');
    console.log('[Firestore] getDocs', productionCollection.path);
    const docs = await getDocs(productionCollection);
    const deletePromises = docs.docs
      .filter((docItem) => !updatedIds.has(docItem.id))
      .map((docItem) => deleteDoc(doc(db, 'production', docItem.id)));

    await Promise.all(deletePromises);

    showToast('Đã lưu dữ liệu thành công.', 'success');
  } catch (error) {
    showToast(error.message || 'Không thể lưu dữ liệu.', 'error');
  } finally {
    isSaving = false;
    hideLoading();
  }
}

// Cập nhật các chỉ số tổng ở cuối trang.
function updateSummary() {
  const rows = table ? table.getData() : [];
  const numeric = rows.map((row) => ({
    kgA: Number(row.kgA || 0),
    kgB: Number(row.kgB || 0),
    kgC: Number(row.kgC || 0)
  }));
  summaryRows.textContent = rows.length;
  summaryA.textContent = numeric.reduce((sum, row) => sum + row.kgA, 0).toFixed(2);
  summaryB.textContent = numeric.reduce((sum, row) => sum + row.kgB, 0).toFixed(2);
  summaryC.textContent = numeric.reduce((sum, row) => sum + row.kgC, 0).toFixed(2);
  summaryCNoSeed.textContent = numeric.reduce((sum, row) => sum + Number(row.kgCNoSeed || 0), 0).toFixed(2);
}

// Kích hoạt tự động lưu sau khi bảng thay đổi.
function autoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveAllRows();
  }, 1500);
}

// Escape các giá trị để ghi an toàn vào file CSV.
function escapeCsv(value) {
  const stringValue = `${value ?? ''}`;
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

// Xuất các dòng hiện tại của bảng ra file CSV.
function exportToCsv() {
  const rows = table.getData();
  const header = ['STT', 'Ngày sản xuất', 'Lot', 'RI/DO', 'kg BTP A', '% BTP A', 'kg BTP B', '% BTP B', 'kg BTP C', '% BTP C', 'kg BTP C Không hạt', '% BTP C Không hạt'];
  const lines = [header.join(',')];

  rows.forEach((row) => {
    const values = [
      row.stt || '',
      normalizeDateValue(row.productionDate),
      row.lot || '',
      row.type || '',
      row.kgA || '',
      row.percentA || '',
      row.kgB || '',
      row.percentB || '',
      row.kgC || '',
      row.percentC || '',
      row.kgCNoSeed || '',
      row.percentCNoSeed || ''
    ];
    lines.push(values.map(escapeCsv).join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'production-data.csv';
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('Đã xuất CSV.', 'success');
}

// Nhập dữ liệu từ file CSV vào bảng.
async function importFromCsv() {
  if (!(await ensureAdminCanWrite('nhập dữ liệu'))) {
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = text.trim().split(/\r?\n/).filter(Boolean);
    if (rows.length < 2) {
      showToast('File không hợp lệ.', 'error');
      return;
    }

    const dataRows = rows.slice(1).map((rowLine) => {
      const values = rowLine.split(',');
      return {
        stt: '',
        productionDate: values[1] || '',
        lot: values[2] || '',
        type: values[3] || 'RI',
        kgA: values[4] || '',
        percentA: values[5] || '',
        kgB: values[6] || '',
        percentB: values[7] || '',
        kgC: values[8] || '',
        percentC: values[9] || '',
        percentCNoSeed: values[10] || ''
      };
    });

    table.setData(dataRows);
    updateSummary();
    showToast('Đã nhập dữ liệu từ CSV.', 'success');
  };
  input.click();
}

// Gắn các nút và ô nhập trên giao diện với hàm xử lý tương ứng.
function renderCategorySelects() {
  const manufacturerOptions = getSettingOptions(settingsState, SETTING_KEYS.nhaCungCap).length
    ? getSettingOptions(settingsState, SETTING_KEYS.nhaCungCap)
    : [{ ma: '009', ten: 'CTBT' }];
  const regionOptions = getSettingOptions(settingsState, SETTING_KEYS.vungNguyenLieu).length
    ? getSettingOptions(settingsState, SETTING_KEYS.vungNguyenLieu)
    : [{ ma: 'DL', ten: 'Đắk Lắk' }];
  const materialKindOptions = getSettingOptions(settingsState, SETTING_KEYS.loaiNguyenLieu).length
    ? getSettingOptions(settingsState, SETTING_KEYS.loaiNguyenLieu)
    : [{ ma: 'M', ten: 'Múi' }, { ma: 'TA', ten: 'Trái' }, { ma: 'K', ten: 'Kem' }];
  const typeOptions = getSettingOptions(settingsState, SETTING_KEYS.loaiSanPham).length
    ? getSettingOptions(settingsState, SETTING_KEYS.loaiSanPham)
    : [{ ma: 'RI', ten: 'RI' }, { ma: 'DO', ten: 'DO' }];

  const buildOptions = (options, selectedValue = '') => options.map((item) => {
    const value = item.ma;
    const label = `${item.ma} - ${item.ten}`;
    const isSelected = value === selectedValue;
    return `<option value="${value}" ${isSelected ? 'selected' : ''}>${label}</option>`;
  }).join('');

  quickManufacturer.innerHTML = `<option value="">-- Chọn NCC --</option>${buildOptions(manufacturerOptions, quickManufacturer.value)}`;
  quickRegion.innerHTML = `<option value="">-- Chọn vùng --</option>${buildOptions(regionOptions, quickRegion.value)}`;
  quickMaterialKind.innerHTML = `<option value="">-- Chọn loại --</option>${buildOptions(materialKindOptions, quickMaterialKind.value)}`;
  quickType.innerHTML = `<option value="">-- Chọn loại sản phẩm --</option>${buildOptions(typeOptions, quickType.value)}`;
}

function bindEvents() {
  [quickManufacturer, quickRegion, quickProductionDate, quickVehicle, quickMaterialKind, quickType].forEach((element) => {
    element.addEventListener('input', updateQuickLot);
    element.addEventListener('change', updateQuickLot);
  });

  quickAddBtn.addEventListener('click', addQuickEntry);
  deleteRowBtn.addEventListener('click', () => {
    if (!canDeleteProductionRows(currentRole)) {
      showToast('Bạn chỉ có thể nhập dữ liệu, không được xóa.', 'info');
      return;
    }
    removeSelectedRows();
  });
  refreshBtn.addEventListener('click', () => {
    startProductionRealtimeListener();
  });
  importBtn.addEventListener('click', importFromCsv);
  exportBtn.addEventListener('click', exportToCsv);
  saveBtn.addEventListener('click', saveAllRows);
}

async function startSettingsSync() {
  if (stopSettingsListener) {
    stopSettingsListener();
  }

  await ensureDefaultSettings();
  stopSettingsListener = listenToSettings((state) => {
    settingsState = state;
    renderCategorySelects();
    if (table) {
      const options = getSettingOptions(settingsState, SETTING_KEYS.loaiSanPham).map((item) => item.ma);
      const currentType = table.getColumn('type');
      if (currentType) {
        currentType.updateDefinition({ editorParams: { values: options }, headerFilterParams: { values: options } });
      }
    }
  });
}

// Điểm khởi đầu: khởi tạo bảng, gắn sự kiện và tải dữ liệu chung.
(async function init() {
  initTable();
  bindEvents();
  await startSettingsSync();
  window.addEventListener('beforeunload', stopProductionRealtimeListener);

  watchAuthState(async (user) => {
    if (!user) {
      currentUser = null;
      currentRole = 'staff';
      updateRoleAccess();
      stopProductionRealtimeListener();
      await loadProductionData();
      return;
    }

    if (currentUser?.uid === user.uid) {
      return;
    }

    currentUser = user;
    try {
      await waitForAuth();
      const profile = await getUserProfile(user.uid);
      currentRole = resolveInitialRole(user.email, profile?.role);
      updateRoleAccess();
      await loadProductionData();
    } catch (error) {
      console.error('[Auth] watchAuthState failed', error);
      showToast(error.message || 'Không thể tải dữ liệu.', 'error');
    }
  });

  try {
    const authUser = await waitForAuth();
    currentUser = authUser;
    const profile = await getUserProfile(authUser.uid);
    currentRole = resolveInitialRole(authUser.email, profile?.role);
    updateRoleAccess();
    await loadProductionData();
  } catch (error) {
    console.error('[Auth] init failed', error);
    showToast(error.message || 'Không thể kết nối dữ liệu.', 'error');
    await loadProductionData();
  }
})();
