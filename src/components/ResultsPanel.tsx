import { Button, Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { ArrowDownToLine, Check, Expand, Grid2X2, PackageOpen, X } from 'lucide-react';
import type { ImageItem } from '../application/use-splitter';
import { validateNames } from '../domain/names';

function ImageCard({
  item,
  index,
  error,
  disabled,
  onRename,
}: {
  item: ImageItem;
  index: number;
  error: string | null;
  disabled: boolean;
  onRename: (id: number, name: string) => void;
}) {
  const inputId = `name-${item.id}`;
  return (
    <article className={`image-card ${error ? 'has-error' : ''}`}>
      <DialogTrigger>
        <Button
          className="image-thumbnail checkerboard"
          aria-label={`Ampliar elemento ${index + 1}`}
        >
          <span className="image-index">{String(index + 1).padStart(2, '0')}</span>
          <img src={item.url} alt={`Recorte ${index + 1}`} loading="lazy" />
          <span className="expand-icon">
            <Expand size={14} />
          </span>
        </Button>
        <ModalOverlay className="modal-overlay">
          <Modal className="preview-modal">
            <Dialog className="outline-none">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Heading slot="title" className="truncate font-semibold">
                    {item.name || `Elemento ${index + 1}`}
                  </Heading>
                  <p className="mt-1 text-sm text-muted">
                    {item.width} × {item.height} px · PNG transparente
                  </p>
                </div>
                <Button slot="close" className="icon-button" aria-label="Cerrar vista previa">
                  <X size={20} />
                </Button>
              </div>
              <div className="modal-image checkerboard">
                <img src={item.url} alt={`Vista ampliada del elemento ${index + 1}`} />
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      </DialogTrigger>
      <div className="image-card-info">
        <label htmlFor={inputId} className="sr-only">
          Nombre del elemento {index + 1}
        </label>
        <div className="filename-field">
          <input
            id={inputId}
            value={item.name}
            onChange={(event) => onRename(item.id, event.target.value)}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <span>.png</span>
        </div>
        <p className="image-size">
          {item.width} × {item.height} px
        </p>
        {error && (
          <p id={`${inputId}-error`} className="name-error">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

interface Props {
  items: ImageItem[];
  completed: boolean;
  disabled: boolean;
  exporting: boolean;
  downloaded: boolean;
  dirty: boolean;
  onRename: (id: number, name: string) => void;
  onExport: () => void;
}
export function ResultsPanel({
  items,
  completed,
  disabled,
  exporting,
  downloaded,
  dirty,
  onRename,
  onExport,
}: Props) {
  const errors = validateNames(items.map((item) => item.name));
  const hasErrors = errors.some(Boolean);
  return (
    <section className="results-panel panel" aria-label="Elementos extraídos">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <Grid2X2 size={17} />
          <h2>Elementos</h2>
          <span className="count-badge">{items.length}</span>
        </div>
        <span className="eyebrow">02 / RESULTADO</span>
      </div>
      {items.length ? (
        <>
          <div className="results-intro">
            <p>Dale un nombre a cada pieza.</p>
            <span>Haz clic en una imagen para ampliarla.</span>
          </div>
          <div className="results-grid">
            {items.map((item, index) => (
              <ImageCard
                key={item.id}
                item={item}
                index={index}
                error={errors[index]}
                disabled={disabled}
                onRename={onRename}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="results-empty">
          <div className="empty-icon">
            <PackageOpen size={33} strokeWidth={1.3} />
          </div>
          <h3>{completed ? 'No encontramos elementos' : 'Aquí empieza cada pieza'}</h3>
          <p>
            {completed
              ? 'Reduce el umbral, el área o el tamaño mínimo y vuelve a extraer.'
              : 'Carga tu PNG y pulsa “Extraer elementos” para revisar y nombrar cada recorte.'}
          </p>
        </div>
      )}
      <div className="export-panel">
        <div className="export-summary">
          <span>
            {items.length
              ? `${items.length} ${items.length === 1 ? 'imagen lista' : 'imágenes listas'}`
              : 'Todo en un solo archivo'}
          </span>
          <span className="text-muted">.ZIP</span>
        </div>
        <Button
          className="primary-button w-full"
          isDisabled={!items.length || disabled || hasErrors || dirty}
          onPress={onExport}
        >
          <ArrowDownToLine size={17} />
          {exporting ? 'Preparando ZIP…' : 'Descargar ZIP'}
          {items.length > 0 && <span className="download-count">{items.length}</span>}
        </Button>
        <p className={`export-note ${hasErrors ? 'text-red-700' : ''}`} role="status">
          {hasErrors ? (
            'Corrige los nombres marcados para descargar.'
          ) : dirty ? (
            'Aplica los nuevos ajustes antes de descargar.'
          ) : downloaded ? (
            <>
              <Check size={13} /> Tu ZIP está listo. Revisa tus descargas.
            </>
          ) : (
            'PNG individuales · Transparencia conservada'
          )}
        </p>
      </div>
    </section>
  );
}
