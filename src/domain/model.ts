export interface ExtractionOptions {
  alphaThreshold: number;
  minArea: number;
  minSize: number;
  padding: number;
}

export const DEFAULT_OPTIONS: Readonly<ExtractionOptions> = {
  alphaThreshold: 24,
  minArea: 64,
  minSize: 4,
  padding: 2,
};

export const LIMITS = {
  fileBytes: 25 * 1024 * 1024,
  pixels: 16_777_216,
  dimension: 8192,
  runs: 250_000,
  components: 1000,
  outputPixels: 24_000_000,
} as const;

export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface Run {
  start: number;
  end: number;
  y: number;
  label: number;
}
export interface Region extends Bounds {
  id: number;
  area: number;
  runs: Run[];
}
export interface ExtractedImage extends Bounds {
  id: number;
  area: number;
  width: number;
  height: number;
  blob: Blob;
}
export interface ExtractionResult {
  images: ExtractedImage[];
  opaque: boolean;
  width: number;
  height: number;
}
export interface Progress {
  percent: number;
  message: string;
}

export function validateOptions(options: ExtractionOptions): void {
  const rules: [keyof ExtractionOptions, number, number][] = [
    ['alphaThreshold', 0, 254],
    ['minArea', 1, LIMITS.pixels],
    ['minSize', 1, LIMITS.dimension],
    ['padding', 0, 256],
  ];
  for (const [key, min, max] of rules) {
    if (!Number.isInteger(options[key]) || options[key] < min || options[key] > max) {
      throw new Error(`El ajuste ${key} debe ser un entero entre ${min} y ${max}.`);
    }
  }
}
