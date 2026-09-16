import { Button } from 'react-aria-components';
import {
  AlertCircle,
  Check,
  Crop,
  FileImage,
  LoaderCircle,
  LockKeyhole,
  ArrowRight,
  X,
} from 'lucide-react';
import type { Services } from './application/use-splitter';
import { useSplitter } from './application/use-splitter';
import { UploadZone } from './components/UploadZone';
import { SettingsPanel } from './components/SettingsPanel';
import { SourcePreview } from './components/SourcePreview';
import { ResultsPanel } from './components/ResultsPanel';

export default function App({ services }: { services: Services }) {
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
  } = useSplitter(services);
  const busy = ['loading', 'processing', 'exporting'].includes(state.status);
  const step = state.items.length ? 3 : state.source ? 2 : 1;
  const fileSize = state.source
    ? state.source.file.size < 1024 * 1024
      ? `${Math.max(0.1, state.source.file.size / 1024).toLocaleString('es', { maximumFractionDigits: 1 })} KB`
      : `${(state.source.file.size / 1024 / 1024).toLocaleString('es', { maximumFractionDigits: 2 })} MB`
    : '';

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="brand" aria-label="Spliter, inicio">
          <span className="brand-mark">
            <Crop size={23} strokeWidth={1.8} />
          </span>
          <span>
            spliter<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="header-divider" />
        <span className="header-description">Tu PNG, pieza por pieza</span>
        <span className="local-badge">
          <LockKeyhole size={13} />
          <span>100% en tu navegador</span>
        </span>
      </header>
      <main>
        <div className="workspace-heading">
          <div>
            <div className="eyebrow mb-2 text-accent">ESPACIO DE TRABAJO</div>
            <h1>Extractor de elementos</h1>
            <p>Separa, nombra y descarga las piezas de tu imagen.</p>
          </div>
          <nav className="steps" aria-label="Progreso">
            {['Carga', 'Extrae', 'Descarga'].map((label, index) => (
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
              Este PNG no tiene transparencia. Un fondo opaco conecta todos los elementos; utiliza
              una imagen con fondo transparente para separarlos.
            </p>
          </div>
        )}
        {state.dirty && (
          <div className="notice info-notice" role="status">
            <AlertCircle size={18} />
            <p>Hay ajustes pendientes. Pulsa “Volver a extraer” para actualizar los recortes.</p>
          </div>
        )}
        {busy && (
          <div className="processing-banner" role="status" aria-live="polite">
            <LoaderCircle size={18} className="animate-spin" />
            <span>
              {state.status === 'exporting'
                ? 'Preparando tu ZIP…'
                : state.status === 'loading'
                  ? 'Leyendo el PNG…'
                  : state.progress.message}
            </span>
            {state.status === 'processing' && (
              <>
                <progress
                  max={100}
                  value={state.progress.percent}
                  aria-label="Progreso de extracción"
                />
                <span className="tabular-nums text-xs">{state.progress.percent}%</span>
              </>
            )}
            <Button onPress={cancel} className="cancel-button">
              <X size={13} /> Cancelar
            </Button>
          </div>
        )}
        <div className="workspace-grid">
          <aside className="sidebar">
            <div className="sidebar-file">
              <p className="eyebrow mb-4">TU ARCHIVO</p>
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
                  <UploadZone compact onFile={load} onError={reportError} disabled={busy} />
                </>
              ) : (
                <div className="file-placeholder">
                  <FileImage size={19} />
                  <span>Ningún archivo seleccionado</span>
                </div>
              )}
            </div>
            <SettingsPanel
              options={state.options}
              onChange={setOptions}
              canExtract={!!state.source}
              disabled={busy}
              hasResults={state.status === 'complete' || state.items.length > 0}
              onExtract={extract}
            />
          </aside>
          <SourcePreview
            source={state.source}
            items={state.items}
            selectedIds={state.selectedIds}
            onFile={load}
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
            onDownloadSingle={downloadSingle}
            onExport={exportZip}
          />
        </div>
        <footer className="workspace-footer">
          <span>Hecho para imágenes con fondo transparente.</span>
          <span>
            PNG → PNG <span className="mx-2 text-line">/</span> Hasta 16 megapíxeles
          </span>
        </footer>
      </main>
    </div>
  );
}
