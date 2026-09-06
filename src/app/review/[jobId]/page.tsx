'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import RedactionTool, { type Rect } from '../../../components/RedactionTool';
import SlidePreview from '../../../components/SlidePreview';
import { paginate, buildToc } from '../../../lib/pptx/pagination';
import type { JobAidDraft, Intake } from '../../../lib/validation/schemas';

interface Step {
  id: string;
  instruction: string;
  expectedResult?: string;
  frameTimestampMs: number;
  confidence: number;
  reviewFlags: string[];
  redactions?: Rect[];
}
interface Section { id: string; title: string; kind: string; steps: Step[] }
interface Draft {
  title: string;
  subtitle?: string;
  audience: string;
  purpose: string;
  disclaimer: string;
  owner: string;
  lastUpdated: string;
  sections: Section[];
}

export default function ReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [frames, setFrames] = useState<Array<{ id: string; tMs: number }>>([]);
  const [intake, setIntake] = useState<Pick<Intake, 'screenshotDensity' | 'allowDecisionSlide'>>({
    screenshotDensity: 'auto',
    allowDecisionSlide: false,
  });
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading…');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setDraft(d.draft ?? null);
        setFrames(d.frames ?? []);
        if (d.intake) setIntake(d.intake);
        setStatus(d.draft ? '' : 'No draft available yet.');
      })
      .catch(() => setError('Could not load this job.'));
  }, [jobId]);

  const updateStep = useCallback((si: number, ti: number, patch: Partial<Step>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.sections[si].steps[ti] = { ...next.sections[si].steps[ti], ...patch };
      return next;
    });
  }, []);

  const moveStep = useCallback((si: number, ti: number, dir: -1 | 1) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const steps = next.sections[si].steps;
      const j = ti + dir;
      if (j < 0 || j >= steps.length) return prev;
      [steps[ti], steps[j]] = [steps[j], steps[ti]];
      return next;
    });
  }, []);

  // Drag-and-drop reordering within a section (keyboard equivalent: Move up/down).
  const [drag, setDrag] = useState<{ si: number; ti: number } | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const reorderStep = useCallback((si: number, from: number, to: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const steps = next.sections[si].steps;
      if (to < 0 || to >= steps.length || from === to) return prev;
      const [moved] = steps.splice(from, 1);
      steps.splice(to, 0, moved);
      return next;
    });
  }, []);

  // Live slide plan — same pagination the generator uses, recomputed on edits.
  const { pages, toc } = useMemo(() => {
    if (!draft) return { pages: [], toc: [] };
    const fullDraft = draft as unknown as JobAidDraft;
    const fullIntake = { ...intake } as Intake;
    const p = paginate(fullDraft, fullIntake);
    return { pages: p, toc: buildToc(p) };
  }, [draft, intake]);

  const removeStep = useCallback((si: number, ti: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.sections[si].steps.splice(ti, 1);
      return next;
    });
  }, []);

  async function save() {
    if (!draft) return;
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error ?? 'Save failed');
  }

  async function generate() {
    setError(null);
    setBusy(true);
    setStatus('Building slides…');
    try {
      await save();
      const res = await fetch(`/api/jobs/${jobId}/generate`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Generation failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${draft?.title ?? 'job-aid'}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Your job aid downloaded successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function deleteNow() {
    await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
    router.push('/');
  }

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!draft) return <p role="status" aria-live="polite">{status}</p>;

  const totalSteps = draft.sections.reduce((n, s) => n + s.steps.length, 0);
  const unresolved = draft.sections
    .flatMap((s) => s.steps)
    .filter((s) => s.reviewFlags.length > 0 || s.confidence < 0.5).length;

  let counter = 0;

  return (
    <>
      <h1>Review: {draft.title}</h1>
      <p role="status" aria-live="polite">{status}</p>

      <div className="card" aria-label="Summary">
        <strong>{totalSteps}</strong> steps ·{' '}
        <strong>{unresolved}</strong> item(s) need review before generating.
        {unresolved > 0 && (
          <span className="hint"> Low-confidence and flagged items are highlighted; you can generate anyway.</span>
        )}
        <div style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            className="secondary"
            aria-expanded={showPreview}
            aria-controls="slide-preview"
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? 'Hide slide preview' : 'Show slide preview'} ({pages.length + 4} slides)
          </button>
        </div>
      </div>

      {showPreview && (
        <section id="slide-preview" aria-label="Slide preview" className="card">
          <h2>Slide preview</h2>
          <SlidePreview
            draft={draft}
            pages={pages}
            toc={toc}
            frameSrc={(tMs) => nearestFrameSrc(jobId, frames, tMs)}
          />
        </section>
      )}

      {draft.sections.map((section, si) => (
        <section key={section.id} aria-labelledby={`sec-${section.id}`}>
          <h2 id={`sec-${section.id}`}>{section.title}</h2>
          {section.steps.map((step, ti) => {
            const number = ++counter;
            return (
              <div
                className={`card step-card${overIdx === ti && drag?.si === si ? ' drag-over' : ''}`}
                key={step.id}
                onDragOver={(e) => {
                  if (drag?.si === si) {
                    e.preventDefault();
                    setOverIdx(ti);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag && drag.si === si) reorderStep(si, drag.ti, ti);
                  setDrag(null);
                  setOverIdx(null);
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOverIdx(null);
                }}
              >
                <div className="row">
                  <div>
                    <span
                      className="drag-handle"
                      title="Drag to reorder (or use Move up/down)"
                      aria-label={`Drag handle for step ${number}. Use the Move up and Move down buttons for keyboard reordering.`}
                      draggable
                      onDragStart={() => setDrag({ si, ti })}
                      style={{ float: 'right', border: '1px solid var(--border)', borderRadius: 4, padding: '0 0.4rem' }}
                    >
                      ⋮⋮
                    </span>
                    <label htmlFor={`instr-${step.id}`}>Step {number} instruction</label>
                    <textarea
                      id={`instr-${step.id}`}
                      value={step.instruction}
                      onChange={(e) => updateStep(si, ti, { instruction: e.target.value })}
                    />
                    <label htmlFor={`res-${step.id}`}>
                      Expected result <span className="hint">(optional)</span>
                    </label>
                    <input
                      id={`res-${step.id}`}
                      type="text"
                      value={step.expectedResult ?? ''}
                      onChange={(e) => updateStep(si, ti, { expectedResult: e.target.value })}
                    />
                    <p>
                      <span className="hint">
                        Confidence: {(step.confidence * 100).toFixed(0)}% · Frame at{' '}
                        {(step.frameTimestampMs / 1000).toFixed(1)}s
                      </span>
                    </p>
                    {step.reviewFlags.length > 0 && (
                      <p>
                        <span className="visually-hidden">Review flags:</span>
                        {step.reviewFlags.map((f) => (
                          <span className="flag" key={f}>
                            {f.replace(/-/g, ' ')}
                          </span>
                        ))}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" className="secondary" onClick={() => moveStep(si, ti, -1)} disabled={ti === 0}>
                        Move up
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => moveStep(si, ti, 1)}
                        disabled={ti === section.steps.length - 1}
                      >
                        Move down
                      </button>
                      <button type="button" className="danger" onClick={() => removeStep(si, ti)}>
                        Remove step
                      </button>
                    </div>
                  </div>
                  <div>
                    <RedactionTool
                      idBase={step.id}
                      src={nearestFrameSrc(jobId, frames, step.frameTimestampMs)}
                      alt={`Selected screenshot for step ${number}: ${step.instruction}`}
                      rects={step.redactions ?? []}
                      onChange={(rects) => updateStep(si, ti, { redactions: rects })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ))}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate PowerPoint'}
        </button>
        <button type="button" className="secondary" onClick={() => save().then(() => setStatus('Saved.'))}>
          Save edits
        </button>
        <button type="button" className="danger" onClick={deleteNow}>
          Delete my files now
        </button>
      </div>
    </>
  );
}

function nearestFrameSrc(
  jobId: string,
  frames: Array<{ id: string; tMs: number }>,
  tMs: number,
): string {
  if (!frames.length) return '';
  const best = frames.reduce((a, b) => (Math.abs(b.tMs - tMs) < Math.abs(a.tMs - tMs) ? b : a));
  return `/api/jobs/${jobId}/frames/${best.id}`;
}
