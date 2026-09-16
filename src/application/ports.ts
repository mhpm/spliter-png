import type { ExtractionOptions, ExtractionResult, Progress } from '../domain/model';

export interface Extractor {
  extract(
    file: File,
    options: ExtractionOptions,
    signal: AbortSignal,
    onProgress: (progress: Progress) => void,
  ): Promise<ExtractionResult>;
}
export interface ArchiveEntry {
  name: string;
  blob: Blob;
}
export interface ArchiveWriter {
  create(entries: ArchiveEntry[], signal: AbortSignal): Promise<Blob>;
}
