'use client';

import type { ContentPage, TocEntry } from '../lib/pptx/pagination';

interface PreviewDraft {
  title: string;
  subtitle?: string;
  purpose: string;
  audience: string;
  disclaimer: string;
  owner: string;
  resources?: Array<{ label: string; url: string }>;
}

interface Props {
  draft: PreviewDraft;
  pages: ContentPage[];
  toc: TocEntry[];
  /** Resolve a screenshot URL for a step's frame timestamp. */
  frameSrc: (tMs: number) => string;
}

/**
 * Structural preview of the deck that WILL be generated. It runs off the same
 * pagination the generator uses, so slide count, density, step numbering, TOC,
 * and screenshot placement match the output. It is a schematic (not a pixel
 * render), clearly labelled as a preview.
 */
export default function SlidePreview({ draft, pages, toc, frameSrc }: Props) {
  return (
    <div>
      <p className="hint">
        Structural preview — matches the slides, layout density, numbering, and table of contents
        that will be generated. Not a pixel-perfect render.
      </p>
      <ol className="preview-grid" aria-label="Slide preview">
        <MiniSlide label="1 · Cover">
          <div className="mini-title">{draft.title || 'Job Aid Title'}</div>
          <div className="mini-sub">{draft.subtitle ?? 'Step-by-Step Job Aid'}</div>
        </MiniSlide>

        <MiniSlide label="2 · Introduction">
          <div className="mini-h">Introduction</div>
          <div className="mini-box">{clip(draft.purpose, 90)}</div>
          <div className="mini-box">Audience: {clip(draft.audience, 70)}</div>
          <div className="mini-box">{clip(draft.disclaimer, 90)}</div>
        </MiniSlide>

        <MiniSlide label="3 · Contents">
          <div className="mini-h">Table of Contents</div>
          {toc.map((t, i) => (
            <div className="mini-row" key={i}>
              <strong>{clip(t.title, 40)}</strong> <span className="hint">{t.detail}</span>
            </div>
          ))}
          <div className="mini-box">Disclaimer: {clip(draft.disclaimer, 60)}</div>
        </MiniSlide>

        {pages.map((page, pi) => {
          const n = pi + 4;
          if (page.kind === 'decision') {
            return (
              <MiniSlide key={pi} label={`${n} · Decision`}>
                <div className="mini-h">{clip(page.sectionTitle, 40)}</div>
                <div className="mini-box">{clip(page.decision.question, 80)}</div>
                {page.decision.paths.map((p, i) => (
                  <div className="mini-row" key={i}>
                    <strong>{p.label}:</strong> {clip(p.destination, 40)}
                  </div>
                ))}
                <ResourceFoot draft={draft} />
              </MiniSlide>
            );
          }
          const cols = page.density === 'four' ? 2 : 1;
          return (
            <MiniSlide key={pi} label={`${n} · ${densityLabel(page.density)}`}>
              <div className="mini-h">{clip(page.sectionTitle, 40)}</div>
              <div className="mini-slots" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {page.steps.map((step) => (
                  <div className="mini-slot" key={step.id}>
                    <span className="mini-num">{step.number}</span>
                    <div className="mini-thumb">
                      <img src={frameSrc(step.frameTimestampMs)} alt="" />
                      {(step.redactions ?? []).map((r, i) => (
                        <span
                          key={i}
                          className="redact-region"
                          aria-hidden="true"
                          style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                        />
                      ))}
                    </div>
                    <div className="mini-cap">{clip(step.instruction, 60)}</div>
                  </div>
                ))}
              </div>
              <ResourceFoot draft={draft} />
            </MiniSlide>
          );
        })}

        <MiniSlide label={`${pages.length + 4} · Closing`}>
          <div className="mini-sub">Closing</div>
        </MiniSlide>
      </ol>
    </div>
  );
}

function MiniSlide({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="mini-slide" aria-label={`Slide ${label}`}>
      <div className="mini-label">{label}</div>
      <div className="mini-body">{children}</div>
    </li>
  );
}

function ResourceFoot({ draft }: { draft: PreviewDraft }) {
  const r = draft.resources?.[0];
  if (!r) return null;
  return <div className="mini-foot hint">For more information: {clip(r.label, 40)}</div>;
}

function densityLabel(d: 'one' | 'two' | 'four'): string {
  return d === 'four' ? 'Four-screen' : d === 'two' ? 'Two-screen' : 'One key screen';
}

function clip(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
