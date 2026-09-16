import { expect, it } from 'vitest';
import { normalizedName, safeStem, validateNames } from './names';

it('detects collisions across case, PNG suffix and Unicode normalization', () => {
  expect(validateNames(['Leaf', 'leaf.PNG'])).toEqual([
    'This name is duplicated.',
    'This name is duplicated.',
  ]);
  expect(validateNames(['café', 'cafe\u0301']).every(Boolean)).toBe(true);
});
it('rejects paths, empty names and reserved platform names', () => {
  expect(
    validateNames([
      '',
      '..',
      '../escape',
      'folder\\image',
      'NUL',
      'con.txt',
      'end.',
      'x'.repeat(181),
    ]).every(Boolean),
  ).toBe(true);
  expect(validateNames(['blue flower', 'leaf-01', 'tree', 'builder'])).toEqual([
    null,
    null,
    null,
    null,
  ]);
  expect(normalizedName(' tree.png ')).toBe('tree');
  expect(safeStem('NUL.png')).toBe('image');
});
