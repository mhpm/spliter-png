import type { Mask } from '../domain/types';

export class MaskRenderer {
  private surface = document.createElement('canvas');
  private matte = document.createElement('canvas');
  private cutout = document.createElement('canvas');
  private matteData: ImageData | null = null;

  draw(
    target: HTMLCanvasElement,
    image: ImageBitmap,
    mask: Mask,
    original = false,
    feather = 0,
    watermark = false,
  ) {
    const { width, height } = mask;
    if (target.width !== width || target.height !== height) {
      target.width = width;
      target.height = height;
    }
    const context = target.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the image editor.');
    context.clearRect(0, 0, width, height);

    if (original) {
      context.globalCompositeOperation = 'source-over';
      context.drawImage(image, 0, 0, width, height);
      return;
    }

    if (!this.matteData || this.matte.width !== width || this.matte.height !== height) {
      this.matte.width = this.surface.width = this.cutout.width = width;
      this.matte.height = this.surface.height = this.cutout.height = height;
      this.matteData = new ImageData(width, height);
      this.matteData.data.fill(255);
    }
    for (let index = 0; index < mask.data.length; index++)
      this.matteData.data[index * 4 + 3] = mask.data[index];
    this.matte.getContext('2d')!.putImageData(this.matteData, 0, 0);

    const cutoutContext = this.cutout.getContext('2d')!;
    cutoutContext.clearRect(0, 0, width, height);
    cutoutContext.globalCompositeOperation = 'source-over';
    cutoutContext.drawImage(image, 0, 0, width, height);
    cutoutContext.globalCompositeOperation = 'destination-in';
    if (feather > 0) {
      const surfaceContext = this.surface.getContext('2d')!;
      surfaceContext.clearRect(0, 0, width, height);
      surfaceContext.filter = `blur(${feather}px)`;
      surfaceContext.drawImage(this.matte, 0, 0);
      cutoutContext.drawImage(this.surface, 0, 0);
    } else {
      cutoutContext.drawImage(this.matte, 0, 0);
    }
    cutoutContext.globalCompositeOperation = 'source-over';

    context.globalCompositeOperation = 'source-over';
    if (watermark) {
      context.save();
      context.globalAlpha = 0.35;
      context.drawImage(image, 0, 0, width, height);
      context.restore();
    }
    context.drawImage(this.cutout, 0, 0);
  }

  dispose() {
    this.surface.width = this.matte.width = this.cutout.width = 1;
    this.surface.height = this.matte.height = this.cutout.height = 1;
    this.matteData = null;
  }
}

export async function exportCutout(image: ImageBitmap, mask: Mask, feather: number): Promise<Blob> {
  const renderer = new MaskRenderer();
  const canvas = document.createElement('canvas');
  try {
    renderer.draw(canvas, image, mask, false, feather);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('Could not create the PNG. Try a smaller image.')),
        'image/png',
      ),
    );
  } finally {
    renderer.dispose();
    canvas.width = canvas.height = 1;
  }
}
