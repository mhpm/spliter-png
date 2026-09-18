import { useEffect, useMemo, useRef, useState } from 'react';
import { Heading } from 'react-aria-components';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckSquare,
  Copy,
  Download,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Layers,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type { ImageItem } from '../application/use-splitter';
import { safeStem } from '../domain/names';
import {
  type FrameLayer,
  type LayerTransform,
  type StudioFrame,
  DEFAULT_LAYER_TRANSFORM,
  calculateFrameDimensions,
  createFrameFromItem,
  createLayerFromItem,
  isFrameUntouched,
  sheetLayout,
} from './model';
import { compositeFrame } from './transform';
import type { ExportRequest } from './export.worker';
import './animation.css';

interface Props {
  initialFrames: ImageItem[];
  availableSprites?: ImageItem[];
  onClose: () => void;
  download: (blob: Blob, name: string) => void;
}

export default function AnimationEditor({
  initialFrames,
  availableSprites = [],
  onClose,
  download,
}: Props) {
  const [frames, setFrames] = useState<StudioFrame[]>(() =>
    initialFrames.map((f, i) => createFrameFromItem(f, i)),
  );
  const [active, setActive] = useState(0);
  const [selectedLayerIndices, setSelectedLayerIndices] = useState<number[]>([0]);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(12);
  const [loop, setLoop] = useState(true);
  const [columns, setColumns] = useState(Math.ceil(Math.sqrt(initialFrames.length)));
  const [padding, setPadding] = useState(2);
  const [alignment, setAlignment] = useState<'center' | 'bottom'>('bottom');
  const [view, setView] = useState<'animation' | 'sheet'>('animation');
  const [name, setName] = useState('my-animation');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState('');

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<StudioFrame[][]>([]);
  const [redoStack, setRedoStack] = useState<StudioFrame[][]>([]);

  // Marquee selection state
  const [marqueeBox, setMarqueeBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const marqueeRef = useRef<{
    startX: number;
    startY: number;
    stageOffsetLeft: number;
    stageOffsetTop: number;
  } | null>(null);
  const worker = useRef<Worker | null>(null);
  const dragSnapshot = useRef<StudioFrame[] | null>(null);
  const sliderSnapshot = useRef<StudioFrame[] | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    initialPositions: Map<number, { x: number; y: number }>;
    hasMoved: boolean;
  } | null>(null);

  const allAvailableSprites = availableSprites.length ? availableSprites : initialFrames;
  const count = frames.length;
  const safeActive = Math.min(Math.max(0, active), Math.max(0, count - 1));
  const activeFrame = frames[safeActive] || frames[0];
  const activeLayers = useMemo(() => activeFrame?.layers || [], [activeFrame]);

  // Guaranteed valid selected layer indices
  const validSelectedIndices = useMemo(() => {
    if (!activeLayers.length) return [];
    const maxIdx = activeLayers.length - 1;
    const filtered = selectedLayerIndices.filter((idx) => idx >= 0 && idx <= maxIdx);
    return filtered.length > 0 ? filtered : [0];
  }, [selectedLayerIndices, activeLayers.length]);

  const primaryLayerIndex = validSelectedIndices[0] ?? 0;
  const primaryLayer = activeLayers[primaryLayerIndex] || activeLayers[0];
  const selectedLayers = useMemo(
    () => validSelectedIndices.map((i) => activeLayers[i]).filter(Boolean),
    [validSelectedIndices, activeLayers],
  );
  const isMultiSelected = validSelectedIndices.length > 1;

  const hasEdits = frames.some((f) => !isFrameUntouched(f));
  const frameSizes = frames.map(calculateFrameDimensions);
  const maxFrameWidth = Math.max(...frameSizes.map((f) => f.width));
  const maxFrameHeight = Math.max(...frameSizes.map((f) => f.height));

  const actualColumns = Math.min(columns, count);
  let layout: ReturnType<typeof sheetLayout> | undefined;
  let layoutError = '';
  try {
    layout = sheetLayout(frameSizes, actualColumns, padding);
  } catch (e) {
    layoutError = e instanceof Error ? e.message : 'Invalid sheet size.';
  }

  const cellWidth = maxFrameWidth + padding * 2;
  const cellHeight = maxFrameHeight + padding * 2;
  const delay = Math.round(100 / fps) * 10;

  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (safeActive + 1 >= count && !loop) setPlaying(false);
      else setActive((safeActive + 1) % count);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, safeActive, count, loop, delay]);

  // Deep-clone frames while preserving intact Blob instances
  function cloneFrames(input: StudioFrame[]): StudioFrame[] {
    return input.map((f) => ({
      ...f,
      layers: f.layers.map((l) => ({
        ...l,
        transform: { ...l.transform },
      })),
    }));
  }

  // History management
  function recordState(beforeFrames: StudioFrame[]) {
    setUndoStack((prev) => [...prev.slice(-35), cloneFrames(beforeFrames)]);
    setRedoStack([]);
  }

  function undo() {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, cloneFrames(frames)]);
    setFrames(previous);
  }

  function redo() {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, cloneFrames(frames)]);
    setFrames(next);
  }

  // Keyboard shortcut listener for Ctrl+Z and Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (target.getAttribute('type') === 'text') return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function updateFrames(next: StudioFrame[], index = 0) {
    recordState(frames);
    setPlaying(false);
    setFrames(next);
    setActive(Math.min(index, Math.max(0, next.length - 1)));
    setSelectedLayerIndices([0]);
    setError('');
  }

  function moveFrame(direction: number) {
    const to = safeActive + direction;
    if (to < 0 || to >= count) return;
    const next = [...frames];
    [next[safeActive], next[to]] = [next[to], next[safeActive]];
    updateFrames(next, to);
  }

  // Transform update for all selected layers
  function updateSelectedLayersTransform(
    patch:
      | Partial<LayerTransform>
      | ((current: LayerTransform, layer: FrameLayer, idx: number) => Partial<LayerTransform>),
    record = true,
  ) {
    if (!primaryLayer) return;
    if (record) recordState(frames);
    setFrames((prev) => {
      const next = [...prev];
      const targetFrame = { ...next[safeActive] };
      const layers = [...targetFrame.layers];
      targetFrame.layers = layers.map((layer, idx) => {
        if (!validSelectedIndices.includes(idx)) return layer;
        const resolvedPatch =
          typeof patch === 'function' ? patch(layer.transform, layer, idx) : patch;
        return {
          ...layer,
          transform: {
            ...layer.transform,
            ...resolvedPatch,
          },
        };
      });
      next[safeActive] = targetFrame;
      return next;
    });
  }

  function applyTransformToAllFrames(transform: LayerTransform) {
    recordState(frames);
    setFrames((prev) =>
      prev.map((f) => {
        const layers = [...f.layers];
        for (const targetIdx of validSelectedIndices) {
          if (layers[targetIdx]) {
            layers[targetIdx] = {
              ...layers[targetIdx],
              transform: { ...transform },
            };
          }
        }
        return { ...f, layers };
      }),
    );
  }

  function addLayerToActiveFrame(item: ImageItem) {
    recordState(frames);
    setFrames((prev) => {
      const next = [...prev];
      const targetFrame = { ...next[safeActive] };
      const newLayer = createLayerFromItem(item);
      targetFrame.layers = [...targetFrame.layers, newLayer];
      next[safeActive] = targetFrame;
      return next;
    });
    setSelectedLayerIndices([activeLayers.length]);
    setShowLibrary(false);
  }

  function removeSelectedLayers() {
    if (activeLayers.length <= 1) return;
    recordState(frames);
    setFrames((prev) => {
      const next = [...prev];
      const targetFrame = { ...next[safeActive] };
      const remaining = targetFrame.layers.filter((_, i) => !validSelectedIndices.includes(i));
      targetFrame.layers = remaining.length > 0 ? remaining : [targetFrame.layers[0]];
      next[safeActive] = targetFrame;
      return next;
    });
    setSelectedLayerIndices([0]);
  }

  function duplicateSelectedLayers() {
    recordState(frames);
    const newLayers: FrameLayer[] = [];
    selectedLayers.forEach((source) => {
      newLayers.push({
        ...source,
        id: `layer-${source.spriteId}-${Math.random().toString(36).slice(2, 9)}`,
        transform: {
          ...source.transform,
          x: (source.transform.x || 0) + 14,
          y: (source.transform.y || 0) + 14,
        },
      });
    });
    const newStartIdx = activeLayers.length;
    setFrames((prev) => {
      const next = [...prev];
      const targetFrame = { ...next[safeActive] };
      targetFrame.layers = [...targetFrame.layers, ...newLayers];
      next[safeActive] = targetFrame;
      return next;
    });
    setSelectedLayerIndices(newLayers.map((_, i) => newStartIdx + i));
  }

  function moveLayerOrder(fromIdx: number, toIdx: number) {
    if (toIdx < 0 || toIdx >= activeLayers.length) return;
    recordState(frames);
    setFrames((prev) => {
      const next = [...prev];
      const targetFrame = { ...next[safeActive] };
      const layers = [...targetFrame.layers];
      const [moved] = layers.splice(fromIdx, 1);
      layers.splice(toIdx, 0, moved);
      targetFrame.layers = layers;
      next[safeActive] = targetFrame;
      return next;
    });
    setSelectedLayerIndices([toIdx]);
  }

  function toggleLayerVisibility(layerIdx: number) {
    recordState(frames);
    setFrames((prev) => {
      const next = [...prev];
      const targetFrame = { ...next[safeActive] };
      const layers = [...targetFrame.layers];
      if (layers[layerIdx]) {
        layers[layerIdx] = {
          ...layers[layerIdx],
          transform: {
            ...layers[layerIdx].transform,
            visible: !layers[layerIdx].transform.visible,
          },
        };
      }
      targetFrame.layers = layers;
      next[safeActive] = targetFrame;
      return next;
    });
  }

  function resetSelectedLayersTransform() {
    recordState(frames);
    updateSelectedLayersTransform({ ...DEFAULT_LAYER_TRANSFORM }, false);
  }

  function addFrameFromSprite(item: ImageItem) {
    recordState(frames);
    const newFrame = createFrameFromItem(item, frames.length);
    setFrames((prev) => [...prev, newFrame]);
    setActive(frames.length);
    setSelectedLayerIndices([0]);
    setShowLibrary(false);
  }

  // Pointer drag handling for layers
  function handleLayerPointerDown(e: React.PointerEvent, layerIndex: number) {
    if (playing) return;
    e.stopPropagation();

    // Multi-select with Shift or Ctrl
    if (e.shiftKey || e.ctrlKey) {
      if (validSelectedIndices.includes(layerIndex)) {
        if (validSelectedIndices.length > 1) {
          setSelectedLayerIndices(validSelectedIndices.filter((i) => i !== layerIndex));
        }
      } else {
        setSelectedLayerIndices([...validSelectedIndices, layerIndex]);
      }
      return;
    }

    // Normal click: if not already selected, select only this layer
    let currentSelection = validSelectedIndices;
    if (!validSelectedIndices.includes(layerIndex)) {
      currentSelection = [layerIndex];
      setSelectedLayerIndices([layerIndex]);
    }

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const initialPositions = new Map<number, { x: number; y: number }>();
    for (const idx of currentSelection) {
      const lyr = activeLayers[idx];
      if (lyr) {
        initialPositions.set(idx, { x: lyr.transform.x || 0, y: lyr.transform.y || 0 });
      }
    }

    dragSnapshot.current = frames;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialPositions,
      hasMoved: false,
    };
  }

  function handleStagePointerDown(e: React.PointerEvent) {
    if (playing) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-layer-index]')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const stageScrollX = e.currentTarget.scrollLeft;
    const stageScrollY = e.currentTarget.scrollTop;
    const startX = e.clientX - rect.left + stageScrollX;
    const startY = e.clientY - rect.top + stageScrollY;

    // Start Marquee box selection
    marqueeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      stageOffsetLeft: rect.left - stageScrollX,
      stageOffsetTop: rect.top - stageScrollY,
    };
    setMarqueeBox({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragRef.current) {
      const dx = Math.round(e.clientX - dragRef.current.startX);
      const dy = Math.round(e.clientY - dragRef.current.startY);
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        dragRef.current.hasMoved = true;
      }
      updateSelectedLayersTransform(
        (t, _, idx) => {
          const init = dragRef.current?.initialPositions.get(idx);
          if (!init) return t;
          return {
            x: init.x + dx,
            y: init.y + dy,
          };
        },
        false,
      );
      return;
    }

    if (marqueeRef.current) {
      const currentX = e.clientX - marqueeRef.current.stageOffsetLeft;
      const currentY = e.clientY - marqueeRef.current.stageOffsetTop;
      setMarqueeBox((prev) =>
        prev
          ? {
              ...prev,
              currentX,
              currentY,
            }
          : null,
      );
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (dragRef.current) {
      if (dragRef.current.hasMoved && dragSnapshot.current) {
        recordState(dragSnapshot.current);
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe capture release
      }
      dragRef.current = null;
      dragSnapshot.current = null;
      return;
    }

    if (marqueeRef.current && stageRef.current) {
      const startX = marqueeRef.current.startX;
      const startY = marqueeRef.current.startY;
      const endX = e.clientX;
      const endY = e.clientY;
      const boxLeft = Math.min(startX, endX);
      const boxTop = Math.min(startY, endY);
      const boxRight = Math.max(startX, endX);
      const boxBottom = Math.max(startY, endY);
      const boxW = boxRight - boxLeft;
      const boxH = boxBottom - boxTop;

      if (boxW > 6 || boxH > 6) {
        const hitIndices: number[] = [];
        const elements = stageRef.current.querySelectorAll<HTMLElement>('[data-layer-index]');
        elements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const intersects = !(
            rect.right < boxLeft ||
            rect.left > boxRight ||
            rect.bottom < boxTop ||
            rect.top > boxBottom
          );
          if (intersects) {
            const idx = Number(el.dataset.layerIndex);
            if (!Number.isNaN(idx)) hitIndices.push(idx);
          }
        });

        if (hitIndices.length > 0) {
          if (e.shiftKey || e.ctrlKey) {
            setSelectedLayerIndices(Array.from(new Set([...validSelectedIndices, ...hitIndices])));
          } else {
            setSelectedLayerIndices(hitIndices);
          }
        }
      } else {
        // Clicked on empty space without dragging: deselect or select first if empty
        if (!e.shiftKey && !e.ctrlKey) {
          setSelectedLayerIndices([0]);
        }
      }
      marqueeRef.current = null;
      setMarqueeBox(null);
    }
  }

  function cancelExport() {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  }

  async function exportImage(kind: 'png' | 'gif') {
    if (!layout || progress !== null) return;
    setPlaying(false);
    setError('');
    setProgress(0);
    try {
      const unifiedBounds = hasEdits ? { width: maxFrameWidth, height: maxFrameHeight } : undefined;
      const renderedFrames: { blob: Blob; width: number; height: number }[] = [];

      for (const f of frames) {
        if (!hasEdits && isFrameUntouched(f)) {
          renderedFrames.push({
            blob: f.layers[0].blob,
            width: f.layers[0].width,
            height: f.layers[0].height,
          });
        } else {
          const comp = await compositeFrame(f, unifiedBounds);
          renderedFrames.push({
            blob: comp.blob,
            width: comp.width,
            height: comp.height,
          });
        }
      }

      const task = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
      worker.current = task;
      task.onmessage = ({
        data,
      }: MessageEvent<{ progress?: number; blob?: Blob; error?: string }>) => {
        if (data.error) {
          setError(data.error);
          cancelExport();
        } else if (data.blob) {
          download(
            data.blob,
            `${safeStem(name || 'my-animation')}${kind === 'png' ? '-sheet' : ''}.${kind}`,
          );
          cancelExport();
        } else if (data.progress !== undefined) setProgress(data.progress);
      };
      task.onerror = () => {
        setError('Export failed. Try fewer frames or smaller sprites.');
        cancelExport();
      };
      task.postMessage({
        frames: renderedFrames,
        columns: actualColumns,
        padding,
        fps,
        loop,
        alignment,
        kind,
      } satisfies ExportRequest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
      cancelExport();
    }
  }

  function exportMetadata() {
    if (!layout) return;
    const unifiedBounds = hasEdits ? { width: maxFrameWidth, height: maxFrameHeight } : undefined;

    const frameMetadata = frames.map((f, i) => {
      const dim = unifiedBounds || calculateFrameDimensions(f);
      return {
        name: f.name,
        duration: delay,
        layersCount: f.layers.length,
        frame: {
          x: (i % actualColumns) * cellWidth,
          y: Math.floor(i / actualColumns) * cellHeight,
          w: cellWidth,
          h: cellHeight,
        },
        sprite: {
          x: Math.floor((cellWidth - dim.width) / 2),
          y:
            alignment === 'bottom'
              ? cellHeight - padding - dim.height
              : Math.floor((cellHeight - dim.height) / 2),
          w: dim.width,
          h: dim.height,
        },
      };
    });

    const json = JSON.stringify(
      {
        generator: 'Splitter Animation Studio',
        width: layout.width,
        height: layout.height,
        cellWidth,
        cellHeight,
        columns: actualColumns,
        rows: layout.rows,
        padding,
        alignment,
        sheet: {
          width: layout.width,
          height: layout.height,
          cellWidth,
          cellHeight,
          columns: actualColumns,
          rows: layout.rows,
          padding,
          alignment,
        },
        frames: frameMetadata,
      },
      null,
      2,
    );

    download(new Blob([json], { type: 'application/json' }), `${safeStem(name || 'my-animation')}.json`);
  }

  const filteredLibrary = allAvailableSprites.filter((item) =>
    item.name.toLowerCase().includes(libraryFilter.trim().toLowerCase()),
  );

  return (
    <div
      className="animation-workspace-view"
      role="dialog"
      aria-label="Animation studio"
    >
      {/* Extracted Sprite Library Modal Backdrop & Dialog */}
      {showLibrary && (
        <div
          className="sprite-library-backdrop"
          onClick={() => setShowLibrary(false)}
        >
          <div
            className="sprite-library-drawer sprite-library-modal"
            role="region"
            aria-label="Sprite Library"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="library-drawer-header">
              <div className="library-heading">
                <Sparkles size={20} className="text-accent" />
                <div>
                  <h4>Extracted Sprite Library</h4>
                  <p>
                    Include elements from your initial split. Combine into frame {safeActive + 1} or
                    append as new frames.
                  </p>
                </div>
              </div>
              <div className="library-search-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search split sprites…"
                  value={libraryFilter}
                  onChange={(e) => setLibraryFilter(e.target.value)}
                  autoFocus
                />
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowLibrary(false)}
                aria-label="Close sprite library"
              >
                <X size={20} />
              </button>
            </div>

            <div className="library-grid">
              {filteredLibrary.map((item) => (
                <div key={item.id} className="library-card">
                  <div className="card-thumb checkerboard">
                    <img src={item.url} alt={item.name} />
                  </div>
                  <div className="card-info">
                    <strong title={item.name}>{item.name}</strong>
                    <small>
                      {item.width} × {item.height} px
                    </small>
                  </div>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="library-btn library-btn-primary"
                      onClick={() => addLayerToActiveFrame(item)}
                    >
                      <Plus size={14} /> Combine in Frame {safeActive + 1}
                    </button>
                    <button
                      type="button"
                      className="library-btn library-btn-secondary"
                      onClick={() => addFrameFromSprite(item)}
                    >
                      <Plus size={14} /> + New Frame
                    </button>
                  </div>
                </div>
              ))}
              {!filteredLibrary.length && (
                <p className="no-sprites-message">No matching sprites found in library.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <header className="animation-header">
        <div className="animation-header-left">
          <button
            type="button"
            className="btn-back-workspace"
            onClick={onClose}
            aria-label="Close animation studio"
          >
            <ArrowLeft size={16} />
            <span>Back to extracted elements</span>
          </button>
          <div className="animation-header-title">
            <span className="eyebrow text-accent">SPRITE WORKSHOP</span>
            <Heading level={2}>Animation studio</Heading>
            <p>Compose multi-layer sprites, adjust animations, and export seamlessly.</p>
          </div>
        </div>

        <div className="animation-header-actions">
          {/* Visible Undo / Redo buttons */}
          <div className="history-btn-group" role="group" aria-label="History controls">
            <button
              type="button"
              className="sprite-button history-btn"
              onClick={undo}
              disabled={undoStack.length === 0}
              title="Undo (Ctrl + Z)"
              aria-label="Undo"
            >
              <Undo2 size={16} />
              <span>Undo</span>
            </button>
            <button
              type="button"
              className="sprite-button history-btn"
              onClick={redo}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl + Y)"
              aria-label="Redo"
            >
              <Redo2 size={16} />
              <span>Redo</span>
            </button>
          </div>

          <button
            type="button"
            className="sprite-button btn-library-toggle"
            onClick={() => setShowLibrary((prev) => !prev)}
            aria-expanded={showLibrary}
          >
            <Sparkles size={15} />
            <span>Sprite library ({allAvailableSprites.length})</span>
          </button>
        </div>
      </header>

      <div className="animation-body">
        <section className="animation-preview-panel" aria-label="Animation preview">

          <div className="animation-view-switch">
            <button
              aria-pressed={view === 'animation'}
              onClick={() => setView('animation')}
            >
              Animation
            </button>
            <button
              aria-pressed={view === 'sheet'}
              onClick={() => {
                setPlaying(false);
                setView('sheet');
              }}
            >
              Spritesheet
            </button>
            <span>
              {count} frames · {((count * delay) / 1000).toFixed(2)}s
            </span>
          </div>

          {/* Top Quick Transform Bar */}
          {primaryLayer && (
            <div className="quick-transform-bar" aria-label="Transform quick tools">
              <div className="quick-transform-group">
                <button
                  type="button"
                  className={`sprite-button mini-btn ${primaryLayer.transform.flipX ? 'active' : ''}`}
                  title="Flip horizontal"
                  onClick={() =>
                    updateSelectedLayersTransform((t) => ({ flipX: !t.flipX }))
                  }
                >
                  <FlipHorizontal2 size={15} /> Flip H
                </button>
                <button
                  type="button"
                  className={`sprite-button mini-btn ${primaryLayer.transform.flipY ? 'active' : ''}`}
                  title="Flip vertical"
                  onClick={() =>
                    updateSelectedLayersTransform((t) => ({ flipY: !t.flipY }))
                  }
                >
                  <FlipVertical2 size={15} /> Flip V
                </button>
                <button
                  type="button"
                  className="sprite-button mini-btn"
                  title="Rotate -90°"
                  onClick={() =>
                    updateSelectedLayersTransform((t) => ({
                      rotation: (t.rotation - 90 + 360) % 360,
                    }))
                  }
                >
                  <RotateCcw size={14} /> -90°
                </button>
                <button
                  type="button"
                  className="sprite-button mini-btn"
                  title="Rotate +90°"
                  onClick={() =>
                    updateSelectedLayersTransform((t) => ({
                      rotation: (t.rotation + 90) % 360,
                    }))
                  }
                >
                  <RotateCw size={14} /> +90°
                </button>
              </div>

              <div className="quick-transform-group scale-group">
                <span className="mini-label">Scale:</span>
                <input
                  type="range"
                  min="10"
                  max="400"
                  value={primaryLayer.transform.scale}
                  onPointerDown={() => {
                    sliderSnapshot.current = frames;
                  }}
                  onChange={(e) => {
                    const newScale = Number(e.target.value);
                    updateSelectedLayersTransform({ scale: newScale }, false);
                  }}
                  onPointerUp={() => {
                    if (sliderSnapshot.current) {
                      recordState(sliderSnapshot.current);
                      sliderSnapshot.current = null;
                    }
                  }}
                  aria-label="Layer scale percentage"
                />
                <span className="scale-value tabular-nums">{primaryLayer.transform.scale}%</span>
              </div>

              {isMultiSelected && (
                <span className="badge multi-selected-badge">
                  <CheckSquare size={12} /> {validSelectedIndices.length} layers selected
                </span>
              )}

              <div className="quick-transform-group ml-auto">
                <button
                  type="button"
                  className="sprite-button mini-btn"
                  title="Reset layer transform"
                  onClick={resetSelectedLayersTransform}
                >
                  <RotateCcw size={13} /> Reset
                </button>
              </div>
            </div>
          )}

          {/* Stage */}
          <div
            ref={stageRef}
            className="animation-stage checkerboard"
            onPointerDown={handleStagePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Render Marquee Selection Box */}
            {marqueeBox && (
              <div
                className="stage-marquee-selection"
                style={{
                  position: 'absolute',
                  left: `${Math.min(marqueeBox.startX, marqueeBox.currentX)}px`,
                  top: `${Math.min(marqueeBox.startY, marqueeBox.currentY)}px`,
                  width: `${Math.abs(marqueeBox.currentX - marqueeBox.startX)}px`,
                  height: `${Math.abs(marqueeBox.currentY - marqueeBox.startY)}px`,
                }}
              />
            )}

            {view === 'animation' ? (
              <div
                className="animation-cell stage-cell"
                style={{
                  width: `${cellWidth}px`,
                  height: `${cellHeight}px`,
                }}
              >
                {activeLayers.map((layer, idx) => {
                  if (!layer.transform.visible) return null;
                  const isSelected = validSelectedIndices.includes(idx);
                  const s = (layer.transform.scale || 100) / 100;
                  const w = layer.width * s;
                  const h = layer.height * s;
                  const ox = layer.transform.x || 0;
                  const oy = layer.transform.y || 0;
                  const fx = layer.transform.flipX ? -1 : 1;
                  const fy = layer.transform.flipY ? -1 : 1;

                  return (
                    <div
                      key={layer.id}
                      data-layer-index={idx}
                      className={`stage-layer-element ${isSelected ? 'active-layer-selection' : ''}`}
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: `${w}px`,
                        height: `${h}px`,
                        transform: `translate(-50%, -50%) translate(${ox}px, ${oy}px) rotate(${layer.transform.rotation || 0}deg) scale(${fx}, ${fy})`,
                        opacity: layer.transform.opacity ?? 1,
                        cursor: playing ? 'default' : 'grab',
                      }}
                      onPointerDown={(e) => handleLayerPointerDown(e, idx)}
                    >
                      <img
                        src={layer.url}
                        alt={layer.name}
                        draggable={false}
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'block',
                          imageRendering: 'pixelated',
                          pointerEvents: 'none',
                        }}
                      />
                      {isSelected && !playing && (
                        <div className="layer-selection-outline" aria-hidden="true">
                          <span className="handle-dot tl" />
                          <span className="handle-dot tr" />
                          <span className="handle-dot bl" />
                          <span className="handle-dot br" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className="spritesheet-preview-grid"
                style={{
                  gridTemplateColumns: `repeat(${actualColumns}, minmax(0, 1fr))`,
                }}
              >
                {frames.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`preview-sheet-frame ${i === safeActive ? 'active' : ''}`}
                    style={{ aspectRatio: `${cellWidth}/${cellHeight}` }}
                    aria-label={`Preview sheet frame ${i + 1}`}
                    onClick={() => {
                      setActive(i);
                      setView('animation');
                    }}
                  >
                    {f.layers.map((layer, idx) => {
                      if (!layer.transform.visible) return null;
                      const s = (layer.transform.scale || 100) / 100;
                      const w = (layer.width * s * 100) / cellWidth;
                      const h = (layer.height * s * 100) / cellHeight;
                      const ox = ((layer.transform.x || 0) * 100) / cellWidth;
                      const oy = ((layer.transform.y || 0) * 100) / cellHeight;
                      const fx = layer.transform.flipX ? -1 : 1;
                      const fy = layer.transform.flipY ? -1 : 1;
                      return (
                        <div
                          key={layer.id || idx}
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            width: `${w}%`,
                            height: `${h}%`,
                            transform: `translate(-50%, -50%) translate(${ox}%, ${oy}%) rotate(${layer.transform.rotation || 0}deg) scale(${fx}, ${fy})`,
                            opacity: layer.transform.opacity ?? 1,
                          }}
                        >
                          <img
                            src={layer.url}
                            alt=""
                            style={{
                              width: '100%',
                              height: '100%',
                              display: 'block',
                              imageRendering: 'pixelated',
                            }}
                          />
                        </div>
                      );
                    })}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Direct coordinates status bar */}
          {primaryLayer && (
            <div className="stage-status-bar">
              <span>
                Selected:{' '}
                <strong>
                  {isMultiSelected
                    ? `${validSelectedIndices.length} layers (${selectedLayers.map((l) => l.name).join(', ')})`
                    : primaryLayer.name}
                </strong>
              </span>
              <span>
                Offset: X {primaryLayer.transform.x || 0}px · Y {primaryLayer.transform.y || 0}px
              </span>
              <span>Scale: {primaryLayer.transform.scale}%</span>
              <span>Rot: {primaryLayer.transform.rotation || 0}°</span>
              <small className="drag-hint">
                Tip: Click + drag on canvas to box-select multiple sprites (or Shift+Click)
              </small>
            </div>
          )}

          {/* Frame Layers Strip */}
          <div className="frame-layers-panel">
            <div className="layers-panel-header">
              <div className="layers-title">
                <Layers size={15} />
                <span>
                  Layers in Frame {safeActive + 1} ({activeLayers.length})
                </span>
                {activeLayers.length > 1 && (
                  <button
                    type="button"
                    className="chip-btn select-all-btn"
                    onClick={() => setSelectedLayerIndices(activeLayers.map((_, i) => i))}
                  >
                    Select all
                  </button>
                )}
              </div>
              <button
                type="button"
                className="sprite-button mini-btn btn-add-sprite-layer"
                onClick={() => setShowLibrary(true)}
              >
                <Plus size={14} /> Combine another sprite
              </button>
            </div>

            <div className="layers-chips-list">
              {activeLayers.map((layer, idx) => {
                const isSelected = validSelectedIndices.includes(idx);
                return (
                  <div
                    key={layer.id}
                    className={`layer-chip ${isSelected ? 'active selected' : ''}`}
                    onClick={(e) => {
                      if (e.shiftKey || e.ctrlKey) {
                        if (validSelectedIndices.includes(idx)) {
                          if (validSelectedIndices.length > 1) {
                            setSelectedLayerIndices(validSelectedIndices.filter((i) => i !== idx));
                          }
                        } else {
                          setSelectedLayerIndices([...validSelectedIndices, idx]);
                        }
                      } else {
                        setSelectedLayerIndices([idx]);
                      }
                    }}
                  >
                    <button
                      type="button"
                      className="chip-vis-btn"
                      title={layer.transform.visible ? 'Hide layer' : 'Show layer'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerVisibility(idx);
                      }}
                    >
                      {layer.transform.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <span className="chip-thumb checkerboard">
                      <img src={layer.url} alt="" />
                    </span>
                    <span className="chip-name" title={layer.name}>
                      {layer.name}
                    </span>
                    <div className="chip-actions">
                      <button
                        type="button"
                        className="chip-btn"
                        disabled={idx === 0}
                        title="Send backward"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveLayerOrder(idx, idx - 1);
                        }}
                      >
                        <ArrowLeft size={11} />
                      </button>
                      <button
                        type="button"
                        className="chip-btn"
                        disabled={idx === activeLayers.length - 1}
                        title="Bring forward"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveLayerOrder(idx, idx + 1);
                        }}
                      >
                        <ArrowRight size={11} />
                      </button>
                      <button
                        type="button"
                        className="chip-btn"
                        title="Duplicate layer"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateSelectedLayers();
                        }}
                      >
                        <Copy size={11} />
                      </button>
                      {activeLayers.length > 1 && (
                        <button
                          type="button"
                          className="chip-btn delete-chip-btn"
                          title="Delete selected layer(s)"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSelectedLayers();
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Playback Controls & Frame Scrubber */}
          <div className="animation-playback">
            <button
              type="button"
              className="sprite-button"
              disabled={safeActive === 0}
              onClick={() => {
                setPlaying(false);
                setActive((safeActive + count - 1) % count);
              }}
              aria-label="Previous frame"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              className="sprite-button sprite-primary"
              onClick={() => {
                setView('animation');
                if (!playing && safeActive === count - 1) setActive(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
              <span>{playing ? 'Pause' : 'Play'}</span>
            </button>
            <button
              type="button"
              className="sprite-button"
              disabled={safeActive === count - 1}
              onClick={() => {
                setPlaying(false);
                setActive((safeActive + 1) % count);
              }}
              aria-label="Next frame"
            >
              <ArrowRight size={16} />
            </button>
            <span className="frame-indicator" data-testid="frame-counter">
              Frame {safeActive + 1} / {count}
            </span>
          </div>

          <label className="frame-scrubber">
            <span className="sr-only">Scrub frames</span>
            <input
              type="range"
              min="0"
              max={count - 1}
              value={safeActive}
              onChange={(e) => {
                setPlaying(false);
                setActive(Number(e.target.value));
              }}
            />
          </label>
        </section>

        {/* Sidebar Controls */}
        <aside className="animation-settings">
          {/* Sprite Transformation Section */}
          <div className="sidebar-section sprite-transform-section">
            <div className="section-title">
              <h4>Sprite manipulation</h4>
              <p>
                Editing: <strong>{isMultiSelected ? `${validSelectedIndices.length} layers selected` : primaryLayer?.name}</strong>
              </p>
            </div>

            {primaryLayer && (
              <div className="transform-controls-grid">
                {/* Scale Control */}
                <div className="control-group">
                  <div className="control-header">
                    <label htmlFor="scale-slider">Scale: {primaryLayer.transform.scale}%</label>
                  </div>
                  <input
                    id="scale-slider"
                    type="range"
                    min="10"
                    max="400"
                    value={primaryLayer.transform.scale}
                    onPointerDown={() => {
                      sliderSnapshot.current = frames;
                    }}
                    onChange={(e) => {
                      const newScale = Number(e.target.value);
                      updateSelectedLayersTransform({ scale: newScale }, false);
                    }}
                    onPointerUp={() => {
                      if (sliderSnapshot.current) {
                        recordState(sliderSnapshot.current);
                        sliderSnapshot.current = null;
                      }
                    }}
                  />
                  <div className="scale-preset-buttons">
                    {[50, 100, 150, 200].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`preset-btn ${primaryLayer.transform.scale === preset ? 'active' : ''}`}
                        onClick={() => updateSelectedLayersTransform({ scale: preset })}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Flip Controls */}
                <div className="control-group">
                  <span className="control-label">Flip & orientation</span>
                  <div className="button-pair">
                    <button
                      type="button"
                      className={`sprite-button toggle-btn ${primaryLayer.transform.flipX ? 'active' : ''}`}
                      onClick={() =>
                        updateSelectedLayersTransform((t) => ({ flipX: !t.flipX }))
                      }
                    >
                      <FlipHorizontal2 size={15} />
                      <span>Flip horizontal</span>
                    </button>
                    <button
                      type="button"
                      className={`sprite-button toggle-btn ${primaryLayer.transform.flipY ? 'active' : ''}`}
                      onClick={() =>
                        updateSelectedLayersTransform((t) => ({ flipY: !t.flipY }))
                      }
                    >
                      <FlipVertical2 size={15} />
                      <span>Flip vertical</span>
                    </button>
                  </div>
                </div>

                {/* Rotation Control */}
                <div className="control-group">
                  <label htmlFor="rotation-slider">Rotation: {primaryLayer.transform.rotation || 0}°</label>
                  <input
                    id="rotation-slider"
                    type="range"
                    min="0"
                    max="360"
                    value={primaryLayer.transform.rotation || 0}
                    onPointerDown={() => {
                      sliderSnapshot.current = frames;
                    }}
                    onChange={(e) => {
                      const newRot = Number(e.target.value);
                      updateSelectedLayersTransform({ rotation: newRot }, false);
                    }}
                    onPointerUp={() => {
                      if (sliderSnapshot.current) {
                        recordState(sliderSnapshot.current);
                        sliderSnapshot.current = null;
                      }
                    }}
                  />
                  <div className="button-pair mt-1">
                    <button
                      type="button"
                      className="sprite-button"
                      onClick={() =>
                        updateSelectedLayersTransform((t) => ({
                          rotation: (t.rotation - 90 + 360) % 360,
                        }))
                      }
                    >
                      <RotateCcw size={14} /> -90°
                    </button>
                    <button
                      type="button"
                      className="sprite-button"
                      onClick={() =>
                        updateSelectedLayersTransform((t) => ({
                          rotation: (t.rotation + 90) % 360,
                        }))
                      }
                    >
                      <RotateCw size={14} /> +90°
                    </button>
                  </div>
                </div>

                {/* Position Offset Control */}
                <div className="control-group">
                  <span className="control-label">Position offset (X, Y px)</span>
                  <div className="offset-inputs-row">
                    <div className="offset-input">
                      <span>X</span>
                      <input
                        type="number"
                        value={primaryLayer.transform.x || 0}
                        onChange={(e) =>
                          updateSelectedLayersTransform({ x: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="offset-input">
                      <span>Y</span>
                      <input
                        type="number"
                        value={primaryLayer.transform.y || 0}
                        onChange={(e) =>
                          updateSelectedLayersTransform({ y: Number(e.target.value) })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="sprite-button mini-btn"
                      onClick={() => updateSelectedLayersTransform({ x: 0, y: 0 })}
                    >
                      Center
                    </button>
                  </div>

                  {/* Nudge pad */}
                  <div className="nudge-pad">
                    <div className="nudge-row">
                      <button
                        type="button"
                        className="nudge-btn"
                        title="Nudge up"
                        onClick={() =>
                          updateSelectedLayersTransform((t) => ({ y: (t.y || 0) - 2 }))
                        }
                      >
                        <ArrowUp size={13} />
                      </button>
                    </div>
                    <div className="nudge-row">
                      <button
                        type="button"
                        className="nudge-btn"
                        title="Nudge left"
                        onClick={() =>
                          updateSelectedLayersTransform((t) => ({ x: (t.x || 0) - 2 }))
                        }
                      >
                        <ArrowLeft size={13} />
                      </button>
                      <span className="nudge-center-dot" />
                      <button
                        type="button"
                        className="nudge-btn"
                        title="Nudge right"
                        onClick={() =>
                          updateSelectedLayersTransform((t) => ({ x: (t.x || 0) + 2 }))
                        }
                      >
                        <ArrowRight size={13} />
                      </button>
                    </div>
                    <div className="nudge-row">
                      <button
                        type="button"
                        className="nudge-btn"
                        title="Nudge down"
                        onClick={() =>
                          updateSelectedLayersTransform((t) => ({ y: (t.y || 0) + 2 }))
                        }
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Opacity Control */}
                <div className="control-group">
                  <label htmlFor="opacity-slider">
                    Opacity: {Math.round((primaryLayer.transform.opacity ?? 1) * 100)}%
                  </label>
                  <input
                    id="opacity-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round((primaryLayer.transform.opacity ?? 1) * 100)}
                    onPointerDown={() => {
                      sliderSnapshot.current = frames;
                    }}
                    onChange={(e) => {
                      const newOpacity = Number(e.target.value) / 100;
                      updateSelectedLayersTransform({ opacity: newOpacity }, false);
                    }}
                    onPointerUp={() => {
                      if (sliderSnapshot.current) {
                        recordState(sliderSnapshot.current);
                        sliderSnapshot.current = null;
                      }
                    }}
                  />
                </div>

                {/* Batch Actions */}
                <div className="transform-batch-actions">
                  <button
                    type="button"
                    className="sprite-button w-full"
                    onClick={() => applyTransformToAllFrames(primaryLayer.transform)}
                  >
                    <Copy size={13} /> Apply transform to all frames
                  </button>
                  <button
                    type="button"
                    className="sprite-button w-full"
                    onClick={resetSelectedLayersTransform}
                  >
                    <RotateCcw size={13} /> Reset layer edits
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Animation Sequence & Export Settings */}
          <div className="sidebar-section animation-config-section">
            <div className="section-title">
              <h4>Animation settings</h4>
            </div>

            <div className="setting-field">
              <label htmlFor="anim-name">File name</label>
              <input
                id="anim-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-animation"
              />
            </div>

            <div className="setting-field">
              <label htmlFor="anim-fps">Speed · {fps} FPS</label>
              <input
                id="anim-fps"
                aria-label="Frames per second"
                type="range"
                min="1"
                max="60"
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
              />
            </div>

            <div className="setting-field checkbox-field">
              <label>
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(e) => setLoop(e.target.checked)}
                />
                Loop animation
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-field">
                <label htmlFor="anim-cols">Columns</label>
                <input
                  id="anim-cols"
                  type="number"
                  min="1"
                  max={count}
                  value={actualColumns}
                  onChange={(e) => setColumns(Math.max(1, Number(e.target.value)))}
                />
              </div>
              <div className="setting-field">
                <label htmlFor="anim-pad">Padding (px)</label>
                <input
                  id="anim-pad"
                  type="number"
                  min="0"
                  max="64"
                  value={padding}
                  onChange={(e) => setPadding(Math.max(0, Number(e.target.value)))}
                />
              </div>
            </div>

            <div className="setting-field">
              <label htmlFor="anim-align">Frame alignment</label>
              <select
                id="anim-align"
                value={alignment}
                onChange={(e) => setAlignment(e.target.value as 'center' | 'bottom')}
              >
                <option value="bottom">Bottom center (walking sprites)</option>
                <option value="center">True center (effects, items)</option>
              </select>
            </div>

            <p className="alignment-hint">
              Equal-sized cells keep frames aligned. Sprites keep their current size.
            </p>

            {layout && (
              <div className="sheet-dimensions-info">
                <span>
                  Cell: {cellWidth} × {cellHeight} px
                </span>
                <span>
                  Sheet: {layout.width} × {layout.height} px · {actualColumns} × {layout.rows}
                </span>
              </div>
            )}

            {layoutError && <p className="error-text">{layoutError}</p>}
            {error && <p className="error-text">{error}</p>}

            {progress !== null && (
              <div className="export-progress">
                <progress max={100} value={progress} />
                <span>Exporting… {progress}%</span>
                <button type="button" className="mini-btn" onClick={cancelExport}>
                  Cancel
                </button>
              </div>
            )}

            <div className="export-actions">
              <button
                type="button"
                className="sprite-button sprite-primary w-full"
                disabled={!layout || progress !== null}
                onClick={() => exportImage('png')}
              >
                <Download size={16} /> Download spritesheet PNG
              </button>
              <button
                type="button"
                className="sprite-button w-full"
                disabled={!layout || progress !== null}
                onClick={() => exportImage('gif')}
              >
                <Download size={16} /> Download animated GIF
              </button>
              <button
                type="button"
                className="sprite-button w-full"
                disabled={!layout || progress !== null}
                onClick={exportMetadata}
              >
                Download frame data (JSON)
              </button>
            </div>

            <p className="export-hint">
              PNG preserves full transparency. GIF uses up to 256 colors and hard transparency edges.
            </p>
          </div>
        </aside>
      </div>

      {/* Full width bottom timeline */}
      <section className="animation-timeline" aria-label="Animation frames">
        <div className="timeline-heading">
          <div>
            <h3>Frame sequence</h3>
            <p>Select a frame, then move, duplicate or remove it.</p>
          </div>
          <fieldset disabled={progress !== null} className="frame-actions">
            <button
              type="button"
              className="sprite-button"
              disabled={safeActive === 0}
              aria-label="Move frame earlier"
              onClick={() => moveFrame(-1)}
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              className="sprite-button"
              disabled={safeActive === count - 1}
              aria-label="Move frame later"
              onClick={() => moveFrame(1)}
            >
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="sprite-button"
              disabled={count >= 200}
              onClick={() => {
                const current = frames[safeActive];
                const clone: StudioFrame = {
                  ...current,
                  id: `frame-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  name: `${current.name}_copy`,
                  layers: current.layers.map((l) => ({
                    ...l,
                    id: `layer-${Math.random().toString(36).slice(2, 9)}`,
                    transform: { ...l.transform },
                  })),
                };
                const next = [...frames];
                next.splice(safeActive + 1, 0, clone);
                updateFrames(next, safeActive + 1);
              }}
            >
              <Copy size={16} /> Duplicate
            </button>
            <button
              type="button"
              className="sprite-button"
              disabled={count <= 1}
              onClick={() => {
                if (count <= 1) return;
                const next = frames.filter((_, i) => i !== safeActive);
                updateFrames(next, Math.max(0, safeActive - 1));
              }}
            >
              <Trash2 size={16} /> Remove
            </button>
            <button
              type="button"
              className="sprite-button"
              onClick={() => updateFrames([...frames].reverse(), count - 1 - safeActive)}
            >
              Reverse
            </button>
            <button
              type="button"
              className="sprite-button"
              onClick={() =>
                updateFrames(
                  initialFrames.map((f, i) => createFrameFromItem(f, i)),
                  0,
                )
              }
            >
              Reset sequence
            </button>
            <button
              type="button"
              className="sprite-button btn-timeline-add"
              onClick={() => setShowLibrary(true)}
            >
              <Plus size={16} /> + Add from library
            </button>
          </fieldset>
        </div>

        <div className="frame-strip">
          {frames.map((frame, i) => (
            <button
              key={frame.id}
              type="button"
              className={`frame-tile ${i === safeActive ? 'active' : ''}`}
              onClick={() => {
                setPlaying(false);
                setActive(i);
                setView('animation');
              }}
              aria-label={`Select animation frame ${i + 1}`}
              aria-pressed={i === safeActive}
            >
              <span className="tile-preview-box checkerboard">
                <img src={frame.layers[0]?.url} alt="" />
              </span>
              <strong>{String(i + 1).padStart(2, '0')}</strong>
              <div className="frame-tile-meta">
                <small title={frame.name}>{frame.name}</small>
                {frame.layers.length > 1 && (
                  <span className="layer-count-badge">
                    {frame.layers.length} layers
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
