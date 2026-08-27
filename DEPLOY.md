# Deploying the HR Job Aid Creator app

## Can it be hosted "on GitHub"?

- **github.com directly: no.** GitHub stores the code and can serve *static*
  files (GitHub Pages = HTML/CSS/JS only). It cannot run Python, hold your API
  key, or generate a `.pptx` on request.
- **From GitHub, via Streamlit Community Cloud: yes.** Streamlit Cloud deploys
  straight from this repo and gives you a public URL. The code stays on GitHub;
  Streamlit runs it. That is the path below.

> ⚠️ **Note.** Streamlit Community Cloud is a **public** host: anyone with the URL
> can use the app (and spend your API key), and uploaded files are processed on a
> third-party server. Fine for general use and demos. If your job aids or sources
> contain confidential information, self-host instead (see the last section) and/or
> add an access check.

## Option A — Streamlit Community Cloud (demo, from GitHub)

This repo is already prepared for it:
- `requirements.txt` (repo root) — Python deps
- `packages.txt` (repo root) — system libs for OpenCV
- `.streamlit/config.toml` — theme + 500 MB upload limit
- entry point: `app/app.py`

Steps (about 3 minutes):

1. Go to **https://share.streamlit.io** and sign in with your GitHub account
   (`ymatanp`). Authorize Streamlit to read your repos.
2. Click **Create app** → **Deploy a public app from GitHub**.
3. Fill in:
   - **Repository:** `ymatanp/hr-job-aid-creator`
   - **Branch:** `main`
   - **Main file path:** `app/app.py`
4. Click **Advanced settings → Secrets** and paste (from your Anthropic key):
   ```toml
   ANTHROPIC_API_KEY = "sk-ant-..."
   ```
5. Click **Deploy**. First build takes a few minutes (installs deps + OpenCV).
6. You get a URL like `https://hr-job-aid-creator-xxxx.streamlit.app` — share that.

To update the app later, just `git push` to `main`; Streamlit redeploys.

### If the repo is private
Streamlit Community Cloud can deploy a private repo too (grant it access when
prompted). Note: anyone with the app URL can still *use* it unless you enable
viewer authentication in the app's settings.

## Option B — Self-host (private deployment)

If you'd rather not use a public host, run the same repo anywhere that executes
Python + has an Anthropic path:

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...            # or ANTHROPIC_BASE_URL for an internal gateway
streamlit run app/app.py --server.port 8501
```

Container sketch (deploy to your internal platform / Azure / etc.):

```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY . .
RUN pip install --no-cache-dir -r requirements.txt
EXPOSE 8501
CMD ["streamlit", "run", "app/app.py", "--server.port", "8501", "--server.address", "0.0.0.0"]
```

Add authentication / network restrictions if you want to limit who can use it,
and set `ANTHROPIC_BASE_URL` if you route the model through your own gateway.
```
