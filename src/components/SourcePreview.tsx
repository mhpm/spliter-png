import { useState } from 'react';
import { Button } from 'react-aria-components';
import { Scan, Image as ImageIcon, Layers, SquareDashed, Check } from 'lucide-react';
import type { SourceImage, ImageItem } from '../application/use-splitter';
import { UploadZone } from './UploadZone';

interface Props {
  source: SourceImage | null;
  items: ImageItem[];
  selectedIds?: Set<number>;
  disabled: boolean;
  onFile: (file: File) => void;
  onError: (message: string) => void;
  onToggleSelect: (id: number) => void;
}

export function SourcePreview({
  source,
  items,
  selectedIds,
  disabled,
  onFile,
  onError,
  onToggleSelect,
}: Props) {
  const [showBounds, setShowBounds] = useState(true);
  return (
    <section className="source-panel panel">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <ImageIcon size={17} />
          <h2>Original image</h2>
        </div>
        <span className="eyebrow">01 / SOURCE</span>
      </div>
      <div className={`source-stage ${source ? 'checkerboard' : ''}`}>
        {source ? (
          <div
            className="source-image-wrap"
            style={{
              aspectRatio: `${source.width} / ${source.height}`,
              width: `min(100%, ${(500 * source.width) / source.height}px)`,
            }}
          >
            <img
              src={source.url}
              alt={`Original image: ${source.file.name}`}
              onError={() => onError('Could not open PNG. It may be incomplete or corrupted.')}
            />
            {showBounds &&
              items.map((item, index) => {
                const isSelected = !selectedIds || selectedIds.has(item.id);
                return (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Toggle source element ${index + 1}`}
                    aria-pressed={isSelected}
                    title={`${item.name} · Click to ${isSelected ? 'deselect' : 'select'}`}
                    onClick={() => onToggleSelect(item.id)}
                    key={item.id}
                    className={`region-bound ${isSelected ? 'is-selected' : 'is-unselected'}`}
                    style={{
                      left: `${(item.left / source.width) * 100}%`,
                      top: `${(item.top / source.height) * 100}%`,
                      width: `${((item.right - item.left) / source.width) * 100}%`,
                      height: `${((item.bottom - item.top) / source.height) * 100}%`,
                    }}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                  </button>
                );
              })}
          </div>
        ) : (
          <UploadZone onFile={onFile} onError={onError} disabled={disabled} />
        )}
      </div>
      <div className="source-footer">
        <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
          <Scan size={15} />
          {source
            ? `${source.width.toLocaleString('en')} × ${source.height.toLocaleString('en')} px`
            : 'Transparency matters'}
        </span>
        {source && (
          <Button
            className={`bounds-toggle ${showBounds ? 'active' : ''}`}
            aria-label="Show detected regions"
            aria-pressed={showBounds}
            onPress={() => setShowBounds((value) => !value)}
          >
            <SquareDashed size={15} />
            <span>Regions</span>
          </Button>
        )}
      </div>
      {items.length > 0 && (
        <p className="source-selection-hint">
          Click a region to select or deselect a sprite. Selection is shared with the Elements
          panel.
        </p>
      )}
      {!source && (
        <div className="source-guidance">
          <div className="flex items-center gap-2 text-ink">
            <Layers size={16} />
            <p className="font-medium">One image. All its elements.</p>
          </div>
          <p>
            Use a PNG with transparent space between pieces. Elements that touch will be extracted
            together.
          </p>
          <div className="guidance-tags">
            <span>
              <Check size={13} /> Original transparency
            </span>
            <span>
              <Check size={13} /> No scaling
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
