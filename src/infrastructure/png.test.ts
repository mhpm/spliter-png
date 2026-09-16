import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { inspectPng } from './png';

it('validates the PNG signature and dimensions before decoding', async () => {
  const sample = readFileSync('tests/fixtures/sample.png');
  await expect(inspectPng(new Blob([sample]))).resolves.toEqual({ width: 480, height: 320 });
  await expect(inspectPng(new Blob(['not a PNG']))).rejects.toThrow('valid PNG');
  const excessive = Buffer.from(sample);
  excessive.writeUInt32BE(100000, 16);
  await expect(inspectPng(new Blob([excessive]))).rejects.toThrow('16 megapixels');
});
