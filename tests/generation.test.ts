import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import JSZip from 'jszip';
import sharp from 'sharp';
import { generateDeck } from '../src/lib/pptx/generator';
import type { JobAidDraft, Intake } from '../src/lib/validation/schemas';

const ROOT = process.cwd();

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 600, height: 360, channels: 3, background: '#cfe0f0' } })
    .png()
    .toBuffer();
}

function step(n: number) {
  return {
    id: `s${n}`,
    instruction: `Step ${n} instruction`,
    frameTimestampMs: n * 1000,
    confidence: 0.9,
    reviewFlags: [] as never[],
    redactions: [],
  };
}

const intake: Intake = {
  title: 'Density + Decision', audience: 'All', purpose: 'Test', owner: 'HR',
  disclaimer: 'D', allowDecisionSlide: true, screenshotDensity: 'four',
};

const draft: JobAidDraft = {
  title: 'Density + Decision', audience: 'All', purpose: 'Test the layouts',
  disclaimer: 'D', owner: 'HR', lastUpdated: '2026-09-03',
  resources: [{ label: 'HR Handbook', url: 'https://example.com/handbook' }],
  sections: [
    { id: 'sec1', title: 'Main task', kind: 'steps', steps: [1, 2, 3, 4, 5].map(step) },
    {
      id: 'dec', title: 'Choose a path', kind: 'decision', steps: [],
      decision: {
        question: 'Is the request urgent?',
        paths: [
          { label: 'Yes', destination: 'Escalate to manager' },
          { label: 'No', destination: 'Queue normally' },
        ],
      },
    },
  ],
};

/**
 * Only slides referenced by the presentation matter — pptx-automizer's
 * removeExistingSlides leaves the original template slide parts in the archive
 * but unreferenced (PowerPoint ignores them). Resolve the live set via
 * sldIdLst -> presentation rels.
 */
async function readReferencedSlides(zip: JSZip): Promise<string[]> {
  const pres = await zip.files['ppt/presentation.xml'].async('string');
  const rels = await zip.files['ppt/_rels/presentation.xml.rels'].async('string');
  const rIds = [...pres.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
  const relMap = new Map(
    [...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  const paths = rIds
    .map((id) => relMap.get(id))
    .filter((t): t is string => !!t)
    .map((t) => `ppt/${t.replace(/^\.\//, '')}`);
  return Promise.all(paths.map((p) => zip.files[p].async('string')));
}

describe('generation: four-screen density + decision slide', () => {
  let slides: string[];
  let files: string[];

  beforeAll(async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jobaid-'));
    const screenshots = new Map<string, Buffer>();
    for (const s of draft.sections[0].steps) screenshots.set(s.id, await png());

    const { file } = await generateDeck({
      draft, intake, templateDir: ROOT, outputDir: outDir,
      outputName: 'gen.pptx', screenshots,
    });
    const zip = await JSZip.loadAsync(await fs.readFile(file));
    files = Object.keys(zip.files);
    slides = await readReferencedSlides(zip);
  }, 60_000);

  it('preserves template branding (layouts + embedded fonts)', () => {
    expect(files.filter((f) => /slideLayouts\/slideLayout\d+\.xml$/.test(f)).length).toBeGreaterThanOrEqual(40);
    expect(files.filter((f) => /ppt\/fonts\//.test(f)).length).toBeGreaterThanOrEqual(10);
  });

  it('numbers steps continuously and never leaks placeholder prompts', () => {
    const joined = slides.join('\n');
    // 5 steps across two four-up slides -> numbers 1..5 present.
    for (const n of ['1', '2', '3', '4', '5']) expect(joined).toContain(`<a:t>${n}</a:t>`);
    expect(joined).not.toContain('Insert Decision Point Content');
    expect(joined).not.toContain('Insert Stop Point');
    expect(joined).not.toContain('Insert Next Step');
    expect(joined).not.toContain('Information about the step');
  });

  it('includes the decision question and embeds screenshots', () => {
    const joined = slides.join('\n');
    expect(joined).toContain('Is the request urgent?');
    expect(joined).toContain('If Yes: Escalate to manager');
    expect(slides.some((s) => /<p:pic>/.test(s))).toBe(true);
  });

  it('populates the approved further-resources link and drops the prompt', () => {
    const joined = slides.join('\n');
    expect(joined).toContain('HR Handbook: https://example.com/handbook');
    expect(joined).not.toContain('Insert Link For Further Resources');
  });

  it('leaves no orphaned slide parts in the output archive', () => {
    const slideFiles = files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    // After pruning, every slide part in the zip is one the presentation references.
    expect(slideFiles.length).toBe(slides.length);
  });
});
