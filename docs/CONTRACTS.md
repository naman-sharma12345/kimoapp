# kimo frontend/backend contracts

The executable source is `packages/kimo-client/src/schema.ts`. All requests and responses are parsed with Zod, as are both directions of WebSocket traffic. `packages/kimo-client/src/index.ts` exports inferred strict TypeScript types and the typed REST client. All times are seconds unless named otherwise.

Base URL: `NEXT_PUBLIC_KIMO_API`, default `http://localhost:8787`. Instantiate `KimoClient` with this value in browser integration. Mock endpoints are not Next.js API routes. JSON errors have `{code,message}`; status codes distinguish 400 invalid requests, 403 expired uploads, 404 missing resources, 409 version/status conflicts, 413 oversized files and 503 simulated upload failures.

## REST

| Method / path                  | Request                                                                        | Response                                                   |
| ------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| POST /v1/uploads               | `{files:[{name,size,mime}]}`                                                   | `{uploads:[{assetId,putUrl,headers}]}`                     |
| PUT presigned putUrl           | exact file bytes; supplied headers                                             | 200 on success; URL expires after 15 minutes               |
| POST /v1/sessions              | `{prompt,assetIds,aspect,durationHint?}`; aspect `16:9`, `9:16`, `1:1`, `auto` | `{sessionId,wsUrl}`                                        |
| GET /v1/sessions/:id           | —                                                                              | `{status,project,assets}`                                  |
| POST /v1/sessions/:id/messages | `{text,attachments?:string[]}`                                                 | 202 with no response body                                  |
| POST /v1/sessions/:id/ops      | `{ops:Op[],baseVersion}`                                                       | `{version}`; 409 if baseVersion differs                    |
| POST /v1/sessions/:id/approve  | `{}`                                                                           | `{renderId}`; 409 before review                            |
| GET /v1/renders/:id            | —                                                                              | `{status,progress,frame,totalFrames,etaSec,videoId?}`      |
| GET /v1/videos/:id             | —                                                                              | `{url,posterUrl,durationSec,width,height,sizeBytes,title}` |

Session status: `warming | editing | awaiting_review | rendering | done | failed`. Render status: `queued | rendering | done | failed`. Progress is 0..1. Uploads use native XMLHttpRequest for progress and AbortSignal cancellation. The mock serves uploaded bytes and fixtures with media byte ranges and CORS.

## Project records

- **Asset:** `{id,kind,name,url,proxyUrl?,thumbUrl?,durationSec?,width?,height?,source,attribution?}`. Kinds: video/image/audio/doc. Source: user/web. Attribution: `{site,pageUrl,license?}`.
- **Clip:** `{id,trackId,assetId?,kind,start,duration,in,transform,text?,effects,keyframes,mask?,speed,volume?,transitionIn?,transitionOut?,locked?}`. Kinds: video/image/audio/text/shape/adjustment. Transform: `{x,y,scale,rotation,opacity,crop?:{l,t,r,b}}`. Text: `{content,style,words?:{t,d,w}[]}`. Mask: `{kind:'sam',maskAssetId,invert,feather}`.
- **Track:** `{id,kind,name,muted,hidden,locked,height}`. Kinds: video/overlay/text/audio. Height: 48, 64 or 88.
- **KimoProject:** `{id,version,fps:30,width,height,duration,tracks,clips:Record<string,Clip>,markers}`. Dimensions: 1920×1080 or 1080×1920; 1080×1080 is the documented 1:1 extension. Clip keys must match IDs and reference real tracks.
- **TextStyleId:** nonempty string owned by the backend.
- **Effect:** `{id,type,params:Record<string,unknown>}`.
- **Keyframe:** `{id,property,time,value,easing}`. Easing: linear/ease-out/ease-in-out/ease-in.
- **Marker:** `{id,time,label}`.
- **Transition:** `{type,duration}`.

The last five structures are explicit Phase 0 decisions because the supplied brief referenced them without definitions. They require agreement when integrating a real engine; see DECISIONS.md.

## WebSocket server → client

| `t`                   | Other fields                                                                      |
| --------------------- | --------------------------------------------------------------------------------- |
| hello                 | version                                                                           |
| agent.status          | state: thinking/acting/waiting_user/idle, label                                   |
| agent.action.start    | id, tool (snake_case), title, args, target?: {clipId?,trackId?,region?:{x,y,w,h}} |
| agent.action.progress | id, pct?, note?                                                                   |
| agent.action.end      | id, ok, error?, durationMs                                                        |
| project.ops           | version, ops, actionId?                                                           |
| agent.message         | id, role: agent, text, kind: say/ask_review/ask_choice, choices?                  |
| asset.added           | asset                                                                             |
| sam.mask              | clipId, maskAssetId, previewPolygon: [x,y][]                                      |
| warmup.step           | step: upload/probe/watch/plan/ready, pct                                          |
| error                 | code, message                                                                     |

Client → server: `{t:'interrupt',text}`, `{t:'pause'}`, `{t:'resume'}`, `{t:'ping'}`. Ping replies with hello/current version. Invalid client events return an error event. The browser client uses native WebSocket; ws is server-only.

## Operation vocabulary

| `op`         | Fields                                                          |
| ------------ | --------------------------------------------------------------- |
| clip.add     | clip                                                            |
| clip.update  | id, patch                                                       |
| clip.remove  | id                                                              |
| clip.move    | id, trackId, start                                              |
| clip.trim    | id, edge: in/out, value (absolute source boundary, speed-aware) |
| clip.split   | id, at (absolute timeline time), newId                          |
| track.add    | track                                                           |
| track.update | id, patch                                                       |
| text.update  | clipId, content                                                 |
| effect.set   | clipId, effect (upsert by effect.id)                            |
| keyframe.set | clipId, keyframe (upsert by keyframe.id)                        |
| marker.add   | marker (upsert by marker.id)                                    |

Patches are shallow and cannot replace record IDs. Each batch is atomic, increases the project version once, and recalculates duration. Invalid operations throw without modifying the original project. Effect/keyframe records use stable IDs so interrupted edits can replace existing settings.

## Version recovery

`ProjectSync` accepts the current snapshot getter and replacement callback. It serializes edits and incoming op events. A next-version batch applies immediately; duplicate or older batches are ignored. A gap refetches GET session and replaces the snapshot. A hello ahead of the local version also refetches. User operations apply optimistically, then POST with the previous baseVersion. On 409, refetch, re-apply and retry once; a repeated conflict restores the snapshot and surfaces the error. Consumers own WebSocket reconnection and backoff, and call dispose on teardown.

## Mock demonstration

Run `pnpm mock` and, in another terminal, `pnpm mock:demo`. The demo prints validated events and closes at ask_review. Set `MOCK_SPEED=2` on the mock process to double warmup, script and render speed. `MOCK_FAIL=upload`, `ws`, or `render` exercises failure states. Session data resets when the server restarts; `.mock-data` holds uploaded bytes. The canned delivered video is not a real rendered project.

Phase 2 starts presigned PUTs and then creates the session with the registered asset IDs without waiting for all bytes. The mock permits registered pending IDs; GET asset returns 404 until its PUT succeeds. The real backend must support this order or provide a separate finalization mechanism. Browser upload failure after session creation is surfaced on the handoff screen and the draft stays available in memory for retry.

## Phase 3 upload extensions

POST `/v1/uploads` returns either `{assetId, putUrl, headers}` or `{assetId, parts:[{partNumber,putUrl}], headers}` per file. Multipart begins above 100 MiB with 16 MiB parts. PUT responses expose ETag. POST `/v1/uploads/:assetId/complete` accepts `{parts:[{partNumber,etag}]}` and returns `{assetId}` only after every part is validated and assembled. Completion is idempotent. POST `/v1/uploads/:assetId/renew` returns `{uploads:[target]}` with the same asset ID.

POST `/v1/sessions/:sessionId/assets/remove` accepts `{assetId}`, detaches the canceled upload and returns 202. Snapshots optionally include `renderId` and `videoId` for restore redirects. The mock's script waits for registered user uploads before progressing past warm-up. Fixture media is already available and does not enter that wait.

## Phase 4 warm-up extensions

POST `/v1/sessions/:sessionId/cancel` returns 202, stops the mock edit and leaves registered uploads in place. GET session may include `wsUrl` for reconnecting after refresh; when absent, the browser derives the session socket URL from the configured API origin. `warmup.step` may additionally include positive integer `clipIndex` and `clipCount`. These are proposed typed extensions that need real-backend agreement. The mock replays its current warm-up stage on reconnection. Socket failures retry after 2, 4 and 8 seconds, and wait for the browser to come online when offline.

## Phase 5 Studio restore extensions

GET session may include `actionCount`, `paused`, `agentState`, and `createdAt` (Unix milliseconds). The mock supplies these so an opened or restored Studio can display accurate agent status and elapsed session time. They are optional typed extensions for real-backend agreement. Agent pause and resume use the existing WebSocket messages; incoming project operations remain synchronized through `ProjectSync`.

## Phase 06 preview extensions

Keyframes additionally accept hold and bezier easing and optional two-number in/out control handles. These optional fields preserve existing project compatibility; the real engine must agree on their timing and coordinate conventions. Transition duration remains seconds under the existing schema. Mask RLE, effect scope, LUT representation and audio solo need agreed contracts before full preview parity.

## Phase 07 — manual editing extensions

All edits use POST `/v1/sessions/:id/ops` and its version/retry protocol. Added operations are `project.update` (dimensions, background and notes), `track.remove`, `marker.remove`, and `clip.unset` for restoring absent optional fields through JSON. Transitions accept null to remove them. The undo stack records the project immediately before each serialized user group. It never adds agent groups to user undo.

Clips optionally carry cropAspectLock, keepPitch, fadeIn, fadeOut, duckUnderVoice; text optionally carries size, align, color, animation and position; effects optionally carry enabled; SAM masks optionally carry scope and label. Project background and notes are optional. The new fields and operations are implemented by the typed client and mock and require the same support in a production backend.

POST `/v1/sessions/:id/assets/add` accepts `{assetIds: string[]}` only after upload completion, returns `{assets: Asset[]}`, and emits `asset.added`. Repeated attachment of the same ID is safe.

`ProjectSync` queues operations only for the soft-locked clip, advances the authoritative version for unrelated operations, and applies deferred operations on release. Removal bypasses a soft lock and exposes recovery. The mock filters agent operations on explicitly locked clips and tracks. Caption text edits preserve timing for matching word counts and redistribute the existing segment interval otherwise.

## Phase 08 — agent feed and interrupts

`agent.message` optionally includes `stream: boolean` and up to four `choices`. Repeated messages with the same ID replace the accumulated text in one entry. `asset.added` optionally includes `actionId`, allowing found images to remain grouped with their originating search after that action completes. These are backwards-compatible schema extensions requiring production-backend agreement.

The existing WebSocket `{t:"interrupt",text}` is acknowledged by `{t:"agent.status",state:"thinking",label:"reading your note"}`. Chat stores the send-to-ack interval, marks pending user messages read, stops the preceding group and prefixes the response group with the return arrow. Attachments are uploaded and attached through Phase 3 before sending; ordinary REST messages include their asset IDs. Pause is a hard stop, and resume continues the mock script. `{t:"retry",actionId}` is a new typed WebSocket command: the mock records and replays the failed tool with a new action ID. Production support needs the same retry semantics.

The mock now keeps successful tool calls open for 140ms, emits progress, then closes them. Only one call is active at once. Pause closes an active call immediately with `ok:false,error:"stopped"` and freezes further script operations. `MOCK_FAIL=action` fails the first action without applying its project operations, allowing repeatable retry tests. It is a mock fault mode, not a production API.

Agent action reversals use the inverse of each applied project batch, in reverse action order, submitted through the existing versioned operations endpoint. They create a user history entry and a system line; they do not add agent changes to ordinary user undo. The feed and audit history live for the mounted Studio session; historical chat restoration is not available in the current snapshot contract.
