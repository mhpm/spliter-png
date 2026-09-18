import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EDIT,
  nextEdit,
  sheetLayout,
  calculateFrameDimensions,
  createFrameFromItem,
  createLayerFromItem,
} from './model';

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

  it('correctly calculates layer transformed bounds and multi-layer frame dimensions', async () => {
    const dummyBlob = new Blob([''], { type: 'image/png' });
    const itemA = { id: 1, name: 'ship', blob: dummyBlob, url: 'blob:test1', width: 100, height: 100 };
    const itemB = { id: 2, name: 'fire', blob: dummyBlob, url: 'blob:test2', width: 40, height: 40 };

    const frame = createFrameFromItem(itemA, 0);

    // Untouched single-layer frame
    const dim1 = calculateFrameDimensions(frame);
    expect(dim1).toEqual({ width: 100, height: 100 });

    // Multi-layer frame with secondary layer offset
    frame.layers.push(
      createLayerFromItem(itemB, {
        y: 60, // 60px down from center -> center at 0, bottom at 60 + 20 = 80
        opacity: 0.9,
      }),
    );

    const dim2 = calculateFrameDimensions(frame);
    // Symmetric extent: maxY is 80 -> height is 80 * 2 = 160. maxX is 50 -> width is 100.
    expect(dim2.width).toBe(100);
    expect(dim2.height).toBe(160);
  });
});

