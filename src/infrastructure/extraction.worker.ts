import { detectRegions, isolateRegion } from '../domain/extract';
import type {
  ExtractedImage,
  ExtractionOptions,
  ExtractionResult,
  Progress,
} from '../domain/model';
import { inspectPng } from './png';

export type WorkerResponse =
  | { type: 'progress'; progress: Progress }
  | { type: 'result'; result: ExtractionResult }
  | { type: 'error'; message: string };
function send(message: WorkerResponse) {
  self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<{ file: File; options: ExtractionOptions }>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    const { file, options } = event.data;
    const dimensions = await inspectPng(file);
    send({ type: 'progress', progress: { percent: 4, message: 'Leyendo la imagen…' } });
    if (typeof OffscreenCanvas === 'undefined')
      throw new Error(
        'Tu navegador no permite procesar esta imagen en segundo plano. Usa una versión reciente de Chrome, Edge, Firefox o Safari.',
      );
    bitmap = await createImageBitmap(file);
    if (bitmap.width !== dimensions.width || bitmap.height !== dimensions.height)
      throw new Error('Las dimensiones del PNG no coinciden con su contenido.');
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No se pudo preparar el procesamiento de la imagen.');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    bitmap = undefined;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    let opaque = true;
    for (let i = 3; i < image.data.length; i += 4) {
      if (image.data[i] < 255) {
        opaque = false;
        break;
      }
    }
    const regions = detectRegions(image, options, (fraction) =>
      send({
        type: 'progress',
        progress: { percent: 10 + Math.round(fraction * 45), message: 'Detectando elementos…' },
      }),
    );
    const images: ExtractedImage[] = [];
    const output = new OffscreenCanvas(1, 1);
    const outputContext = output.getContext('2d');
    if (!outputContext) throw new Error('No se pudieron crear los recortes.');
    for (let index = 0; index < regions.length; index++) {
      const region = regions[index];
      const crop = isolateRegion(image, region, options.padding);
      output.width = crop.width;
      output.height = crop.height;
      outputContext.putImageData(
        new ImageData(crop.data as Uint8ClampedArray<ArrayBuffer>, crop.width, crop.height),
        0,
        0,
      );
      const blob = await output.convertToBlob({ type: 'image/png' });
      images.push({
        id: region.id,
        area: region.area,
        left: region.left,
        top: region.top,
        right: region.right,
        bottom: region.bottom,
        width: crop.width,
        height: crop.height,
        blob,
      });
      if (index % 8 === 0 || index === regions.length - 1)
        send({
          type: 'progress',
          progress: {
            percent: 55 + Math.round(((index + 1) / regions.length) * 45),
            message: `Preparando recortes: ${index + 1} de ${regions.length}`,
          },
        });
    }
    canvas.width = canvas.height = output.width = output.height = 1;
    send({ type: 'result', result: { images, opaque, ...dimensions } });
  } catch (error) {
    send({
      type: 'error',
      message: error instanceof Error ? error.message : 'No se pudo procesar el PNG.',
    });
  } finally {
    bitmap?.close();
  }
};
