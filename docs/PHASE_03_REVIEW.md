# Phase 3 and Phase 2 polish review

| Before                                               | After                                                         | Why                                               |
| ---------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| Composer-owned uploads disappeared with route state  | Shared root manager with IndexedDB recovery                   | Uploads survive navigation and refresh            |
| All selected files uploaded at once                  | Three files, smallest first; four parts per multipart file    | Bound network and memory use                      |
| Large files hit the mock's 100 MiB cap               | Streamed 16 MiB multipart transfers and verified assembly     | Exercise the actual production-facing file limits |
| Failed requests required starting over               | Part backoff, explicit retry, offline resume and URL renewal  | Keep completed work and the original asset IDs    |
| Browser previews were transient                      | Cached thumbnails, eight filmstrip frames and waveform arrays | Make media data available to the future timeline  |
| Approximate CSS spring entrances                     | Specified soft/snappy spring presets                          | Match the supplied motion values                  |
| Double outline inside the composer                   | Outer composer focus treatment only                           | Preserve the user's explicit Phase 2 correction   |
| Unknown session links showed generic foundation copy | Exact Phase 3 error and not-found copy                        | Make recovery actions understandable              |

The Phase 0 visual language is preserved. Queued/reading metadata retains the documented cream-60 accessibility correction. The studio/render/delivery handoffs are intentionally limited to the Phase 3 restore contract; their full product scenes belong to later phases.
