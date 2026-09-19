import { useEffect, useRef, useState } from 'react';
import type { ImageItem, Services } from '../../application/use-splitter';
import { createManualFrameItem } from '../domain/frame-item';

export interface WorkshopSeed {
  key: number;
  frames: ImageItem[];
  availableSprites: ImageItem[];
}

type LoadingState = 'idle' | 'loading';

function revokeUrls(urls: Set<string>) {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
}

export function useSpriteWorkshopFrames(services: Services, seed: WorkshopSeed | null) {
  const [frames, setFrames] = useState<ImageItem[]>(() => seed?.frames ?? []);
  const [availableSprites, setAvailableSprites] = useState<ImageItem[]>(
    () => seed?.availableSprites ?? [],
  );
  const [status, setStatus] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const ownedUrls = useRef(new Set<string>());
  const operation = useRef(0);
  const nextId = useRef(-1);

  useEffect(() => {
    const urls = ownedUrls.current;
    return () => revokeUrls(urls);
  }, []);

  async function loadFiles(files: File[]) {
    if (!files.length) return false;
    const operationId = ++operation.current;
    setStatus('loading');
    setError(null);

    try {
      const inspected = await Promise.all(
        files.map(async (file) => ({
          file,
          dimensions: await services.inspect(file),
        })),
      );
      if (operationId !== operation.current) return false;

      revokeUrls(ownedUrls.current);
      const items = inspected.map(({ file, dimensions }) => {
        const item = createManualFrameItem(file, dimensions, nextId.current);
        nextId.current -= 1;
        ownedUrls.current.add(item.url);
        return item;
      });

      setFrames(items);
      setAvailableSprites(items);
      setStatus('idle');
      return true;
    } catch (cause) {
      if (operationId !== operation.current) return false;
      setStatus('idle');
      setError(cause instanceof Error ? cause.message : 'Unable to load the PNG frames.');
      return false;
    }
  }

  return {
    frames,
    availableSprites,
    busy: status === 'loading',
    error,
    loadFiles,
    reportError: setError,
  };
}
