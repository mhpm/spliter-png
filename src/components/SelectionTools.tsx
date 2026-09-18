import { useState } from 'react';
import { FlipHorizontal2, FlipVertical2, Film, RotateCcw } from 'lucide-react';
import type { EditCommand } from '../animation/model';
import '../animation/animation.css';

export function SelectionTools({
  count,
  disabled,
  onEdit,
  onAnimate,
}: {
  count: number;
  disabled: boolean;
  onEdit: (command: EditCommand) => void;
  onAnimate: () => void;
}) {
  const [scale, setScale] = useState('100');
  if (!count) return null;
  const valid = Number.isFinite(Number(scale)) && Number(scale) >= 1 && Number(scale) <= 400;
  return (
    <section className="sprite-tools" aria-label="Selected sprite tools">
      <div>
        <strong>
          {count} {count === 1 ? 'sprite' : 'sprites'} selected
        </strong>
        <p>Changes apply to previews and downloads.</p>
      </div>
      <fieldset disabled={disabled}>
        <label className="sprite-scale">
          Scale (%)
          <input
            type="number"
            min="1"
            max="400"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
            aria-label="Sprite scale percent"
          />
        </label>
        <button
          className="sprite-button"
          disabled={!valid}
          onClick={() => onEdit({ scale: Number(scale) })}
        >
          Apply size
        </button>
        <button className="sprite-button" onClick={() => onEdit('flipX')}>
          <FlipHorizontal2 size={16} /> Flip horizontal
        </button>
        <button className="sprite-button" onClick={() => onEdit('flipY')}>
          <FlipVertical2 size={16} /> Flip vertical
        </button>
        <button className="sprite-button" onClick={() => onEdit('reset')}>
          <RotateCcw size={16} /> Reset edits
        </button>
        <button className="sprite-button sprite-primary" onClick={onAnimate}>
          <Film size={16} /> Create animation
        </button>
      </fieldset>
      <small>Scale is relative to the original size. Proportions stay locked.</small>
    </section>
  );
}
