import { describe, expect, it } from 'vitest';
import { createMask, eraseColor, MaskHistory, paintStroke, toImagePoint } from './mask';

describe('non-destructive editing', () => {
  it('paints a continuous stroke and restores erased pixels', () => {
    const mask = createMask(100, 100);
    paintStroke(mask, { x: 10, y: 50 }, { x: 90, y: 50 }, 10, 1, false);
    for (let x = 10; x < 90; x++) expect(mask.data[50 * 100 + x]).toBe(0);
    expect(mask.data[20 * 100 + 50]).toBe(255);
    paintStroke(mask, { x: 50, y: 50 }, { x: 50, y: 50 }, 8, 1, true);
    expect(mask.data[50 * 100 + 50]).toBe(255);
    expect(mask.data[50 * 100 + 20]).toBe(0);
  });
  it('creates partial alpha with a soft brush without extending beyond the canvas', () => {
    const mask = createMask(12, 12);
    paintStroke(mask, { x: 0, y: 0 }, { x: 0, y: 0 }, 20, 0, false);
    expect(mask.data[0]).toBeGreaterThan(0);
    expect(mask.data[0]).toBeLessThan(mask.data[4]);
    expect(mask.data[143]).toBe(255);
    expect(mask.data.length).toBe(144);
  });
  it('groups a stroke as one edit, supports redo and invalidates redo on a new edit', () => {
    const history = new MaskHistory(createMask(2, 2));
    history.begin();
    history.mask.data[0] = 0;
    history.mask.data[1] = 100;
    history.commit();
    history.undo();
    expect([...history.mask.data]).toEqual([255, 255, 255, 255]);
    history.redo();
    expect([...history.mask.data]).toEqual([0, 100, 255, 255]);
    history.undo();
    history.replace(createMask(2, 2, false));
    expect(history.canRedo).toBe(false);
    history.undo();
    expect([...history.mask.data]).toEqual([255, 255, 255, 255]);
  });
  it('bounds history and discards cancelled or unchanged strokes', () => {
    const history = new MaskHistory(createMask(2, 2), 8);
    history.begin();
    history.commit();
    expect(history.canUndo).toBe(false);
    history.begin();
    history.mask.data[0] = 0;
    history.cancelStroke();
    expect(history.mask.data[0]).toBe(255);
    for (let i = 0; i < 4; i++) {
      history.begin();
      history.mask.data[0] = i;
      history.commit();
    }
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(false);
  });
  it('maps points correctly through zoom and clamps captured pointer movement', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(toImagePoint({ x: 200, y: 100 }, rect, { width: 1000, height: 500 })).toEqual({
      x: 500,
      y: 250,
    });
    expect(toImagePoint({ x: -10, y: 300 }, rect, { width: 1000, height: 500 })).toEqual({
      x: 0,
      y: 499,
    });
  });
  it('erases contiguous colors using flood-fill and respects boundaries', () => {
    // 4x4 image:
    // M M W M (M = magenta, W = white wall)
    // M M W M
    // M M W M
    // M M W M
    const mask = createMask(4, 4);
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const i4 = (y * 4 + x) * 4;
        if (x === 2) {
          // White wall
          pixels[i4] = 255;
          pixels[i4 + 1] = 255;
          pixels[i4 + 2] = 255;
          pixels[i4 + 3] = 255;
        } else {
          // Magenta
          pixels[i4] = 216;
          pixels[i4 + 1] = 36;
          pixels[i4 + 2] = 112;
          pixels[i4 + 3] = 255;
        }
      }
    }

    // Click at (0, 0) - left side of white wall, contiguous = true
    eraseColor(mask, pixels, { x: 0, y: 0 }, 20, true);

    // Left 2 columns should be erased (0)
    for (let y = 0; y < 4; y++) {
      expect(mask.data[y * 4 + 0]).toBe(0);
      expect(mask.data[y * 4 + 1]).toBe(0);
      // Wall should be preserved (255)
      expect(mask.data[y * 4 + 2]).toBe(255);
      // Right side past the wall should be preserved (255)
      expect(mask.data[y * 4 + 3]).toBe(255);
    }

    // Now test contiguous = false (global erase)
    const globalMask = createMask(4, 4);
    eraseColor(globalMask, pixels, { x: 0, y: 0 }, 20, false);
    for (let y = 0; y < 4; y++) {
      expect(globalMask.data[y * 4 + 0]).toBe(0);
      expect(globalMask.data[y * 4 + 1]).toBe(0);
      expect(globalMask.data[y * 4 + 2]).toBe(255); // Wall preserved
      expect(globalMask.data[y * 4 + 3]).toBe(0); // Right side also erased!
    }
  });
  it('restores erased color when restore is true', () => {
    const mask = createMask(2, 2, false); // All 0
    const pixels = new Uint8ClampedArray([
      200, 0, 0, 255, 200, 0, 0, 255, 200, 0, 0, 255, 0, 200, 0, 255,
    ]);
    eraseColor(mask, pixels, { x: 0, y: 0 }, 10, true, true);
    expect(mask.data[0]).toBe(255);
    expect(mask.data[1]).toBe(255);
    expect(mask.data[2]).toBe(255);
    expect(mask.data[3]).toBe(0); // Different color remains 0
  });
});
