"""HR Job Aid Creator — Streamlit web app.

Run locally:
    pip install -r app/requirements.txt
    export ANTHROPIC_API_KEY=sk-ant-...        # or set in Streamlit secrets
    streamlit run app/app.py

Deploy: push this repo to a host that runs Python (Streamlit Community Cloud
from GitHub for a quick public demo, or an approved internal Cisco host for
real HR data). GitHub itself only stores the code; it does not run the app.
"""
from __future__ import annotations

import datetime as _dt
import os
import sys

import streamlit as st

sys.path.insert(0, os.path.dirname(__file__))
from job_aid import build_pptx, generate, sources  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(REPO_ROOT, "HR Job Aid Template.pptx")

st.set_page_config(page_title="HR Job Aid Creator", page_icon="📄", layout="centered")
st.title("📄 HR Job Aid Creator")
st.caption("Turn a document, deck, or video into a Cisco-branded HR job aid.")

topic = st.text_input("Topic / product / process this job aid covers")
audience = st.text_input("HR audience (who is it for?)")

st.markdown("**Provide the source material** (one or both):")
link = st.text_input("Paste a link (article, doc, or video URL)")
upload = st.file_uploader(
    "…or upload a file", type=["docx", "pptx", "txt", "md", "vtt", "srt", "mp4", "mov", "mkv", "webm"]
)
pasted = st.text_area("…or paste text / a transcript", height=140)

with st.expander("Advanced settings"):
    model = st.text_input("Model", value=generate.DEFAULT_MODEL)
    api_key = st.text_input("Anthropic API key (or set ANTHROPIC_API_KEY)", type="password")
    base_url = st.text_input("API base URL (optional — for an internal gateway)")

go = st.button("Create Job Aid", type="primary")

if go:
    if not (link or upload or pasted):
        st.error("Add a link, upload a file, or paste text first.")
        st.stop()
    if not os.path.exists(TEMPLATE):
        st.error(f"Template not found at {TEMPLATE}")
        st.stop()

    try:
        # 1) Ingest source
        src = sources.Source(kind="text", text=pasted or "")
        if upload is not None:
            src = sources.from_upload(upload.name, upload.getvalue())
            if pasted:
                src.text = (src.text + "\n\n" + pasted).strip()
        elif link:
            src = sources.from_url(link)
            if pasted:
                src.text = (src.text + "\n\n" + pasted).strip()
        for note in src.notes:
            st.info(note)

        # 2) Ask Claude for the structured spec
        with st.spinner("Drafting the job aid with Claude…"):
            system_prompt = generate.load_system_prompt(REPO_ROOT)
            spec = generate.generate_spec(
                system_prompt=system_prompt,
                source_text=src.text,
                audience=audience,
                topic=topic,
                is_video=(src.kind == "video"),
                model=model or generate.DEFAULT_MODEL,
                api_key=api_key or None,
                base_url=base_url or None,
            )
        spec.setdefault("last_updated", _dt.date.today().isoformat())

        # 3) Extract real frames if we have a video + timestamps
        frame_paths: list[str] = []
        if src.kind == "video" and src.video_path:
            tss = [s.get("timestamp_seconds") for s in spec.get("steps", [])]
            if all(t is not None for t in tss) and tss:
                with st.spinner("Extracting screenshots from the video…"):
                    frame_paths = sources.extract_frames(src.video_path, [float(t) for t in tss])

        # 4) Fill the template
        with st.spinner("Building the PowerPoint…"):
            pptx_bytes = build_pptx.render(spec, TEMPLATE, frame_paths)

        st.success("Job aid created.")
        fname = (spec.get("title", "job-aid").strip() or "job-aid").replace("/", "-") + " - Job Aid.pptx"
        st.download_button(
            "⬇️ Download job aid (.pptx)",
            data=pptx_bytes,
            file_name=fname,
            mime="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )

        if spec.get("assumptions"):
            st.subheader("Assumptions")
            st.write("\n".join(f"- {a}" for a in spec["assumptions"]))
        if spec.get("open_questions"):
            st.subheader("Open questions")
            st.write("\n".join(f"- {q}" for q in spec["open_questions"]))
    except Exception as exc:  # noqa: BLE001 - show the user something useful
        st.exception(exc)
