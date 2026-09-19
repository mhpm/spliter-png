import type { ImageItem } from '../../application/use-splitter';
import { safeStem } from '../../domain/names';

export function createManualFrameItem(
  file: File,
  dimensions: { width: number; height: number },
  id: number,
): ImageItem {
  return {
    id,
    area: dimensions.width * dimensions.height,
    left: 0,
    top: 0,
    right: dimensions.width,
    bottom: dimensions.height,
    width: dimensions.width,
    height: dimensions.height,
    blob: file,
    url: URL.createObjectURL(file),
    name: safeStem(file.name),
  };
}
