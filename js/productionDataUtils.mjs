export function canPersistProductionRow(row) {
  const lot = String(row?.lot ?? '').trim();
  const type = String(row?.type ?? '').trim();
  return Boolean(lot) && Boolean(type);
}
