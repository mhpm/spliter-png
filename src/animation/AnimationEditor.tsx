import { memo, useEffect, useMemo, useRef, useState } from 'react';
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
  GripVertical,
  Layers,
  Link2,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Search,
  Settings2,
  Sliders,
  Sparkles,
  Trash2,
  Undo2,
  Unlink2,
  X,
} from 'lucide-react';
import type { ImageItem } from '../application/use-splitter';
import { safeStem } from '../domain/names';
import {
  type FrameLayer,
  type LayerTransform,
  type ResizeCorner,
  type ResizeEdge,
  type StudioFrame,
  DEFAULT_LAYER_TRANSFORM,
  MAX_LAYER_SCALE,
  MIN_LAYER_SCALE,
  calculateFrameDimensions,
  createFrameFromItem,
  createLayerFromItem,
  getLayerDisplaySize,
  isFrameUntouched,
  layersInPaintOrder,
  moveLayerPivot,
  resizeLayerFromCorner,
  resizeLayerFromEdge,
  rotateLayerAroundPivot,
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

type OnionSkinDirection = 'previous' | 'next';

interface OnionSkinFrameProps {
  frame: StudioFrame;
  direction: OnionSkinDirection;
  opacity: number;
}

const OnionSkinFrame = memo(function OnionSkinFrame({
  frame,
  direction,
  opacity,
}: OnionSkinFrameProps) {
  const paintLayers = useMemo(
    () => layersInPaintOrder(frame.layers.map((layer, index) => ({ layer, index }))),
    [frame],
  );

  return (
    <div
      className={`onion-skin-frame onion-skin-${direction}`}
      style={{ opacity: opacity / 100 }}
      aria-hidden="true"
    >
      {paintLayers.map(({ layer }) => {
        if (!layer.transform.visible) return null;
        const { width, height } = getLayerDisplaySize(layer);
        const flipX = layer.transform.flipX ? -1 : 1;
        const flipY = layer.transform.flipY ? -1 : 1;

        return (
          <div
            key={layer.id}
            className="onion-skin-layer"
            style={{
              width: `${width}px`,
              height: `${height}px`,
              transform: `translate(-50%, -50%) translate(${layer.transform.x || 0}px, ${layer.transform.y || 0}px) rotate(${layer.transform.rotation || 0}deg) scale(${flipX}, ${flipY})`,
              opacity: layer.transform.opacity ?? 1,
            }}
          >
            <img src={layer.url} alt="" draggable={false} />
          </div>
        );
      })}
    </div>
  );
});

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
  const [draggedLayerIdx, setDraggedLayerIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [draggedFrameIndex, setDraggedFrameIndex] = useState<number | null>(null);
  const [frameDropIndex, setFrameDropIndex] = useState<number | null>(null);
  const [frameDropPosition, setFrameDropPosition] = useState<'before' | 'after' | null>(null);
  const [frameDropMode, setFrameDropMode] = useState<'reorder' | 'include' | null>(null);
  const [frameDropTarget, setFrameDropTarget] = useState<'stage' | 'layers' | null>(null);
  const [settingsTab, setSettingsTab] = useState<'sprite' | 'animation'>('sprite');
  const [showExportModal, setShowExportModal] = useState(false);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [onionSkinEnabled, setOnionSkinEnabled] = useState(false);
  const [onionSkinOpacity, setOnionSkinOpacity] = useState(24);

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
  const frameStripRef = useRef<HTMLDivElement | null>(null);
  const frameDragMovedRef = useRef(false);
  const layerDragPayloadRef = useRef<{ frameIndex: number; layerIndex: number } | null>(null);
  const marqueeRef = useRef<{
    startX: number;
    startY: number;
    stageOffsetLeft: number;
    stageOffsetTop: number;
  } | null>(null);
  const worker = useRef<Worker | null>(null);
  const dragSnapshot = useRef<StudioFrame[] | null>(null);
  const resizeSnapshot = useRef<StudioFrame[] | null>(null);
  const pivotSnapshot = useRef<StudioFrame[] | null>(null);
  const sliderSnapshot = useRef<StudioFrame[] | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    initialPositions: Map<number, { x: number; y: number }>;
    hasMoved: boolean;
  } | null>(null);
  const resizeRef = useRef<{
    layerIndex: number;
    handle: ResizeCorner | ResizeEdge;
    kind: 'corner' | 'edge';
    stageCenter: { x: number; y: number };
    sourceLayer: FrameLayer;
    captureTarget: HTMLElement;
    pointerId: number;
    hasMoved: boolean;
  } | null>(null);
  const pivotRef = useRef<{
    layerIndex: number;
    stageCenter: { x: number; y: number };
    sourceLayer: FrameLayer;
    captureTarget: HTMLElement;
    pointerId: number;
    hasMoved: boolean;
  } | null>(null);

  const allAvailableSprites = availableSprites.length ? availableSprites : initialFrames;
  const count = frames.length;
  const safeActive = Math.min(Math.max(0, active), Math.max(0, count - 1));
  const activeFrame = frames[safeActive] || frames[0];
  const previousFrame = safeActive > 0 ? frames[safeActive - 1] : undefined;
  const nextFrame = safeActive < count - 1 ? frames[safeActive + 1] : undefined;
  const activeLayers = useMemo(() => activeFrame?.layers || [], [activeFrame]);
  const activePaintLayers = useMemo(
    () => layersInPaintOrder(activeLayers.map((layer, index) => ({ layer, index }))),
    [activeLayers],
  );

  // Guaranteed valid selected layer indices
  const validSelectedIndices = useMemo(() => {
    if (!activeLayers.length) return [];
    const maxIdx = activeLayers.length - 1;
    const filtered = selectedLayerIndices.filter((idx) => idx >= 0 && idx <= maxIdx);
    return filtered.length > 0 ? filtered : [0];
  }, [selectedLayerIndices, activeLayers.length]);

  const primaryLayerIndex = validSelectedIndices[0] ?? 0;
  const primaryLayer = activeLayers[primaryLayerIndex] || activeLayers[0];
  const primaryLayerSize = primaryLayer ? getLayerDisplaySize(primaryLayer) : null;
  const primaryScale = primaryLayer
    ? Math.round((primaryLayer.transform.scaleX + primaryLayer.transform.scaleY) / 2)
    : 100;
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
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowExportModal(false);
      }
    }
    if (showExportModal) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showExportModal]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (safeActive + 1 >= count && !loop) setPlaying(false);
      else setActive((safeActive + 1) % count);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, safeActive, count, loop, delay]);
  useEffect(() => {
    const strip = frameStripRef.current;
    const selectedFrame = strip?.querySelector<HTMLElement>(
      `[data-frame-index="${safeActive}"]`,
    );
    if (!strip || !selectedFrame) return;
    const frameLeft = selectedFrame.offsetLeft;
    const frameRight = frameLeft + selectedFrame.offsetWidth;
    const visibleLeft = strip.scrollLeft;
    const visibleRight = visibleLeft + strip.clientWidth;
    if (frameLeft < visibleLeft || frameRight > visibleRight) {
      strip.scrollTo({
        left: Math.max(0, frameLeft - (strip.clientWidth - selectedFrame.offsetWidth) / 2),
        behavior: 'smooth',
      });
    }
  }, [safeActive]);

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

  function duplicateActiveFrame() {
    if (count >= 200) return;
    const current = frames[safeActive];
    const clone: StudioFrame = {
      ...current,
      id: `frame-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${current.name}_copy`,
      layers: current.layers.map((layer) => ({
        ...layer,
        id: `layer-${Math.random().toString(36).slice(2, 9)}`,
        transform: { ...layer.transform },
      })),
    };
    const next = [...frames];
    next.splice(safeActive + 1, 0, clone);
    updateFrames(next, safeActive + 1);
  }

  function removeActiveFrame() {
    if (count <= 1) return;
    updateFrames(
      frames.filter((_, index) => index !== safeActive),
      Math.max(0, safeActive - 1),
    );
  }

  function resetFrameSequence() {
    updateFrames(
      initialFrames.map((frame, index) => createFrameFromItem(frame, index)),
      0,
    );
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
    addLayerToFrame(item, safeActive);
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

  function handleLayerDragStart(e: React.DragEvent, idx: number) {
    layerDragPayloadRef.current = { frameIndex: safeActive, layerIndex: idx };
    setDraggedLayerIdx(idx);
    // A layer can be reordered in the sidebar (move) or copied into another
    // frame (copy), so expose both operations to the browser drag contract.
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData(
      'application/x-splitter-layer',
      JSON.stringify({ frameIndex: safeActive, layerIndex: idx }),
    );
    e.dataTransfer.setData('text/plain', `layer:${safeActive}:${idx}`);
    if (!validSelectedIndices.includes(idx)) {
      setSelectedLayerIndices([idx]);
    }
  }

  function handleLayerDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedLayerIdx === null || draggedLayerIdx === idx) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const pos = e.clientY < midPoint ? 'before' : 'after';

    if (dragOverIdx !== idx || dropPosition !== pos) {
      setDragOverIdx(idx);
      setDropPosition(pos);
    }
  }

  function handleLayerDragLeave() {
    // Keep target indication stable during drag over card children
  }

  function handleLayerDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (draggedLayerIdx === null || draggedLayerIdx === idx) {
      setDraggedLayerIdx(null);
      setDragOverIdx(null);
      setDropPosition(null);
      return;
    }

    let targetIdx = idx;
    if (draggedLayerIdx < idx) {
      targetIdx = dropPosition === 'before' ? Math.max(0, idx - 1) : idx;
    } else {
      targetIdx = dropPosition === 'after' ? Math.min(activeLayers.length - 1, idx + 1) : idx;
    }

    moveLayerOrder(draggedLayerIdx, targetIdx);
    setDraggedLayerIdx(null);
    setDragOverIdx(null);
    setDropPosition(null);
  }

  function handleLayerDragEnd() {
    layerDragPayloadRef.current = null;
    setDraggedLayerIdx(null);
    setDragOverIdx(null);
    setDropPosition(null);
  }

  function clearFrameDragState() {
    layerDragPayloadRef.current = null;
    setDraggedFrameIndex(null);
    setFrameDropIndex(null);
    setFrameDropPosition(null);
    setFrameDropMode(null);
    setFrameDropTarget(null);
  }

  function handleFrameDragStart(e: React.DragEvent, frameIndex: number) {
    frameDragMovedRef.current = true;
    layerDragPayloadRef.current = null;
    setDraggedLayerIdx(null);
    setDraggedFrameIndex(frameIndex);
    setFrameDropMode('reorder');
    // A frame is reordered in the timeline, or copied as a new layer when it
    // is dropped on the active frame's preview/layers column.
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/x-splitter-frame', String(frameIndex));
    e.dataTransfer.setData('text/plain', `frame:${frameIndex}`);
  }

  function getDraggedFrameIndex(e: React.DragEvent): number | null {
    const frameData = e.dataTransfer.getData('application/x-splitter-frame');
    const plainData = e.dataTransfer.getData('text/plain');
    const value = frameData || (plainData.startsWith('frame:') ? plainData.slice(6) : '');
    const parsedIndex = value.trim() ? Number(value) : null;
    return parsedIndex !== null && Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < frames.length
      ? parsedIndex
      : draggedFrameIndex;
  }

  function isFrameDrag(e: React.DragEvent) {
    return (
      e.dataTransfer.types.includes('application/x-splitter-frame') ||
      (draggedFrameIndex !== null &&
        !e.dataTransfer.types.includes('application/x-splitter-layer') &&
        !e.dataTransfer.types.includes('application/x-splitter-sprite'))
    );
  }

  function handleFrameSurfaceDragOver(e: React.DragEvent, target: 'stage' | 'layers') {
    if (!isFrameDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setFrameDropTarget(target);
  }

  function handleFrameSurfaceDragLeave(e: React.DragEvent, target: 'stage' | 'layers') {
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setFrameDropTarget((current) => (current === target ? null : current));
    }
  }

  async function includeFrameAsLayer(sourceFrameIndex: number, targetFrameIndex: number) {
    if (sourceFrameIndex === targetFrameIndex) {
      setError('A frame cannot be included inside itself.');
      return;
    }
    const source = frames[sourceFrameIndex];
    const target = frames[targetFrameIndex];
    if (!source || !target) return;

    try {
      const composed = await compositeFrame(source);
      const layer = createLayerFromItem(
        {
          // Keep the existing layer model compatible with extracted sprites;
          // the name and pixels identify this as a composed frame layer.
          id: source.layers[0]?.spriteId ?? sourceFrameIndex,
          name: source.name,
          blob: composed.blob,
          url: URL.createObjectURL(composed.blob),
          width: composed.width,
          height: composed.height,
        },
        { x: 0, y: 0 },
      );
      const newLayerIndex = target.layers.length;
      recordState(frames);
      setFrames((previous) =>
        previous.map((frame, index) =>
          index === targetFrameIndex ? { ...frame, layers: [...frame.layers, layer] } : frame,
        ),
      );
      setPlaying(false);
      setActive(targetFrameIndex);
      setSelectedLayerIndices([newLayerIndex]);
      setView('animation');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not include the frame as a layer.');
    }
  }

  async function handleFrameSurfaceDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const sourceFrameIndex = getDraggedFrameIndex(e);
    if (sourceFrameIndex !== null) {
      await includeFrameAsLayer(sourceFrameIndex, safeActive);
    }
    clearFrameDragState();
  }

  function handleFrameDragOver(e: React.DragEvent, frameIndex: number) {
    e.preventDefault();
    const hasSprite = e.dataTransfer.types.includes('application/x-splitter-sprite');
    const hasFrame =
      e.dataTransfer.types.includes('application/x-splitter-frame') ||
      (draggedFrameIndex !== null && !hasSprite && !e.dataTransfer.types.includes('application/x-splitter-layer'));
    const hasLayer = !hasFrame && (
      e.dataTransfer.types.includes('application/x-splitter-layer') ||
      (e.dataTransfer.types.includes('text/plain') && draggedLayerIdx !== null) ||
      layerDragPayloadRef.current !== null
    );
    if (!hasSprite && !hasLayer && !hasFrame) return;
    e.dataTransfer.dropEffect = hasFrame ? 'move' : 'copy';
    setFrameDropIndex(frameIndex);
    if (!hasFrame && (hasSprite || hasLayer)) {
      setFrameDropMode('include');
      setFrameDropPosition(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    setFrameDropMode('reorder');
    setFrameDropPosition(e.clientX < rect.left + rect.width / 2 ? 'before' : 'after');
  }

  function addLayerToFrame(item: ImageItem, frameIndex: number) {
    const target = frames[frameIndex];
    if (!target) return;
    recordState(frames);
    const newLayer = createLayerFromItem(item);
    setFrames((previous) =>
      previous.map((frame, index) =>
        index === frameIndex ? { ...frame, layers: [...frame.layers, newLayer] } : frame,
      ),
    );
    setActive(frameIndex);
    setSelectedLayerIndices([target.layers.length]);
    setView('animation');
    setShowLibrary(false);
  }

  function copyLayerToFrame(sourceFrameIndex: number, layerIndex: number, targetFrameIndex: number) {
    const source = frames[sourceFrameIndex]?.layers[layerIndex];
    const target = frames[targetFrameIndex];
    if (!source || !target) return;
    recordState(frames);
    const clone = createLayerFromItem(
      {
        id: source.spriteId,
        name: source.name,
        blob: source.blob,
        url: source.url,
        width: source.width,
        height: source.height,
      },
      { ...source.transform },
    );
    setFrames((previous) =>
      previous.map((frame, index) =>
        index === targetFrameIndex ? { ...frame, layers: [...frame.layers, clone] } : frame,
      ),
    );
    setActive(targetFrameIndex);
    setSelectedLayerIndices([target.layers.length]);
    setView('animation');
  }

  function handleFrameDrop(e: React.DragEvent, targetFrameIndex: number) {
    e.preventDefault();
    const layerData = e.dataTransfer.getData('application/x-splitter-layer');
    const frameData = e.dataTransfer.getData('application/x-splitter-frame');
    const plainData = e.dataTransfer.getData('text/plain');
    const draggedFrame = frameData || (plainData.startsWith('frame:') ? plainData.slice(6) : '');

    const layerPayload =
      layerData ||
      (plainData.startsWith('layer:')
        ? JSON.stringify(
            plainData
              .slice(6)
              .split(':')
              .map(Number)
              .reduce((payload, value, index) => {
                if (index === 0) payload.frameIndex = value;
                if (index === 1) payload.layerIndex = value;
                return payload;
              }, {} as { frameIndex?: number; layerIndex?: number }),
          )
        : '');
    const fallbackLayerPayload = layerDragPayloadRef.current;

    if (layerPayload || fallbackLayerPayload) {
      try {
        const parsed = fallbackLayerPayload ?? (JSON.parse(layerPayload) as { frameIndex: number; layerIndex: number });
        copyLayerToFrame(parsed.frameIndex, parsed.layerIndex, targetFrameIndex);
      } catch {
        // Ignore malformed drag payloads.
      }
      clearFrameDragState();
      return;
    }

    if (!draggedFrame) {
      clearFrameDragState();
      return;
    }

    const fromIndex = Number(draggedFrame);
    if (!Number.isInteger(fromIndex) || fromIndex === targetFrameIndex) {
      clearFrameDragState();
      return;
    }

    let insertionIndex = targetFrameIndex + (frameDropPosition === 'after' ? 1 : 0);
    const next = [...frames];
    const [moved] = next.splice(fromIndex, 1);
    if (fromIndex < insertionIndex) insertionIndex -= 1;
    next.splice(Math.max(0, Math.min(next.length, insertionIndex)), 0, moved);
    updateFrames(next, Math.max(0, Math.min(next.length - 1, insertionIndex)));
    clearFrameDragState();
  }

  function handleFrameDragEnd() {
    frameDragMovedRef.current = false;
    clearFrameDragState();
  }

  function duplicateSingleLayer(layerIdx: number) {
    recordState(frames);
    const source = activeLayers[layerIdx];
    if (!source) return;
    const clone: FrameLayer = {
      ...source,
      id: `layer-${source.spriteId}-${Math.random().toString(36).slice(2, 9)}`,
      name: `${source.name}_copy`,
      transform: {
        ...source.transform,
        x: (source.transform.x || 0) + 12,
        y: (source.transform.y || 0) + 12,
      },
    };
    setFrames((prev) => {
      const next = [...prev];
      const targetFrame = { ...next[safeActive] };
      const layers = [...targetFrame.layers];
      layers.splice(layerIdx + 1, 0, clone);
      targetFrame.layers = layers;
      next[safeActive] = targetFrame;
      return next;
    });
    setSelectedLayerIndices([layerIdx + 1]);
  }

  function removeSingleLayer(layerIdx: number) {
    if (activeLayers.length <= 1) return;
    recordState(frames);
    setFrames((prev) => {
      const next = [...prev];
      const targetFrame = { ...next[safeActive] };
      const layers = targetFrame.layers.filter((_, i) => i !== layerIdx);
      targetFrame.layers = layers.length > 0 ? layers : [targetFrame.layers[0]];
      next[safeActive] = targetFrame;
      return next;
    });
    setSelectedLayerIndices([Math.max(0, layerIdx - 1)]);
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

  function updateSelectedLayerDimension(
    axis: 'width' | 'height',
    value: number,
    record = true,
  ) {
    if (!Number.isFinite(value)) return;
    updateSelectedLayersTransform((transform, layer) => {
      const currentSize = getLayerDisplaySize({ ...layer, transform });
      const sourceSize = axis === 'width' ? layer.width : layer.height;
      const desiredSize = Math.max(
        1,
        Math.min((sourceSize * MAX_LAYER_SCALE) / 100, value),
      );
      const currentAxisSize = axis === 'width' ? currentSize.width : currentSize.height;
      const nextAxisScale = Math.max(
        MIN_LAYER_SCALE,
        Math.min(MAX_LAYER_SCALE, (desiredSize / sourceSize) * 100),
      );
      if (!lockAspectRatio) {
        return axis === 'width' ? { scaleX: nextAxisScale } : { scaleY: nextAxisScale };
      }
      const requestedFactor = desiredSize / Math.max(1, currentAxisSize);
      const factor = Math.min(
        MAX_LAYER_SCALE / Math.max(transform.scaleX, transform.scaleY),
        Math.max(
          MIN_LAYER_SCALE / Math.min(transform.scaleX, transform.scaleY),
          requestedFactor,
        ),
      );
      return {
        scaleX: transform.scaleX * factor,
        scaleY: transform.scaleY * factor,
      };
    }, record);
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

  function handleResizePointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    layerIndex: number,
    handle: ResizeCorner | ResizeEdge,
    kind: 'corner' | 'edge',
  ) {
    if (playing) return;
    e.preventDefault();
    e.stopPropagation();
    const layer = activeLayers[layerIndex];
    const stageCell = stageRef.current?.querySelector<HTMLElement>('.stage-cell');
    if (!layer || !stageCell) return;
    const rect = stageCell.getBoundingClientRect();
    const captureTarget = e.currentTarget;
    captureTarget.setPointerCapture(e.pointerId);
    setSelectedLayerIndices([layerIndex]);
    resizeSnapshot.current = frames;
    resizeRef.current = {
      layerIndex,
      handle,
      kind,
      stageCenter: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      sourceLayer: layer,
      captureTarget,
      pointerId: e.pointerId,
      hasMoved: false,
    };
  }

  function handlePivotPointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    layerIndex: number,
  ) {
    if (playing) return;
    e.preventDefault();
    e.stopPropagation();
    const layer = activeLayers[layerIndex];
    const stageCell = stageRef.current?.querySelector<HTMLElement>('.stage-cell');
    if (!layer || !stageCell) return;
    const rect = stageCell.getBoundingClientRect();
    const captureTarget = e.currentTarget;
    captureTarget.setPointerCapture(e.pointerId);
    setSelectedLayerIndices([layerIndex]);
    pivotSnapshot.current = frames;
    pivotRef.current = {
      layerIndex,
      stageCenter: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      sourceLayer: layer,
      captureTarget,
      pointerId: e.pointerId,
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
    if (pivotRef.current) {
      const pivot = pivotRef.current;
      const nextPivot = moveLayerPivot(
        pivot.sourceLayer,
        { x: e.clientX, y: e.clientY },
        pivot.stageCenter,
      );
      if (
        nextPivot.pivotX !== pivot.sourceLayer.transform.pivotX ||
        nextPivot.pivotY !== pivot.sourceLayer.transform.pivotY
      ) {
        pivot.hasMoved = true;
      }
      setFrames((previous) => {
        const next = [...previous];
        const targetFrame = { ...next[safeActive] };
        const layers = [...targetFrame.layers];
        const layer = layers[pivot.layerIndex];
        if (!layer) return previous;
        layers[pivot.layerIndex] = {
          ...layer,
          transform: { ...layer.transform, ...nextPivot },
        };
        targetFrame.layers = layers;
        next[safeActive] = targetFrame;
        return next;
      });
      return;
    }

    if (resizeRef.current) {
      const resize = resizeRef.current;
      const transform =
        resize.kind === 'corner'
          ? resizeLayerFromCorner(
              resize.sourceLayer,
              resize.handle as ResizeCorner,
              { x: e.clientX, y: e.clientY },
              resize.stageCenter,
            )
          : resizeLayerFromEdge(
              resize.sourceLayer,
              resize.handle as ResizeEdge,
              { x: e.clientX, y: e.clientY },
              resize.stageCenter,
            );
      if (
        transform.scaleX !== resize.sourceLayer.transform.scaleX ||
        transform.scaleY !== resize.sourceLayer.transform.scaleY ||
        transform.x !== resize.sourceLayer.transform.x ||
        transform.y !== resize.sourceLayer.transform.y
      ) {
        resize.hasMoved = true;
      }
      setFrames((previous) => {
        const next = [...previous];
        const targetFrame = { ...next[safeActive] };
        const layers = [...targetFrame.layers];
        const layer = layers[resize.layerIndex];
        if (!layer) return previous;
        layers[resize.layerIndex] = {
          ...layer,
          transform: { ...layer.transform, ...transform },
        };
        targetFrame.layers = layers;
        next[safeActive] = targetFrame;
        return next;
      });
      return;
    }

    if (dragRef.current) {
      const dx = Math.round(e.clientX - dragRef.current.startX);
      const dy = Math.round(e.clientY - dragRef.current.startY);
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        dragRef.current.hasMoved = true;
      }
      updateSelectedLayersTransform((t, _, idx) => {
        const init = dragRef.current?.initialPositions.get(idx);
        if (!init) return t;
        return {
          x: init.x + dx,
          y: init.y + dy,
        };
      }, false);
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
    if (pivotRef.current) {
      const pivot = pivotRef.current;
      if (pivot.hasMoved && pivotSnapshot.current) recordState(pivotSnapshot.current);
      if (pivot.captureTarget.hasPointerCapture(pivot.pointerId)) {
        pivot.captureTarget.releasePointerCapture(pivot.pointerId);
      }
      pivotRef.current = null;
      pivotSnapshot.current = null;
      return;
    }

    if (resizeRef.current) {
      const resize = resizeRef.current;
      if (resize.hasMoved && resizeSnapshot.current) recordState(resizeSnapshot.current);
      if (resize.captureTarget.hasPointerCapture(resize.pointerId)) {
        resize.captureTarget.releasePointerCapture(resize.pointerId);
      }
      resizeRef.current = null;
      resizeSnapshot.current = null;
      return;
    }

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
        layers: f.layers.map((layer, index) => ({
          index,
          name: layer.name,
          spriteId: layer.spriteId,
          width: layer.width,
          height: layer.height,
          transform: { ...layer.transform },
        })),
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

    download(
      new Blob([json], { type: 'application/json' }),
      `${safeStem(name || 'my-animation')}.json`,
    );
  }

  const filteredLibrary = allAvailableSprites.filter((item) =>
    item.name.toLowerCase().includes(libraryFilter.trim().toLowerCase()),
  );

  return (
    <div className="animation-workspace-view" role="dialog" aria-label="Animation studio">
      {/* Extracted Sprite Library Modal Backdrop & Dialog */}
      {showLibrary && (
        <div className="sprite-library-backdrop" onClick={() => setShowLibrary(false)}>
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
            <span>Back to Sprite Workshop</span>
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

          <button
            type="button"
            className="sprite-button sprite-primary btn-header-export"
            onClick={() => setShowExportModal(true)}
          >
            <Download size={15} />
            <span>Export</span>
          </button>
        </div>
      </header>

      <div className="animation-body">
        <section className="animation-preview-panel" aria-label="Animation preview">
          <div className="animation-view-switch">
            <button aria-pressed={view === 'animation'} onClick={() => setView('animation')}>
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
                  onClick={() => updateSelectedLayersTransform((t) => ({ flipX: !t.flipX }))}
                >
                  <FlipHorizontal2 size={15} /> Flip H
                </button>
                <button
                  type="button"
                  className={`sprite-button mini-btn ${primaryLayer.transform.flipY ? 'active' : ''}`}
                  title="Flip vertical"
                  onClick={() => updateSelectedLayersTransform((t) => ({ flipY: !t.flipY }))}
                >
                  <FlipVertical2 size={15} /> Flip V
                </button>
                <button
                  type="button"
                  className="sprite-button mini-btn"
                  title="Rotate -90°"
                  onClick={() =>
                    updateSelectedLayersTransform((t, layer) =>
                      rotateLayerAroundPivot(
                        { ...layer, transform: t },
                        (t.rotation - 90 + 360) % 360,
                      ),
                    )
                  }
                >
                  <RotateCcw size={14} /> -90°
                </button>
                <button
                  type="button"
                  className="sprite-button mini-btn"
                  title="Rotate +90°"
                  onClick={() =>
                    updateSelectedLayersTransform((t, layer) =>
                      rotateLayerAroundPivot(
                        { ...layer, transform: t },
                        (t.rotation + 90) % 360,
                      ),
                    )
                  }
                >
                  <RotateCw size={14} /> +90°
                </button>
              </div>

              <div className="quick-transform-group size-input-group">
                <span className="mini-label">Size</span>
                <label className="dimension-input">
                  <span>W</span>
                  <input
                    type="number"
                    min="1"
                    max={Math.round((primaryLayer.width * MAX_LAYER_SCALE) / 100)}
                    value={Math.round(primaryLayerSize?.width || primaryLayer.width)}
                    aria-label="Layer width in pixels"
                    onFocus={() => {
                      sliderSnapshot.current = frames;
                    }}
                    onChange={(event) =>
                      updateSelectedLayerDimension('width', Number(event.target.value), false)
                    }
                    onBlur={() => {
                      if (sliderSnapshot.current) recordState(sliderSnapshot.current);
                      sliderSnapshot.current = null;
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                  <span>px</span>
                </label>
                <button
                  type="button"
                  className={`aspect-lock-button ${lockAspectRatio ? 'active' : ''}`}
                  aria-label={lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                  title={lockAspectRatio ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                  aria-pressed={lockAspectRatio}
                  onClick={() => setLockAspectRatio((locked) => !locked)}
                >
                  {lockAspectRatio ? <Link2 size={13} /> : <Unlink2 size={13} />}
                </button>
                <label className="dimension-input">
                  <span>H</span>
                  <input
                    type="number"
                    min="1"
                    max={Math.round((primaryLayer.height * MAX_LAYER_SCALE) / 100)}
                    value={Math.round(primaryLayerSize?.height || primaryLayer.height)}
                    aria-label="Layer height in pixels"
                    onFocus={() => {
                      sliderSnapshot.current = frames;
                    }}
                    onChange={(event) =>
                      updateSelectedLayerDimension('height', Number(event.target.value), false)
                    }
                    onBlur={() => {
                      if (sliderSnapshot.current) recordState(sliderSnapshot.current);
                      sliderSnapshot.current = null;
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                  <span>px</span>
                </label>
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
            className={`animation-stage checkerboard ${frameDropTarget === 'stage' ? 'frame-drop-active' : ''}`}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDragOver={(event) => handleFrameSurfaceDragOver(event, 'stage')}
            onDragLeave={(event) => handleFrameSurfaceDragLeave(event, 'stage')}
            onDrop={handleFrameSurfaceDrop}
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
                {onionSkinEnabled && previousFrame && (
                  <OnionSkinFrame
                    frame={previousFrame}
                    direction="previous"
                    opacity={onionSkinOpacity}
                  />
                )}
                {onionSkinEnabled && nextFrame && (
                  <OnionSkinFrame frame={nextFrame} direction="next" opacity={onionSkinOpacity} />
                )}
                {activePaintLayers.map(({ layer, index: idx }) => {
                  if (!layer.transform.visible) return null;
                  const isSelected = validSelectedIndices.includes(idx);
                  const { width: w, height: h } = getLayerDisplaySize(layer);
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
                        <>
                          <div className="layer-selection-outline">
                            {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                              <button
                                key={corner}
                                type="button"
                                className={`handle-dot ${corner}`}
                                aria-label={`Resize ${layer.name} from ${corner}`}
                                title="Drag to resize proportionally"
                                onPointerDown={(event) =>
                                  handleResizePointerDown(event, idx, corner, 'corner')
                                }
                              />
                            ))}
                            {(
                              [
                                ['t', 'Resize height from top edge'],
                                ['r', 'Resize width from right edge'],
                                ['b', 'Resize height from bottom edge'],
                                ['l', 'Resize width from left edge'],
                              ] as const
                            ).map(([edge, label]) => (
                              <button
                                key={edge}
                                type="button"
                                className={`handle-edge ${edge}`}
                                aria-label={`${label} for ${layer.name}`}
                                title={label}
                                onPointerDown={(event) =>
                                  handleResizePointerDown(event, idx, edge, 'edge')
                                }
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            className="layer-pivot-handle"
                            style={{
                              left: `${50 + (layer.transform.pivotX || 0) * 100}%`,
                              top: `${50 + (layer.transform.pivotY || 0) * 100}%`,
                            }}
                            aria-label={`Move rotation pivot for ${layer.name}`}
                            title="Drag to move rotation pivot"
                            onPointerDown={(event) => handlePivotPointerDown(event, idx)}
                          >
                            <span />
                          </button>
                        </>
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
                  gridTemplateRows: layout
                    ? `repeat(${layout.rows}, minmax(0, 1fr))`
                    : undefined,
                  aspectRatio: layout ? `${layout.width}/${layout.height}` : undefined,
                }}
              >
                {frames.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`preview-sheet-frame ${i === safeActive ? 'active' : ''}`}
                    aria-label={`Preview sheet frame ${i + 1}`}
                    onClick={() => {
                      setActive(i);
                      setView('animation');
                    }}
                  >
                    {layersInPaintOrder(f.layers.map((layer, idx) => ({ layer, idx }))).map(
                      ({ layer, idx }) => {
                        if (!layer.transform.visible) return null;
                        const displaySize = getLayerDisplaySize(layer);
                        const w = (displaySize.width * 100) / cellWidth;
                        const h = (displaySize.height * 100) / cellHeight;
                        const ox = ((layer.transform.x || 0) * 100) / cellWidth;
                        const oy = ((layer.transform.y || 0) * 100) / cellHeight;
                        const fx = layer.transform.flipX ? -1 : 1;
                        const fy = layer.transform.flipY ? -1 : 1;
                        return (
                          <div
                            key={layer.id || idx}
                            style={{
                              position: 'absolute',
                              left: `${50 + ox}%`,
                              top: `${50 + oy}%`,
                              width: `${w}%`,
                              height: `${h}%`,
                              transform: `translate(-50%, -50%) rotate(${layer.transform.rotation || 0}deg) scale(${fx}, ${fy})`,
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
                      },
                    )}
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
              <span>
                Size: {Math.round(primaryLayerSize?.width || primaryLayer.width)} ×{' '}
                {Math.round(primaryLayerSize?.height || primaryLayer.height)} px
              </span>
              <span>Rot: {primaryLayer.transform.rotation || 0}°</span>
              <small className="drag-hint">
                Tip: Click + drag on canvas to box-select multiple sprites (or Shift+Click)
              </small>
            </div>
          )}

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

          <section className="animation-timeline" aria-label="Animation frames">
            <div className="timeline-toolbar">
              <div className="timeline-title">
                <div>
                  <h3>Timeline</h3>
                  <span>
                    Frame {safeActive + 1} of {count} · {delay} ms
                  </span>
                  <small className="timeline-drop-hint">
                    Drag frames to reorder · Drop a frame on the preview or layers to include it
                  </small>
                </div>
              </div>

              <div
                className="onion-skin-controls timeline-onion-controls"
                role="group"
                aria-label="Onion skin controls"
              >
                <label className="onion-skin-toggle">
                  <input
                    type="checkbox"
                    checked={onionSkinEnabled}
                    onChange={(event) => setOnionSkinEnabled(event.target.checked)}
                    aria-label="Show onion skin"
                  />
                  <span>Onion skin</span>
                </label>
                {onionSkinEnabled && (
                  <>
                    <label className="onion-skin-opacity-control">
                      <span>Opacity</span>
                      <input
                        type="range"
                        min="10"
                        max="60"
                        step="1"
                        value={onionSkinOpacity}
                        onChange={(event) => setOnionSkinOpacity(Number(event.target.value))}
                        aria-label="Onion skin opacity"
                      />
                      <output>{onionSkinOpacity}%</output>
                    </label>
                    <span className="onion-skin-legend" aria-label="Onion skin colors">
                      <span className="onion-skin-legend-item previous">Previous</span>
                      <span className="onion-skin-legend-item next">Next</span>
                    </span>
                  </>
                )}
              </div>

              <div className="timeline-actions-row">
                <fieldset
                  disabled={progress !== null}
                  className="frame-actions frame-context-actions"
                  aria-label={`Actions for frame ${safeActive + 1}`}
                >
                  <span className="frame-actions-label">Selected frame</span>
                  <button
                    type="button"
                    className="timeline-icon-button"
                    disabled={safeActive === 0}
                    aria-label="Move selected frame left"
                    title="Move frame left"
                    onClick={() => moveFrame(-1)}
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className="timeline-icon-button"
                    disabled={safeActive === count - 1}
                    aria-label="Move selected frame right"
                    title="Move frame right"
                    onClick={() => moveFrame(1)}
                  >
                    <ArrowRight size={14} />
                  </button>
                  <button
                    type="button"
                    className="timeline-icon-button"
                    disabled={count >= 200}
                    aria-label="Duplicate selected frame"
                    title="Duplicate frame"
                    onClick={duplicateActiveFrame}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    className="timeline-icon-button danger"
                    disabled={count <= 1}
                    aria-label="Delete selected frame"
                    title="Delete frame"
                    onClick={removeActiveFrame}
                  >
                    <Trash2 size={14} />
                  </button>
                </fieldset>

                <fieldset
                  disabled={progress !== null}
                  className="frame-actions sequence-actions"
                  aria-label="Sequence actions"
                >
                  <button
                    type="button"
                    className="timeline-text-button"
                    onClick={() => updateFrames([...frames].reverse(), count - 1 - safeActive)}
                  >
                    Reverse
                  </button>
                  <button
                    type="button"
                    className="timeline-icon-button"
                    aria-label="Reset frame sequence"
                    title="Reset sequence"
                    onClick={resetFrameSequence}
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    className="timeline-text-button btn-timeline-add"
                    onClick={() => setShowLibrary(true)}
                  >
                    <Plus size={14} /> Add frame
                  </button>
                </fieldset>
              </div>
            </div>

            <div
              ref={frameStripRef}
              className="frame-strip"
              role="group"
              aria-label="Frame sequence"
            >
              {frames.map((frame, frameIndex) => (
                <button
                  key={frame.id}
                  type="button"
                  data-frame-index={frameIndex}
                  draggable
                  className={`frame-tile ${frameIndex === safeActive ? 'active' : ''} ${draggedFrameIndex === frameIndex ? 'is-dragging' : ''} ${frameDropIndex === frameIndex && frameDropMode === 'include' ? 'drop-include' : ''} ${frameDropIndex === frameIndex && frameDropMode === 'reorder' && frameDropPosition ? `drop-${frameDropPosition}` : ''}`}
                  onDragStart={(event) => handleFrameDragStart(event, frameIndex)}
                  onDragOver={(event) => handleFrameDragOver(event, frameIndex)}
                  onDrop={(event) => handleFrameDrop(event, frameIndex)}
                  onDragEnd={handleFrameDragEnd}
                  onClick={() => {
                    if (frameDragMovedRef.current) {
                      frameDragMovedRef.current = false;
                      return;
                    }
                    setPlaying(false);
                    setActive(frameIndex);
                    setView('animation');
                  }}
                  aria-label={`Select animation frame ${frameIndex + 1}`}
                  aria-pressed={frameIndex === safeActive}
                >
                  <span className="tile-preview-box checkerboard">
                    {layersInPaintOrder(frame.layers).map((layer) => {
                      if (!layer.transform.visible) return null;
                      const displaySize = getLayerDisplaySize(layer);
                      const width = (displaySize.width * 100) / cellWidth;
                      const height = (displaySize.height * 100) / cellHeight;
                      const offsetX = ((layer.transform.x || 0) * 100) / cellWidth;
                      const offsetY = ((layer.transform.y || 0) * 100) / cellHeight;
                      const flipX = layer.transform.flipX ? -1 : 1;
                      const flipY = layer.transform.flipY ? -1 : 1;
                      return (
                        <span
                          key={layer.id}
                          className="tile-preview-layer"
                          style={{
                            left: `${50 + offsetX}%`,
                            top: `${50 + offsetY}%`,
                            width: `${width}%`,
                            height: `${height}%`,
                            transform: `translate(-50%, -50%) rotate(${layer.transform.rotation || 0}deg) scale(${flipX}, ${flipY})`,
                            opacity: layer.transform.opacity ?? 1,
                          }}
                        >
                          <img src={layer.url} alt="" />
                        </span>
                      );
                    })}
                    <strong>{String(frameIndex + 1).padStart(2, '0')}</strong>
                    {frame.layers.length > 1 && (
                      <span className="layer-count-badge" title={`${frame.layers.length} layers`}>
                        {frame.layers.length}
                      </span>
                    )}
                  </span>
                  <small title={frame.name}>{frame.name}</small>
                </button>
              ))}
            </div>
          </section>
        </section>

        {/* Dedicated Layers Column */}
        <aside className="animation-layers-sidebar" aria-label="Animation layers">
          <div className="layers-sidebar-panel">
            <div className="layers-section-header">
              <div className="layers-title-row">
                <div className="layers-title">
                  <Layers size={16} />
                  <h4>
                    Layers in Frame {safeActive + 1} ({activeLayers.length})
                  </h4>
                </div>
              </div>
              <small className="layers-drop-hint">Drop a frame here to add it as a new layer</small>

              <div className="layers-actions-bar">
                <button
                  type="button"
                  className="sprite-button mini-btn btn-add-sprite-layer"
                  onClick={() => setShowLibrary(true)}
                >
                  <Plus size={14} /> Combine another sprite
                </button>
                {activeLayers.length > 1 && (
                  <button
                    type="button"
                    className="chip-btn select-all-btn"
                    onClick={() => setSelectedLayerIndices(activeLayers.map((_, i) => i))}
                  >
                    Select all
                  </button>
                )}
                {isMultiSelected && (
                  <>
                    <button
                      type="button"
                      className="chip-btn"
                      title="Duplicate selected layers"
                      onClick={duplicateSelectedLayers}
                    >
                      <Copy size={11} /> Clone
                    </button>
                    {activeLayers.length > validSelectedIndices.length && (
                      <button
                        type="button"
                        className="chip-btn delete-chip-btn"
                        title="Delete selected layers"
                        onClick={removeSelectedLayers}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    )}
                    <span className="layers-selected-tag">
                      {validSelectedIndices.length} layers selected
                    </span>
                  </>
                )}
              </div>
            </div>

            <div
              className={`layers-container layers-list-rows ${frameDropTarget === 'layers' ? 'frame-drop-active' : ''}`}
              onDragOver={(event) => handleFrameSurfaceDragOver(event, 'layers')}
              onDragLeave={(event) => handleFrameSurfaceDragLeave(event, 'layers')}
              onDrop={handleFrameSurfaceDrop}
            >
              {activeLayers.map((layer, idx) => {
                const isSelected = validSelectedIndices.includes(idx);
                const isDragging = draggedLayerIdx === idx;
                const isDragOver = dragOverIdx === idx;
                const posClass = isDragOver && dropPosition ? `drop-${dropPosition}` : '';

                return (
                  <div
                    key={layer.id}
                    className={`sidebar-layer-card ${isSelected ? 'active selected' : ''} ${isDragging ? 'is-dragging' : ''} ${posClass}`}
                    draggable
                    onDragStart={(e) => handleLayerDragStart(e, idx)}
                    onDragOver={(e) => handleLayerDragOver(e, idx)}
                    onDragLeave={handleLayerDragLeave}
                    onDrop={(e) => handleLayerDrop(e, idx)}
                    onDragEnd={handleLayerDragEnd}
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
                    <div className="card-top-row">
                      <div className="card-drag-pos">
                        <span className="layer-drag-handle" title="Drag to reorder">
                          <GripVertical size={13} />
                        </span>
                        <span className="layer-pos-pill" title={`Layer position ${idx + 1}`}>
                          #{idx + 1}
                        </span>
                      </div>

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
                    </div>

                    <div className="card-body-row">
                      <div className="card-thumb-wrapper checkerboard">
                        <img src={layer.url} alt={layer.name} />
                      </div>
                      <div className="card-info">
                        <span className="card-name" title={layer.name}>
                          {layer.name}
                        </span>
                        <span className="card-meta">
                          {layer.width}×{layer.height}
                          {idx === 0
                            ? ' · Front'
                            : idx === activeLayers.length - 1
                              ? ' · Back'
                              : ''}
                        </span>
                      </div>
                    </div>

                    <div className="card-actions-row">
                      <div className="card-move-btns">
                        <button
                          type="button"
                          className="chip-btn"
                          disabled={idx === 0}
                          title="Bring layer forward"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveLayerOrder(idx, idx - 1);
                          }}
                        >
                          <ArrowUp size={11} />
                        </button>
                        <button
                          type="button"
                          className="chip-btn"
                          disabled={idx === activeLayers.length - 1}
                          title="Send layer backward"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveLayerOrder(idx, idx + 1);
                          }}
                        >
                          <ArrowDown size={11} />
                        </button>
                      </div>

                      <div className="card-util-btns">
                        <button
                          type="button"
                          className="chip-btn"
                          title="Duplicate layer"
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateSingleLayer(idx);
                          }}
                        >
                          <Copy size={11} />
                        </button>
                        {activeLayers.length > 1 && (
                          <button
                            type="button"
                            className="chip-btn delete-chip-btn"
                            title="Delete layer"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSingleLayer(idx);
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Sidebar Controls (Sprite manipulation & Animation settings in tabs) */}
        <aside className="animation-settings" aria-label="Animation controls">
          {/* Tabs and Export button header */}
          <div className="settings-panel-header">
            <div className="settings-tab-nav" role="tablist" aria-label="Settings categories">
              <button
                type="button"
                role="tab"
                id="tab-sprite"
                aria-selected={settingsTab === 'sprite'}
                aria-controls="tabpanel-sprite"
                className={`settings-tab-btn ${settingsTab === 'sprite' ? 'active' : ''}`}
                onClick={() => setSettingsTab('sprite')}
              >
                <Sliders size={13} />
                <span>Sprite manipulation</span>
              </button>
              <button
                type="button"
                role="tab"
                id="tab-animation"
                aria-selected={settingsTab === 'animation'}
                aria-controls="tabpanel-animation"
                className={`settings-tab-btn ${settingsTab === 'animation' ? 'active' : ''}`}
                onClick={() => setSettingsTab('animation')}
              >
                <Settings2 size={13} />
                <span>Animation settings</span>
              </button>
            </div>
          </div>

          {/* Tab Panel 1: Sprite Transformation */}
          {settingsTab === 'sprite' && (
            <div
              id="tabpanel-sprite"
              role="tabpanel"
              aria-labelledby="tab-sprite"
              className="sidebar-section sprite-transform-section"
            >
              <div className="section-title">
                <h4>Sprite manipulation</h4>
                <p>
                  Editing:{' '}
                  <strong>
                    {isMultiSelected
                      ? `${validSelectedIndices.length} layers selected`
                      : primaryLayer?.name}
                  </strong>
                </p>
              </div>

              {primaryLayer && (
                <div className="transform-controls-grid">
                  {/* Uniform Scale Control */}
                  <div className="control-group">
                    <label htmlFor="inspector-scale-slider">Scale: {primaryScale}%</label>
                    <input
                      id="inspector-scale-slider"
                      type="range"
                      min={MIN_LAYER_SCALE}
                      max={MAX_LAYER_SCALE}
                      value={primaryScale}
                      onPointerDown={() => {
                        sliderSnapshot.current = frames;
                      }}
                      onChange={(event) => {
                        const nextScale = Number(event.target.value);
                        updateSelectedLayersTransform(
                          { scaleX: nextScale, scaleY: nextScale },
                          false,
                        );
                      }}
                      onPointerUp={() => {
                        if (sliderSnapshot.current) recordState(sliderSnapshot.current);
                        sliderSnapshot.current = null;
                      }}
                      onBlur={() => {
                        if (sliderSnapshot.current) recordState(sliderSnapshot.current);
                        sliderSnapshot.current = null;
                      }}
                      aria-label="Scale percentage"
                    />
                    <div className="scale-shortcuts" aria-label="Scale shortcuts">
                      {[50, 100, 150, 200].map((scale) => (
                        <button
                          key={scale}
                          type="button"
                          className={`sprite-button mini-btn ${primaryScale === scale ? 'active' : ''}`}
                          aria-label={`Set scale to ${scale}%`}
                          aria-pressed={primaryScale === scale}
                          onClick={() =>
                            updateSelectedLayersTransform({ scaleX: scale, scaleY: scale })
                          }
                        >
                          {scale}%
                        </button>
                      ))}
                    </div>
                    <div className="precise-value-input">
                      <label className="sr-only" htmlFor="scale-value">
                        Precise scale value
                      </label>
                      <input
                        id="scale-value"
                        aria-label="Precise scale value"
                        type="number"
                        min={MIN_LAYER_SCALE}
                        max={MAX_LAYER_SCALE}
                        step="1"
                        value={primaryScale}
                        onFocus={() => {
                          sliderSnapshot.current = frames;
                        }}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value)) return;
                          const nextScale = Math.min(
                            MAX_LAYER_SCALE,
                            Math.max(MIN_LAYER_SCALE, value),
                          );
                          updateSelectedLayersTransform(
                            { scaleX: nextScale, scaleY: nextScale },
                            false,
                          );
                        }}
                        onBlur={() => {
                          if (sliderSnapshot.current) recordState(sliderSnapshot.current);
                          sliderSnapshot.current = null;
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                      />
                      <span>%</span>
                    </div>
                  </div>

                  {/* Precise rotation and pivot controls */}
                  <div className="control-group">
                    <label htmlFor="rotation-slider">
                      Rotation: {primaryLayer.transform.rotation || 0}°
                    </label>
                    <input
                      id="rotation-slider"
                      type="range"
                      min="0"
                      max="359"
                      value={primaryLayer.transform.rotation || 0}
                      onPointerDown={() => {
                        sliderSnapshot.current = frames;
                      }}
                      onChange={(event) => {
                        const newRotation = Number(event.target.value);
                        updateSelectedLayersTransform(
                          (transform, layer) =>
                            rotateLayerAroundPivot({ ...layer, transform }, newRotation),
                          false,
                        );
                      }}
                      onPointerUp={() => {
                        if (sliderSnapshot.current) recordState(sliderSnapshot.current);
                        sliderSnapshot.current = null;
                      }}
                      onBlur={() => {
                        if (sliderSnapshot.current) recordState(sliderSnapshot.current);
                        sliderSnapshot.current = null;
                      }}
                      aria-label="Rotation slider"
                    />
                    <div className="precise-value-input">
                      <label className="sr-only" htmlFor="rotation-value">
                        Precise rotation
                      </label>
                      <input
                        id="rotation-value"
                        aria-label="Rotation in degrees"
                        type="number"
                        min="0"
                        max="359"
                        value={primaryLayer.transform.rotation || 0}
                        onFocus={() => {
                          sliderSnapshot.current = frames;
                        }}
                        onChange={(event) => {
                          const newRotation = Number(event.target.value);
                          updateSelectedLayersTransform(
                            (transform, layer) =>
                              rotateLayerAroundPivot({ ...layer, transform }, newRotation),
                            false,
                          );
                        }}
                        onBlur={() => {
                          if (sliderSnapshot.current) recordState(sliderSnapshot.current);
                          sliderSnapshot.current = null;
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                      />
                      <span>°</span>
                    </div>
                    <div className="pivot-control-row">
                      <div>
                        <span className="control-label">Rotation pivot</span>
                        <small>
                          Drag the target on the sprite. Rotation keeps that point fixed.
                        </small>
                      </div>
                      <button
                        type="button"
                        className="sprite-button"
                        onClick={() =>
                          updateSelectedLayersTransform({ pivotX: 0, pivotY: 0 })
                        }
                      >
                        Center pivot
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
                      aria-label="Opacity slider"
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
                      onBlur={() => {
                        if (sliderSnapshot.current) {
                          recordState(sliderSnapshot.current);
                          sliderSnapshot.current = null;
                        }
                      }}
                    />
                    <div className="precise-value-input">
                      <label className="sr-only" htmlFor="opacity-value">
                        Precise opacity value
                      </label>
                      <input
                        id="opacity-value"
                        aria-label="Precise opacity value"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={Math.round((primaryLayer.transform.opacity ?? 1) * 100)}
                        onFocus={() => {
                          sliderSnapshot.current = frames;
                        }}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value)) return;
                          const nextOpacity = Math.min(100, Math.max(0, value)) / 100;
                          updateSelectedLayersTransform({ opacity: nextOpacity }, false);
                        }}
                        onBlur={() => {
                          if (sliderSnapshot.current) recordState(sliderSnapshot.current);
                          sliderSnapshot.current = null;
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                      />
                      <span>%</span>
                    </div>
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
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab Panel 2: Animation Settings */}
          {settingsTab === 'animation' && (
            <div
              id="tabpanel-animation"
              role="tabpanel"
              aria-labelledby="tab-animation"
              className="sidebar-section animation-config-section"
            >
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

              {/* Quick Export Trigger Card inside Animation settings */}
              <div className="tab-export-trigger">
                <button
                  type="button"
                  className="sprite-button sprite-primary w-full"
                  onClick={() => setShowExportModal(true)}
                >
                  <Download size={15} /> Export animation (PNG, GIF, JSON)…
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Export Mini-Modal Dialog */}
        {showExportModal && (
          <div
            className="export-modal-backdrop"
            onClick={() => setShowExportModal(false)}
            role="presentation"
          >
            <div
              className="export-mini-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="export-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="export-modal-header">
                <div className="export-modal-title-box">
                  <Download size={18} className="export-modal-icon" />
                  <div>
                    <h3 id="export-modal-title">Export Animation</h3>
                    <p className="export-modal-subtitle">
                      {count} frames · {delay}ms delay ({fps} FPS)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setShowExportModal(false)}
                  aria-label="Close export dialog"
                >
                  <X size={16} />
                </button>
              </div>

              {layout && (
                <div className="export-modal-specs">
                  <span>
                    Cell:{' '}
                    <strong>
                      {cellWidth}×{cellHeight}px
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Sheet:{' '}
                    <strong>
                      {layout.width}×{layout.height}px
                    </strong>{' '}
                    ({actualColumns}×{layout.rows})
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

              {/* Format Cards */}
              <div className="export-options-list">
                {/* 1. Spritesheet PNG */}
                <div className="export-format-card">
                  <div className="format-card-left">
                    <span className="format-badge png-badge">PNG</span>
                    <div className="format-info">
                      <h4>Spritesheet PNG</h4>
                      <p>Full transparency · Crisp pixel art ({actualColumns} columns)</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sprite-button sprite-primary"
                    disabled={!layout || progress !== null}
                    onClick={() => exportImage('png')}
                  >
                    <Download size={14} /> Download spritesheet PNG
                  </button>
                </div>

                {/* 2. Animated GIF */}
                <div className="export-format-card">
                  <div className="format-card-left">
                    <span className="format-badge gif-badge">GIF</span>
                    <div className="format-info">
                      <h4>Animated GIF</h4>
                      <p>Looping web animation · 256 colors palette</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sprite-button"
                    disabled={!layout || progress !== null}
                    onClick={() => exportImage('gif')}
                  >
                    <Download size={14} /> Download animated GIF
                  </button>
                </div>

                {/* 3. Frame Data JSON */}
                <div className="export-format-card">
                  <div className="format-card-left">
                    <span className="format-badge json-badge">JSON</span>
                    <div className="format-info">
                      <h4>Frame metadata (JSON)</h4>
                      <p>Spritesheet offsets, frame durations & layer data</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sprite-button"
                    disabled={!layout || progress !== null}
                    onClick={exportMetadata}
                  >
                    <Download size={14} /> Download frame data (JSON)
                  </button>
                </div>
              </div>

              <div className="export-modal-footer">
                <small>PNG preserves full alpha channels. GIF uses up to 256 colors.</small>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
