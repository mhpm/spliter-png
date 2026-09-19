import { track } from '@vercel/analytics';
import { lazy, Suspense, useState } from 'react';
import { ArrowRight, Check, Film, LoaderCircle, Sparkles } from 'lucide-react';
import type { ImageItem, Services } from '../../application/use-splitter';
import type { WorkshopSeed } from '../application/use-sprite-workshop-frames';
import { useSpriteWorkshopFrames } from '../application/use-sprite-workshop-frames';
import { FrameUploadZone } from './FrameUploadZone';

const AnimationEditor = lazy(() => import('../../animation/AnimationEditor'));

interface Props {
  services: Services;
  seed: WorkshopSeed | null;
  onExitToExtractor: () => void;
}

function FramePreview({ item, index }: { item: ImageItem; index: number }) {
  return (
    <div className="sprite-frame-preview">
      <div className="sprite-frame-preview-image checkerboard">
        <img src={item.url} alt="" />
        <span>{index + 1}</span>
      </div>
      <p title={item.name}>{item.name}</p>
      <small>
        {item.width} × {item.height} px
      </small>
    </div>
  );
}

export default function SpriteWorkshopWorkspace({ services, seed, onExitToExtractor }: Props) {
  const [studioOpen, setStudioOpen] = useState(Boolean(seed?.frames.length));
  const [returnToExtractor, setReturnToExtractor] = useState(Boolean(seed));
  const [editorKey, setEditorKey] = useState(seed ? `seed-${seed.key}` : 'manual-0');
  const { frames, availableSprites, busy, error, loadFiles, reportError } =
    useSpriteWorkshopFrames(services, seed);

  async function handleFiles(files: File[]) {
    const loaded = await loadFiles(files);
    if (!loaded) return;
    track('animation_frames_uploaded', { frame_count: files.length });
    setReturnToExtractor(false);
    setEditorKey((current) => `manual-${current}`);
    setStudioOpen(true);
  }

  function closeStudio() {
    setStudioOpen(false);
    if (returnToExtractor) onExitToExtractor();
  }

  if (studioOpen && frames.length > 0) {
    return (
      <Suspense fallback={<main role="status">Opening animation studio…</main>}>
        <AnimationEditor
          key={editorKey}
          initialFrames={frames}
          availableSprites={availableSprites}
          onClose={closeStudio}
          download={services.download}
        />
      </Suspense>
    );
  }

  return (
    <main className="sprite-workshop-page">
      <div className="workspace-heading">
        <div>
          <div className="eyebrow mb-2 text-accent">SPRITE WORKSHOP</div>
          <h1>Build your sprite animation</h1>
          <p>Upload PNGs as frames, arrange them, and export a ready-to-use animation.</p>
        </div>
        <div className="sprite-workshop-stat" aria-label={`${frames.length} frames loaded`}>
          <Film size={18} />
          <strong>{frames.length}</strong>
          <span>{frames.length === 1 ? 'frame loaded' : 'frames loaded'}</span>
        </div>
      </div>

      {error && (
        <div className="notice error-notice" role="alert">
          <Sparkles size={18} />
          <p>{error}</p>
          <button type="button" className="notice-dismiss" onClick={() => reportError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {busy && (
        <div className="processing-banner" role="status" aria-live="polite">
          <LoaderCircle size={18} className="animate-spin" />
          <span>Reading your PNG frames…</span>
        </div>
      )}

      <div className="sprite-workshop-grid">
        <section className="sprite-workshop-card sprite-workshop-upload-card">
          <div className="sprite-workshop-card-heading">
            <div className="sprite-workshop-card-icon">
              <Film size={20} />
            </div>
            <div>
              <h2>Start with your own frames</h2>
              <p>Choose multiple PNGs to create the sequence in the order you select them.</p>
            </div>
          </div>
          <FrameUploadZone disabled={busy} onFiles={handleFiles} onError={reportError} />
          <div className="sprite-workshop-tip">
            <Check size={15} />
            <span>Transparent PNGs preserve crisp edges and work best for sprite animation.</span>
          </div>
        </section>

        <aside className="sprite-workshop-card sprite-workshop-guide">
          <div className="sprite-workshop-card-heading">
            <div className="sprite-workshop-card-icon accent">
              <Sparkles size={20} />
            </div>
            <div>
              <h2>What you can do</h2>
              <p>Everything stays local in your browser.</p>
            </div>
          </div>
          <ul>
            <li>Arrange and duplicate frames on the timeline.</li>
            <li>Combine sprites into multi-layer frames.</li>
            <li>Adjust position, scale, rotation, opacity, and pivots.</li>
            <li>Export PNG spritesheets, GIFs, and frame data.</li>
          </ul>
        </aside>
      </div>

      {frames.length > 0 && (
        <section className="sprite-workshop-card sprite-workshop-sequence" aria-label="Frame sequence">
          <div className="sprite-workshop-sequence-heading">
            <div>
              <div className="eyebrow text-accent">YOUR SEQUENCE</div>
              <h2>Ready to animate</h2>
            </div>
            <button
              type="button"
              className="sprite-button sprite-primary"
              onClick={() => {
                setReturnToExtractor(false);
                setEditorKey((current) => `manual-${current}`);
                setStudioOpen(true);
              }}
            >
              Open Sprite Workshop <ArrowRight size={16} />
            </button>
          </div>
          <div className="sprite-frame-preview-grid">
            {frames.map((item, index) => (
              <FramePreview key={`${item.id}-${index}`} item={item} index={index} />
            ))}
          </div>
        </section>
      )}

      <footer className="workspace-footer">
        <span>PNG frames stay on your device.</span>
        <span>
          Up to 200 frames <span className="mx-2 text-line">/</span> Up to 16 megapixels per PNG
        </span>
      </footer>
    </main>
  );
}
