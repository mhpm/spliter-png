import { useEffect, useRef, useState } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { ArrowLeft, ArrowRight, Copy, Download, Pause, Play, Trash2, X } from 'lucide-react';
import type { ImageItem } from '../application/use-splitter';
import { safeStem } from '../domain/names';
import { sheetLayout } from './model';
import type { ExportRequest } from './export.worker';
import './animation.css';

interface Props {
  initialFrames: ImageItem[];
  onClose: () => void;
  download: (blob: Blob, name: string) => void;
}
export default function AnimationEditor({ initialFrames, onClose, download }: Props) {
  const [frames, setFrames] = useState(initialFrames);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(12);
  const [loop, setLoop] = useState(true);
  const [columns, setColumns] = useState(Math.ceil(Math.sqrt(initialFrames.length)));
  const [padding, setPadding] = useState(2);
  const [alignment, setAlignment] = useState<'center' | 'bottom'>('bottom');
  const [view, setView] = useState<'animation' | 'sheet'>('animation');
  const [name, setName] = useState('my-animation');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const count = frames.length;
  const frame = frames[active];
  const actualColumns = Math.min(columns, count);
  let layout: ReturnType<typeof sheetLayout> | undefined;
  let layoutError = '';
  try {
    layout = sheetLayout(frames, actualColumns, padding);
  } catch (e) {
    layoutError = e instanceof Error ? e.message : 'Invalid sheet size.';
  }
  const cellWidth = Math.max(...frames.map((f) => f.width)) + padding * 2;
  const cellHeight = Math.max(...frames.map((f) => f.height)) + padding * 2;
  const delay = Math.round(100 / fps) * 10;

  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (active + 1 >= count && !loop) setPlaying(false);
      else setActive((active + 1) % count);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, active, count, loop, delay]);

  function updateFrames(next: ImageItem[], index = 0) {
    setPlaying(false);
    setFrames(next);
    setActive(index);
    setError('');
  }
  function move(direction: number) {
    const to = active + direction;
    if (to < 0 || to >= count) return;
    const next = [...frames];
    [next[active], next[to]] = [next[to], next[active]];
    updateFrames(next, to);
  }
  function cancelExport() {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  }
  function exportImage(kind: 'png' | 'gif') {
    if (!layout || progress !== null) return;
    setPlaying(false);
    setError('');
    setProgress(0);
    try {
      const task = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
      worker.current = task;
      task.onmessage = ({
        data,
      }: MessageEvent<{ progress?: number; blob?: Blob; error?: string }>) => {
        if (data.error) {
          setError(data.error);
          cancelExport();
        } else if (data.blob) {
          download(
            data.blob,
            `${safeStem(name || 'my-animation')}${kind === 'png' ? '-sheet' : ''}.${kind}`,
          );
          cancelExport();
        } else if (data.progress !== undefined) setProgress(data.progress);
      };
      task.onerror = () => {
        setError('Export failed. Try fewer frames or smaller sprites.');
        cancelExport();
      };
      task.postMessage({
        frames: frames.map(({ blob, width, height }) => ({ blob, width, height })),
        columns: actualColumns,
        padding,
        fps,
        loop,
        alignment,
        kind,
      } satisfies ExportRequest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
      cancelExport();
    }
  }
  function exportMetadata() {
    if (!layout) return;
    const metadata = {
      image: `${safeStem(name || 'my-animation')}-sheet.png`,
      ...layout,
      padding,
      alignment,
      fps: 1000 / delay,
      loop,
      frames: frames.map((f, i) => ({
        name: f.name,
        duration: delay,
        frame: {
          x: (i % actualColumns) * cellWidth,
          y: Math.floor(i / actualColumns) * cellHeight,
          w: cellWidth,
          h: cellHeight,
        },
        sprite: {
          x: Math.floor((cellWidth - f.width) / 2),
          y:
            alignment === 'bottom'
              ? cellHeight - padding - f.height
              : Math.floor((cellHeight - f.height) / 2),
          w: f.width,
          h: f.height,
        },
      })),
    };
    download(
      new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' }),
      `${safeStem(name || 'my-animation')}.json`,
    );
  }
  function spriteStyle(f: ImageItem) {
    return {
      width: `${(f.width / cellWidth) * 100}%`,
      height: `${(f.height / cellHeight) * 100}%`,
      left: `${(Math.floor((cellWidth - f.width) / 2) / cellWidth) * 100}%`,
      top: `${((alignment === 'bottom' ? cellHeight - padding - f.height : Math.floor((cellHeight - f.height) / 2)) / cellHeight) * 100}%`,
    };
  }

  return (
    <ModalOverlay
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="modal-overlay animation-overlay"
      isDismissable={progress === null}
    >
      <Modal className="animation-modal">
        <Dialog className="animation-dialog">
          <header className="animation-header">
            <div>
              <span className="eyebrow">SPRITE WORKSHOP</span>
              <Heading slot="title">Animation studio</Heading>
              <p>Turn your selected sprites into a moving sequence.</p>
            </div>
            <button className="icon-button" aria-label="Close animation studio" onClick={onClose}>
              <X size={22} />
            </button>
          </header>
          <div className="animation-body">
            <section className="animation-preview-panel" aria-label="Animation preview">
              <div className="animation-view-switch">
                <button aria-pressed={view === 'animation'} onClick={() => setView('animation')}>
                  Animation
                </button>
                <button
                  aria-pressed={view === 'sheet'}
                  onClick={() => {
                    setPlaying(false);
                    setView('sheet');
                  }}
                >
                  Spritesheet
                </button>
                <span>
                  {count} frames · {((count * delay) / 1000).toFixed(2)}s
                </span>
              </div>
              <div className="animation-stage checkerboard">
                {view === 'animation' ? (
                  <div
                    className="animation-cell"
                    style={{
                      aspectRatio: `${cellWidth}/${cellHeight}`,
                      width: `min(100%, ${(300 * cellWidth) / cellHeight}px)`,
                    }}
                  >
                    <img
                      src={frame.url}
                      alt={`Animation frame ${active + 1}`}
                      style={spriteStyle(frame)}
                    />
                  </div>
                ) : (
                  <div
                    className="sheet-preview"
                    style={{ gridTemplateColumns: `repeat(${actualColumns}, minmax(0, 1fr))` }}
                  >
                    {frames.map((f, i) => (
                      <button
                        key={i}
                        className="animation-cell"
                        style={{ aspectRatio: `${cellWidth}/${cellHeight}` }}
                        aria-label={`Preview sheet frame ${i + 1}`}
                        onClick={() => {
                          setActive(i);
                          setView('animation');
                        }}
                      >
                        <img src={f.url} alt="" style={spriteStyle(f)} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="animation-playback">
                <button
                  className="sprite-button"
                  aria-label="Previous frame"
                  onClick={() => {
                    setPlaying(false);
                    setActive((active + count - 1) % count);
                  }}
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  className="sprite-button sprite-primary"
                  onClick={() => {
                    setView('animation');
                    if (!playing && active === count - 1) setActive(0);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                  {playing ? 'Pause' : 'Play'}
                </button>
                <button
                  className="sprite-button"
                  aria-label="Next frame"
                  onClick={() => {
                    setPlaying(false);
                    setActive((active + 1) % count);
                  }}
                >
                  <ArrowRight size={16} />
                </button>
                <span data-testid="frame-counter">
                  Frame {active + 1} / {count}
                </span>
              </div>
              <label className="frame-scrubber">
                Scrub frames
                <input
                  type="range"
                  min="0"
                  max={count - 1}
                  value={active}
                  onChange={(e) => {
                    setPlaying(false);
                    setActive(Number(e.target.value));
                  }}
                />
              </label>
            </section>
            <aside className="animation-settings">
              <fieldset disabled={progress !== null}>
                <h3>Animation settings</h3>
                <label>
                  File name
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                </label>
                <label>
                  Speed · {fps} FPS
                  <input
                    aria-label="Frames per second"
                    type="range"
                    min="1"
                    max="50"
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                  />
                </label>
                <label className="animation-checkbox">
                  <input
                    type="checkbox"
                    checked={loop}
                    onChange={(e) => setLoop(e.target.checked)}
                  />{' '}
                  Loop animation
                </label>
                <div className="animation-field-row">
                  <label>
                    Columns
                    <input
                      type="number"
                      min="1"
                      max={count}
                      value={actualColumns}
                      onChange={(e) =>
                        setColumns(
                          Math.max(1, Math.min(count, Math.round(Number(e.target.value)) || 1)),
                        )
                      }
                    />
                  </label>
                  <label>
                    Padding (px)
                    <input
                      type="number"
                      min="0"
                      max="64"
                      value={padding}
                      onChange={(e) =>
                        setPadding(Math.max(0, Math.min(64, Math.round(Number(e.target.value)))))
                      }
                    />
                  </label>
                </div>
                <label>
                  Frame alignment
                  <select
                    value={alignment}
                    onChange={(e) => setAlignment(e.target.value as 'center' | 'bottom')}
                  >
                    <option value="bottom">Bottom center (walking sprites)</option>
                    <option value="center">Center</option>
                  </select>
                </label>
                <p className="animation-note">
                  Equal-sized cells keep frames aligned. Sprites keep their current size.
                </p>
                <div className="sheet-dimensions">
                  Cell: {cellWidth} × {cellHeight} px
                  <br />
                  {layout
                    ? `Sheet: ${layout.width} × ${layout.height} px · ${layout.columns} × ${layout.rows}`
                    : 'Sheet size unavailable'}
                </div>
                <button
                  className="sprite-button sprite-primary"
                  disabled={!layout}
                  onClick={() => exportImage('png')}
                >
                  <Download size={16} /> Download spritesheet PNG
                </button>
                <button
                  className="sprite-button"
                  disabled={!layout}
                  onClick={() => exportImage('gif')}
                >
                  <Download size={16} /> Download animated GIF
                </button>
                <button className="sprite-button" disabled={!layout} onClick={exportMetadata}>
                  Download frame data (JSON)
                </button>
                <p className="animation-note">
                  PNG preserves full transparency. GIF uses up to 256 colors and hard transparency
                  edges.
                </p>
              </fieldset>
            </aside>
          </div>
          {(error || layoutError) && (
            <p role="alert" className="animation-error">
              {error || layoutError}
            </p>
          )}
          {progress !== null && (
            <div className="animation-export-progress" role="status">
              <progress value={progress} max="100" aria-label="Animation export progress" />
              <span>Exporting… {progress}%</span>
              <button className="sprite-button" onClick={cancelExport}>
                Cancel export
              </button>
            </div>
          )}
          <section className="animation-timeline" aria-label="Animation frames">
            <div className="timeline-heading">
              <div>
                <h3>Frame sequence</h3>
                <p>Select a frame, then move, duplicate or remove it.</p>
              </div>
              <fieldset disabled={progress !== null} className="frame-actions">
                <button
                  className="sprite-button"
                  disabled={active === 0}
                  aria-label="Move frame earlier"
                  onClick={() => move(-1)}
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  className="sprite-button"
                  disabled={active === count - 1}
                  aria-label="Move frame later"
                  onClick={() => move(1)}
                >
                  <ArrowRight size={16} />
                </button>
                <button
                  className="sprite-button"
                  disabled={count >= 200}
                  onClick={() =>
                    updateFrames(
                      [...frames.slice(0, active + 1), frame, ...frames.slice(active + 1)],
                      active + 1,
                    )
                  }
                >
                  <Copy size={16} /> Duplicate
                </button>
                <button
                  className="sprite-button"
                  disabled={count <= 1}
                  onClick={() =>
                    updateFrames(
                      frames.filter((_, i) => i !== active),
                      Math.min(active, count - 2),
                    )
                  }
                >
                  <Trash2 size={16} /> Remove
                </button>
                <button
                  className="sprite-button"
                  onClick={() => updateFrames([...frames].reverse())}
                >
                  Reverse
                </button>
                <button className="sprite-button" onClick={() => updateFrames(initialFrames)}>
                  Reset sequence
                </button>
              </fieldset>
            </div>
            <div className="frame-strip">
              {frames.map((f, i) => (
                <button
                  key={i}
                  className={`frame-tile ${i === active ? 'active' : ''}`}
                  aria-label={`Select animation frame ${i + 1}`}
                  aria-pressed={i === active}
                  onClick={() => {
                    setPlaying(false);
                    setActive(i);
                    setView('animation');
                  }}
                >
                  <span className="checkerboard">
                    <img src={f.url} alt="" />
                  </span>
                  <strong>{String(i + 1).padStart(2, '0')}</strong>
                  <small title={f.name}>{f.name}</small>
                </button>
              ))}
            </div>
            <p className="animation-note">
              The sequence starts in extraction order. Reorder frames to match your animation;
              removing a frame here keeps the original sprite.
            </p>
          </section>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
