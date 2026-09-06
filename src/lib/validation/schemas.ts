import { z } from 'zod';

/** Review flags the model may attach to a step. Kept in sync with the UI. */
export const reviewFlag = z.enum([
  'unclear-ui-label',
  'possible-sensitive-data',
  'transcript-video-conflict',
  'low-confidence',
  'duplicate-frame',
]);
export type ReviewFlag = z.infer<typeof reviewFlag>;

/** A rectangular blur region, normalized (0..1) relative to the screenshot. */
export const redactionRect = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type RedactionRect = z.infer<typeof redactionRect>;

export const stepSchema = z.object({
  id: z.string().min(1),
  instruction: z.string().min(1).max(500),
  expectedResult: z.string().max(500).optional(),
  frameTimestampMs: z.number().int().nonnegative(),
  evidenceTimestampMs: z.number().int().nonnegative().optional(),
  transcriptEvidence: z.string().max(2000).optional(),
  confidence: z.number().min(0).max(1),
  reviewFlags: z.array(reviewFlag).default([]),
  /** Regions the user marked for blur before generation. */
  redactions: z.array(redactionRect).default([]),
});
export type Step = z.infer<typeof stepSchema>;

export const decisionSchema = z.object({
  question: z.string().min(1),
  paths: z
    .array(z.object({ label: z.string().min(1), destination: z.string().min(1) }))
    .min(2),
});

export const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  summary: z.string().max(1000).optional(),
  kind: z.enum(['steps', 'decision']),
  steps: z.array(stepSchema).default([]),
  decision: decisionSchema.optional(),
});
export type Section = z.infer<typeof sectionSchema>;

export const resourceSchema = z.object({
  label: z.string().min(1).max(200),
  // Validate URL shape and restrict to http(s) before it is ever inserted.
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) URLs are allowed'),
});

export const jobAidDraftSchema = z
  .object({
    title: z.string().min(1).max(200),
    subtitle: z.string().max(200).optional(),
    audience: z.string().min(1).max(300),
    purpose: z.string().min(1).max(1000),
    disclaimer: z.string().min(1).max(2000),
    owner: z.string().min(1).max(200),
    lastUpdated: z.string().min(1).max(40),
    resources: z.array(resourceSchema).optional(),
    sections: z.array(sectionSchema).min(1),
  })
  .superRefine((draft, ctx) => {
    // A decision section must carry decision data; a steps section must carry steps.
    draft.sections.forEach((s, i) => {
      if (s.kind === 'decision' && !s.decision) {
        ctx.addIssue({ code: 'custom', path: ['sections', i, 'decision'], message: 'decision section missing decision content' });
      }
      if (s.kind === 'steps' && s.steps.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['sections', i, 'steps'], message: 'steps section has no steps' });
      }
    });
  });
export type JobAidDraft = z.infer<typeof jobAidDraftSchema>;

/** Intake form the user confirms before generation. */
export const intakeSchema = z.object({
  title: z.string().min(1).max(200),
  audience: z.string().min(1).max(300),
  purpose: z.string().min(1).max(1000),
  owner: z.string().min(1).max(200),
  disclaimer: z.string().max(2000).default(''),
  resourceLabel: z.string().max(200).optional(),
  resourceUrl: z.string().optional(),
  allowDecisionSlide: z.boolean().default(false),
  screenshotDensity: z.enum(['auto', 'one', 'two', 'four']).default('auto'),
  transcriptText: z.string().max(500_000).optional(),
});
export type Intake = z.infer<typeof intakeSchema>;

export const DEFAULT_DISCLAIMER =
  'This job aid reflects the process shown in the source recording. Interfaces and procedures may change. Verify critical actions against the current approved process before use.';
