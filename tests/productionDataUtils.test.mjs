import test from 'node:test';
import assert from 'node:assert/strict';
import { canPersistProductionRow, normalizeProductionRowForPersistence } from '../js/productionDataUtils.mjs';

test('canPersistProductionRow trims whitespace before validating', () => {
  assert.equal(canPersistProductionRow({ lot: '   ', type: 'RI' }), false);
  assert.equal(canPersistProductionRow({ lot: 'LOT-01', type: '  DO  ' }), true);
});

test('normalizeProductionRowForPersistence trims and preserves values', () => {
  const result = normalizeProductionRowForPersistence({
    lot: '  LOT-01  ',
    type: '  DO  ',
    productionDate: ' 2026-08-05 ',
    warehouse: '  WH1  '
  });

  assert.deepEqual(result, {
    lot: 'LOT-01',
    type: 'DO',
    productionDate: '2026-08-05',
    warehouse: 'WH1'
  });
});
