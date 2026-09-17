export type EditTool = 'keep' | 'exclude' | 'erase' | 'restore' | 'pan' | 'wand';
export interface Point {
  x: number;
  y: number;
}
export interface SelectionPoint extends Point {
  kind: 'keep' | 'exclude';
  id: string;
}
export interface Mask {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export interface EditorImage {
  id: string;
  file: File;
  bitmap: ImageBitmap;
  width: number;
  height: number;
}
export interface AIProgress {
  message: string;
  percent?: number;
}
export interface SegmentationEngine {
  segment(
    image: EditorImage,
    points: SelectionPoint[] | null,
    signal: AbortSignal,
    progress: (value: AIProgress) => void,
  ): Promise<Mask>;
  warmup?(): void;
  dispose(): void;
}
export interface BackgroundServices {
  engine: SegmentationEngine;
  open: (file: File) => Promise<EditorImage>;
  download: (blob: Blob, name: string) => void;
  renderPng: (image: ImageBitmap, mask: Mask, feather: number) => Promise<Blob>;
}
