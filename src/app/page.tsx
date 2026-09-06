'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const DEFAULT_DISCLAIMER =
  'This job aid reflects the process shown in the source recording. Interfaces and procedures may change. Verify critical actions against the current approved process before use.';

export default function HomePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setStatus('Uploading and analyzing. This can take a moment for longer videos.');
    try {
      const form = new FormData(e.currentTarget);
      const res = await fetch('/api/jobs', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed.');
      router.push(`/review/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Create a job aid from a demo video</h1>
      <p className="hint">
        Upload one demo video (mp4, mov, or webm) and optional supporting text. Limits:
        up to 500&nbsp;MB and 30&nbsp;minutes. Your files are processed temporarily and
        deleted after 60&nbsp;minutes or when you choose “Delete my files now”.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>

      <form onSubmit={onSubmit}>
        <fieldset>
          <legend>Source files</legend>
          <label htmlFor="video">
            Demo video <span className="hint">(required — mp4, mov, or webm)</span>
          </label>
          <input id="video" name="video" type="file" accept="video/mp4,video/quicktime,video/webm" required />

          <label htmlFor="transcript">
            Supporting text <span className="hint">(optional — paste a transcript or notes)</span>
          </label>
          <textarea id="transcript" name="transcript" placeholder="Paste transcript or notes here" />
        </fieldset>

        <fieldset>
          <legend>Job aid details</legend>
          <div className="row">
            <div>
              <label htmlFor="title">Title</label>
              <input id="title" name="title" type="text" required />
            </div>
            <div>
              <label htmlFor="owner">Document owner / team</label>
              <input id="owner" name="owner" type="text" defaultValue="Human Resources" required />
            </div>
          </div>
          <label htmlFor="audience">Intended audience</label>
          <input id="audience" name="audience" type="text" required />
          <label htmlFor="purpose">Purpose or outcome</label>
          <textarea id="purpose" name="purpose" required />
          <label htmlFor="disclaimer">Disclaimer</label>
          <textarea id="disclaimer" name="disclaimer" defaultValue={DEFAULT_DISCLAIMER} />
        </fieldset>

        <fieldset>
          <legend>Options</legend>
          <div className="row">
            <div>
              <label htmlFor="screenshotDensity">Screenshot density</label>
              <select id="screenshotDensity" name="screenshotDensity" defaultValue="auto">
                <option value="auto">Auto</option>
                <option value="one">One key screen per slide</option>
                <option value="two">Two screens per slide</option>
                <option value="four">Four screens per slide</option>
              </select>
            </div>
            <div>
              <label htmlFor="resourceLabel">Further-resources label (optional)</label>
              <input id="resourceLabel" name="resourceLabel" type="text" />
            </div>
            <div>
              <label htmlFor="resourceUrl">Further-resources URL (optional)</label>
              <input id="resourceUrl" name="resourceUrl" type="url" placeholder="https://" />
            </div>
          </div>
          <label htmlFor="allowDecisionSlide" style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
            <input id="allowDecisionSlide" name="allowDecisionSlide" type="checkbox" value="true" />
            Allow a decision/branching slide if the source genuinely contains alternatives
          </label>
        </fieldset>

        <button type="submit" disabled={busy}>
          {busy ? 'Analyzing…' : 'Analyze video'}
        </button>
      </form>
    </>
  );
}
