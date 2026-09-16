import type { Extractor } from '../application/ports';
import type { WorkerResponse } from './extraction.worker';

export const workerExtractor: Extractor = {
  extract(file, options, signal, onProgress) {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const worker = new Worker(new URL('./extraction.worker.ts', import.meta.url), {
        type: 'module',
      });
      const cleanup = () => {
        worker.terminate();
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        reject(new DOMException('Processing cancelled', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.type === 'progress') onProgress(data.progress);
        else {
          cleanup();
          if (data.type === 'result') resolve(data.result);
          else reject(new Error(data.message));
        }
      };
      worker.onerror = () => {
        cleanup();
        reject(new Error('Could not process the image. Try with a smaller PNG.'));
      };
      worker.onmessageerror = () => {
        cleanup();
        reject(new Error('Could not retrieve the result.'));
      };
      worker.postMessage({ file, options });
    });
  },
};
