import { Button, Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { ArrowDownToLine, Check, Expand, Grid2X2, PackageOpen, X } from 'lucide-react';
import type { ImageItem } from '../application/use-splitter';
import { validateNames, nameError } from '../domain/names';

function ImageCard({
  item,
  index,
  error,
  disabled,
  selected,
  onRename,
  onToggleSelect,
  onDownloadSingle,
}: {
  item: ImageItem;
  index: number;
  error: string | null;
  disabled: boolean;
  selected: boolean;
  onRename: (id: number, name: string) => void;
  onToggleSelect: (id: number) => void;
  onDownloadSingle: (id: number) => void;
}) {
  const inputId = `name-${item.id}`;
  return (
    <article
      className={`image-card ${error ? 'has-error' : ''} ${selected ? 'is-selected' : 'is-unselected'}`}
    >
      <div className="image-card-top">
        <DialogTrigger>
          <Button
            className="image-thumbnail checkerboard"
            aria-label={`Ampliar elemento ${index + 1}`}
          >
            <span className="image-index">{String(index + 1).padStart(2, '0')}</span>
            <img src={item.url} alt={`Recorte ${index + 1}`} loading="lazy" />
            <span className="expand-icon" title="Ampliar">
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
                  <div className="flex items-center gap-2">
                    <Button
                      className="icon-button"
                      onPress={() => onDownloadSingle(item.id)}
                      aria-label={`Descargar PNG del elemento ${index + 1}`}
                    >
                      <ArrowDownToLine size={18} />
                    </Button>
                    <Button slot="close" className="icon-button" aria-label="Cerrar vista previa">
                      <X size={20} />
                    </Button>
                  </div>
                </div>
                <div className="modal-image checkerboard">
                  <img src={item.url} alt={`Vista ampliada del elemento ${index + 1}`} />
                </div>
              </Dialog>
            </Modal>
          </ModalOverlay>
        </DialogTrigger>

        <button
          type="button"
          className={`card-select-btn ${selected ? 'is-selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(item.id);
          }}
          aria-label={
            selected
              ? `Deseleccionar elemento ${index + 1}`
              : `Seleccionar elemento ${index + 1}`
          }
          aria-pressed={selected}
          title={selected ? 'Excluir de la descarga' : 'Incluir en la descarga'}
        >
          <span className="select-check-icon">
            {selected && <Check size={12} strokeWidth={3.2} />}
          </span>
        </button>

        <button
          type="button"
          className="card-download-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDownloadSingle(item.id);
          }}
          aria-label={`Descargar PNG del elemento ${index + 1}`}
          title="Descargar este PNG"
        >
          <ArrowDownToLine size={13} />
        </button>
      </div>

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
  selectedIds: Set<number>;
  completed: boolean;
  disabled: boolean;
  exporting: boolean;
  downloaded: boolean;
  dirty: boolean;
  onRename: (id: number, name: string) => void;
  onToggleSelect: (id: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDownloadSingle: (id: number) => void;
  onExport: () => void;
}

export function ResultsPanel({
  items,
  selectedIds,
  completed,
  disabled,
  exporting,
  downloaded,
  dirty,
  onRename,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onDownloadSingle,
  onExport,
}: Props) {
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const selectedCount = selectedItems.length;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const noneSelected = selectedCount === 0;

  // Validate duplicate collisions strictly among selected items for downloading
  const selectedNames = selectedItems.map((item) => item.name);
  const selectedErrors = validateNames(selectedNames);
  const hasErrors = selectedErrors.some(Boolean);

  const selectedErrorMap = new Map<number, string | null>();
  selectedItems.forEach((item, index) => {
    selectedErrorMap.set(item.id, selectedErrors[index]);
  });

  return (
    <section className="results-panel panel" aria-label="Elementos extraídos">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <Grid2X2 size={17} />
          <h2>Elementos</h2>
          <span className="count-badge">
            {items.length > 0
              ? selectedCount === items.length
                ? items.length
                : `${selectedCount}/${items.length}`
              : 0}
          </span>
        </div>
        <span className="eyebrow">02 / RESULTADO</span>
      </div>
      {items.length ? (
        <>
          <div className="results-intro">
            <div className="flex flex-col gap-2.5">
              <div>
                <p>Dale un nombre a cada pieza.</p>
                <span>Haz clic en una imagen para ampliarla.</span>
              </div>
              <div className="selection-toolbar">
                <span className="selection-status">
                  <strong className="font-semibold text-ink">{selectedCount}</strong>{' '}
                  <span className="text-muted">de {items.length} seleccionados</span>
                </span>
                <div className="selection-actions">
                  <button
                    type="button"
                    className="selection-action-btn"
                    onClick={onSelectAll}
                    disabled={allSelected || disabled}
                    aria-label="Seleccionar todos los elementos"
                  >
                    Seleccionar todos
                  </button>
                  <span className="selection-divider" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    className="selection-action-btn"
                    onClick={onDeselectAll}
                    disabled={noneSelected || disabled}
                    aria-label="Deseleccionar todos los elementos"
                  >
                    Deseleccionar todos
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="results-grid">
            {items.map((item, index) => {
              const isSelected = selectedIds.has(item.id);
              const cardError = isSelected
                ? (selectedErrorMap.get(item.id) ?? null)
                : nameError(item.name);

              return (
                <ImageCard
                  key={item.id}
                  item={item}
                  index={index}
                  error={cardError}
                  disabled={disabled}
                  selected={isSelected}
                  onRename={onRename}
                  onToggleSelect={onToggleSelect}
                  onDownloadSingle={onDownloadSingle}
                />
              );
            })}
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
              ? selectedCount === items.length
                ? `${items.length} ${items.length === 1 ? 'imagen lista' : 'imágenes listas'}`
                : selectedCount === 0
                  ? 'Ninguna imagen seleccionada'
                  : `${selectedCount} de ${items.length} ${selectedCount === 1 ? 'seleccionada' : 'seleccionadas'}`
              : 'Todo en un solo archivo'}
          </span>
          <span className="text-muted">.ZIP</span>
        </div>
        <Button
          className="primary-button w-full"
          isDisabled={!selectedCount || disabled || hasErrors || dirty}
          onPress={onExport}
        >
          <ArrowDownToLine size={17} />
          {exporting ? 'Preparando ZIP…' : 'Descargar ZIP'}
          {selectedCount > 0 && <span className="download-count">{selectedCount}</span>}
        </Button>
        <p
          className={`export-note ${hasErrors || (selectedCount === 0 && items.length > 0) ? 'text-amber-800' : ''}`}
          role="status"
        >
          {hasErrors ? (
            'Corrige los nombres marcados para descargar.'
          ) : dirty ? (
            'Aplica los nuevos ajustes antes de descargar.'
          ) : selectedCount === 0 && items.length > 0 ? (
            'Selecciona al menos un elemento para descargar.'
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
