"""Call the Claude API to turn source material into a structured job-aid spec.

The agent's markdown prompt (PROMPT.md at the repo root) is used verbatim as the
system prompt, so the web app produces the same style of job aid as the Claude
Code agent. The model returns a strict JSON structure (via tool use) that
build_pptx.py then renders into the HR Job Aid Template.
"""
from __future__ import annotations

import json
import os
from typing import Optional

# Default to the latest, most capable Claude model. Override with JOBAID_MODEL
# (e.g. a cheaper Sonnet for high volume) or point at an internal gateway with
# ANTHROPIC_BASE_URL.
DEFAULT_MODEL = os.environ.get("JOBAID_MODEL", "claude-opus-4-8")

# JSON schema the model must fill. Kept in sync with build_pptx.render().
JOB_AID_TOOL = {
    "name": "emit_job_aid",
    "description": "Return the structured content for one HR job aid deck.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Job aid title (slide 1)."},
            "subtitle": {"type": "string"},
            "document_title": {"type": "string", "description": "Short running title used in headers."},
            "disclaimers": {
                "type": "array", "items": {"type": "string"}, "maxItems": 3,
                "description": "Up to 3 short disclaimer statements (slide 2).",
            },
            "overview": {
                "type": "array",
                "description": "Overview/TOC cards for slides 3-4 (Purpose, Audience, When to Use, Before You Begin, etc.).",
                "items": {
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string"},
                        "info": {"type": "string"},
                    },
                    "required": ["topic", "info"],
                },
            },
            "decision_tree": {
                "type": "object",
                "description": "Optional Yes/No decision logic for slide 5.",
                "properties": {
                    "points": {"type": "array", "items": {"type": "string"}},
                    "stop": {"type": "string"},
                    "next": {"type": "string"},
                    "notes": {"type": "string"},
                },
            },
            "steps": {
                "type": "array",
                "description": "Procedure steps. Each caption MUST start with an active verb.",
                "items": {
                    "type": "object",
                    "properties": {
                        "caption": {"type": "string", "description": "Verb-first step text."},
                        "alt_text": {"type": "string", "description": "Descriptive alt text for the screenshot."},
                        "timestamp_seconds": {
                            "type": "number",
                            "description": "If the source is a video, the time to grab this step's frame.",
                        },
                    },
                    "required": ["caption", "alt_text"],
                },
            },
            "notes_message": {"type": "string", "description": "Important warning shown on procedural slides."},
            "resources": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"label": {"type": "string"}, "url": {"type": "string"}},
                    "required": ["label"],
                },
            },
            "last_updated": {"type": "string"},
            "assumptions": {"type": "array", "items": {"type": "string"}},
            "open_questions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["title", "disclaimers", "overview", "steps", "last_updated"],
    },
}


def load_system_prompt(repo_root: str) -> str:
    """Use the repo's PROMPT.md as the system prompt (source of truth)."""
    path = os.path.join(repo_root, "PROMPT.md")
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def generate_spec(
    *,
    system_prompt: str,
    source_text: str,
    audience: str,
    topic: str,
    is_video: bool,
    model: str = DEFAULT_MODEL,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> dict:
    """Ask Claude for the structured job-aid spec. Returns the tool-input dict."""
    from anthropic import Anthropic

    client = Anthropic(
        api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"),
        base_url=base_url or os.environ.get("ANTHROPIC_BASE_URL") or None,
    )

    user_msg = _build_user_message(source_text, audience, topic, is_video)
    resp = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system_prompt,
        tools=[JOB_AID_TOOL],
        tool_choice={"type": "tool", "name": "emit_job_aid"},
        messages=[{"role": "user", "content": user_msg}],
    )
    for block in resp.content:
        if block.type == "tool_use" and block.name == "emit_job_aid":
            return dict(block.input)
    # Fallback: try to parse JSON from any text block.
    for block in resp.content:
        if block.type == "text":
            return json.loads(block.text)
    raise RuntimeError("Model did not return a job-aid structure.")


def _build_user_message(source_text: str, audience: str, topic: str, is_video: bool) -> str:
    video_note = (
        "\nThe source is a VIDEO. Provide a `timestamp_seconds` for each step so real "
        "frames can be extracted as the screenshots.\n"
        if is_video
        else ""
    )
    src = source_text.strip() or "[No source text provided — draft from the topic and mark gaps.]"
    return (
        f"Create an HR job aid.\n"
        f"Topic: {topic or '[infer from source]'}\n"
        f"HR audience: {audience or '[not specified — note as an open question]'}\n"
        f"{video_note}\n"
        f"Follow the template rules from your instructions: pick ONE screencast layout "
        f"and duplicate it for all screens; every step caption starts with an active verb; "
        f"mark missing policy/legal detail with [Needs confirmation] etc.\n\n"
        f"=== SOURCE MATERIAL ===\n{src[:16000]}\n=== END SOURCE ===\n\n"
        f"Return the job aid via the emit_job_aid tool."
    )
