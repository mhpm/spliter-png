import { useEffect, useReducer, useRef } from 'react';
import type { ArchiveWriter, Extractor } from './ports';
import { DEFAULT_OPTIONS } from '../domain/model';
import type { ExtractedImage, ExtractionOptions, Progress } from '../domain/model';
import { safeStem, normalizedName } from '../domain/names';

export interface SourceImage {
  file: File;
  url: string;
  width: number;
  height: number;
}
export interface ImageItem extends ExtractedImage {
  name: string;
  url: string;
}
export interface Services {
  extractor: Extractor;
  archive: ArchiveWriter;
  inspect: (file: Blob) => Promise<{ width: number; height: number }>;
  download: (blob: Blob, name: string) => void;
}
type Status = 'idle' | 'loading' | 'ready' | 'processing' | 'complete' | 'exporting';
interface State {
  source: SourceImage | null;
  items: ImageItem[];
  selectedIds: Set<number>;
  options: ExtractionOptions;
  status: Status;
  progress: Progress;
  error: string | null;
  opaque: boolean;
  dirty: boolean;
  downloaded: boolean;
}
const initialState: State = {
  source: null,
  items: [],
  selectedIds: new Set<number>(),
  options: { ...DEFAULT_OPTIONS },
  status: 'idle',
  progress: { percent: 0, message: '' },
  error: null,
  opaque: false,
  dirty: false,
  downloaded: false,
};
type Action =
  | { type: 'status'; status: Status }
  | { type: 'source'; source: SourceImage }
  | { type: 'options'; options: ExtractionOptions }
  | { type: 'progress'; progress: Progress }
  | { type: 'result'; items: ImageItem[]; opaque: boolean }
  | { type: 'rename'; id: number; name: string }
  | { type: 'toggleSelect'; id: number }
  | { type: 'selectAll' }
  | { type: 'deselectAll' }
  | { type: 'error'; message: string }
  | { type: 'cancel' }
  | { type: 'downloaded' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'source':
      return {
        ...state,
        source: action.source,
        items: [],
        selectedIds: new Set(),
        error: null,
        opaque: false,
        dirty: false,
        downloaded: false,
        status: 'ready',
      };
    case 'status':
      return {
        ...state,
        status: action.status,
        error: null,
        downloaded: false,
        progress: { percent: 0, message: 'Preparing…' },
      };
    case 'options':
      return {
        ...state,
        options: action.options,
        dirty: state.status === 'complete' || state.dirty,
      };
    case 'progress':
      return { ...state, progress: action.progress };
    case 'result':
      return {
        ...state,
        items: action.items,
        selectedIds: new Set(action.items.map((item) => item.id)),
        opaque: action.opaque,
        status: 'complete',
        error: null,
        dirty: false,
      };
    case 'rename':
      return {
        ...state,
        downloaded: false,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, name: action.name } : item,
        ),
      };
    case 'toggleSelect': {
      const nextSelected = new Set(state.selectedIds);
      if (nextSelected.has(action.id)) {
        nextSelected.delete(action.id);
      } else {
        nextSelected.add(action.id);
      }
      return {
        ...state,
        selectedIds: nextSelected,
        downloaded: false,
      };
    }
    case 'selectAll':
      return {
        ...state,
        selectedIds: new Set(state.items.map((item) => item.id)),
        downloaded: false,
      };
    case 'deselectAll':
      return {
        ...state,
        selectedIds: new Set(),
        downloaded: false,
      };
    case 'error':
      return {
        ...state,
        error: action.message,
        status: state.items.length ? 'complete' : state.source ? 'ready' : 'idle',
      };
    case 'cancel':
      return {
        ...state,
        status: state.items.length ? 'complete' : state.source ? 'ready' : 'idle',
        error: null,
      };
    case 'downloaded':
      return { ...state, status: 'complete', downloaded: true };
  }
}

export function useSplitter(services: Services) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const allocated = urls.current;
    return () => {
      // Invalidate the latest asynchronous operation, not the one at mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      operation.current++;
      controller.current?.abort();
      for (const url of allocated) URL.revokeObjectURL(url);
      allocated.clear();
    };
  }, []);

  function allocate(blob: Blob) {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }
  function release(url: string) {
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  }
  function begin() {
    controller.current?.abort();
    controller.current = new AbortController();
    return { id: ++operation.current, signal: controller.current.signal };
  }
  function fail(error: unknown, id: number) {
    if (id !== operation.current) return;
    if (error instanceof DOMException && error.name === 'AbortError') dispatch({ type: 'cancel' });
    else
      dispatch({
        type: 'error',
        message: error instanceof Error ? error.message : 'An error occurred. Please try again.',
      });
  }

  async function load(file: File) {
    const { id } = begin();
    dispatch({ type: 'status', status: 'loading' });
    try {
      const dimensions = await services.inspect(file);
      if (id !== operation.current) return;
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
      dispatch({ type: 'source', source: { file, url: allocate(file), ...dimensions } });
    } catch (error) {
      fail(error, id);
    }
  }

  async function extract() {
    if (!state.source) return;
    const { id, signal } = begin();
    dispatch({ type: 'status', status: 'processing' });
    try {
      const result = await services.extractor.extract(
        state.source.file,
        state.options,
        signal,
        (progress) => {
          if (id === operation.current) dispatch({ type: 'progress', progress });
        },
      );
      if (id !== operation.current) return;
      for (const item of state.items) release(item.url);
      const stem = safeStem(state.source.file.name);
      dispatch({
        type: 'result',
        opaque: result.opaque,
        items: result.images.map((item, index) => ({
          ...item,
          url: allocate(item.blob),
          name: `${stem}_${String(index + 1).padStart(3, '0')}`,
        })),
      });
    } catch (error) {
      fail(error, id);
    }
  }

  async function exportZip() {
    const selectedItems = state.items.filter((item) => state.selectedIds.has(item.id));
    if (!selectedItems.length || !state.source) return;
    const { id, signal } = begin();
    dispatch({ type: 'status', status: 'exporting' });
    try {
      const blob = await services.archive.create(selectedItems, signal);
      if (id !== operation.current) return;
      services.download(blob, `${safeStem(state.source.file.name)}_elements.zip`);
      dispatch({ type: 'downloaded' });
    } catch (error) {
      fail(error, id);
    }
  }

  function downloadSingle(id: number) {
    const item = state.items.find((item) => item.id === id);
    if (!item) return;
    const name = normalizedName(item.name) || `element_${id}`;
    services.download(item.blob, `${name}.png`);
  }

  function cancel() {
    operation.current++;
    controller.current?.abort();
    dispatch({ type: 'cancel' });
  }
  return {
    state,
    load,
    extract,
    exportZip,
    downloadSingle,
    cancel,
    toggleSelect: (id: number) => dispatch({ type: 'toggleSelect', id }),
    selectAll: () => dispatch({ type: 'selectAll' }),
    deselectAll: () => dispatch({ type: 'deselectAll' }),
    setOptions: (options: ExtractionOptions) => dispatch({ type: 'options', options }),
    rename: (id: number, name: string) => dispatch({ type: 'rename', id, name }),
    reportError: (message: string) => dispatch({ type: 'error', message }),
  };
}
