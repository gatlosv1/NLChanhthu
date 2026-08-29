// Nhập các hàm liên quan đến auth, Firestore và UI helper.
import { getCurrentUser, watchAuthState, waitForAuth } from './auth.js?v=20260804-8';
// Kết nối tới Firestore trong Firebase.
import { db } from './firebase.js?v=20260804-8';
// Lấy thông tin hồ sơ người dùng từ Firestore.
import { getUserProfile } from './firestore.js';
// Xác định vai trò admin/staff dựa trên email hoặc hồ sơ.
import { resolveInitialRole } from './roleUtils.js';
import { requirePageAccess } from './pageAccess.js';
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
import { buildProductionPayload, canPersistProductionRow, normalizeProductionRowForPersistence } from './productionDataUtils.mjs?v=20260804-8';
import { logActivity } from './activityLog.js';

// Lấy các phần tử DOM từ HTML để code có thể thao tác với form, bảng và nút bấm.
const tableEl = document.getElementById('productionTable');
const quickManufacturer = document.getElementById('quickManufacturer');
const quickRegion = document.getElementById('quickRegion');
const quickWarehouse = document.getElementById('quickWarehouse');
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
const realtimeClock = document.getElementById('realtimeClock');
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
const readonlyColumn = (title, field, width, options = {}) => ({ title, field, width, ...options });
const columns = [
  readonlyColumn('STT', 'stt', 55, { frozen: true, editor: false, editable: false, formatter: (cell) => {
    const value = cell.getValue();
    return value === null || value === undefined || value === '' ? '' : value;
  } }),
  readonlyColumn('Ngày sản xuất', 'productionDate', 110, { frozen: true, editor: 'date', editorParams: { format: 'dd/MM/yyyy' }, sorter: 'date', validator: ['required'], editable: () => canEditProductionRows(currentUser, currentRole), headerFilter: 'input', headerFilterPlaceholder: 'Lọc ngày', headerFilterLiveFilter: true }),
  readonlyColumn('Lot', 'lot', 160, { frozen: true, editor: 'input', validator: ['required'], editable: () => canEditProductionRows(currentUser, currentRole), headerFilter: 'input', headerFilterPlaceholder: 'Lọc lot', headerFilterLiveFilter: true }),
  readonlyColumn('Kho', 'warehouse', 100, { editor: 'input', editable: () => canEditProductionRows(currentUser, currentRole), headerFilter: 'input', headerFilterPlaceholder: 'Lọc kho', headerFilterLiveFilter: true }),
  readonlyColumn('RI/DO', 'type', 75, { editor: 'select', editorParams: { values: [] }, validator: ['required'], editable: () => canEditProductionRows(currentUser, currentRole), headerFilter: 'select', headerFilterParams: { values: [] }, headerFilterPlaceholder: 'Lọc' }),
  readonlyColumn('kg', 'kgA', 85, { editor: 'number', editorParams: { min: 0, step: 0.01 }, editable: () => canEditProductionRows(currentUser, currentRole) }),
  readonlyColumn('%', 'percentA', 75, { editor: false, formatter: percentFormatter, editable: false }),
  readonlyColumn('kg', 'kgB', 85, { editor: 'number', editorParams: { min: 0, step: 0.01 }, editable: () => canEditProductionRows(currentUser, currentRole) }),
  readonlyColumn('%', 'percentB', 75, { editor: false, formatter: percentFormatter, editable: false }),
  readonlyColumn('kg', 'kgC', 85, { editor: 'number', editorParams: { min: 0, step: 0.01 }, editable: () => canEditProductionRows(currentUser, currentRole) }),
  readonlyColumn('%', 'percentC', 75, { editor: false, formatter: percentFormatter, editable: false }),
  readonlyColumn('kg', 'kgCNoSeed', 85, { editor: 'number', editorParams: { min: 0, step: 0.01 }, editable: () => canEditProductionRows(currentUser, currentRole) }),
  readonlyColumn('%', 'percentCNoSeed', 75, { editor: false, formatter: percentFormatter, editable: false }),
  readonlyColumn('Ngày giờ', 'createdDateTime', 145, { editor: false, editable: false })
];
const groupedColumns = [
  columns[0],
  { title: 'Thông tin sản xuất', columns: columns.slice(1, 5) },
  { title: 'BTP A', columns: columns.slice(5, 7) },
  { title: 'BTP B', columns: columns.slice(7, 9) },
  { title: 'BTP C', columns: columns.slice(9, 11) },
  { title: 'BTP C không hạt', columns: columns.slice(11, 13) },
  columns[13]
];

// Định dạng giá trị phần trăm để hiển thị trong bảng.
function percentFormatter(cell) {
  const value = cell.getValue();
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return value;
  return `${numeric.toFixed(2)}%`;
}

// Khởi tạo bảng Tabulator và gắn các sự kiện cho bảng.
function initTable() {
  const options = getSettingOptions(settingsState, SETTING_KEYS.loaiSanPham).map((item) => item.ma);
  const typeColumnIndex = columns.findIndex((column) => column.field === 'type');
  if (typeColumnIndex >= 0) {
    columns[typeColumnIndex].editorParams.values = options;
    columns[typeColumnIndex].headerFilterParams.values = options;
  }

  if (!tableEl) {
    console.warn('[Production] Table container not found; skipping Tabulator init');
    return;
  }

  try {
    table = new Tabulator(tableEl, {
      data: [],
      columns: groupedColumns,
      layout: 'fitData',
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
      if (['kgA', 'kgB', 'kgC', 'kgCNoSeed'].includes(field)) {
        const rowData = cell.getRow().getData();
        const beforeValue = cell.getOldValue();
        updatePercentages(rowData);
        cell.getRow().update(rowData);
        logActivity({
          action: 'edit',
          page: 'production',
          detail: `Sửa ${field} của lot ${rowData.lot || '-'}`,
          changes: {
            [field]: { before: beforeValue, after: rowData[field] }
          }
        });
      }
    });

    table.on('tableBuilt', () => {
      table.setData([]);
    });
  } catch (error) {
    console.error('[Production] Tabulator init failed', error);
    const errorMessage = document.createElement('div');
    errorMessage.className = 'text-muted p-3';
    errorMessage.textContent = 'Bảng dữ liệu không thể khởi tạo. Bạn vẫn có thể thêm dòng bằng form nhập nhanh.';
    tableEl.replaceChildren(errorMessage);
  }
}

// Chuẩn hóa một dòng dữ liệu trước khi chèn vào bảng hoặc lưu xuống Firestore.
function normalizeRow(row, index) {
  const normalizedSource = normalizeProductionRowForPersistence(row);
  const normalized = {
    id: normalizedSource.id || `${Date.now()}-${index}`,
    firestoreId: normalizedSource.firestoreId || '',
    stt: normalizedSource.stt ?? index + 1,
    productionDate: normalizedSource.productionDate || '',
    lot: normalizedSource.lot || '',
    type: normalizedSource.type || 'RI',
    kgA: normalizedSource.kgA ?? '',
    percentA: normalizedSource.percentA ?? '',
    kgB: normalizedSource.kgB ?? '',
    percentB: normalizedSource.percentB ?? '',
    kgC: normalizedSource.kgC ?? '',
    kgCNoSeed: normalizedSource.kgCNoSeed ?? '',
    percentC: normalizedSource.percentC ?? '',
    percentCNoSeed: normalizedSource.percentCNoSeed ?? '',
    materialType: normalizedSource.materialType ?? '',
    manufacturer: normalizedSource.manufacturer ?? '',
    region: normalizedSource.region ?? '',
    warehouse: normalizedSource.warehouse || '',
    vehicle: normalizedSource.vehicle ?? '',
    materialKind: normalizedSource.materialKind ?? ''
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
function generateLot({ materialType, manufacturer, region, productionDate, warehouse, materialKind, type }) {
  if (!materialType || !manufacturer || !region || !productionDate || !warehouse || !materialKind) return '';

  const dateObj = new Date(productionDate);
  if (Number.isNaN(dateObj.getTime())) return '';

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yearSuffix = getYearSuffix(dateObj.getFullYear());
  const manufacturerCode = String(manufacturer).trim().padStart(3, '0');
  const regionCode = String(region).trim().toUpperCase();
  const warehouseCode = String(warehouse).trim().toUpperCase();
  const materialCode = String(materialKind).trim().toUpperCase();
  const lotTypePrefix = String(type || '').trim().toUpperCase() === 'DO' ? 'D' : 'R';

  return `${lotTypePrefix}${materialType}${manufacturerCode}${regionCode}${day}${month}${yearSuffix}-${warehouseCode}-${materialCode}`;
}

// Tự động điền ô Lot dựa trên các thông tin nhập nhanh.
function updateQuickLot() {
  const lot = generateLot({
    materialType: quickMaterialKind.value,
    manufacturer: quickManufacturer.value,
    region: quickRegion.value,
    warehouse: quickWarehouse.value,
    materialKind: quickMaterialKind.value,
    type: quickType.value
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

function getDefaultProductionDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    createdDateTime: formatDateTimeForDisplay(rowData.createdAt),
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
    warehouse: rowData.warehouse ?? '',
    materialKind: rowData.materialKind ?? ''
  };
  return updatePercentages(row);
}

function formatDateTimeForDisplay(value) {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
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
        warehouse: docItem.data().warehouse ?? '',
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
    productionDate: getDefaultProductionDate(),
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
    warehouse: '',
    materialKind: ''
  };
  updatePercentages(newRow);
  data = reindexRows([...data, newRow]);
  table.setData(data);
  updateSummary();
  logActivity({ action: 'delete', page: 'production', detail: `Xóa ${selected.length} dòng sản xuất` });
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
    productionDate: getDefaultProductionDate(),
    warehouse: quickWarehouse.value,
    materialKind: quickMaterialKind.value,
    type: quickType.value
  });

  const normalizedRow = normalizeProductionRowForPersistence({
    lot: quickLot.value,
    type: quickType.value,
    productionDate: getDefaultProductionDate(),
    warehouse: quickWarehouse.value
  });

  if (!canPersistProductionRow(normalizedRow)) {
    showToast('Vui lòng nhập Lot và loại sản phẩm trước khi thêm dòng.', 'error');
    return;
  }

  const newRow = {
    id: `${Date.now()}`,
    stt: data.length + 1,
    productionDate: getDefaultProductionDate(),
    lot: normalizedRow.lot,
    type: normalizedRow.type,
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
    warehouse: quickWarehouse.value,
    materialKind: quickMaterialKind.value
  };

  updatePercentages(newRow);
  data = reindexRows([...data, newRow]);
  table.setData(data);
  quickLot.value = '';
  quickManufacturer.value = '';
  quickRegion.value = '';
  quickWarehouse.value = '';
  quickKgA.value = '';
  quickKgB.value = '';
  quickKgC.value = '';
  quickKgCNoSeed.value = '';
  quickType.value = '';
  quickMaterialKind.value = '';
  updateSummary();
  autoSave();
  logActivity({ action: 'add', page: 'production', detail: `Thêm lot ${newRow.lot || '-'}` });
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

  const authUser = await waitForAuth();
  currentUser = authUser;
  if (!authUser) {
    showToast('Bạn cần đăng nhập để lưu dữ liệu.', 'info');
    return;
  }

  await ensureUserDocument();
  isSaving = true;
  showLoading();
  try {
    const rows = table.getData();
    const existingIds = new Set(rows.filter((row) => row.firestoreId).map((row) => row.firestoreId));
    const updatedIds = new Set(existingIds);

    const savePromises = rows.map(async (row) => {
      const normalizedRow = normalizeProductionRowForPersistence(row);
      if (!canPersistProductionRow(normalizedRow)) return;

      const payload = {
        ...buildProductionPayload({
          ...normalizedRow,
          kgA: row.kgA,
          percentA: row.percentA,
          kgB: row.kgB,
          percentB: row.percentB,
          kgC: row.kgC,
          percentC: row.percentC,
          kgCNoSeed: row.kgCNoSeed,
          percentCNoSeed: row.percentCNoSeed
        }, authUser.uid),
        productionDate: normalizeDateValue(normalizedRow.productionDate) || getDefaultProductionDate(),
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
    logActivity({ action: 'save', page: 'production', detail: `Lưu ${rows.length} dòng sản xuất` });
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
  const header = ['STT', 'Ngày sản xuất', 'Lot', 'Kho', 'RI/DO', 'kg BTP A', '% BTP A', 'kg BTP B', '% BTP B', 'kg BTP C', '% BTP C', 'kg BTP C Không hạt', '% BTP C Không hạt', 'Ngày giờ'];
  const lines = [header.join(',')];

  rows.forEach((row) => {
    const values = [
      row.stt || '',
      normalizeDateValue(row.productionDate),
      row.lot || '',
      row.warehouse || '',
      row.type || '',
      row.kgA || '',
      row.percentA || '',
      row.kgB || '',
      row.percentB || '',
      row.kgC || '',
      row.percentC || '',
      row.kgCNoSeed || '',
      row.percentCNoSeed || '',
      row.createdDateTime || ''
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
  logActivity({ action: 'export', page: 'production', detail: `Xuất ${rows.length} dòng CSV` });
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
        warehouse: values[3] || '',
        type: values[4] || 'RI',
        kgA: values[5] || '',
        percentA: values[6] || '',
        kgB: values[7] || '',
        percentB: values[8] || '',
        kgC: values[9] || '',
        percentC: values[10] || '',
        percentCNoSeed: values[11] || ''
      };
    });

    table.setData(dataRows);
    updateSummary();
    showToast('Đã nhập dữ liệu từ CSV.', 'success');
    logActivity({ action: 'import', page: 'production', detail: `Nhập ${dataRows.length} dòng CSV` });
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

  const renderOptions = (select, placeholder, options) => {
    const selectedValue = select.value;
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder;
    const optionElements = options.map((item) => {
      const option = document.createElement('option');
      option.value = item.ma;
      option.textContent = `${item.ma} - ${item.ten}`;
      option.selected = item.ma === selectedValue;
      return option;
    });
    select.replaceChildren(placeholderOption, ...optionElements);
  };

  renderOptions(quickManufacturer, '-- Chọn NCC --', manufacturerOptions);
  renderOptions(quickRegion, '-- Chọn vùng --', regionOptions);
  renderOptions(quickMaterialKind, '-- Chọn loại --', materialKindOptions);
  renderOptions(quickType, '-- Chọn loại sản phẩm --', typeOptions);
}

function updateRealtimeClock() {
  if (!realtimeClock) return;
  const now = new Date();
  const value = now.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  realtimeClock.textContent = value;
}

function bindEvents() {
  [quickManufacturer, quickRegion, quickWarehouse, quickMaterialKind, quickType].forEach((element) => {
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

function bindSettingsSyncEvents() {
  window.addEventListener('catalog-updated', () => {
    startSettingsSync();
  });

  window.addEventListener('storage', (event) => {
    if (event.key === 'catalog-sync') {
      startSettingsSync();
    }
  });
}

// Điểm khởi đầu: khởi tạo bảng, gắn sự kiện và tải dữ liệu chung.
(async function init() {
  initTable();
  bindEvents();
  updateRealtimeClock();
  setInterval(updateRealtimeClock, 1000);
  bindSettingsSyncEvents();
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
      const access = await requirePageAccess(user, 'production');
      const profile = access.profile;
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
    const access = await requirePageAccess(authUser, 'production');
    const profile = access.profile;
    currentRole = resolveInitialRole(authUser.email, profile?.role);
    updateRoleAccess();
    await loadProductionData();
  } catch (error) {
    console.error('[Auth] init failed', error);
    showToast(error.message || 'Không thể kết nối dữ liệu.', 'error');
    await loadProductionData();
  }
})();