import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInitialRole } from '../js/roleUtils.js';

test('resolveInitialRole prioritizes Firestore role and maps fixed emails correctly', () => {
  assert.equal(resolveInitialRole('admin2@company.com', 'staff'), 'admin');
  assert.equal(resolveInitialRole('gatlosv1@gmail.com', 'staff'), 'dev');
  assert.equal(resolveInitialRole('staff@company.com', 'admin'), 'admin');
  assert.equal(resolveInitialRole('staff@company.com', ''), 'staff');
});
