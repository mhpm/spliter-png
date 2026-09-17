import { useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  ArrowDownToLine,
  Brush,
  Check,
  ChevronDown,
  Eraser,
  Hand,
  ImagePlus,
  LoaderCircle,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Undo2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { useBackgroundEditor } from '../application/use-background-editor';
import { createSegmentationEngine } from '../infrastructure/segmentation-engine';
import { openEditorImage } from '../infrastructure/image-file';
import { exportCutout } from '../infrastructure/canvas-renderer';
import { downloadBlob } from '../../infrastructure/download';
import { nameError } from '../../domain/names';
import type { EditorImage, EditTool, Point } from '../domain/types';
import { EditorCanvas } from './EditorCanvas';
import './background.css';

function PhotoThumbnail({ image }: { image: EditorImage }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, 48, 48);
    const scale = Math.min(48 / image.width, 48 / image.height);
    const width = image.width * scale,
      height = image.height * scale;
    context.drawImage(image.bitmap, (48 - width) / 2, (48 - height) / 2, width, height);
  }, [image]);
  return <canvas ref={canvas} width={48} height={48} aria-label="Current photo" role="img" />;
}

export default function BackgroundEditor() {
  const [services] = useState(() => ({
    engine: createSegmentationEngine(),
    open: openEditorImage,
    download: downloadBlob,
    renderPng: exportCutout,
  }));
  const editor = useBackgroundEditor(services);
  const [tool, setTool] = useState<EditTool>('erase');
  const [panel, setPanel] = useState<'brush' | 'select' | 'wand'>('brush');
  const [diameter, setDiameter] = useState(40);
  const [hardness, setHardness] = useState(0.8);
  const [tolerance, setTolerance] = useState(25);
  const [contiguous, setContiguous] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [original, setOriginal] = useState(false);
  const [background, setBackground] = useState('checker');
  const selecting = tool === 'keep' || tool === 'exclude';
  const disabled = !editor.image || editor.busy;

  useEffect(() => {
    services.engine.warmup?.();
  }, [services]);
  const keepCount = editor.points.filter((point) => point.kind === 'keep').length;
  const upload = useDropzone({
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'] },
    multiple: false,
    maxSize: 25 * 1024 * 1024,
    disabled: editor.busy,
    noClick: true,
    noKeyboard: true,
    onDropAccepted: ([file]) => {
      setZoom(1);
      setOriginal(false);
      setTool('erase');
      setPanel('brush');
      void editor.load(file);
    },
    onDropRejected: () => editor.setError('Choose one PNG, JPG or WebP image, up to 25 MB.'),
  });
  function chooseTool(next: EditTool) {
    setTool(next);
    setOriginal(false);
  }
  function addPoint(point: Point) {
    if (!selecting) return;
    if ((tool === 'keep' && keepCount >= 8) || editor.points.length >= 24) {
      editor.setError(
        'Use up to 8 Keep points and 24 points in total. Clear a point to add another.',
      );
      return;
    }
    editor.setPoints((points) => [...points, { ...point, kind: tool, id: crypto.randomUUID() }]);
  }
  async function removeBackground(withPoints: boolean) {
    if (await editor.segment(withPoints)) {
      setTool('erase');
      setPanel('brush');
      setOriginal(false);
    }
  }
  const tip =
    tool === 'wand'
      ? 'Click anywhere on the background to erase that color.'
      : tool === 'restore'
        ? 'Watermark guide active. Paint over any faint area to restore it to full opacity.'
        : selecting
          ? 'Click an object to keep it. Mark unwanted areas with Exclude.'
          : original
            ? 'You’re viewing the original. Switch to Result to keep editing.'
            : tool === 'erase'
              ? 'Brush over the details you want to remove.'
              : 'Drag to move around your image.';

  return (
    <main className="background-workspace">
      <h1 className="sr-only">Background Remover</h1>
      <div className="studio-toolbar" aria-label="Editor actions">
        <span className="studio-title">
          <Brush size={18} />
          <span>Cutout studio</span>
        </span>

        <div className="studio-toolbar-divider" />

        <div className="studio-compare" aria-label="Preview mode">
          <button
            aria-pressed={!original}
            disabled={disabled}
            onClick={() => {
              setOriginal(false);
              if (selecting) {
                setTool('erase');
                setPanel('brush');
              }
            }}
          >
            Result
          </button>
          <button
            aria-pressed={original}
            disabled={disabled}
            onClick={() => {
              setOriginal(true);
              if (selecting) {
                setTool('erase');
                setPanel('brush');
              }
            }}
          >
            Original
          </button>
        </div>

        <div className="studio-preview-swatches" aria-label="Preview background options">
          <span className="studio-preview-label">Backdrop:</span>
          <div className="flex items-center gap-1.5">
            {['checker', 'light', 'dark'].map((value) => (
              <button
                key={value}
                className={`studio-swatch preview-${value}`}
                aria-label={`${value} preview background`}
                aria-pressed={background === value}
                onClick={() => setBackground(value)}
                title={`${value} preview background`}
              />
            ))}
          </div>
        </div>

        <div className="studio-toolbar-divider" />

        <div className="studio-mode-switch" aria-label="Retouch mode">
          <button
            aria-pressed={panel === 'wand'}
            disabled={disabled}
            onClick={() => {
              setPanel('wand');
              chooseTool('wand');
            }}
          >
            <Wand2 size={14} /> Color wand
          </button>
          <button
            aria-pressed={panel === 'brush'}
            disabled={disabled}
            onClick={() => {
              setPanel('brush');
              chooseTool('erase');
            }}
          >
            <Brush size={14} /> Brushes
          </button>
          <button
            aria-pressed={panel === 'select'}
            disabled={disabled}
            onClick={() => {
              setPanel('select');
              chooseTool('keep');
            }}
          >
            <MousePointer2 size={14} /> Select objects
          </button>
        </div>

        <div className="studio-history">
          <button
            className="studio-icon"
            aria-label="Undo edit"
            title="Undo edit"
            disabled={disabled || !editor.history?.canUndo}
            onClick={editor.undo}
          >
            <Undo2 size={19} />
          </button>
          <button
            className="studio-icon"
            aria-label="Redo edit"
            title="Redo edit"
            disabled={disabled || !editor.history?.canRedo}
            onClick={editor.redo}
          >
            <Redo2 size={19} />
          </button>
        </div>

        <button
          className="studio-download"
          disabled={disabled || !!nameError(editor.name)}
          onClick={() => void editor.download()}
        >
          <ArrowDownToLine size={17} />
          <span>Download PNG</span>
        </button>
      </div>
      {editor.error && (
        <div className="notice error-notice" role="alert">
          <p>{editor.error}</p>
          <button onClick={() => editor.setError(null)} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {editor.busy && (
        <div className="studio-progress" role="status">
          <LoaderCircle size={17} className="animate-spin" />
          <span>{editor.progress.message}</span>
          {editor.progress.percent !== undefined && (
            <progress
              max={100}
              value={editor.progress.percent}
              aria-label="Model download progress"
            />
          )}
          {editor.canCancel && <button onClick={editor.cancel}>Cancel</button>}
        </div>
      )}

      <div className="studio-layout">
        <section className="studio-canvas-area" aria-label="Cutout preview">
          <div
            {...upload.getRootProps({
              className: `studio-drop-area ${upload.isDragActive ? 'dragging' : ''}`,
            })}
          >
            <input {...upload.getInputProps({ 'aria-label': 'Choose photo' })} />
            {editor.image && editor.history ? (
              <EditorCanvas
                key={editor.image.id}
                image={editor.image}
                history={editor.history}
                revision={editor.revision}
                points={editor.points}
                tool={tool}
                diameter={diameter}
                hardness={hardness}
                tolerance={tolerance}
                contiguous={contiguous}
                feather={editor.feather}
                zoom={zoom}
                original={original}
                background={background}
                disabled={editor.busy}
                onPoint={addPoint}
                onChange={editor.refresh}
              />
            ) : (
              <div className="studio-empty">
                <div className="studio-empty-icon">
                  <ImagePlus size={46} strokeWidth={1.2} />
                  <span>
                    <Sparkles size={16} />
                  </span>
                </div>
                <h2>
                  A little less background.
                  <br />A lot more possibility.
                </h2>
                <p>Drop a photo here and make it your own.</p>
                <button className="studio-download" disabled={editor.busy} onClick={upload.open}>
                  <Upload size={17} /> Choose a photo
                </button>
                <span>PNG, JPG, WebP · Up to 25 MB / 16 MP</span>
              </div>
            )}
            {upload.isDragActive && (
              <div className="studio-drop-overlay">
                <Upload size={28} /> Drop your photo here
              </div>
            )}
          </div>
          {editor.image && (
            <div className="studio-canvas-controls">
              <span>
                {selecting ? 'Select on original' : original ? 'Original' : 'Transparent preview'}
                <span className="studio-dimensions">
                  {' '}
                  · {editor.image.width} × {editor.image.height}
                </span>
              </span>
              <div className="studio-zoom">
                <button
                  className="studio-icon"
                  aria-label="Move image"
                  title="Move image"
                  aria-pressed={tool === 'pan'}
                  disabled={disabled}
                  onClick={() => setTool('pan')}
                >
                  <Hand size={16} />
                </button>
                <button
                  className="studio-icon"
                  aria-label="Zoom out"
                  disabled={disabled || zoom <= 1}
                  onClick={() => setZoom(Math.max(1, zoom - 0.5))}
                >
                  <Minus size={16} />
                </button>
                <button
                  className="studio-fit"
                  title="Fit image"
                  disabled={disabled}
                  onClick={() => setZoom(1)}
                >
                  {zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}
                </button>
                <button
                  className="studio-icon"
                  aria-label="Zoom in"
                  disabled={disabled || zoom >= 8}
                  onClick={() => setZoom(Math.min(8, zoom + 0.5))}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}
          <div className="studio-photo-dock">
            <button
              className="studio-add-photo"
              aria-label={editor.image ? 'Change photo' : 'Upload photo'}
              title={editor.image ? 'Change photo' : 'Upload photo'}
              onClick={upload.open}
              disabled={editor.busy}
            >
              <Plus size={23} />
            </button>
            {editor.image && (
              <span className="studio-thumbnail" title={editor.image.file.name}>
                <PhotoThumbnail image={editor.image} />
                <span>
                  <Check size={9} />
                </span>
              </span>
            )}
            <span className="studio-photo-name">
              {editor.image ? editor.image.file.name : 'Add your first photo'}
              <small>
                {editor.image
                  ? 'Original saved for this session'
                  : 'Your photos stay on your device'}
              </small>
            </span>
          </div>
        </section>

        <aside className="studio-panel" aria-label="Cutout tools">
          <div className="studio-panel-intro">
            <span className="studio-spark">
              <Sparkles size={19} />
            </span>
            <div>
              <h2>Make the subject shine</h2>
              <p>Start with a clean background.</p>
            </div>
          </div>
          <button
            className="studio-auto"
            disabled={disabled}
            onClick={() => void removeBackground(false)}
          >
            <Sparkles size={16} /> Auto remove background
          </button>
          <div className="studio-tool-heading">
            <span className="studio-tool-badge">
              {panel === 'wand' ? (
                <>
                  <Wand2 size={13} /> Color wand tool
                </>
              ) : panel === 'brush' ? (
                <>
                  <Brush size={13} /> Manual brush
                </>
              ) : (
                <>
                  <MousePointer2 size={13} /> Object selector
                </>
              )}
            </span>
          </div>
          {panel === 'wand' ? (
            <div className="studio-tools-body">
              <p className="studio-panel-hint">Erase background colors with a single click.</p>
              <label className="studio-range">
                Color tolerance <span>{tolerance}%</span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={tolerance}
                  disabled={disabled}
                  onChange={(event) => setTolerance(Number(event.target.value))}
                />
              </label>
              <label className="studio-checkbox-label">
                <input
                  type="checkbox"
                  checked={contiguous}
                  disabled={disabled}
                  onChange={(event) => setContiguous(event.target.checked)}
                />
                <span>Contiguous (connected area only)</span>
              </label>
              <p className="studio-brush-tip">
                Click on any background color to remove it. Keep &quot;Contiguous&quot; checked to
                protect colors inside frames or text.
              </p>
            </div>
          ) : panel === 'brush' ? (
            <div className="studio-tools-body">
              <p className="studio-panel-hint">A few finishing touches.</p>
              <div className="studio-tool-pair">
                <button
                  className="studio-tool-tile"
                  aria-pressed={tool === 'erase'}
                  disabled={disabled}
                  onClick={() => chooseTool('erase')}
                >
                  <Eraser size={24} strokeWidth={1.6} />
                  Erase
                </button>
                <button
                  className="studio-tool-tile"
                  aria-pressed={tool === 'restore'}
                  disabled={disabled}
                  onClick={() => chooseTool('restore')}
                >
                  <RotateCcw size={24} strokeWidth={1.6} />
                  Restore
                </button>
              </div>
              <label className="studio-range">
                Brush size <span>{diameter} px</span>
                <input
                  type="range"
                  min="2"
                  max="300"
                  value={diameter}
                  disabled={disabled}
                  onChange={(event) => setDiameter(Number(event.target.value))}
                />
              </label>
              <p className="studio-brush-tip">
                {tool === 'restore'
                  ? 'Watermark guide is visible behind your cutout. Paint over any faint area to restore it.'
                  : 'Erase what you don’t need. Restore brings back anything you brushed away.'}
              </p>
            </div>
          ) : (
            <div className="studio-tools-body">
              <p className="studio-panel-hint">Tell us what you want to keep.</p>
              <div className="studio-tool-pair">
                <button
                  className="studio-tool-tile keep"
                  aria-pressed={tool === 'keep'}
                  disabled={disabled}
                  onClick={() => chooseTool('keep')}
                >
                  <Plus size={24} />
                  Keep object
                </button>
                <button
                  className="studio-tool-tile exclude"
                  aria-pressed={tool === 'exclude'}
                  disabled={disabled}
                  onClick={() => chooseTool('exclude')}
                >
                  <Minus size={24} />
                  Exclude area
                </button>
              </div>
              <p className="studio-brush-tip">
                Click once on each object to keep. Add red points to exclude unwanted areas.
              </p>
              <div className="studio-point-actions">
                <span>
                  {keepCount} to keep · {editor.points.length - keepCount} to exclude
                </span>
                <button
                  disabled={disabled || !editor.points.length}
                  onClick={() => editor.setPoints((points) => points.slice(0, -1))}
                >
                  Undo point
                </button>
                <button
                  disabled={disabled || !editor.points.length}
                  onClick={() => editor.setPoints([])}
                >
                  Clear
                </button>
              </div>
              <button
                className="studio-auto"
                disabled={disabled || !keepCount}
                onClick={() => void removeBackground(true)}
              >
                Apply selection
              </button>
              <p className="studio-microcopy">Replaces your cutout. Undo brings it back.</p>
            </div>
          )}
          <details className="studio-details">
            <summary>
              Fine-tune & export <ChevronDown size={15} />
            </summary>
            <div>
              <label className="studio-range">
                Brush hardness <span>{Math.round(hardness * 100)}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={hardness * 100}
                  disabled={disabled}
                  onChange={(event) => setHardness(Number(event.target.value) / 100)}
                />
              </label>
              <label className="studio-range">
                Soften edges <span>{editor.feather} px</span>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step=".25"
                  value={editor.feather}
                  disabled={disabled}
                  onChange={(event) => editor.setFeather(Number(event.target.value))}
                />
              </label>
              <label className="studio-name-label" htmlFor="cutout-name">
                File name
              </label>
              <div className="studio-filename">
                <input
                  id="cutout-name"
                  value={editor.name}
                  disabled={disabled}
                  onChange={(event) => editor.setName(event.target.value)}
                  aria-invalid={!!nameError(editor.name)}
                  aria-describedby={nameError(editor.name) ? 'cutout-name-error' : undefined}
                />
                <span>.png</span>
              </div>
              {nameError(editor.name) && (
                <p id="cutout-name-error" className="field-error">
                  {nameError(editor.name)}
                </p>
              )}
              <button className="studio-reset" disabled={disabled} onClick={editor.reset}>
                Restore original
              </button>
            </div>
          </details>
          <details className="studio-details studio-about">
            <summary>
              <span>
                <ShieldCheck size={14} /> Private, right in your browser
              </span>
              <ChevronDown size={14} />
            </summary>
            <p>
              AI downloads on first use: about 46 MB for automatic removal and 14 MB for selection,
              plus the processing engine. Models are cached when available. Photos stay on your
              device. Processing can take a minute or more. Brushes work without AI.
            </p>
            <p>
              Hair, glass and similar colors may need retouching. AI won’t produce a perfect cutout
              every time.
            </p>
          </details>
        </aside>
      </div>
      <div className="studio-status">
        <MousePointer2 size={14} />
        <span>
          {editor.image
            ? tip
            : 'Upload a photo. Remove the background. Add your finishing touches.'}
        </span>
      </div>
      <p className="studio-announcement" role="status" aria-live="polite">
        {editor.message}
      </p>
    </main>
  );
}
