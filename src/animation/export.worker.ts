import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { sheetLayout } from './model';
export interface ExportRequest {
  frames: { blob: Blob; width: number; height: number }[];
  columns: number;
  padding: number;
  fps: number;
  loop: boolean;
  alignment: 'center' | 'bottom';
  kind: 'png' | 'gif';
}
self.onmessage = async ({ data }: MessageEvent<ExportRequest>) => {
  try {
    const { frames, columns, padding, kind, fps, loop, alignment } = data;
    const layout = sheetLayout(frames, columns, padding);
    const { cellWidth, cellHeight } = layout;
    if (kind === 'gif' && cellWidth * cellHeight * frames.length > 50_000_000)
      throw new Error(
        'GIF is too large. Reduce sprite size or use fewer frames (maximum 50 million frame pixels).',
      );
    const canvas = new OffscreenCanvas(
      kind === 'png' ? layout.width : cellWidth,
      kind === 'png' ? layout.height : cellHeight,
    );
    const ctx = canvas.getContext('2d', { willReadFrequently: kind === 'gif' });
    if (!ctx) throw new Error('Could not create the export canvas.');
    const gif = kind === 'gif' ? GIFEncoder() : null;
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index];
      const bitmap = await createImageBitmap(frame.blob);
      try {
        if (gif) ctx.clearRect(0, 0, cellWidth, cellHeight);
        const cellX = gif ? 0 : (index % columns) * cellWidth;
        const cellY = gif ? 0 : Math.floor(index / columns) * cellHeight;
        const x = Math.floor((cellWidth - frame.width) / 2);
        const y =
          alignment === 'bottom'
            ? cellHeight - padding - frame.height
            : Math.floor((cellHeight - frame.height) / 2);
        ctx.drawImage(bitmap, cellX + x, cellY + y);
        if (gif) {
          const rgba = ctx.getImageData(0, 0, cellWidth, cellHeight).data;
          // Reserve palette index 0 so opaque black never becomes transparent.
          const palette = quantize(rgba, 255);
          const indexed = applyPalette(rgba, palette);
          for (let p = 0; p < indexed.length; p++)
            indexed[p] = rgba[p * 4 + 3] < 128 ? 0 : indexed[p] + 1;
          gif.writeFrame(indexed, cellWidth, cellHeight, {
            palette: [[0, 0, 0], ...palette],
            delay: Math.round(100 / fps) * 10,
            repeat: loop ? 0 : -1,
            transparent: true,
            transparentIndex: 0,
            dispose: 2,
          });
        }
      } finally {
        bitmap.close();
      }
      self.postMessage({ progress: Math.round(((index + 1) / frames.length) * 100) });
    }
    if (gif) gif.finish();
    const blob = gif
      ? new Blob([gif.bytes()], { type: 'image/gif' })
      : await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Could not export animation.',
    });
  }
};
