import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { imageDimensions } from './image-file';

describe('image header validation', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'reads real %s dimensions before decoding',
    async (format) => {
      const bytes = await sharp({
        create: { width: 73, height: 41, channels: 4, background: '#38a976' },
      })
        .toFormat(format)
        .toBuffer();
      expect(imageDimensions(bytes)).toEqual({ width: 73, height: 41 });
    },
  );
  it('reads lossless WebP and rejects truncated or unsupported images', async () => {
    const bytes = await sharp({
      create: { width: 95, height: 27, channels: 4, background: '#38a97680' },
    })
      .webp({ lossless: true })
      .toBuffer();
    expect(imageDimensions(bytes)).toEqual({ width: 95, height: 27 });
    for (const invalid of [
      new Uint8Array(),
      new Uint8Array([255, 216, 255]),
      new TextEncoder().encode('<svg></svg>'),
    ])
      expect(() => imageDimensions(invalid)).toThrow();
  });
});
