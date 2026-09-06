import { describe, it, expect } from 'vitest';
import { jobAidDraftSchema } from '../src/lib/validation/schemas';
import { detectFileKind, isAcceptedVideoKind } from '../src/lib/validation/file-signature';

describe('JobAidDraft schema', () => {
  const valid = {
    title: 'T', audience: 'A', purpose: 'P', disclaimer: 'D', owner: 'O',
    lastUpdated: '2026-09-03',
    sections: [{ id: 's1', title: 'Sec', kind: 'steps', steps: [
      { id: 'st1', instruction: 'Do it', frameTimestampMs: 0, confidence: 0.8, reviewFlags: [] },
    ] }],
  };

  it('accepts a well-formed draft', () => {
    expect(jobAidDraftSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a steps section with no steps', () => {
    const bad = structuredClone(valid);
    bad.sections[0].steps = [];
    expect(jobAidDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a decision section missing decision content', () => {
    const bad = structuredClone(valid) as any;
    bad.sections[0] = { id: 'd', title: 'D', kind: 'decision', steps: [] };
    expect(jobAidDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a non-http(s) resource URL', () => {
    const bad = structuredClone(valid) as any;
    bad.resources = [{ label: 'x', url: 'javascript:alert(1)' }];
    expect(jobAidDraftSchema.safeParse(bad).success).toBe(false);
  });
});

describe('file signature detection', () => {
  it('detects an ISO mp4 by its ftyp box, not extension', () => {
    const buf = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
    expect(detectFileKind(buf)).toBe('mp4');
    expect(isAcceptedVideoKind(detectFileKind(buf))).toBe(true);
  });

  it('detects webm/matroska by EBML header', () => {
    const buf = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    expect(detectFileKind(buf)).toBe('webm');
  });

  it('does not accept a text file as video', () => {
    expect(isAcceptedVideoKind(detectFileKind(Buffer.from('hello world')))).toBe(false);
  });
});
