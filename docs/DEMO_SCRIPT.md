# Three-minute desktop demo recording guide

Status: the submission video has not been recorded yet. This is a shot list for
recording the real Windows app, not a link to a completed demo.

## Prepare the real app

1. Install the current Windows release and use the actual desktop app with a
   working Meta connection. Confirm the active models are Muse Spark 1.3 and
   SAM 3.1. Keep keys, account details and private projects out of the recording.
2. Use a short talking-head clip you own or have permission to publish. Prepare
   a real completed creator edit and a real SAM subject-effect result from that
   footage. Keep the input, plan, review and output from the same edit together.
3. Choose clean shorts, set **length target** to **30**, and use a concrete prompt:
   "Make a 30-second short. Keep the clearest explanation, remove repeated takes
   and silence, add readable captions and quiet background music."
4. Verify the complete timeline is about 30 seconds before exporting. At 30 fps,
   30 seconds is 900 frames. The source-player duration is not the timeline length.
5. Rehearse with the real saved outputs. A cached replay must be identified as
   replaying an earlier real run. A deterministic fallback must be identified as
   a fallback; it does not demonstrate a successful Muse Spark call.

Do not run `pnpm dev:mock`, use the renderer's dev mock, or use fixture videos as
proof of real model output. The historical web UI recordings remain development
artifacts and are not the hackathon submission video.

## Shot list (3:00)

| Time      | Show                                                                                                           | Narration / evidence                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:18 | Original footage, then a short excerpt of the actual exported result.                                          | "kimo turns a prompt and footage into an editable video. This is the original and the real output."                                     |
| 0:18–0:40 | Desktop template picker, 30-second length target and the edit prompt.                                          | "I choose the style and target length. The app keeps an editable timeline rather than returning only a finished file."                  |
| 0:40–1:05 | Real planner activity and the resulting cuts, captions, music and camera choices.                              | "Meta Muse Spark 1.3 plans the edit from the prompt and footage context. The validated plan becomes timeline operations."               |
| 1:05–1:30 | A real SAM run/result: select "follow subject" or another supported subject effect, and compare source/result. | "Meta SAM 3.1 segments and tracks the subject for reframing and effects. This is a requested effect, not a call made on every edit."    |
| 1:30–1:55 | Edit a caption or camera choice in Studio; show undo/redo and preview the change.                              | "The AI result remains editable. I can correct text and framing directly."                                                              |
| 1:55–2:25 | The actual critic review, any valid proposed correction, and the corresponding rendered result.                | "Muse Spark also critiques rendered frames and measurements. kimo applies bounded corrections and reports unavailable checks honestly." |
| 2:25–2:50 | Verified timeline duration, actual export progress, then open and play the resulting MP4.                      | "Whisper transcription and video rendering run locally. This is the real exported file."                                                |
| 2:50–3:00 | Final output and the repository/download page.                                                                 | "The app and creator pipeline were built October 26–November 4, 2026. The earlier open-source kimo engine is a dependency."             |

If a step takes longer, speed up or cut the waiting interval and label it
"sped up" or "time elapsed". The three-minute recording is a presentation length,
not a promise that inference or export finishes in three minutes. If the critic
proposes no correction, show that outcome rather than inventing one. Show an
export's actual resolution, duration and result; do not imply a preview is a
completed final export.

## Publish

Upload the recording to a publicly viewable video page, verify it plays while
signed out, and replace the pending-demo line near the top of the root README
with the real link and runtime. Include footage credits and disclose sped-up
intervals, cache replay or deterministic fallback in the video description.
