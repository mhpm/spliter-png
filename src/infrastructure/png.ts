import { LIMITS } from '../domain/model';

export async function inspectPng(file: Blob): Promise<{ width: number; height: number }> {
  if (file.size > LIMITS.fileBytes)
    throw new Error('The PNG exceeds 25 MB. Please choose a smaller image.');
  const bytes = new Uint8Array(await file.slice(0, 33).arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 33 ||
    signature.some((byte, i) => bytes[i] !== byte) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
  ) {
    throw new Error('The file is not a valid PNG.');
  }
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (
    !width ||
    !height ||
    width > LIMITS.dimension ||
    height > LIMITS.dimension ||
    width * height > LIMITS.pixels
  ) {
    throw new Error('The image exceeds the limit of 16 megapixels or 8,192 pixels per side.');
  }
  return { width, height };
}
