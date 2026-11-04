KimoApp v6 -> kimo core-engine v8.12.1: tool-compat audit
==========================================================

Method: started kimo-mcp (the built v8.12.1 Linux binary at
/home/user/kimo_target_core/gate/kimo-mcp, read-only, never rebuilt) over
real MCP stdio (initialize + tools/list, both flat and grouped/"director"
mode). Note: this binary's serverInfo.commit reads "d4aa6a6d3880-dirty"
(V8.12.0's commit, not 9292a51/V8.12.1's caption face-avoidance commit) --
flagging this as a caveat; its registry is still the right one to diff
against since no core-engine command/schema changed between d4aa6a6 and
9292a51 (that commit only touched crates/kimo-core/src/ext/caption_engine.rs
and its own test file, confirmed via git diff --stat 9292a51^..9292a51
reading no commands/tools_0.rs or director_tools.rs change).
v6's registry: crates/kimo-core/tests/golden/golden_registry.txt and tool
source at tag v6.0.0 (3621dcf), read via `git show`, never built.

PROTOCOL / ENV
- MCP protocolVersion: unchanged ("2024-11-05").
- schema_version: 1 (v6) -> 2 (v8.12.1). KimoApp never reads schema_version
  anywhere (grep: no hits) -- not a compat issue today, but the app also
  never tells the engine which schema it was written for; a future app
  change that starts checking it should know the number moved.
- tools/list now defaults to a grouped "director profile" (17 entries:
  project, timeline, animate, effects, masks, text, graphics, vfx3d,
  tracking, color_grade, color_science, scopes, audio, output,
  search_tools, kimo_describe, kimo_enable_group) instead of v6's flat
  list. KIMO_TOOLS=flat (or {"mode":"flat"} on the tools/list call) lists
  all 539 individually. NOT an app break: KimoApp's Mcp class never calls
  tools/list at all -- it calls every tool directly by name
  (mcp.call(name, args)), and the engine's own comment confirms "every
  tool stays callable by name either way" regardless of which list mode is
  active. No fix needed; noted for completeness per the brief.
- KIMO_SPECTATOR, KIMO_FONTS, KIMO_MODELS, KIMO_WHISPER_*: unchanged
  defaults/semantics between v6 and v8.12.1 on the engine side; KimoApp's
  own usage of these (KIMO_FONTS passed to pictureTools/samEffect,
  KIMO_WHISPER_BIN/MODEL for the app's OWN separate whisper path, KIMO_
  MODELS/KIMO_SPECTATOR never set by the app at all) is unaffected.

TOOL REGISTRY, WHOLE-APP SURFACE (539 v8.12.1 tools vs 452 in v6's golden
registry): 0 removed, 0 renamed, 87 new. Every one of the 452 v6 tool names
still exists in v8.12.1.

TOOLS KIMOAPP ACTUALLY CALLS ON kimo-mcp (engine.mjs ENGINE_TOOLS, plus
export/render_frame which the app calls directly without exposing them to
the AI model):

tool               | v6->v8.12.1 schema hash | verdict
-------------------+-------------------------+----------------------------
project_set        | CHANGED                 | additive only (new optional
                    |                         | linear_blend, x264_preset,
                    |                         | color_tag_sanity,
                    |                         | frame_blend_conform,
                    |                         | adaptive_denoise,
                    |                         | hdr_tonemap). App's call
                    |                         | (width/height/fps only)
                    |                         | unaffected. No fix needed.
import_media       | unchanged               | --
auto_rough_cut      | unchanged               | --
cut_to_beat         | unchanged               | --
auto_grade          | unchanged               | --
add_title           | unchanged               | --
add_text            | unchanged               | --
add_glow_text       | unchanged               | --
auto_captions       | unchanged               | --
caption_from_words  | unchanged               | --
edit_caption        | unchanged               | --
finish_audio        | CHANGED                 | REAL BREAK (fixed, see
                    |                         | below): v6 always ran a
                    |                         | fixed 3:1 dialogue
                    |                         | compressor; v8.12.1 adds
                    |                         | compress_strength
                    |                         | (default 0.0 = OFF). The
                    |                         | app's 3 finish_audio call
                    |                         | sites never set it, so
                    |                         | updating the engine alone
                    |                         | would silently drop
                    |                         | dialogue compression on
                    |                         | every render. FIXED:
                    |                         | engine.mjs's 3 call sites
                    |                         | now pass
                    |                         | compress_strength: 1 to
                    |                         | keep the old fixed-3:1
                    |                         | behaviour. v8.12.1 also
                    |                         | adds level_dynamics
                    |                         | (gentle speech leveling,
                    |                         | default true) and
                    |                         | match_strength (default
                    |                         | 1.0) -- new, no v6
                    |                         | equivalent, left at their
                    |                         | new defaults (a net
                    |                         | improvement, not a
                    |                         | regression) rather than
                    |                         | pinned off.
lint_edit           | unchanged               | --
timeline_summary    | unchanged               | --
add_track           | unchanged               | --
add_clip            | CHANGED                 | additive only (new
                    |                         | optional mode: "insert"|
                    |                         | "overwrite", ripple_tracks;
                    |                         | omitted = "exactly as
                    |                         | before" per the engine's
                    |                         | own doc string). App's
                    |                         | calls (no mode set) are
                    |                         | unaffected. No fix needed;
                    |                         | flagged below as
                    |                         | new-and-useful.
trim_clip           | unchanged               | --
move_clip           | unchanged               | --
delete_clip         | unchanged               | --
set_property        | unchanged               | --
set_audio           | CHANGED                 | additive only (new
                    |                         | optional compress_amount,
                    |                         | speech_level; old compress
                    |                         | boolean behaviour
                    |                         | preserved by its own
                    |                         | default). No fix needed.
auto_reframe        | unchanged               | --
stabilize           | unchanged               | --
undo                | unchanged               | --
export              | unchanged               | --
render_frame        | unchanged               | --

sam_reframe / sam_text_behind / sam_background / sam_redact: these never
reach kimo-mcp -- engine.mjs intercepts SAM_TOOLS and routes them to the
app's own sam.mjs (Meta SAM 3.1 proxy), so kimo-mcp's registry is
irrelevant to them.

NEW-AND-USEFUL (not wired into the app, no fix required, worth Naman's
attention): caption_engine_compose (V8.12.0's real caption engine, spec-
driven timing/layout/style/emphasis -- KimoApp still drives the app's own
desktop/captions.mjs preset system, unaware this exists), add_clip's new
insert/overwrite edit modes, set_audio's speech_level (gentle automatic
speech leveling per clip, independent of finish_audio's own leveling),
hdr_tonemap/color_tag_sanity/adaptive_denoise/frame_blend_conform on
project_set (the app currently never sets any of these explicitly -- they
ride the engine's own per-project defaults).
