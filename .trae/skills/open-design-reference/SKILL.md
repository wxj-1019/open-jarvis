---
name: "open-design-reference"
description: "Reference skill for OpenDesign project patterns. Invoke when building AI-powered design tools, multi-provider LLM integrations, design token ingestion, or prototype/deck/landing page generation features."
---

# OpenDesign — AI-Powered Open Source Design Engine

Reference skill summarizing the [OpenDesign](https://github.com/Pandemonium-Research/OpenDesign) project (MIT License, Pandemonium Research). Use its architecture, patterns, and design decisions as a reference when building similar features in OpenJarvis.

## Project Overview

OpenDesign is an open-source, model-agnostic design tool that generates HTML/CSS/JS prototypes, presentation decks, and landing pages from a single prompt. It ingests design tokens from websites, GitHub repos, and Figma files, and exports to HTML, PDF, MP4, editable PPTX, and framework components (React/Vue/Svelte).

**Core differentiator:** Combines open-source + model-agnostic + real video export + editable PPTX from arbitrary HTML/CSS/JS — a combination no other product offers today.

## Architecture

```
app/ (Next.js 16, App Router)
├── /api/generate — prototype generation
├── /api/generate/deck — deck generation
├── /api/generate/landing — landing page generation
├── /api/generate/all — multi-artifact in one shot
├── /api/ingest — site URL → DTCG tokens
├── /api/ingest/github — GitHub repo → DTCG tokens
├── /api/ingest/figma — Figma file → DTCG tokens
├── /api/export/html — ZIP download
├── /api/export/pdf — Playwright PDF
├── /api/export/pptx — editable PowerPoint
├── /api/export/video — proxies to renderer
├── /api/export/code — React / Vue / Svelte
└── /api/artifacts/share — public share links

renderer/ (Express on :3001)
Puppeteer + virtual clock + FFmpeg → MP4
```

## Key Design Patterns

### 1. Multi-Provider LLM Strategy

Uses Vercel AI SDK v6 to support Anthropic, OpenAI, Google, and Ollama interchangeably. Users bring their own API keys (AES-256-GCM encrypted at rest). Provider selection is per-request, with a configurable server default.

```
Pattern: Per-user encrypted API keys → user keys override server env vars → fallback to server config
```

### 2. Design Token Ingestion Pipeline

Three ingestion sources, all producing W3C DTCG tokens:
- **URL**: Playwright captures the page → @projectwallace/css-design-tokens extracts colors/fonts
- **GitHub**: REST API fetches `globals.css`, `variables.css`, `tailwind.config.*`, token JSON files — no cloning
- **Figma**: REST API `/v1/files/:key` → extracts solid fills and typography styles

Tokens are stored as `brand_context` JSONB in Supabase and applied to all subsequent generations.

### 3. Multi-Artifact Orchestration

One prompt can generate multiple artifact types simultaneously (prototype + deck + landing page). Each artifact type has its own API route but shares the same LLM prompt processing pipeline.

```
Pattern: Single prompt → parallel artifact generation → independent storage + export
```

### 4. Deterministic Video Export

The renderer service achieves frame-perfect video capture:
1. Launch Chrome with `--enable-begin-frame-control` and `--deterministic-mode`
2. Inject virtual-clock bundle that patches `Date`, `performance.now`, `requestAnimationFrame`, `setTimeout`, `setInterval`
3. Wait for `document.fonts.ready`
4. Step through each frame by advancing clock + `HeadlessExperimental.beginFrame`
5. Pipe PNG frames to FFmpeg → H.264 MP4

This ensures CSS animations, `requestAnimationFrame` loops, and `setTimeout`-driven state all advance at exactly the correct speed regardless of server load.

### 5. Editable PPTX Export

Uses `pptxgenjs` to create real XML text boxes, speaker notes, and brand colors — not rasterized images. Slides remain fully editable in PowerPoint.

### 6. Code Handoff

LLM-based conversion transforms any HTML/CSS/JS prototype into a self-contained React `.tsx`, Vue `.vue`, or Svelte `.svelte` component.

### 7. Refinement Mode

"Refine current design" mode passes `existingPrototype` to the generation endpoint. The LLM applies only the requested change while preserving layout, colors, and animations — avoiding full regeneration.

## Tech Stack Reference

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | Clerk |
| Database | Supabase (Postgres + service-role client) |
| LLM | Vercel AI SDK v6 — Anthropic, OpenAI, Google, Ollama |
| Design tokens | @projectwallace/css-design-tokens (W3C DTCG) |
| PDF export | Playwright (server-side) |
| PPTX export | pptxgenjs |
| Video export | Puppeteer + HeadlessExperimental + FFmpeg |
| Code handoff | LLM-based conversion |
| Styling | Tailwind CSS 4 |
| Self-hosting | Docker Compose |

## Database Schema

```sql
-- Core tables
projects (id, user_id, name, brand_context jsonb, created_at, updated_at)
artifacts (id, project_id, type, document jsonb, share_token uuid unique, created_at)
exports (id, artifact_id, format, status, error_message, created_at)
user_api_keys (user_id, anthropic_key, openai_key, google_key, figma_key, updated_at)
```

Key design decisions:
- `brand_context` stores full BrandContext (sourceUrl, colors[], fontFamilies[], fontSizes[], rawCss, dtcgTokens)
- `artifacts.type` is `'prototype'`, `'deck'`, or `'landing'`
- All API keys are AES-256-GCM encrypted before storage
- `share_token` being non-null makes an artifact publicly readable at `/share/[token]`

## Roadmap Phases

- **Phase 1 — MVP ✅**: Prompt to prototype, design token ingestion, multi-provider, per-user API keys, HTML/PDF/MP4 export, self-hosting
- **Phase 2 — Multi-artifact ✅ (partial)**: Deck/landing page types, GitHub ingestion, multi-artifact orchestration, share links, real-time collaboration
- **Phase 3 — Polish (in progress)**: Figma ingestion, code handoff, refinement UX, Storybook ingestion, animation timeline
- **Phase 4 — Future**: Voice interaction, 3D/shader authoring, distributed rendering, plugin system, template marketplace, enterprise SSO

## Applicable Patterns for OpenJarvis

When building AI-powered features in OpenJarvis, consider these patterns from OpenDesign:

1. **Multi-provider LLM**: Use Vercel AI SDK for provider abstraction, let users bring their own keys
2. **Design token pipeline**: W3C DTCG standard for token exchange between design tools
3. **Artifact storage**: JSONB in Postgres for flexible artifact document storage
4. **Export pipeline**: Separate microservice (renderer) for CPU-intensive operations like video encoding
5. **Refinement over regeneration**: Pass existing context to LLM for targeted modifications
6. **Deterministic rendering**: Virtual clock injection for frame-perfect animation capture
7. **Share without auth**: UUID share tokens for public read-only access to artifacts
