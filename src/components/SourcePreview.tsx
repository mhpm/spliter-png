import { useState } from 'react';
import { Button } from 'react-aria-components';
import { Scan, Image as ImageIcon, Layers, SquareDashed, Check } from 'lucide-react';
import type { SourceImage, ImageItem } from '../application/use-splitter';
import { UploadZone } from './UploadZone';

interface Props {
  source: SourceImage | null;
  items: ImageItem[];
  disabled: boolean;
  onFile: (file: File) => void;
  onError: (message: string) => void;
}

export function SourcePreview({ source, items, disabled, onFile, onError }: Props) {
  const [showBounds, setShowBounds] = useState(true);
  return (
    <section className="source-panel panel">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <ImageIcon size={17} />
          <h2>Imagen original</h2>
        </div>
        <span className="eyebrow">01 / ORIGEN</span>
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
              alt={`Imagen original: ${source.file.name}`}
              onError={() => onError('No se pudo abrir el PNG. Puede estar incompleto o dañado.')}
            />
            {showBounds &&
              items.map((item, index) => (
                <div
                  key={item.id}
                  className="region-bound"
                  style={{
                    left: `${(item.left / source.width) * 100}%`,
                    top: `${(item.top / source.height) * 100}%`,
                    width: `${((item.right - item.left) / source.width) * 100}%`,
                    height: `${((item.bottom - item.top) / source.height) * 100}%`,
                  }}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                </div>
              ))}
          </div>
        ) : (
          <UploadZone onFile={onFile} onError={onError} disabled={disabled} />
        )}
      </div>
      <div className="source-footer">
        <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
          <Scan size={15} />
          {source
            ? `${source.width.toLocaleString('es')} × ${source.height.toLocaleString('es')} px`
            : 'La transparencia importa'}
        </span>
        {source && (
          <Button
            className={`bounds-toggle ${showBounds ? 'active' : ''}`}
            aria-label="Mostrar regiones detectadas"
            aria-pressed={showBounds}
            onPress={() => setShowBounds((value) => !value)}
          >
            <SquareDashed size={15} />
            <span>Regiones</span>
          </Button>
        )}
      </div>
      {!source && (
        <div className="source-guidance">
          <div className="flex items-center gap-2 text-ink">
            <Layers size={16} />
            <p className="font-medium">Una imagen. Todos sus elementos.</p>
          </div>
          <p>
            Usa un PNG con espacio transparente entre las piezas. Los elementos que se tocan se
            extraen juntos.
          </p>
          <div className="guidance-tags">
            <span>
              <Check size={13} /> Transparencia original
            </span>
            <span>
              <Check size={13} /> Sin cambiar la escala
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
