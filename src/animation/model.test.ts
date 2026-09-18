import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EDIT,
  DEFAULT_LAYER_TRANSFORM,
  nextEdit,
  sheetLayout,
  calculateFrameDimensions,
  createFrameFromItem,
  createLayerFromItem,
  layersInPaintOrder,
  moveLayerPivot,
  resizeLayerFromCorner,
  resizeLayerFromEdge,
  rotateLayerAroundPivot,
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

  it('paints inspector layers from back to front so the first row stays on top', () => {
    expect(layersInPaintOrder(['front', 'middle', 'back'])).toEqual(['back', 'middle', 'front']);
  });

  it('resizes proportionally from every corner while keeping the opposite corner fixed', () => {
    const layer = {
      width: 100,
      height: 80,
      transform: {
        ...DEFAULT_LAYER_TRANSFORM,
        x: 0,
        y: 0,
      },
    };
    const center = { x: 200, y: 200 };
    const initialCorners = {
      tl: { x: 150, y: 160 },
      tr: { x: 250, y: 160 },
      bl: { x: 150, y: 240 },
      br: { x: 250, y: 240 },
    } as const;
    for (const [corner, pointer] of Object.entries(initialCorners)) {
      expect(
        resizeLayerFromCorner(layer, corner as keyof typeof initialCorners, pointer, center),
      ).toEqual({ scaleX: 100, scaleY: 100, x: 0, y: 0 });
    }
    expect(resizeLayerFromCorner(layer, 'br', { x: 350, y: 320 }, center)).toEqual({
      scaleX: 200,
      scaleY: 200,
      x: 50,
      y: 40,
    });
  });

  it('keeps corner resizing stable for rotated and flipped sprites', () => {
    const layer = {
      width: 100,
      height: 80,
      transform: {
        ...DEFAULT_LAYER_TRANSFORM,
        rotation: 90,
        flipX: true,
        x: 12,
        y: -8,
      },
    };
    expect(
      resizeLayerFromCorner(layer, 'br', { x: 172, y: 142 }, { x: 200, y: 200 }),
    ).toEqual({ scaleX: 100, scaleY: 100, x: 12, y: -8 });
  });

  it('resizes one axis from edge handles while keeping the opposite edge fixed', () => {
    const layer = {
      width: 100,
      height: 80,
      transform: { ...DEFAULT_LAYER_TRANSFORM },
    };
    expect(
      resizeLayerFromEdge(layer, 'r', { x: 300, y: 200 }, { x: 200, y: 200 }),
    ).toEqual({ scaleX: 150, scaleY: 100, x: 25, y: 0 });
    expect(
      resizeLayerFromEdge(layer, 'b', { x: 200, y: 280 }, { x: 200, y: 200 }),
    ).toEqual({ scaleX: 100, scaleY: 150, x: 0, y: 20 });
  });

  it('moves a pivot in sprite space even when the layer is rotated and flipped', () => {
    const layer = {
      width: 100,
      height: 80,
      transform: {
        ...DEFAULT_LAYER_TRANSFORM,
        rotation: 90,
        flipX: true,
        x: 12,
        y: -8,
      },
    };

    const pivot = moveLayerPivot(layer, { x: 212, y: 142 }, { x: 200, y: 200 });
    expect(pivot.pivotX).toBeCloseTo(0.5);
    expect(pivot.pivotY).toBeCloseTo(0);
  });

  it('keeps a custom pivot fixed while rotating the layer around it', () => {
    const layer = {
      width: 100,
      height: 80,
      transform: {
        ...DEFAULT_LAYER_TRANSFORM,
        pivotX: 0.5,
      },
    };

    expect(rotateLayerAroundPivot(layer, 90)).toEqual({ rotation: 90, x: 50, y: -50 });
    expect(
      rotateLayerAroundPivot(
        { ...layer, transform: { ...layer.transform, pivotX: 0, pivotY: 0 } },
        90,
      ),
    ).toEqual({ rotation: 90, x: 0, y: 0 });
  });

  it('correctly calculates layer transformed bounds and multi-layer frame dimensions', async () => {
    const dummyBlob = new Blob([''], { type: 'image/png' });
    const itemA = {
      id: 1,
      name: 'ship',
      blob: dummyBlob,
      url: 'blob:test1',
      width: 100,
      height: 100,
    };
    const itemB = {
      id: 2,
      name: 'fire',
      blob: dummyBlob,
      url: 'blob:test2',
      width: 40,
      height: 40,
    };

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
