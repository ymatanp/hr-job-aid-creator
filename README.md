# HR Job Aid Creator

A Claude Code agent that creates clear, practical, Cisco-branded **HR job aids** by
populating the `HR Job Aid Template.pptx`. This repository is the source of truth for
the agent definition and its template.

## Contents

| Path | Purpose |
| --- | --- |
| `.claude/agents/hr-job-aid-creator.md` | The agent definition (system prompt, method, template map, formatting rules). |
| `HR Job Aid Template.pptx` | The Cisco HR Job Aid PowerPoint template the agent fills in. |

## What the agent does

- Opens every request by asking for the **topic** and the **HR audience**.
- Produces job aids that are plain-language, task-focused, accessible, and Cisco-branded.
- Supports many formats: step-by-step guides, quick reference guides, checklists,
  decision trees, FAQs, how-to guides, system navigation guides, policy/regulation
  summaries, troubleshooting guides, comparison tables, and role-based guidance.
- Fills the 9-slide template using its known placeholder map, selecting the right
  step-by-step slide by step count (4 → slide 6, 2 → slide 7, 1–2 with notes → slide 8).
- Never invents policy or legal detail — flags gaps with `[Needs confirmation]`,
  `[Source required]`, `[Country-specific guidance needed]`, `[Policy owner to confirm]`.
- Can also produce a one-page quick reference version on request.

## Using the agent

In a Claude Code session opened in this repository, invoke it by name, e.g.:

> Use the hr-job-aid-creator agent to build a job aid for the new benefits enrollment process.

The agent copies the template (never overwrites it) and edits the copy, then reports the
new file path along with assumptions, open questions, improvement recommendations, and
visual suggestions.
