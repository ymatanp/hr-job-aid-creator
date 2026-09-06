'use client';

import { useRef, useState } from 'react';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  src: string;
  alt: string;
  rects: Rect[];
  onChange: (rects: Rect[]) => void;
  /** Stable id fragment so labels/controls are unique per step. */
  idBase: string;
}

/**
 * Draw rectangular blur regions over a screenshot. Regions are stored in
 * normalized (0..1) coordinates. Drawing is pointer-based; removal is fully
 * keyboard-accessible (each region has a labelled Remove button), and a live
 * region announces changes. No color-only meaning — regions are labelled.
 */
export default function RedactionTool({ src, alt, rects, onChange, idBase }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function toNorm(e: React.PointerEvent) {
    const el = wrapRef.current!;
    const b = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)),
      y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toNorm(e);
    startRef.current = p;
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    const p = toNorm(e);
    const s = startRef.current;
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  }

  function onPointerUp() {
    if (draft && draft.w > 0.02 && draft.h > 0.02) {
      onChange([...rects, draft]);
    }
    setDraft(null);
    startRef.current = null;
  }

  function remove(i: number) {
    onChange(rects.filter((_, idx) => idx !== i));
  }

  const overlays = draft ? [...rects, draft] : rects;

  return (
    <div>
      <div
        ref={wrapRef}
        className="redact-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="application"
        aria-label={`Redaction canvas. Drag to mark blur regions for: ${alt}`}
      >
        <img src={src} alt={alt} draggable={false} />
        {overlays.map((r, i) => (
          <span
            key={i}
            className="redact-region"
            aria-hidden="true"
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
            }}
          />
        ))}
      </div>

      <p className="hint" role="status" aria-live="polite">
        {rects.length === 0
          ? 'No blur regions. Drag on the image to hide sensitive areas.'
          : `${rects.length} blur region${rects.length > 1 ? 's' : ''} marked.`}
      </p>

      {rects.length > 0 && (
        <ul aria-label="Marked blur regions" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rects.map((r, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="hint">
                Region {i + 1}: {Math.round(r.w * 100)}% × {Math.round(r.h * 100)}%
              </span>
              <button
                type="button"
                className="secondary"
                onClick={() => remove(i)}
                id={`${idBase}-redact-${i}`}
              >
                Remove region {i + 1}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
