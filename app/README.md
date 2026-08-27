# HR Job Aid Creator — Web App

A Streamlit app that turns a document, deck, or video into a Cisco-branded HR
job aid. It wraps the **same logic** as the Claude Code agent: it uses
[`PROMPT.md`](../PROMPT.md) as the system prompt, calls the Claude API to draft
the job aid, extracts real frames from a source video with OpenCV, and fills
[`HR Job Aid Template.pptx`](../HR%20Job%20Aid%20Template.pptx) with `python-pptx`.

The end user gets one page: paste a link **or** upload a file **or** paste text,
click **Create Job Aid**, and download the finished `.pptx`.

## Why an app (and not just the GitHub repo)

GitHub *stores* code; it does not *run* a Python backend for visitors. To give
non-technical HR users a click-a-link experience, the logic has to run on a host
that executes Python. Python running server-side is invisible to the user — they
install nothing.

## Run locally

```bash
pip install -r app/requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...        # your key
streamlit run app/app.py
```

Then open the URL Streamlit prints (usually http://localhost:8501).

## Configuration

| Setting | How | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | env var or the in-app "Advanced settings" field | Auth for the Claude API |
| `JOBAID_MODEL` | env var (default `claude-opus-4-8`) | Swap to a cheaper model (e.g. a Sonnet) for volume |
| `ANTHROPIC_BASE_URL` | env var or the in-app field | Point at an approved internal Cisco LLM gateway instead of the public API |

## Deploy & share a link

- **Quick public demo:** push this repo to GitHub and deploy on
  [Streamlit Community Cloud](https://streamlit.io/cloud) (it runs `app/app.py`
  straight from the repo). Put the API key in *Secrets*. Gives you a shareable URL.
- **⚠️ Real HR data:** this is internal Cisco content — do **not** put it on a
  public host. Deploy the same repo to an approved internal host (internal app
  platform, Azure, or a container) and, if required, route the model calls
  through `ANTHROPIC_BASE_URL` to an internal gateway. Add sign-in in front of it.

## How it maps to the agent

| Agent step | App module |
| --- | --- |
| Read source (docx/pptx/video/transcript) | `job_aid/sources.py` |
| Draft the job aid with Claude (using `PROMPT.md`) | `job_aid/generate.py` |
| Extract real video frames for screenshots | `job_aid/sources.extract_frames` |
| Fill the template (pick a layout, duplicate per screen, keep the white bg) | `job_aid/build_pptx.py` |

## Prototype limitations

- **Screencast layout:** the app always uses the 4-up screencast layout (template
  slide 6) and duplicates it per group of 4 steps, clearing unused quadrants. The
  agent can choose among slides 6/7/8; the app standardizes on the one with
  top-level picture slots for reliable image placement.
- **Video transcripts** are not auto-derived; paste a transcript/step list for
  best step wording. Frame extraction (screenshots) works from the video directly.
- **URL fetch** is best-effort; YouTube pages don't expose transcripts to a
  server fetch — upload the video or paste the transcript.
- Always review the draft (assumptions/open questions are shown) before use.
