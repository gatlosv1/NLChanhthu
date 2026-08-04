import { getCurrentUser, watchAuthState, loginAnonymously } from './auth.js?v=20260804-3';
import { db } from './firebase.js?v=20260804-3';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  doc,
  serverTimestamp,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { hideLoading, showLoading, showToast } from './utils.js?v=20260804-3';

const tableEl = document.getElementById('productionTable');
const quickMaterialType = document.getElementById('quickMaterialType');
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

let table;
let data = [];
let unsubscribe = null;
let saveTimer = null;
let currentUser = null;
let authReadyPromise = null;
let isSaving = false;

const columns = [
  { title: 'STT', field: 'stt', width: 70, frozen: true, editor: false, formatter: (cell) => cell.getValue() || '' },
  { title: 'Ngày sản xuất', field: 'productionDate', width: 140, editor: 'date', editorParams: { format: 'dd/MM/yyyy' }, sorter: 'date', validator: ['required'] },
  { title: 'Lot', field: 'lot', width: 180, editor: 'input', validator: ['required'] },
  { title: 'RI/DO', field: 'type', width: 100, editor: 'select', editorParams: { values: ['RI', 'DO'] }, validator: ['required'] },
  { title: 'kg BTP A', field: 'kgA', width: 120, editor: 'number', editorParams: { min: 0, step: 0.01 } },
  { title: '% BTP A', field: 'percentA', width: 120, editor: false, formatter: percentFormatter },
  { title: 'kg BTP B', field: 'kgB', width: 120, editor: 'number', editorParams: { min: 0, step: 0.01 } },
  { title: '% BTP B', field: 'percentB', width: 120, editor: false, formatter: percentFormatter },
  { title: 'kg BTP C', field: 'kgC', width: 120, editor: 'number', editorParams: { min: 0, step: 0.01 } },
  { title: '% BTP C', field: 'percentC', width: 120, editor: false, formatter: percentFormatter }
];

function percentFormatter(cell) {
  const value = cell.getValue();
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return value;
  return `${numeric}%`;
}

function initTable() {
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
        action: () => removeSelectedRows()
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
    keybindings: {
      enter: 'navigateDown',
      shiftEnter: 'navigateUp',
      tab: 'navigateRight',
      delete: 'deleteTable',
      ctrlKey: true
    },
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
}

function normalizeRow(row, index) {
  const normalized = {
    id: row.id || `${Date.now()}-${index}`,
    firestoreId: row.firestoreId || '',
    stt: index + 1,
    productionDate: row.productionDate || '',
    lot: row.lot || '',
    type: row.type || 'RI',
    kgA: row.kgA ?? '',
    percentA: row.percentA ?? '',
    kgB: row.kgB ?? '',
    percentB: row.percentB ?? '',
    kgC: row.kgC ?? '',
    percentC: row.percentC ?? '',
    materialType: row.materialType ?? '',
    manufacturer: row.manufacturer ?? '',
    region: row.region ?? '',
    vehicle: row.vehicle ?? '',
    materialKind: row.materialKind ?? ''
  };
  updatePercentages(normalized);
  return normalized;
}

function formatDateForDisplay(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function getYearSuffix(year) {
  const suffix = String(year).slice(-1);
  return suffix;
}

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

function updateQuickLot() {
  const lot = generateLot({
    materialType: quickMaterialType.value,
    manufacturer: quickManufacturer.value,
    region: quickRegion.value,
    productionDate: quickProductionDate.value,
    vehicle: quickVehicle.value,
    materialKind: quickMaterialKind.value
  });
  quickLot.value = lot;
}

function parsePercent(value) {
  if (value === null || value === undefined || value === '') return '';
  const stringValue = String(value).trim();
  if (stringValue.endsWith('%')) return stringValue.replace('%', '');
  return stringValue;
}

function updatePercentages(rowData) {
  const total = Number(rowData.kgA || 0) + Number(rowData.kgB || 0) + Number(rowData.kgC || 0);
  if (total > 0) {
    rowData.percentA = ((Number(rowData.kgA || 0) / total) * 100).toFixed(2);
    rowData.percentB = ((Number(rowData.kgB || 0) / total) * 100).toFixed(2);
    rowData.percentC = ((Number(rowData.kgC || 0) / total) * 100).toFixed(2);
  } else {
    rowData.percentA = '';
    rowData.percentB = '';
    rowData.percentC = '';
  }
  return rowData;
}

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

function formatPercentValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return value;
  return `${numeric}%`;
}

async function waitForAuth() {
  if (authReadyPromise) return authReadyPromise;

  authReadyPromise = (async () => {
    const existingUser = getCurrentUser();
    if (existingUser) {
      currentUser = existingUser;
      return existingUser;
    }

    const authUser = await new Promise((resolve) => {
      const unsubscribeAuth = watchAuthState((user) => {
        unsubscribeAuth();
        resolve(user);
      });
    });

    if (authUser) {
      currentUser = authUser;
      return authUser;
    }

    const anonymousUser = await loginAnonymously();
    currentUser = anonymousUser.user;
    return anonymousUser.user;
  })();

  return authReadyPromise;
}

async function ensureUserDocument() {
  if (currentUser) return currentUser;
  const user = await waitForAuth();
  if (!user) throw new Error('Bạn chưa đăng nhập.');
  currentUser = user;
  return user;
}

function sortRowsByCreatedAt(rows) {
  return [...rows].sort((a, b) => {
    const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
    const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    return aTime - bTime;
  });
}

async function loadProductionData() {
  const user = await ensureUserDocument();
  try {
    const q = query(collection(db, 'production'), where('createdBy', '==', user.uid));
    const snapshot = await getDocs(q);
    data = sortRowsByCreatedAt(snapshot.docs.map((docItem, index) => {
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
        materialType: docItem.data().materialType ?? '',
        manufacturer: docItem.data().manufacturer ?? '',
        region: docItem.data().region ?? '',
        vehicle: docItem.data().vehicle ?? '',
        materialKind: docItem.data().materialKind ?? ''
      };
      return updatePercentages(row);
    })).map((row, index) => ({ ...row, stt: index + 1 }));
    table.setData(data);
    updateSummary();
  } catch (error) {
    showToast(error.message || 'Không thể tải dữ liệu.', 'error');
  }
}

async function addNewRow() {
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
    materialType: '',
    manufacturer: '',
    region: '',
    vehicle: '',
    materialKind: ''
  };
  updatePercentages(newRow);
  table.addRow(newRow);
  updateSummary();
}

function addQuickEntry() {
  const generatedLot = generateLot({
    materialType: quickMaterialType.value,
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
    percentA: '',
    percentB: '',
    percentC: '',
    materialType: quickMaterialType.value,
    manufacturer: quickManufacturer.value,
    region: quickRegion.value,
    vehicle: quickVehicle.value,
    materialKind: quickMaterialKind.value
  };

  updatePercentages(newRow);
  table.addRow(newRow);
  quickLot.value = '';
  quickProductionDate.value = '';
  quickManufacturer.value = '';
  quickRegion.value = '';
  quickVehicle.value = '';
  quickKgA.value = '';
  quickKgB.value = '';
  quickKgC.value = '';
  quickType.value = 'RI';
  quickMaterialType.value = 'D';
  quickMaterialKind.value = 'M';
  updateSummary();
  autoSave();
}

function removeSelectedRows() {
  const selected = table.getSelectedRows();
  if (!selected.length) {
    showToast('Vui lòng chọn dòng để xóa.', 'info');
    return;
  }

  selected.forEach(async (row) => {
    if (row.getData().firestoreId) {
      await deleteDoc(doc(db, 'production', row.getData().firestoreId));
    }
    table.deleteRow(row.getIndex());
  });
  updateSummary();
}

async function saveAllRows() {
  if (isSaving) return;

  const user = await ensureUserDocument();
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
        materialType: row.materialType || '',
        manufacturer: row.manufacturer || '',
        region: row.region || '',
        vehicle: row.vehicle || '',
        materialKind: row.materialKind || '',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (row.firestoreId) {
        await updateDoc(doc(db, 'production', row.firestoreId), payload);
        updatedIds.add(row.firestoreId);
      } else {
        const docRef = await addDoc(collection(db, 'production'), payload);
        row.firestoreId = docRef.id;
        row.id = docRef.id;
        updatedIds.add(docRef.id);
      }
    });

    await Promise.all(savePromises);

    const q = query(collection(db, 'production'), where('createdBy', '==', user.uid));
    const docs = await getDocs(q);
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
}

function autoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveAllRows();
  }, 1500);
}

function escapeCsv(value) {
  const stringValue = `${value ?? ''}`;
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

function exportToCsv() {
  const rows = table.getData();
  const header = ['STT', 'Ngày sản xuất', 'Lot', 'RI/DO', 'kg BTP A', '% BTP A', 'kg BTP B', '% BTP B', 'kg BTP C', '% BTP C'];
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
      row.percentC || ''
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

async function importFromCsv() {
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
        percentC: values[9] || ''
      };
    });

    table.setData(dataRows);
    updateSummary();
    showToast('Đã nhập dữ liệu từ CSV.', 'success');
  };
  input.click();
}

function bindEvents() {
  [quickMaterialType, quickManufacturer, quickRegion, quickProductionDate, quickVehicle, quickMaterialKind].forEach((element) => {
    element.addEventListener('input', updateQuickLot);
    element.addEventListener('change', updateQuickLot);
  });

  quickAddBtn.addEventListener('click', addQuickEntry);
  deleteRowBtn.addEventListener('click', removeSelectedRows);
  refreshBtn.addEventListener('click', loadProductionData);
  importBtn.addEventListener('click', importFromCsv);
  exportBtn.addEventListener('click', exportToCsv);
  saveBtn.addEventListener('click', saveAllRows);
}

(async function init() {
  initTable();
  bindEvents();
  await waitForAuth();
  await loadProductionData();
})();
