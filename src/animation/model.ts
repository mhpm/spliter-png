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
