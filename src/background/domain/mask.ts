import type { Mask, Point } from './types';

/** A mask stores visibility only. Original colors and transparency stay untouched. */
export function createMask(width: number, height: number, visible = true): Mask {
  return { width, height, data: new Uint8ClampedArray(width * height).fill(visible ? 255 : 0) };
}

export function paintStroke(
  mask: Mask,
  from: Point,
  to: Point,
  diameter: number,
  hardness: number,
  restore: boolean,
): void {
  const radius = Math.max(0.5, diameter / 2);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distanceSquared = dx * dx + dy * dy;
  const left = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius));
  const right = Math.min(mask.width - 1, Math.ceil(Math.max(from.x, to.x) + radius));
  const top = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius));
  const bottom = Math.min(mask.height - 1, Math.ceil(Math.max(from.y, to.y) + radius));
  const hardRadius = radius * Math.min(1, Math.max(0, hardness));
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const t =
        distanceSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((x + 0.5 - from.x) * dx + (y + 0.5 - from.y) * dy) / distanceSquared),
            );
      const distance = Math.hypot(x + 0.5 - from.x - t * dx, y + 0.5 - from.y - t * dy);
      if (distance > radius) continue;
      const coverage =
        distance <= hardRadius ? 1 : (radius - distance) / Math.max(0.001, radius - hardRadius);
      const index = y * mask.width + x;
      mask.data[index] = restore
        ? Math.max(mask.data[index], Math.round(255 * coverage))
        : Math.min(mask.data[index], Math.round(255 * (1 - coverage)));
    }
  }
}

export function eraseColor(
  mask: Mask,
  pixels: Uint8ClampedArray,
  origin: Point,
  tolerance: number,
  contiguous: boolean,
  restore = false,
): void {
  const totalPixels = mask.width * mask.height;
  if (pixels.length < totalPixels * 4 || totalPixels === 0) return;
  const originX = Math.max(0, Math.min(mask.width - 1, Math.round(origin.x)));
  const originY = Math.max(0, Math.min(mask.height - 1, Math.round(origin.y)));
  const originIdx = (originY * mask.width + originX) * 4;
  const targetR = pixels[originIdx];
  const targetG = pixels[originIdx + 1];
  const targetB = pixels[originIdx + 2];
  const targetA = pixels[originIdx + 3];

  const threshold = (Math.max(0, Math.min(100, tolerance)) / 100) * 442;
  const thresholdSq = threshold * threshold;

  const matches = (i4: number) => {
    const dr = pixels[i4] - targetR;
    const dg = pixels[i4 + 1] - targetG;
    const db = pixels[i4 + 2] - targetB;
    const da = (pixels[i4 + 3] - targetA) * 0.5;
    return dr * dr + dg * dg + db * db + da * da <= thresholdSq;
  };

  const targetValue = restore ? 255 : 0;

  if (!contiguous) {
    for (let i = 0; i < totalPixels; i++) {
      if (matches(i * 4)) mask.data[i] = targetValue;
    }
    return;
  }

  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const startIdx = originY * mask.width + originX;
  visited[startIdx] = 1;
  queue[tail++] = startIdx;

  const w = mask.width;
  const h = mask.height;

  while (head < tail) {
    const current = queue[head++];
    mask.data[current] = targetValue;

    const cx = current % w;
    const cy = Math.floor(current / w);

    if (cx > 0) {
      const next = current - 1;
      if (!visited[next]) {
        visited[next] = 1;
        if (matches(next * 4)) queue[tail++] = next;
      }
    }
    if (cx < w - 1) {
      const next = current + 1;
      if (!visited[next]) {
        visited[next] = 1;
        if (matches(next * 4)) queue[tail++] = next;
      }
    }
    if (cy > 0) {
      const next = current - w;
      if (!visited[next]) {
        visited[next] = 1;
        if (matches(next * 4)) queue[tail++] = next;
      }
    }
    if (cy < h - 1) {
      const next = current + w;
      if (!visited[next]) {
        visited[next] = 1;
        if (matches(next * 4)) queue[tail++] = next;
      }
    }
  }
}

/** Whole-mask history with a strict memory budget, including undo and redo. */
export class MaskHistory {
  mask: Mask;
  private undoFrames: Uint8ClampedArray[] = [];
  private redoFrames: Uint8ClampedArray[] = [];
  private beforeStroke: Uint8ClampedArray | null = null;
  private readonly capacity: number;

  constructor(mask: Mask, budget = 48 * 1024 * 1024) {
    this.mask = mask;
    this.capacity = Math.max(1, Math.min(30, Math.floor(budget / mask.data.byteLength)));
  }
  get canUndo() {
    return this.undoFrames.length > 0;
  }
  get canRedo() {
    return this.redoFrames.length > 0;
  }
  begin() {
    this.beforeStroke ??= this.mask.data.slice();
  }
  commit() {
    const before = this.beforeStroke;
    this.beforeStroke = null;
    if (!before || before.every((value, index) => value === this.mask.data[index])) return false;
    this.undoFrames.push(before);
    this.redoFrames = [];
    while (this.undoFrames.length > this.capacity) this.undoFrames.shift();
    return true;
  }
  cancelStroke() {
    if (this.beforeStroke) this.mask = { ...this.mask, data: this.beforeStroke };
    this.beforeStroke = null;
  }
  replace(mask: Mask) {
    if (
      mask.width !== this.mask.width ||
      mask.height !== this.mask.height ||
      mask.data.length !== this.mask.data.length
    )
      throw new Error('The generated mask does not match your image.');
    this.begin();
    this.mask = mask;
    return this.commit();
  }
  undo() {
    this.cancelStroke();
    const previous = this.undoFrames.pop();
    if (!previous) return false;
    this.redoFrames.push(this.mask.data);
    this.mask = { ...this.mask, data: previous };
    return true;
  }
  redo() {
    const next = this.redoFrames.pop();
    if (!next) return false;
    this.undoFrames.push(this.mask.data);
    this.mask = { ...this.mask, data: next };
    return true;
  }
}

export function toImagePoint(
  client: Point,
  rect: { left: number; top: number; width: number; height: number },
  image: { width: number; height: number },
): Point {
  return {
    x: Math.max(0, Math.min(image.width - 1, ((client.x - rect.left) / rect.width) * image.width)),
    y: Math.max(
      0,
      Math.min(image.height - 1, ((client.y - rect.top) / rect.height) * image.height),
    ),
  };
}
