import { describe, expect, it } from 'vitest';
import { DEFAULT_EDIT, nextEdit, sheetLayout } from './model';

describe('sprite transformations and sheet layout', () => {
  it('keeps flips when resizing and resets all edits', () => {
    const flipped = nextEdit(DEFAULT_EDIT, 'flipX');
    expect(nextEdit(flipped, { scale: 50 })).toEqual({ scale: 50, flipX: true, flipY: false });
    expect(nextEdit(flipped, 'flipX')).toEqual(DEFAULT_EDIT);
    expect(nextEdit(flipped, 'reset')).toEqual(DEFAULT_EDIT);
    expect(() => nextEdit(DEFAULT_EDIT, { scale: NaN })).toThrow();
  });
  it('packs unequal sprites into equal padded cells including a partial final row', () => {
    expect(
      sheetLayout(
        [
          { width: 40, height: 20 },
          { width: 10, height: 60 },
          { width: 12, height: 12 },
        ],
        2,
        3,
      ),
    ).toEqual({ cellWidth: 46, cellHeight: 66, columns: 2, rows: 2, width: 92, height: 132 });
  });
  it('rejects empty sheets, fractional columns and unsafe allocation sizes', () => {
    expect(() => sheetLayout([], 1, 0)).toThrow();
    expect(() => sheetLayout([{ width: 12, height: 12 }], 1.5, 0)).toThrow();
    expect(() => sheetLayout([{ width: 8192, height: 4000 }], 1, 0)).toThrow();
  });
});
