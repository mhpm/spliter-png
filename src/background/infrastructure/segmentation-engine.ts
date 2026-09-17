import type { SegmentationEngine } from '../domain/types';

/** The worker owns model state; termination also interrupts downloads and inference. */
export function createSegmentationEngine(): SegmentationEngine {
  let worker: Worker | null = null;
  let pending: (() => void) | null = null;
  function getWorker(): Worker {
    worker ??= new Worker(new URL('./segmentation.worker.ts', import.meta.url), {
      type: 'module',
    });
    return worker;
  }
  function dispose() {
    pending?.();
    worker?.terminate();
    worker = null;
  }
  function warmup() {
    try {
      getWorker().postMessage({ type: 'warmup' });
    } catch {
      // Opportunistic warmup
    }
  }
  return {
    dispose,
    warmup,
    async segment(image, points, signal, onProgress) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (pending) throw new Error('Another selection is already running.');
      const bitmap = await createImageBitmap(image.bitmap);
      if (signal.aborted) {
        bitmap.close();
        throw new DOMException('Cancelled', 'AbortError');
      }
      const active = getWorker();
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const cleanup = () => {
          signal.removeEventListener('abort', abort);
          active.onmessage = null;
          active.onerror = null;
          pending = null;
        };
        const abort = () => {
          cleanup();
          active.terminate();
          worker = null;
          reject(new DOMException('Cancelled', 'AbortError'));
        };
        pending = abort;
        signal.addEventListener('abort', abort, { once: true });
        active.onerror = () => {
          cleanup();
          active.terminate();
          worker = null;
          reject(
            new Error(
              'The AI engine could not start. Check your connection or use the manual brushes.',
            ),
          );
        };
        active.onmessage = ({ data }) => {
          if (data.id !== id) return;
          if (data.type === 'progress')
            onProgress({ message: data.message, percent: data.percent });
          else if (data.type === 'complete') {
            cleanup();
            resolve({
              width: data.width,
              height: data.height,
              data: new Uint8ClampedArray(data.buffer),
            });
          } else {
            console.error('Segmentation engine:', data.message);
            cleanup();
            active.terminate();
            worker = null;
            reject(
              new Error(
                'AI processing failed. Check your connection and try again; the brushes still work.',
              ),
            );
          }
        };
        active.postMessage({ id, imageId: image.id, bitmap, points }, [bitmap]);
      });
    },
  };
}
