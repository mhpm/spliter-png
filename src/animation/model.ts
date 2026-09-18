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
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  flipY: boolean;
  rotation: number;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  pivotX: number;
  pivotY: number;
}

export const DEFAULT_LAYER_TRANSFORM: LayerTransform = {
  scaleX: 100,
  scaleY: 100,
  flipX: false,
  flipY: false,
  rotation: 0,
  x: 0,
  y: 0,
  opacity: 1,
  visible: true,
  pivotX: 0,
  pivotY: 0,
};

export const MIN_LAYER_SCALE = 1;
export const MAX_LAYER_SCALE = 800;

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

export function getLayerDisplaySize(
  layer: Pick<FrameLayer, 'width' | 'height' | 'transform'>,
): FrameSize {
  return {
    width: layer.width * ((layer.transform.scaleX || 100) / 100),
    height: layer.height * ((layer.transform.scaleY || 100) / 100),
  };
}

export type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br';
export type ResizeEdge = 't' | 'r' | 'b' | 'l';

export function resizeLayerFromCorner(
  layer: Pick<FrameLayer, 'width' | 'height' | 'transform'>,
  corner: ResizeCorner,
  pointer: { x: number; y: number },
  stageCenter: { x: number; y: number },
): Pick<LayerTransform, 'scaleX' | 'scaleY' | 'x' | 'y'> {
  const horizontalSign = (corner.endsWith('r') ? 1 : -1) * (layer.transform.flipX ? -1 : 1);
  const verticalSign = (corner.startsWith('b') ? 1 : -1) * (layer.transform.flipY ? -1 : 1);
  const initialScaleX = (layer.transform.scaleX || 100) / 100;
  const initialScaleY = (layer.transform.scaleY || 100) / 100;
  const localX = (horizontalSign * layer.width * initialScaleX) / 2;
  const localY = (verticalSign * layer.height * initialScaleY) / 2;
  const radians = ((layer.transform.rotation || 0) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const diagonal = {
    x: localX * cosine - localY * sine,
    y: localX * sine + localY * cosine,
  };
  const initialCenter = {
    x: stageCenter.x + (layer.transform.x || 0),
    y: stageCenter.y + (layer.transform.y || 0),
  };
  const fixedOpposite = {
    x: initialCenter.x - diagonal.x,
    y: initialCenter.y - diagonal.y,
  };
  const denominator = 2 * (diagonal.x * diagonal.x + diagonal.y * diagonal.y);
  const projectedScale =
    ((pointer.x - fixedOpposite.x) * diagonal.x +
      (pointer.y - fixedOpposite.y) * diagonal.y) /
    denominator;
  const scaleFactor = Math.min(
    MAX_LAYER_SCALE / Math.max(initialScaleX * 100, initialScaleY * 100),
    Math.max(
      MIN_LAYER_SCALE / Math.min(initialScaleX * 100, initialScaleY * 100),
      projectedScale,
    ),
  );
  const nextCenter = {
    x: fixedOpposite.x + diagonal.x * scaleFactor,
    y: fixedOpposite.y + diagonal.y * scaleFactor,
  };
  return {
    scaleX: Math.round(initialScaleX * scaleFactor * 100),
    scaleY: Math.round(initialScaleY * scaleFactor * 100),
    x: Math.round(nextCenter.x - stageCenter.x),
    y: Math.round(nextCenter.y - stageCenter.y),
  };
}

export function resizeLayerFromEdge(
  layer: Pick<FrameLayer, 'width' | 'height' | 'transform'>,
  edge: ResizeEdge,
  pointer: { x: number; y: number },
  stageCenter: { x: number; y: number },
): Pick<LayerTransform, 'scaleX' | 'scaleY' | 'x' | 'y'> {
  const horizontal = edge === 'l' || edge === 'r';
  const initialScaleX = (layer.transform.scaleX || 100) / 100;
  const initialScaleY = (layer.transform.scaleY || 100) / 100;
  const flipSign = horizontal
    ? layer.transform.flipX
      ? -1
      : 1
    : layer.transform.flipY
      ? -1
      : 1;
  const edgeSign = (edge === 'r' || edge === 'b' ? 1 : -1) * flipSign;
  const local = horizontal
    ? { x: (edgeSign * layer.width * initialScaleX) / 2, y: 0 }
    : { x: 0, y: (edgeSign * layer.height * initialScaleY) / 2 };
  const rotated = rotateVector(local.x, local.y, layer.transform.rotation || 0);
  const initialCenter = {
    x: stageCenter.x + (layer.transform.x || 0),
    y: stageCenter.y + (layer.transform.y || 0),
  };
  const fixedOpposite = {
    x: initialCenter.x - rotated.x,
    y: initialCenter.y - rotated.y,
  };
  const denominator = 2 * (rotated.x * rotated.x + rotated.y * rotated.y);
  const projectedScale =
    ((pointer.x - fixedOpposite.x) * rotated.x +
      (pointer.y - fixedOpposite.y) * rotated.y) /
    denominator;
  const currentPercent = (horizontal ? initialScaleX : initialScaleY) * 100;
  const scaleFactor = Math.min(
    MAX_LAYER_SCALE / currentPercent,
    Math.max(MIN_LAYER_SCALE / currentPercent, projectedScale),
  );
  const nextCenter = {
    x: fixedOpposite.x + rotated.x * scaleFactor,
    y: fixedOpposite.y + rotated.y * scaleFactor,
  };
  return {
    scaleX: horizontal ? Math.round(initialScaleX * scaleFactor * 100) : Math.round(initialScaleX * 100),
    scaleY: horizontal ? Math.round(initialScaleY * 100) : Math.round(initialScaleY * scaleFactor * 100),
    x: Math.round(nextCenter.x - stageCenter.x),
    y: Math.round(nextCenter.y - stageCenter.y),
  };
}

function rotateVector(x: number, y: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return { x: x * cosine - y * sine, y: x * sine + y * cosine };
}

export function moveLayerPivot(
  layer: Pick<FrameLayer, 'width' | 'height' | 'transform'>,
  pointer: { x: number; y: number },
  stageCenter: { x: number; y: number },
): Pick<LayerTransform, 'pivotX' | 'pivotY'> {
  const scaleX = (layer.transform.scaleX || 100) / 100;
  const scaleY = (layer.transform.scaleY || 100) / 100;
  const centerX = stageCenter.x + (layer.transform.x || 0);
  const centerY = stageCenter.y + (layer.transform.y || 0);
  const unrotated = rotateVector(
    pointer.x - centerX,
    pointer.y - centerY,
    -(layer.transform.rotation || 0),
  );
  const flipX = layer.transform.flipX ? -1 : 1;
  const flipY = layer.transform.flipY ? -1 : 1;
  return {
    pivotX: Math.max(-1, Math.min(1, (unrotated.x * flipX) / (layer.width * scaleX))),
    pivotY: Math.max(-1, Math.min(1, (unrotated.y * flipY) / (layer.height * scaleY))),
  };
}

export function rotateLayerAroundPivot(
  layer: Pick<FrameLayer, 'width' | 'height' | 'transform'>,
  rotation: number,
): Pick<LayerTransform, 'rotation' | 'x' | 'y'> {
  const transform = layer.transform;
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const scaleX = (transform.scaleX || 100) / 100;
  const scaleY = (transform.scaleY || 100) / 100;
  const pivotLocal = {
    x: (transform.pivotX || 0) * layer.width * scaleX * (transform.flipX ? -1 : 1),
    y: (transform.pivotY || 0) * layer.height * scaleY * (transform.flipY ? -1 : 1),
  };
  const previousPivotOffset = rotateVector(
    pivotLocal.x,
    pivotLocal.y,
    transform.rotation || 0,
  );
  const nextPivotOffset = rotateVector(pivotLocal.x, pivotLocal.y, normalizedRotation);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    rotation: normalizedRotation,
    x: round((transform.x || 0) + previousPivotOffset.x - nextPivotOffset.x),
    y: round((transform.y || 0) + previousPivotOffset.y - nextPivotOffset.y),
  };
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
    t.scaleX === 100 &&
    t.scaleY === 100 &&
    !t.flipX &&
    !t.flipY &&
    t.rotation === 0 &&
    t.x === 0 &&
    t.y === 0 &&
    t.opacity === 1 &&
    t.visible &&
    (t.pivotX || 0) === 0 &&
    (t.pivotY || 0) === 0
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
  const { width: w, height: h } = getLayerDisplaySize(layer);
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
