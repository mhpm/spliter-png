import { LIMITS } from '../domain/model';

export async function inspectPng(file: Blob): Promise<{ width: number; height: number }> {
  if (file.size > LIMITS.fileBytes)
    throw new Error('El PNG supera los 25 MB. Elige una imagen más pequeña.');
  const bytes = new Uint8Array(await file.slice(0, 33).arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 33 ||
    signature.some((byte, i) => bytes[i] !== byte) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
  ) {
    throw new Error('El archivo no es un PNG válido.');
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
    throw new Error('La imagen supera el límite de 16 megapíxeles o de 8.192 píxeles por lado.');
  }
  return { width, height };
}
