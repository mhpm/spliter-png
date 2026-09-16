import type { ArchiveWriter } from '../application/ports';
import { normalizedName, validateNames } from '../domain/names';

export const zipWriter: ArchiveWriter = {
  async create(entries, signal) {
    signal.throwIfAborted();
    if (!entries.length) throw new Error('No hay imágenes para descargar.');
    if (validateNames(entries.map((entry) => entry.name)).some(Boolean))
      throw new Error('Corrige los nombres antes de descargar.');
    const { zip } = await import('fflate');
    const files: Record<string, Uint8Array> = Object.create(null);
    for (const entry of entries) {
      signal.throwIfAborted();
      files[`${normalizedName(entry.name)}.png`] = new Uint8Array(await entry.blob.arrayBuffer());
    }
    signal.throwIfAborted();
    return new Promise<Blob>((resolve, reject) => {
      // PNG already compresses its pixels; storing avoids wasteful recompression.
      const cancel = zip(files, { level: 0 }, (error, data) => {
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
      });
      const abort = () => {
        cancel();
        reject(new DOMException('Descarga cancelada', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  },
};
