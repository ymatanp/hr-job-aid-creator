# Video → Job Aid

Convert a software demonstration video plus supporting text (transcript, notes) into an
**editable PowerPoint job aid**, built by duplicating and populating the supplied template
`HR Job Aid Creator Template.pptx` — never rebuilt or flattened.

TypeScript / Next.js only. No Python anywhere in source, scripts, tests, or build.

> **Template note:** the brief referenced `Video-to-Job-Aid-PowerPoint-Template.pptx`, but the
> file actually supplied is `HR Job Aid Creator Template.pptx` (8 slides, US-Letter **portrait**
> 8.5×11). All code targets the real file. The manifest documents the exact slide/shape mapping.

## Status

The end-to-end flow is implemented and verified through the running app:
upload → validate → ffmpeg metadata + frame sampling → schema-validated AI analysis →
review/edit → template-driven `.pptx` generation → download. Branding (master, 49 layouts,
2 themes, 12 embedded fonts, page size, footer) is preserved in the output.

Instructional layouts are density-aware: **four-screen** (slide 5), **two-screen** (slide 6),
and **one key screen** (two-screen slide with a single large screenshot spanning both panels;
unused number/step shapes are removed cleanly). Step numbering is continuous across duplicated
slides, and **decision/process-flow** slides (slide 4) are emitted only when the operator allows
them and the source genuinely branches — populated from the question + provided paths, with any
unused decision-point/stop/next prompts cleared so no `<Insert …>` placeholder text ships.

> **Shape addressing:** the template reuses shape names (e.g. three `Content Placeholder 2` on
> the intro). pptx-automizer zeroes `nameIdx` whenever a shape has a `creationId`, so duplicate
> names must be addressed by **`creationId`** (see `CID` in `src/lib/pptx/generator.ts`).

The review page supports editing instructions/expected results, removing steps, **drag-and-drop
reordering** (with keyboard-equivalent Move up/down), a **redaction tool** to mark rectangular
blur regions over each screenshot, and a **live slide preview** — a structural, per-slide
schematic computed from the same pagination the generator uses, so slide count, layout density,
step numbering, TOC, and screenshot placement match the output and update instantly as you edit. Redactions are stored as normalized coordinates
and **baked into the image server-side** (via `sharp`) before embedding, so hidden content never
leaves the server inside the generated deck.

The further-resources box on each content slide is populated with an approved `label: url`
when one is provided, and its `<Insert Link …>` prompt is cleared otherwise so no placeholder
text ships. After generation, orphaned original template slide parts (which pptx-automizer
leaves in the archive) are pruned from the output zip, keeping only referenced slides.

FAQ slides are intentionally omitted — the analysis schema produces no FAQ data, and fabricating
it would violate the "don't invent content" rule.

Later expansion (documented in code): `.docx` transcript parsing, media pruning for fully
minimal output, and automated a11y/DOM flow tests.

## Setup

```bash
npm install
cp .env.example .env.local     # set AI_PROVIDER + keys if using a live model
npm run dev                    # http://localhost:3000
```

Requires Node 18+ (developed on Node 24). `ffmpeg-static` ships the ffmpeg binary; no system
install needed. `sharp` and `pptx-automizer` run only on the Node server runtime.

## Verify the toolchain (recommended order)

```bash
npm run template:validate      # asserts every required template shape still exists
npm run template:roundtrip     # gate: open template, duplicate a slide, inject text+image, re-open
npx tsx scripts/make-synthetic-video.ts   # writes tmp/synthetic.mp4 (non-sensitive)
npx tsx scripts/slice-test.ts             # offline: analyze(mock) → paginate → generate → assert
npm test                                   # all tests: unit (validation, pagination, numbering,
                                           #   TOC, geometry, redaction, generation) + a11y/keyboard
# live HTTP smoke (start `npm run dev` in another shell first):
npx tsx scripts/smoke-http.ts
```

## Environment variables

| Var | Default | Meaning |
| --- | --- | --- |
| `AI_PROVIDER` | `mock` | `mock` (offline, deterministic) or `anthropic` |
| `ANTHROPIC_API_KEY` | — | Required when `AI_PROVIDER=anthropic`. Server-side only. |
| `ANTHROPIC_MODEL` | `claude-opus-4-8` | Multimodal model id |
| `MAX_UPLOAD_BYTES` | `524288000` (500 MB) | Upload size cap |
| `MAX_VIDEO_DURATION_SECONDS` | `1800` (30 min) | Duration cap |
| `JOB_RETENTION_MINUTES` | `60` | Temp data lifetime |
| `MAX_CONCURRENT_FFMPEG` / `MAX_CONCURRENT_AI` | `2` / `2` | Concurrency caps |

Keys are read only in server code (`src/lib/config.ts`) and never reach the browser bundle.

## Supported formats & limits

- **Video:** mp4, mov, webm — detected by **file signature** (magic bytes), not extension.
- **Text:** paste transcript/notes (txt/md/docx upload parsing is a documented extension point).
- Defaults: ≤ 500 MB, ≤ 30 min. Configurable via env; surfaced to the user before upload.

## Architecture

```
src/app/                 Next.js App Router (UI + API route handlers, Node runtime)
  page.tsx               Upload + intake form (accessible, labelled, live status)
  review/[jobId]/        Review workflow: edit steps, reorder, remove, per-step frame, generate
  api/jobs/              POST create+analyze · GET/PATCH/DELETE · frames/[id] · generate (stream)
src/lib/
  config.ts              Env-driven limits, provider, concurrency
  validation/            Zod schemas (JobAidDraft, intake) + magic-byte file detection
  media/ffmpeg.ts        ffmpeg-static via execFile (no shell): metadata, scene+interval sampling
  media/redact.ts        sharp: bakes rectangular blur regions into screenshots before embedding
  ai/                    Provider-neutral adapter (mock + Anthropic), prompt-injection-hardened,
                         strict schema validation with retry-once
  pptx/                  template-manifest, geometry resolver (group transforms), pagination/
                         numbering/TOC, generator (pptx-automizer + bundled pptxgenjs for images)
  storage/jobStore.ts    Per-job isolated temp dirs, unpredictable ids, retention sweep
  jobs/pipeline.ts       Orchestration + honest progress stages, cleanup on error
scripts/                 template validation, gate round-trip, synthetic video, slice + HTTP smoke
tests/                   unit tests (Vitest)
```

### How the template is populated

- Slides are **duplicated** from the template and named shapes replaced by exact name (and
  `nameIdx`/`creationId` where names repeat). See `src/lib/pptx/template-manifest.ts`.
- Screenshot placeholders are solid rectangles **nested inside groups**, so images are placed at
  the placeholder's **resolved absolute geometry** (group transform math in `geometry.ts`),
  `contain`-fit, with alt text = the step instruction. Images use pptx-automizer's bundled
  pptxgenjs — the only "new object" path — everything else reuses template shapes.
- Step numbering is **continuous** across duplicated instructional slides; the TOC is built
  **after** pagination so ranges stay correct.

## Security & privacy

- Uploaded video/transcript are treated as **untrusted data**; the AI prompt explicitly refuses
  to follow instructions found inside them.
- File type is validated by signature; filenames are never used for filesystem paths (job ids
  are random hex, validated against traversal).
- No transcript content, frames, keys, or decks are written to logs.
- Per-job temp directories with unpredictable ids; swept after `JOB_RETENTION_MINUTES`.
- **Delete my files now** removes all temp data immediately (review page → `DELETE /api/jobs/:id`).
- ffmpeg is invoked with an argument array (no shell), with timeouts and concurrency caps.

## Accessibility

Desktop-first, keyboard operable, visible focus, associated labels, `role="status"`/`alert`
live regions, no color-only meaning, skip link. Targeting WCAG 2.2 AA.

Automated coverage (Vitest + Testing Library + `vitest-axe`, jsdom): `tests/redaction-tool.test.tsx`
and `tests/review-page.test.tsx` assert label associations, the announced unresolved-issue count,
flags rendered as text (not color-only), **keyboard-only** step reordering and redaction removal,
and **zero axe violations** on the loaded review page.

## Deployment requirements

- Node server runtime that can execute the bundled ffmpeg binary and native `sharp`.
- If a target cannot execute binaries, isolate `src/lib/media` as a separate worker/container
  (the media service is already decoupled behind a small interface).
- Local temp storage for the MVP; `storage/jobStore.ts` is the seam for approved object storage.
