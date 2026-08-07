// Chỉ cho phép lưu dòng khi lot và loại sản phẩm đã được nhập đầy đủ.
export function canPersistProductionRow(row) {
  const lot = String(row?.lot ?? '').trim();
  const type = String(row?.type ?? '').trim();
  return Boolean(lot) && Boolean(type);
}

// Chuẩn hóa dữ liệu trước khi lưu để tránh lỗi do khoảng trắng hoặc ký tự không cần thiết.
export function normalizeProductionRowForPersistence(row = {}) {
  const normalizedLot = String(row?.lot ?? '').trim();
  const normalizedType = String(row?.type ?? '').trim().toUpperCase();
  const normalizedProductionDate = String(row?.productionDate ?? '').trim();
  const normalizedWarehouse = String(row?.warehouse ?? '').trim();

  return {
    ...row,
    lot: normalizedLot,
    type: normalizedType,
    productionDate: normalizedProductionDate,
    warehouse: normalizedWarehouse
  };
}

// Xây dựng payload Firestore cho một dòng sản xuất, bắt buộc có ownerId.
export function buildProductionPayload(row = {}, ownerId = '') {
  const normalizedRow = normalizeProductionRowForPersistence(row);
  return {
    ownerId: ownerId || '',
    productionDate: normalizedRow.productionDate || '',
    lot: normalizedRow.lot || '',
    type: normalizedRow.type || 'RI',
    kgA: Number(normalizedRow.kgA || 0),
    percentA: Number(normalizedRow.percentA || 0),
    kgB: Number(normalizedRow.kgB || 0),
    percentB: Number(normalizedRow.percentB || 0),
    kgC: Number(normalizedRow.kgC || 0),
    percentC: Number(normalizedRow.percentC || 0),
    kgCNoSeed: Number(normalizedRow.kgCNoSeed || 0),
    percentCNoSeed: Number(normalizedRow.percentCNoSeed || 0),
    materialType: normalizedRow.materialType || '',
    manufacturer: normalizedRow.manufacturer || '',
    region: normalizedRow.region || '',
    warehouse: normalizedRow.warehouse || '',
    vehicle: normalizedRow.vehicle || '',
    materialKind: normalizedRow.materialKind || ''
  };
}
