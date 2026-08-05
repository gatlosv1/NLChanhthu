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
