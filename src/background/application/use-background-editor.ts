import { useEffect, useRef, useState } from 'react';
import { MaskHistory, createMask } from '../domain/mask';
import type { AIProgress, BackgroundServices, EditorImage, SelectionPoint } from '../domain/types';
import { nameError, normalizedName, safeStem } from '../../domain/names';

export function useBackgroundEditor(services: BackgroundServices) {
  const [image, setImage] = useState<EditorImage | null>(null);
  const [history, setHistory] = useState<MaskHistory | null>(null);
  const [revision, setRevision] = useState(0);
  const [points, setPoints] = useState<SelectionPoint[]>([]);
  const [name, setName] = useState('cutout');
  const [feather, setFeather] = useState(0);
  const [busy, setBusy] = useState(false);
  const [canCancel, setCanCancel] = useState(false);
  const [progress, setProgress] = useState<AIProgress>({ message: '' });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const active = useRef<AbortController | null>(null);
  const currentImage = useRef<EditorImage | null>(null);
  const refresh = () => setRevision((value) => value + 1);

  useEffect(
    () => () => {
      active.current?.abort();
      currentImage.current?.bitmap.close();
      services.engine.dispose();
    },
    [services],
  );

  async function load(file: File) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setCanCancel(true);
    setError(null);
    setMessage('');
    setProgress({ message: 'Opening your image…' });
    try {
      const next = await services.open(file);
      if (controller.signal.aborted) {
        next.bitmap.close();
        return;
      }
      currentImage.current?.bitmap.close();
      currentImage.current = next;
      setImage(next);
      setHistory(new MaskHistory(createMask(next.width, next.height)));
      setPoints([]);
      setFeather(0);
      setName(`${safeStem(file.name.replace(/\.[^.]+$/, ''))}-cutout`);
      refresh();
      setMessage('Image ready. Remove the background or choose the objects to keep.');
      services.engine.warmup?.();
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : 'Could not open this image.');
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
        setCanCancel(false);
      }
    }
  }

  async function segment(withPoints: boolean) {
    if (!image || !history || busy) return false;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setCanCancel(true);
    setError(null);
    setMessage('');
    setProgress({ message: 'Starting AI…' });
    try {
      const mask = await services.engine.segment(
        image,
        withPoints ? points : null,
        controller.signal,
        setProgress,
      );
      if (controller.signal.aborted) return false;
      history.replace(mask);
      refresh();
      setMessage('Background removed. Check the edges and refine with the brushes.');
      return true;
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : 'Could not remove the background.');
      return false;
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
        setCanCancel(false);
      }
    }
  }

  async function download() {
    if (!image || !history || busy || nameError(name)) return;
    setBusy(true);
    setError(null);
    setProgress({ message: 'Preparing your transparent PNG…' });
    try {
      services.download(
        await services.renderPng(image.bitmap, history.mask, feather),
        `${normalizedName(name)}.png`,
      );
      setMessage('Your PNG is ready. The preview background is not included.');
    } catch {
      setError('Could not create the PNG. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return {
    image,
    history,
    revision,
    refresh,
    points,
    setPoints,
    name,
    setName,
    feather,
    setFeather,
    busy,
    canCancel,
    progress,
    error,
    setError,
    message,
    load,
    segment,
    download,
    cancel: () => {
      active.current?.abort();
      setMessage('Cancelled. Your previous edits are still here.');
    },
    undo: () => {
      if (history?.undo()) refresh();
    },
    redo: () => {
      if (history?.redo()) refresh();
    },
    reset: () => {
      if (image && history) {
        history.replace(createMask(image.width, image.height));
        setPoints([]);
        setFeather(0);
        refresh();
        setMessage('Original restored. You can undo this change.');
      }
    },
  };
}
