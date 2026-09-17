import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Wand2, ShieldCheck, Layers, X, ChevronRight } from 'lucide-react';

export function VersionBadge() {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = 324;
    const padding = 12;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }
    if (left < padding) left = padding;
    setCoords({
      top: rect.bottom + 10,
      left,
    });
  };

  const toggleOpen = () => {
    if (!open) updatePosition();
    setOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function handleResizeOrScroll() {
      updatePosition();
    }
    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);
    return () => {
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="version-badge-container">
      <button
        ref={buttonRef}
        type="button"
        className={`version-badge ${open ? 'active' : ''}`}
        onClick={toggleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Version 2.0 release details"
        title="Spliter v2.0 — Click to see what's new"
      >
        <span className="version-badge-pulse" aria-hidden="true" />
        <Sparkles size={12} className="version-badge-sparkle" />
        <span className="version-badge-number">v2.0</span>
        <span className="version-badge-tag">AI STUDIO</span>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="What's new in Spliter 2.0"
            className="version-popover"
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
          >
            <div className="version-popover-header">
              <div className="version-popover-title-row">
                <span className="version-popover-icon">
                  <Sparkles size={16} />
                </span>
                <div>
                  <h3 className="version-popover-title">Spliter 2.0</h3>
                  <p className="version-popover-subtitle">AI Cutout & Multi-Tool Studio</p>
                </div>
                <span className="version-popover-pill">LATEST</span>
              </div>
              <button
                className="version-popover-close"
                onClick={() => setOpen(false)}
                aria-label="Close version details"
              >
                <X size={14} />
              </button>
            </div>

            <div className="version-popover-body">
              <div className="version-feature-item">
                <span className="version-feature-icon wand">
                  <Wand2 size={15} />
                </span>
                <div>
                  <h4>Cutout Studio & AI</h4>
                  <p>One-click background removal powered by on-device AI transformers.</p>
                </div>
              </div>

              <div className="version-feature-item">
                <span className="version-feature-icon layers">
                  <Layers size={15} />
                </span>
                <div>
                  <h4>Multi-Tool Top Bar</h4>
                  <p>
                    Streamlined toolbar with Color Wand, Erase/Restore brushes, and Object Selection.
                  </p>
                </div>
              </div>

              <div className="version-feature-item">
                <span className="version-feature-icon shield">
                  <ShieldCheck size={15} />
                </span>
                <div>
                  <h4>100% Client-Side Privacy</h4>
                  <p>All processing occurs on your device with zero server uploads.</p>
                </div>
              </div>
            </div>

            <div className="version-popover-footer">
              <span className="version-popover-version">build 2.0.0 · wasm + webgpu</span>
              <button className="version-popover-done" onClick={() => setOpen(false)}>
                <span>Explore</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
