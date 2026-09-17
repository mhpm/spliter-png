import type { EditorImage } from '../domain/types';

/** Read size before decoding to reject highly compressed oversized images. */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
  )
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes[0] === 255 && bytes[1] === 216) {
    let position = 2;
    while (position + 9 < bytes.length) {
      if (bytes[position++] !== 255) break;
      while (bytes[position] === 255) position++;
      const marker = bytes[position++];
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = view.getUint16(position);
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker))
        return { height: view.getUint16(position + 3), width: view.getUint16(position + 5) };
      if (length < 2) break;
      position += length;
    }
  }
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') {
    const kind = text(12, 16);
    const uint24 = (offset: number) =>
      bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
    if (kind === 'VP8X') return { width: uint24(24) + 1, height: uint24(27) + 1 };
    if (kind === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42)
      return { width: view.getUint16(26, true) & 16383, height: view.getUint16(28, true) & 16383 };
    if (kind === 'VP8L' && bytes[20] === 47) {
      const bits = view.getUint32(21, true);
      return { width: (bits & 16383) + 1, height: ((bits >>> 14) & 16383) + 1 };
    }
  }
  throw new Error('Choose a valid PNG, JPG, or WebP image.');
}

export async function openEditorImage(file: File): Promise<EditorImage> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB.');
  const dimensions = imageDimensions(new Uint8Array(await file.arrayBuffer()));
  if (
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width * dimensions.height > 16_777_216 ||
    Math.max(dimensions.width, dimensions.height) > 8192
  )
    throw new Error('Use an image up to 16 megapixels and 8,192 pixels per side.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This image could not be opened. It may be damaged.');
  }
  // The browser applies EXIF orientation; all clicks and exports use these dimensions.
  return { id: crypto.randomUUID(), file, bitmap, width: bitmap.width, height: bitmap.height };
}
