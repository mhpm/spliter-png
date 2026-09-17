import {
  AutoModel,
  AutoProcessor,
  RawImage,
  SamModel,
  env,
  type SamProcessor,
  type Tensor,
  type ProgressInfo,
} from '@huggingface/transformers';
import type { SelectionPoint } from '../domain/types';

env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;

// Pin both model artifacts and preprocessing configuration for reproducible results.
const AUTO = {
  id: 'Ko033/isnet-general-use-onnx',
  revision: '5349b617911fd60c619b52f32e2b593517b78df3',
};
const SELECT = {
  id: 'Xenova/slimsam-77-uniform',
  revision: '5850ab45f587c112167512ffef949107115e26a0',
};
let automatic: Awaited<ReturnType<typeof AutoModel.from_pretrained>> | undefined;
let automaticProcessor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | undefined;
let automaticPromise: Promise<void> | null = null;

async function isModelCached(modelId: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some((req) => req.url.includes(modelId));
  } catch {
    return false;
  }
}

async function ensureAutomaticLoaded(onProgress?: (event: ProgressInfo) => void) {
  if (automatic && automaticProcessor) return;
  if (!automaticPromise) {
    automaticPromise = (async () => {
      automaticProcessor = await AutoProcessor.from_pretrained(AUTO.id, {
        revision: AUTO.revision,
      });
      automatic = await AutoModel.from_pretrained(AUTO.id, {
        revision: AUTO.revision,
        dtype: 'q8',
        device: 'wasm',
        progress_callback: onProgress,
      });
    })();
  }
  await automaticPromise;
}

let selection: SamModel | undefined;
let selectionProcessor: SamProcessor | undefined;
let cached:
  | { id: string; embeddings: { image_embeddings: Tensor; image_positional_embeddings: Tensor } }
  | undefined;

type SegmentRequest = {
  id: string;
  imageId: string;
  bitmap: ImageBitmap;
  points: SelectionPoint[] | null;
};

type WarmupRequest = {
  type: 'warmup';
};

self.onmessage = async ({ data }: MessageEvent<SegmentRequest | WarmupRequest>) => {
  if ('type' in data && data.type === 'warmup') {
    const inCache = await isModelCached(AUTO.id);
    if (inCache && !automatic) {
      ensureAutomaticLoaded().catch(() => {
        automaticPromise = null;
      });
    }
    return;
  }

  const { id, imageId, bitmap, points } = data as SegmentRequest;
  const progress = (message: string, percent?: number) =>
    self.postMessage({ id, type: 'progress', message, percent });
  const modelId = points ? SELECT.id : AUTO.id;
  const inCache = await isModelCached(modelId);
  const downloadProgress = (event: ProgressInfo) => {
    if (event.status === 'progress')
      progress(
        `${inCache ? 'Loading' : 'Downloading'} ${points ? 'selection' : 'background'} model…`,
        Math.round(event.progress),
      );
    else if (event.status === 'initiate')
      progress(
        inCache
          ? 'Reading model from device storage…'
          : 'Preparing the model. First use needs an internet connection…',
      );
  };
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const image = new RawImage(pixels.data, bitmap.width, bitmap.height, 4).rgb();
    let mask: Uint8ClampedArray;
    if (!points) {
      if (!automatic) {
        progress(
          inCache
            ? 'Loading background model from local storage…'
            : 'Downloading background model (about 46 MB on first use)…',
        );
        await ensureAutomaticLoaded(downloadProgress);
      }
      const maxDim = 512;
      const scale = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1);
      const targetWidth = Math.max(32, Math.round((bitmap.width * scale) / 32) * 32);
      const targetHeight = Math.max(32, Math.round((bitmap.height * scale) / 32) * 32);
      automaticProcessor!.image_processor!.size = { width: targetWidth, height: targetHeight };
      progress('Finding the subject and refining its edges…');
      const inputs = await automaticProcessor!(image);
      const output = await automatic!({ input_image: inputs.pixel_values });
      const probabilities = output.output_image as Tensor;
      let minimum = Infinity,
        maximum = -Infinity;
      for (const value of probabilities.data as Float32Array) {
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
      const alpha = new Uint8ClampedArray(probabilities.data.length);
      const range = maximum - minimum;
      for (let i = 0; i < alpha.length; i++)
        alpha[i] =
          range > 1e-8
            ? ((Number(probabilities.data[i]) - minimum) / range) * 255
            : Number(probabilities.data[i]) * 255;
      const resized = await new RawImage(alpha, targetWidth, targetHeight, 1).resize(
        bitmap.width,
        bitmap.height,
      );
      mask = new Uint8ClampedArray(resized.data);
    } else {
      const keep = points.filter((point: SelectionPoint) => point.kind === 'keep');
      const exclude = points.filter((point: SelectionPoint) => point.kind === 'exclude');
      if (!keep.length) throw new Error('Add at least one Keep point on your subject.');
      if (!selection) {
        progress(
          inCache
            ? 'Loading selection model from local storage…'
            : 'Downloading selection model (about 14 MB on first use)…',
        );
        selectionProcessor ??= (await AutoProcessor.from_pretrained(SELECT.id, {
          revision: SELECT.revision,
        })) as SamProcessor;
        selection = (await SamModel.from_pretrained(SELECT.id, {
          revision: SELECT.revision,
          dtype: 'q8',
          device: 'wasm',
          progress_callback: downloadProgress,
        })) as SamModel;
      }
      mask = new Uint8ClampedArray(bitmap.width * bitmap.height);
      for (const [index, point] of keep.entries()) {
        progress(`Selecting object ${index + 1} of ${keep.length}…`);
        const inputs = await selectionProcessor!(image, {
          input_points: [[[point.x, point.y], ...exclude.map((p: SelectionPoint) => [p.x, p.y])]],
          input_labels: [[1, ...exclude.map(() => 0)]],
        });
        if (cached?.id !== imageId) {
          if (cached) Object.values(cached.embeddings).forEach((tensor) => tensor.dispose());
          cached = { id: imageId, embeddings: await selection.get_image_embeddings(inputs) };
        }
        const embeddings = cached!.embeddings;
        const output = await selection({ ...inputs, ...embeddings });
        const masks: Tensor[] = await selectionProcessor!.post_process_masks(
          output.pred_masks,
          inputs.original_sizes,
          inputs.reshaped_input_sizes,
        );
        const scores = output.iou_scores.data as Float32Array;
        let best = 0;
        for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
        const predicted = masks[0].data;
        const offset = best * mask.length;
        for (let i = 0; i < mask.length; i++) if (predicted[offset + i]) mask[i] = 255;
      }
    }
    self.postMessage(
      { id, type: 'complete', width: bitmap.width, height: bitmap.height, buffer: mask.buffer },
      { transfer: [mask.buffer] },
    );
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message:
        error instanceof Error ? error.message : 'The model could not finish. Please try again.',
    });
  } finally {
    bitmap.close();
  }
};
