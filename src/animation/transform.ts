import {
  type SpriteEdit,
  type FrameSize,
  type StudioFrame,
  isFrameUntouched,
  calculateFrameDimensions,
  getLayerDisplaySize,
  layersInPaintOrder,
} from './model';

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

export async function compositeFrame(
  frame: StudioFrame,
  forcedDimensions?: { width: number; height: number },
): Promise<{ width: number; height: number; blob: Blob }> {
  if (!forcedDimensions && isFrameUntouched(frame)) {
    return {
      width: frame.layers[0].width,
      height: frame.layers[0].height,
      blob: frame.layers[0].blob,
    };
  }

  const dimensions = forcedDimensions || calculateFrameDimensions(frame);
  const width = Math.max(1, dimensions.width);
  const height = Math.max(1, dimensions.height);

  if (width > 8192 || height > 8192 || width * height > 16_777_216) {
    throw new Error('The frame is too large. Reduce sprite scale or offsets.');
  }

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : (document.createElement('canvas') as unknown as OffscreenCanvas);
  if ('width' in canvas) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Could not create canvas context for composite frame.');

  const cx = width / 2;
  const cy = height / 2;
  const visibleLayers = layersInPaintOrder(frame.layers).filter((l) => l.transform.visible);

  for (const layer of visibleLayers) {
    const bitmap = await createImageBitmap(layer.blob);
    try {
      ctx.save();
      const lx = cx + (layer.transform.x || 0);
      const ly = cy + (layer.transform.y || 0);
      ctx.translate(lx, ly);

      if (layer.transform.rotation) {
        ctx.rotate(((layer.transform.rotation || 0) * Math.PI) / 180);
      }

      const fx = layer.transform.flipX ? -1 : 1;
      const fy = layer.transform.flipY ? -1 : 1;
      ctx.scale(fx, fy);

      if (layer.transform.opacity !== undefined && layer.transform.opacity < 1) {
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.transform.opacity));
      }

      const { width: drawW, height: drawH } = getLayerDisplaySize(layer);

      ctx.drawImage(bitmap, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    } finally {
      bitmap.close();
    }
  }

  let blob: Blob;
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    blob = await canvas.convertToBlob({ type: 'image/png' });
  } else {
    blob = await new Promise<Blob>((resolve, reject) => {
      (canvas as unknown as HTMLCanvasElement).toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to generate PNG blob from canvas.'));
      }, 'image/png');
    });
  }

  return { width, height, blob };
}
