import { LIMITS, validateOptions } from './model';
import type { Bounds, ExtractionOptions, PixelImage, Region, Run } from './model';

/** Eight-connected run labeling. Pure: no React, browser APIs, or encoders. */
export function detectRegions(
  image: PixelImage,
  options: ExtractionOptions,
  onProgress?: (fraction: number) => void,
): Region[] {
  validateOptions(options);
  const { width, height, data } = image;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > LIMITS.pixels ||
    data.length !== width * height * 4
  ) {
    throw new Error('Las dimensiones o los píxeles de la imagen no son válidos.');
  }
  const parent: number[] = [0];
  const rank: number[] = [0];
  const runs: Run[] = [];
  let previous: Run[] = [];

  function find(label: number): number {
    let root = label;
    while (parent[root] !== root) root = parent[root];
    while (parent[label] !== label) {
      const next = parent[label];
      parent[label] = root;
      label = next;
    }
    return root;
  }
  function union(a: number, b: number): void {
    let rootA = find(a);
    let rootB = find(b);
    if (rootA === rootB) return;
    if (rank[rootA] < rank[rootB]) [rootA, rootB] = [rootB, rootA];
    parent[rootB] = rootA;
    if (rank[rootA] === rank[rootB]) rank[rootA]++;
  }

  for (let y = 0; y < height; y++) {
    const current: Run[] = [];
    let previousIndex = 0;
    let x = 0;
    while (x < width) {
      if (data[(y * width + x) * 4 + 3] < options.alphaThreshold) {
        x++;
        continue;
      }
      const start = x++;
      while (x < width && data[(y * width + x) * 4 + 3] >= options.alphaThreshold) x++;
      const end = x;
      // Ends are exclusive; equality includes diagonal neighbors.
      while (previousIndex < previous.length && previous[previousIndex].end < start)
        previousIndex++;
      let label = 0;
      for (let i = previousIndex; i < previous.length && previous[i].start <= end; i++) {
        if (label === 0) label = previous[i].label;
        else union(label, previous[i].label);
      }
      if (label === 0) {
        label = parent.length;
        parent.push(label);
        rank.push(0);
      }
      const run = { start, end, y, label };
      current.push(run);
      runs.push(run);
      if (runs.length > LIMITS.runs)
        throw new Error(
          'La imagen contiene demasiado ruido. Prueba con un recorte más pequeño o un umbral mayor.',
        );
    }
    previous = current;
    if (y % 128 === 0) onProgress?.(y / height);
  }

  const regions = new Map<number, Region>();
  for (const run of runs) {
    const id = find(run.label);
    run.label = id;
    const region = regions.get(id);
    if (region) {
      region.left = Math.min(region.left, run.start);
      region.right = Math.max(region.right, run.end);
      region.bottom = run.y + 1;
      region.area += run.end - run.start;
      region.runs.push(run);
    } else {
      regions.set(id, {
        id,
        left: run.start,
        right: run.end,
        top: run.y,
        bottom: run.y + 1,
        area: run.end - run.start,
        runs: [run],
      });
    }
  }
  const retained = [...regions.values()]
    .filter(
      (region) =>
        region.area >= options.minArea &&
        region.right - region.left >= options.minSize &&
        region.bottom - region.top >= options.minSize,
    )
    .sort((a, b) => a.top - b.top || a.left - b.left);
  if (retained.length > LIMITS.components)
    throw new Error(
      'Se detectaron más de 1.000 elementos. Aumenta el área mínima o usa una imagen más pequeña.',
    );
  let outputPixels = 0;
  for (const region of retained) {
    const box = paddedBounds(region, width, height, options.padding);
    outputPixels += (box.right - box.left) * (box.bottom - box.top);
  }
  if (outputPixels > LIMITS.outputPixels)
    throw new Error(
      'Los recortes ocuparían demasiada memoria. Reduce el margen o divide la imagen de origen.',
    );
  onProgress?.(1);
  return retained;
}

export function paddedBounds(
  region: Bounds,
  width: number,
  height: number,
  padding: number,
): Bounds {
  return {
    left: Math.max(0, region.left - padding),
    top: Math.max(0, region.top - padding),
    right: Math.min(width, region.right + padding),
    bottom: Math.min(height, region.bottom + padding),
  };
}

export function isolateRegion(
  image: PixelImage,
  region: Region,
  padding: number,
): PixelImage & Bounds {
  const bounds = paddedBounds(region, image.width, image.height, padding);
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const data = new Uint8ClampedArray(width * height * 4);
  // Copy RGB even under transparent pixels, as Pillow does. Alpha is isolated by label.
  for (let y = 0; y < height; y++) {
    const offset = ((y + bounds.top) * image.width + bounds.left) * 4;
    data.set(image.data.subarray(offset, offset + width * 4), y * width * 4);
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 0;
  for (const run of region.runs) {
    for (let x = run.start; x < run.end; x++) {
      data[((run.y - bounds.top) * width + x - bounds.left) * 4 + 3] =
        image.data[(run.y * image.width + x) * 4 + 3];
    }
  }
  return { ...bounds, width, height, data };
}
