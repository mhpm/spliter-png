import { expect, it } from 'vitest';
import { normalizedName, safeStem, validateNames } from './names';

it('detects collisions across case, PNG suffix and Unicode normalization', () => {
  expect(validateNames(['Hoja', 'hoja.PNG'])).toEqual([
    'Este nombre está repetido.',
    'Este nombre está repetido.',
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
  expect(validateNames(['flor azul', 'hoja-01', 'árbol', 'constructor'])).toEqual([
    null,
    null,
    null,
    null,
  ]);
  expect(normalizedName(' árbol.png ')).toBe('árbol');
  expect(safeStem('NUL.png')).toBe('imagen');
});
