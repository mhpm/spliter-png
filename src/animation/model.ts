export interface SpriteEdit {
  scale: number;
  flipX: boolean;
  flipY: boolean;
}
export type EditCommand = { scale: number } | 'flipX' | 'flipY' | 'reset';
export const DEFAULT_EDIT: SpriteEdit = { scale: 100, flipX: false, flipY: false };
export function nextEdit(current: SpriteEdit, command: EditCommand): SpriteEdit {
  if (command === 'reset') return { ...DEFAULT_EDIT };
  if (typeof command === 'object') {
    if (!Number.isFinite(command.scale) || command.scale < 1 || command.scale > 400)
      throw new Error('Scale must be between 1% and 400%.');
    return { ...current, scale: command.scale };
  }
  return { ...current, [command]: !current[command] };
}
export interface FrameSize {
  width: number;
  height: number;
}
export function sheetLayout(frames: FrameSize[], columns: number, padding: number) {
  if (!frames.length || frames.length > 200) throw new Error('Choose between 1 and 200 frames.');
  if (
    !Number.isInteger(columns) ||
    columns < 1 ||
    columns > frames.length ||
    !Number.isInteger(padding) ||
    padding < 0 ||
    padding > 64
  )
    throw new Error('Check the columns and padding.');
  const cellWidth = Math.max(...frames.map((f) => f.width)) + padding * 2;
  const cellHeight = Math.max(...frames.map((f) => f.height)) + padding * 2;
  const rows = Math.ceil(frames.length / columns);
  const width = columns * cellWidth,
    height = rows * cellHeight;
  if (width > 8192 || height > 8192 || width * height > 24_000_000)
    throw new Error(
      'The sheet is too large. Reduce sprite size or change the number of columns (maximum 8192 px per side and 24 megapixels).',
    );
  return { cellWidth, cellHeight, columns, rows, width, height };
}

export interface LayerTransform {
  scale: number;
  flipX: boolean;
  flipY: boolean;
  rotation: number;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
}

export const DEFAULT_LAYER_TRANSFORM: LayerTransform = {
  scale: 100,
  flipX: false,
  flipY: false,
  rotation: 0,
  x: 0,
  y: 0,
  opacity: 1,
  visible: true,
};

export interface FrameLayer {
  id: string;
  spriteId: number;
  name: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  transform: LayerTransform;
}

export interface StudioFrame {
  id: string;
  name: string;
  layers: FrameLayer[];
}

/**
 * The inspector stores layers from front to back, while DOM and Canvas paint
 * later entries over earlier ones. Return the back-to-front paint sequence.
 */
export function layersInPaintOrder<T>(layers: readonly T[]): T[] {
  return [...layers].reverse();
}

export function isDefaultTransform(t: LayerTransform): boolean {
  return (
    t.scale === 100 &&
    !t.flipX &&
    !t.flipY &&
    t.rotation === 0 &&
    t.x === 0 &&
    t.y === 0 &&
    t.opacity === 1 &&
    t.visible
  );
}

export function isFrameUntouched(frame: StudioFrame): boolean {
  return frame.layers.length === 1 && isDefaultTransform(frame.layers[0].transform);
}

export function calculateTransformedLayerBounds(layer: FrameLayer): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
} {
  const scale = (layer.transform.scale || 100) / 100;
  const w = layer.width * scale;
  const h = layer.height * scale;
  const rad = ((layer.transform.rotation || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bbW = Math.round(w * cos + h * sin);
  const bbH = Math.round(w * sin + h * cos);

  const cx = layer.transform.x || 0;
  const cy = layer.transform.y || 0;

  return {
    minX: cx - bbW / 2,
    maxX: cx + bbW / 2,
    minY: cy - bbH / 2,
    maxY: cy + bbH / 2,
    width: bbW,
    height: bbH,
  };
}

export function calculateFrameDimensions(frame: StudioFrame): { width: number; height: number } {
  const visibleLayers = frame.layers.filter((l) => l.transform.visible);
  if (!visibleLayers.length) return { width: 32, height: 32 };
  if (isFrameUntouched(frame)) {
    return { width: frame.layers[0].width, height: frame.layers[0].height };
  }
  let maxExtentX = 0;
  let maxExtentY = 0;
  for (const layer of visibleLayers) {
    const bounds = calculateTransformedLayerBounds(layer);
    maxExtentX = Math.max(maxExtentX, Math.abs(bounds.minX), Math.abs(bounds.maxX));
    maxExtentY = Math.max(maxExtentY, Math.abs(bounds.minY), Math.abs(bounds.maxY));
  }
  return {
    width: Math.max(1, Math.ceil(maxExtentX * 2)),
    height: Math.max(1, Math.ceil(maxExtentY * 2)),
  };
}

export function createLayerFromItem(
  item: { id: number; name: string; blob: Blob; url: string; width: number; height: number },
  transform?: Partial<LayerTransform>,
): FrameLayer {
  return {
    id: `layer-${item.id}-${Math.random().toString(36).slice(2, 9)}`,
    spriteId: item.id,
    name: item.name,
    blob: item.blob,
    url: item.url,
    width: item.width,
    height: item.height,
    transform: { ...DEFAULT_LAYER_TRANSFORM, ...transform },
  };
}

export function createFrameFromItem(
  item: { id: number; name: string; blob: Blob; url: string; width: number; height: number },
  index = 0,
): StudioFrame {
  return {
    id: `frame-${index}-${item.id}-${Math.random().toString(36).slice(2, 7)}`,
    name: item.name,
    layers: [createLayerFromItem(item)],
  };
}
