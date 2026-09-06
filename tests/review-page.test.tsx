// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

vi.mock('next/navigation', () => ({
  useParams: () => ({ jobId: 'job1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

import ReviewPage from '../src/app/review/[jobId]/page';

const draft = {
  title: 'Submit a Leave Request',
  subtitle: 'Step-by-Step Job Aid',
  audience: 'All employees',
  purpose: 'How to submit a leave request.',
  disclaimer: 'Verify before use.',
  owner: 'HR',
  lastUpdated: '2026-09-03',
  sections: [
    {
      id: 'sec1',
      title: 'Main task',
      kind: 'steps',
      steps: [
        { id: 's1', instruction: 'Open the HR portal.', frameTimestampMs: 1000, confidence: 0.9, reviewFlags: [], redactions: [] },
        { id: 's2', instruction: 'Click New Request.', frameTimestampMs: 5000, confidence: 0.4, reviewFlags: ['low-confidence'], redactions: [] },
      ],
    },
  ],
};

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (typeof url === 'string' && url === '/api/jobs/job1' && (!init || init.method === undefined)) {
      return new Response(
        JSON.stringify({
          id: 'job1', stage: 'building-slides', draft,
          frames: [{ id: 'f0', tMs: 1000 }, { id: 'f1', tMs: 5000 }],
          intake: { screenshotDensity: 'two', allowDecisionSlide: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
});

describe('ReviewPage keyboard + screen-reader flows', () => {
  it('associates a label with each step instruction field', async () => {
    render(<ReviewPage />);
    expect(await screen.findByLabelText(/Step 1 instruction/i)).toHaveValue('Open the HR portal.');
    expect(screen.getByLabelText(/Step 2 instruction/i)).toHaveValue('Click New Request.');
  });

  it('announces the unresolved-issue count and flags in text (not color-only)', async () => {
    render(<ReviewPage />);
    await screen.findByLabelText(/Step 1 instruction/i);
    // One low-confidence step -> 1 item needs review.
    expect(screen.getByLabelText('Summary')).toHaveTextContent(/1\s*item\(s\) need review/i);
    expect(screen.getByText(/low confidence/i)).toBeInTheDocument();
  });

  it('reorders steps with keyboard-only Move down', async () => {
    const user = userEvent.setup();
    render(<ReviewPage />);
    await screen.findByLabelText(/Step 1 instruction/i);

    // Move step 1 down using its accessible button, activated by keyboard.
    const step1Card = screen.getByLabelText(/Step 1 instruction/i).closest('.step-card') as HTMLElement;
    const moveDown = within(step1Card).getByRole('button', { name: /Move down/i });
    moveDown.focus();
    await user.keyboard('{Enter}');

    // After reorder, position 1 now holds the previously-second instruction.
    await waitFor(() =>
      expect(screen.getByLabelText(/Step 1 instruction/i)).toHaveValue('Click New Request.'),
    );
  });

  it('has no axe violations on the loaded review page', async () => {
    const { container } = render(<ReviewPage />);
    await screen.findByLabelText(/Step 1 instruction/i);
    expect(await axe(container)).toHaveNoViolations();
  });
});
