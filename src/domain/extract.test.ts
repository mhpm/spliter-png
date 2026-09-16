import { describe, expect, it } from 'vitest';
import cases from '../../tests/fixtures/python-reference.json';
import { detectRegions, isolateRegion } from './extract';
import { DEFAULT_OPTIONS } from './model';

describe('parity with the original Python / Pillow extractor', () => {
  for (const fixture of cases) {
    it(fixture.name, () => {
      const source = {
        width: fixture.width,
        height: fixture.height,
        data: new Uint8ClampedArray(fixture.pixels),
      };
      const regions = detectRegions(source, fixture.options);
      expect(regions).toHaveLength(fixture.expected.length);
      for (const [index, region] of regions.entries()) {
        const expected = fixture.expected[index];
        expect({
          left: region.left,
          top: region.top,
          right: region.right,
          bottom: region.bottom,
          area: region.area,
        }).toEqual({
          left: expected.left,
          top: expected.top,
          right: expected.right,
          bottom: expected.bottom,
          area: expected.area,
        });
        const crop = isolateRegion(source, region, fixture.options.padding);
        expect([crop.width, crop.height]).toEqual([expected.width, expected.height]);
        expect([...crop.data]).toEqual(expected.pixels);
      }
    });
  }
});

it('rejects invalid dimensions and extraction settings', () => {
  expect(() =>
    detectRegions({ width: 2, height: 2, data: new Uint8ClampedArray(1) }, DEFAULT_OPTIONS),
  ).toThrow();
  const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  for (const value of [NaN, -1, 255, 12.5])
    expect(() => detectRegions(image, { ...DEFAULT_OPTIONS, alphaThreshold: value })).toThrow();
});
