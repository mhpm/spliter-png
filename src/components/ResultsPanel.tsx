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
            aria-label={`Enlarge element ${index + 1}`}
          >
            <span className="image-index">{String(index + 1).padStart(2, '0')}</span>
            <img src={item.url} alt={`Cutout ${index + 1}`} loading="lazy" />
            <span className="expand-icon" title="Enlarge">
              <Expand size={14} />
            </span>
          </Button>
          <ModalOverlay className="modal-overlay">
            <Modal className="preview-modal">
              <Dialog className="outline-none">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Heading slot="title" className="truncate font-semibold">
                      {item.name || `Element ${index + 1}`}
                    </Heading>
                    <p className="mt-1 text-sm text-muted">
                      {item.width} × {item.height} px · Transparent PNG
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      className="icon-button"
                      onPress={() => onDownloadSingle(item.id)}
                      aria-label={`Download PNG for element ${index + 1}`}
                    >
                      <ArrowDownToLine size={18} />
                    </Button>
                    <Button slot="close" className="icon-button" aria-label="Close preview">
                      <X size={20} />
                    </Button>
                  </div>
                </div>
                <div className="modal-image checkerboard">
                  <img src={item.url} alt={`Enlarged view of element ${index + 1}`} />
                </div>
              </Dialog>
            </Modal>
          </ModalOverlay>
        </DialogTrigger>

        <button
          type="button"
          className={`card-select-btn ${selected ? 'is-selected' : ''}`}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(item.id);
          }}
          aria-label={selected ? `Deselect element ${index + 1}` : `Select element ${index + 1}`}
          aria-pressed={selected}
          title={selected ? 'Exclude from download' : 'Include in download'}
        >
          <span className="select-check-icon">
            {selected && <Check size={12} strokeWidth={3.2} />}
          </span>
        </button>

        <button
          type="button"
          className="card-download-btn"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onDownloadSingle(item.id);
          }}
          aria-label={`Download PNG for element ${index + 1}`}
          title="Download this PNG"
        >
          <ArrowDownToLine size={13} />
        </button>
      </div>

      <div className="image-card-info">
        <label htmlFor={inputId} className="sr-only">
          Element {index + 1} name
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
    <section className="results-panel panel" aria-label="Extracted elements">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <Grid2X2 size={17} />
          <h2>Elements</h2>
          <span className="count-badge">
            {items.length > 0
              ? selectedCount === items.length
                ? items.length
                : `${selectedCount}/${items.length}`
              : 0}
          </span>
        </div>
        <span className="eyebrow">02 / RESULT</span>
      </div>
      {items.length ? (
        <>
          <div className="results-intro">
            <div className="flex flex-col gap-2.5">
              <div>
                <p>Name each piece.</p>
                <span>Click an image to enlarge it.</span>
              </div>
              <div className="selection-toolbar">
                <span className="selection-status">
                  <strong className="font-semibold text-ink">{selectedCount}</strong>{' '}
                  <span className="text-muted">of {items.length} selected</span>
                </span>
                <div className="selection-actions">
                  <button
                    type="button"
                    className="selection-action-btn"
                    onClick={onSelectAll}
                    disabled={allSelected || disabled}
                    aria-label="Select all elements"
                  >
                    Select all
                  </button>
                  <span className="selection-divider" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    className="selection-action-btn"
                    onClick={onDeselectAll}
                    disabled={noneSelected || disabled}
                    aria-label="Deselect all elements"
                  >
                    Deselect all
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
          <h3>{completed ? 'No elements found' : 'Your pieces will appear here'}</h3>
          <p>
            {completed
              ? 'Reduce the threshold, area, or minimum size and extract again.'
              : 'Upload your PNG and click “Extract elements” to review and name each cutout.'}
          </p>
        </div>
      )}
      <div className="export-panel">
        <div className="export-summary">
          <span>
            {items.length
              ? selectedCount === items.length
                ? `${items.length} ${items.length === 1 ? 'image ready' : 'images ready'}`
                : selectedCount === 0
                  ? 'No images selected'
                  : `${selectedCount} of ${items.length} ${selectedCount === 1 ? 'image selected' : 'images selected'}`
              : 'All in a single file'}
          </span>
          <span className="text-muted">.ZIP</span>
        </div>
        <Button
          className="primary-button w-full"
          isDisabled={!selectedCount || disabled || hasErrors || dirty}
          onPress={onExport}
        >
          <ArrowDownToLine size={17} />
          {exporting ? 'Preparing ZIP…' : 'Download ZIP'}
          {selectedCount > 0 && <span className="download-count">{selectedCount}</span>}
        </Button>
        <p
          className={`export-note ${hasErrors || (selectedCount === 0 && items.length > 0) ? 'text-amber-800' : ''}`}
          role="status"
        >
          {hasErrors ? (
            'Fix highlighted names before downloading.'
          ) : dirty ? (
            'Apply pending settings before downloading.'
          ) : selectedCount === 0 && items.length > 0 ? (
            'Select at least one element to download.'
          ) : downloaded ? (
            <>
              <Check size={13} /> Your ZIP is ready. Check your downloads.
            </>
          ) : (
            'Individual PNGs · Transparency preserved'
          )}
        </p>
      </div>
    </section>
  );
}
