# Editing, AI and export on the free plan

- Media never leaves the browser tab. `POST /v1/uploads` records only a clip's
  name, type, size and probed duration and answers with a `kimo-local://asset/<id>`
  address; the tab maps it to an in-memory object URL (`apps/web/src/lib/local-media.ts`).
  Nothing is written to IndexedDB, OPFS or a server. A reopened project asks for the
  clips again and matches them by file name and duration.
- Timelines are JSON in D1 (`edit_sessions`), edited with the shared ops contract
  (`packages/kimo-client`), versioned, with mutation-id dedupe.
- Realtime: one SQLite-backed Durable Object (`SessionRoom`, Workers Free) per session
  fans events out to the owner's open tabs. The Worker checks cookie + Origin first.
- Export: `packages/compositor/src/export.ts` plays the cut into a hidden canvas and
  records canvas + Web Audio with MediaRecorder (MP4 where the browser supports it,
  else WebM). The file is offered as a download; kimo keeps no copy.
- Analysis: the studio measures each clip in the browser (speech/silence ranges,
  loudness, music beats; `apps/web/src/lib/media-analysis.ts`) and sends only those
  numbers (`POST /v1/sessions/:id/analysis`).
- AI: `POST /v1/sessions/:id/messages` calls Meta's Model API (OpenAI-compatible chat
  completions, structured output) with the instruction, the timeline and the analysis
  numbers. The system prompt is the output contract + the knowledge pack
  (`apps/api/src/ai/knowledge/*.md`, bundled by `pnpm ai:knowledge`) + a safety line.
  Model output is validated with zod and applied to a copy; anything invalid is
  rejected with `422 ai_invalid_edit`. Without `META_API_KEY` the endpoint answers
  `503 ai_unavailable` and the studio shows a calm note.

## Switching AI on

Cloudflare dashboard → Workers & Pages → kimo-api → Settings → Variables and Secrets →
Add → type **Secret**, name `META_API_KEY`, value = the Meta Model API key → Deploy.
`META_API_BASE_URL` (default `https://api.meta.ai/v1`) and `META_MODEL` (default
`muse-spark-1.3`) are plain vars in `apps/api/wrangler.toml`; change them there, since a
deploy overwrites dashboard vars (secrets are kept).
