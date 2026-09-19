import { track } from '@vercel/analytics';
import { Button } from 'react-aria-components';
import { AlertCircle, Check, FileImage, LoaderCircle, ArrowRight, X } from 'lucide-react';
import type { Services, ImageItem } from '../application/use-splitter';
import { useSplitter } from '../application/use-splitter';
import { UploadZone } from './UploadZone';
import { SettingsPanel } from './SettingsPanel';
import { SourcePreview } from './SourcePreview';
import { ResultsPanel } from './ResultsPanel';
import { SelectionTools } from './SelectionTools';

interface Props {
  services: Services;
  onOpenWorkshop: (initialFrames: ImageItem[], availableSprites: ImageItem[]) => void;
}

export function ExtractorWorkspace({ services, onOpenWorkshop }: Props) {
  const {
    state,
    load,
    extract,
    exportZip,
    downloadSingle,
    cancel,
    toggleSelect,
    selectAll,
    deselectAll,
    setOptions,
    rename,
    reportError,
    editSelected,
  } = useSplitter(services);
  const trackFileLoad = (file: File) => {
    track('sprite_uploaded', { source: 'extractor', size_kb: Math.round(file.size / 1024) });
    return load(file);
  };
  const trackExtract = () => {
    track('sprite_extraction_started', { reextract: state.items.length > 0 });
    return extract();
  };
  const trackZipExport = () => {
    track('frames_zip_downloaded', { frame_count: state.selectedIds.size });
    return exportZip();
  };
  const trackSingleDownload = (id: number) => {
    track('frame_downloaded');
    return downloadSingle(id);
  };

  const busy = ['loading', 'processing', 'exporting', 'editing'].includes(state.status);
  const step = state.items.length ? 3 : state.source ? 2 : 1;
  const fileSize = state.source
    ? state.source.file.size < 1024 * 1024
      ? `${Math.max(0.1, state.source.file.size / 1024).toLocaleString('en', { maximumFractionDigits: 1 })} KB`
      : `${(state.source.file.size / 1024 / 1024).toLocaleString('en', { maximumFractionDigits: 2 })} MB`
    : '';

  return (
    <main>
      <div className="workspace-heading">
        <div>
          <div className="eyebrow mb-2 text-accent">WORKSPACE</div>
          <h1>Element Extractor</h1>
          <p>Separate, name, and download individual pieces from your image.</p>
        </div>
        <nav className="steps" aria-label="Progress">
          {['Upload', 'Extract', 'Download'].map((label, index) => (
            <div
              key={label}
              className={`step ${step >= index + 1 ? 'current' : ''}`}
              aria-current={step === index + 1 ? 'step' : undefined}
            >
              <span>{step > index + 1 ? <Check size={12} /> : index + 1}</span>
              {label}
              {index < 2 && <ArrowRight className="step-arrow" size={13} />}
            </div>
          ))}
        </nav>
      </div>
      {state.error && (
        <div className="notice error-notice" role="alert">
          <AlertCircle size={18} />
          <p>{state.error}</p>
        </div>
      )}
      {state.opaque && (
        <div className="notice warning-notice" role="status">
          <AlertCircle size={18} />
          <p>
            This PNG has no transparency. An opaque background connects all elements; use an image
            with a transparent background to separate them.
          </p>
        </div>
      )}
      {state.dirty && (
        <div className="notice info-notice" role="status">
          <AlertCircle size={18} />
          <p>Pending settings. Click “Re-extract” to update cutouts.</p>
        </div>
      )}
      {busy && (
        <div className="processing-banner" role="status" aria-live="polite">
          <LoaderCircle size={18} className="animate-spin" />
          <span>
            {state.status === 'editing'
              ? 'Updating selected sprites…'
              : state.status === 'exporting'
                ? 'Preparing your ZIP…'
                : state.status === 'loading'
                  ? 'Reading PNG…'
                  : state.progress.message}
          </span>
          {state.status === 'processing' && (
            <>
              <progress max={100} value={state.progress.percent} aria-label="Extraction progress" />
              <span className="tabular-nums text-xs">{state.progress.percent}%</span>
            </>
          )}
          <Button onPress={cancel} className="cancel-button">
            <X size={13} /> Cancel
          </Button>
        </div>
      )}
      <SelectionTools
        count={state.selectedIds.size}
        disabled={busy || state.dirty}
        onEdit={editSelected}
        onAnimate={() => {
          track('animation_editor_opened', { frame_count: state.selectedIds.size });
          onOpenWorkshop(
            state.items.filter((item) => state.selectedIds.has(item.id)),
            state.items,
          );
        }}
      />
      <div className="workspace-grid">
        <aside className="sidebar">
          <div className="sidebar-file">
            <p className="eyebrow mb-4">YOUR FILE</p>
            {state.source ? (
              <>
                <div className="selected-file">
                  <span>
                    <FileImage size={20} />
                  </span>
                  <div className="min-w-0">
                    <p title={state.source.file.name}>{state.source.file.name}</p>
                    <span>{fileSize} · PNG</span>
                  </div>
                  <Check size={15} className="ml-auto shrink-0 text-accent" />
                </div>
                <UploadZone compact onFile={trackFileLoad} onError={reportError} disabled={busy} />
              </>
            ) : (
              <div className="file-placeholder">
                <FileImage size={19} />
                <span>No file selected</span>
              </div>
            )}
          </div>
          <SettingsPanel
            options={state.options}
            onChange={setOptions}
            canExtract={!!state.source}
            disabled={busy}
            hasResults={state.status === 'complete' || state.items.length > 0}
            onExtract={trackExtract}
          />
        </aside>
        <SourcePreview
          source={state.source}
          items={state.items}
          selectedIds={state.selectedIds}
          onToggleSelect={toggleSelect}
          onFile={trackFileLoad}
          onError={reportError}
          disabled={busy}
        />
        <ResultsPanel
          items={state.items}
          selectedIds={state.selectedIds}
          completed={state.status === 'complete'}
          disabled={busy}
          exporting={state.status === 'exporting'}
          downloaded={state.downloaded}
          dirty={state.dirty}
          onRename={rename}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onDownloadSingle={trackSingleDownload}
          onExport={trackZipExport}
        />
      </div>
      <footer className="workspace-footer">
        <span>Designed for images with transparent backgrounds.</span>
        <span>
          PNG → PNG <span className="mx-2 text-line">/</span> Up to 16 megapixels
        </span>
      </footer>
    </main>
  );
}
