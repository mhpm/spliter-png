import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { EditorImage, EditTool, Point, SelectionPoint } from '../domain/types';
import { MaskHistory, eraseColor, paintStroke, toImagePoint } from '../domain/mask';
import { MaskRenderer } from '../infrastructure/canvas-renderer';

interface Props {
  image: EditorImage;
  history: MaskHistory;
  revision: number;
  points: SelectionPoint[];
  tool: EditTool;
  diameter: number;
  hardness: number;
  tolerance: number;
  contiguous: boolean;
  feather: number;
  zoom: number;
  original: boolean;
  background: string;
  disabled: boolean;
  onPoint(point: Point): void;
  onChange(): void;
}

export function EditorCanvas({
  image,
  history,
  revision,
  points,
  tool,
  diameter,
  hardness,
  tolerance,
  contiguous,
  feather,
  zoom,
  original,
  background,
  disabled,
  onPoint,
  onChange,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const renderer = useRef<MaskRenderer | null>(null);
  const pixelCache = useRef<Uint8ClampedArray | null>(null);
  const frame = useRef(0);
  const gesture = useRef<{
    point: Point;
    pointerId: number;
    pan: boolean;
    left: number;
    top: number;
  } | null>(null);
  const [available, setAvailable] = useState({ width: 600, height: 540 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const selecting = tool === 'keep' || tool === 'exclude';
  const showOriginal = original || selecting;
  const showWatermark = tool === 'restore' && !showOriginal;
  const fit = Math.min(
    (available.width - 48) / image.width,
    (available.height - 48) / image.height,
    1,
  );
  const scale = Math.max(0.02, fit) * zoom;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width)
        setAvailable({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const instance = new MaskRenderer();
    renderer.current = instance;
    return () => {
      cancelAnimationFrame(frame.current);
      instance.dispose();
      renderer.current = null;
    };
  }, []);
  useEffect(() => {
    if (canvas.current)
      renderer.current?.draw(
        canvas.current,
        image.bitmap,
        history.mask,
        showOriginal,
        feather,
        showWatermark,
      );
  }, [image, history, revision, showOriginal, feather, showWatermark]);

  useEffect(() => {
    pixelCache.current = null;
  }, [image]);

  function getPixelBuffer(): Uint8ClampedArray {
    if (pixelCache.current) return pixelCache.current;
    const offscreen = new OffscreenCanvas(image.width, image.height);
    const ctx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!ctx) return new Uint8ClampedArray(0);
    ctx.drawImage(image.bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, image.width, image.height).data;
    pixelCache.current = data;
    return data;
  }

  function draw() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (canvas.current)
        renderer.current?.draw(
          canvas.current,
          image.bitmap,
          history.mask,
          showOriginal,
          feather,
          showWatermark,
        );
    });
  }
  function pointOf(event: PointerEvent<HTMLCanvasElement>) {
    return toImagePoint(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
      image,
    );
  }
  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled || event.button !== 0) return;
    const point = pointOf(event);
    setCursor(point);
    if (selecting) {
      onPoint(point);
      return;
    }
    if (tool === 'wand') {
      const pixels = getPixelBuffer();
      history.begin();
      eraseColor(history.mask, pixels, point, tolerance, contiguous, false);
      history.commit();
      draw();
      onChange();
      return;
    }
    if (original && tool !== 'pan') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const pan = tool === 'pan';
    gesture.current = {
      point: pan ? { x: event.clientX, y: event.clientY } : point,
      pointerId: event.pointerId,
      pan,
      left: viewport.current?.scrollLeft ?? 0,
      top: viewport.current?.scrollTop ?? 0,
    };
    if (!pan) {
      history.begin();
      paintStroke(history.mask, point, point, diameter, hardness, tool === 'restore');
      draw();
    }
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    const point = pointOf(event);
    setCursor(point);
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.pan) {
      viewport.current?.scrollTo(
        active.left + active.point.x - event.clientX,
        active.top + active.point.y - event.clientY,
      );
    } else {
      paintStroke(history.mask, active.point, point, diameter, hardness, tool === 'restore');
      active.point = point;
      draw();
    }
  }
  function end(event: PointerEvent<HTMLCanvasElement>, cancelled = false) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (!active.pan) {
      if (cancelled) history.cancelStroke();
      else history.commit();
      draw();
      onChange();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <div ref={viewport} className="editor-viewport">
      <div
        className={`editor-image-stage preview-${background}`}
        style={{ width: image.width * scale, height: image.height * scale }}
      >
        <canvas
          ref={canvas}
          tabIndex={0}
          role="img"
          aria-label="Image editor. Arrow keys move the cursor; Space applies the selected tool. Hold Shift for larger steps."
          style={{
            cursor:
              tool === 'pan'
                ? 'grab'
                : tool === 'wand' || selecting
                  ? 'crosshair'
                  : original
                    ? 'default'
                    : 'none',
          }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={(event) => end(event)}
          onPointerCancel={(event) => end(event, true)}
          onLostPointerCapture={(event) => end(event)}
          onPointerLeave={() => {
            if (!gesture.current) setCursor(null);
          }}
          onKeyDown={(event) => {
            if (disabled) return;
            const current = cursor ?? { x: image.width / 2, y: image.height / 2 };
            if (event.key.startsWith('Arrow')) {
              event.preventDefault();
              const step = event.shiftKey ? 20 : 1;
              setCursor({
                x: Math.max(
                  0,
                  Math.min(
                    image.width - 1,
                    current.x +
                      (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
                  ),
                ),
                y: Math.max(
                  0,
                  Math.min(
                    image.height - 1,
                    current.y +
                      (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
                  ),
                ),
              });
            } else if (event.key === ' ') {
              event.preventDefault();
              if (selecting) onPoint(current);
              else if (tool === 'wand') {
                const pixels = getPixelBuffer();
                history.begin();
                eraseColor(history.mask, pixels, current, tolerance, contiguous, false);
                history.commit();
                draw();
                onChange();
              } else if (!original && tool !== 'pan') {
                history.begin();
                paintStroke(history.mask, current, current, diameter, hardness, tool === 'restore');
                history.commit();
                draw();
                onChange();
              }
            }
          }}
        />
        {selecting &&
          points.map((point, index) => (
            <span
              key={point.id}
              className={`selection-point ${point.kind}`}
              style={{ left: point.x * scale, top: point.y * scale }}
            >
              {index + 1}
            </span>
          ))}
        {cursor && !disabled && tool !== 'pan' && !original && (
          <span
            className={`brush-cursor ${selecting ? 'point-cursor' : tool === 'wand' ? 'wand-cursor' : ''}`}
            style={{
              left: cursor.x * scale,
              top: cursor.y * scale,
              width: selecting || tool === 'wand' ? 18 : diameter * scale,
              height: selecting || tool === 'wand' ? 18 : diameter * scale,
            }}
          />
        )}
      </div>
    </div>
  );
}
