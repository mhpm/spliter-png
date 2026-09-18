import type { SpriteEdit, FrameSize } from './model';
export async function transformSprite(original: FrameSize & { blob: Blob }, edit: SpriteEdit) {
  const width = Math.max(1, Math.round((original.width * edit.scale) / 100));
  const height = Math.max(1, Math.round((original.height * edit.scale) / 100));
  if (width > 8192 || height > 8192 || width * height > 16_777_216)
    throw new Error('This size is too large. Use a smaller scale.');
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create an image canvas.');
  const bitmap = await createImageBitmap(original.blob);
  try {
    ctx.translate(edit.flipX ? width : 0, edit.flipY ? height : 0);
    ctx.scale(edit.flipX ? -1 : 1, edit.flipY ? -1 : 1);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { width, height, blob: await canvas.convertToBlob({ type: 'image/png' }) };
  } finally {
    bitmap.close();
  }
}
