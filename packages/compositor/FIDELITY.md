# Preview fidelity

The preview is a browser-side approximation, not a server-render comparison. The server rendering equations and reference frames are not supplied, so exact parity cannot yet be claimed.

- Timeline positions and keyframes use seconds. A visible clip samples its source at `in + (time - start) * speed`; clips use a half-open time interval. Transform keyframes support linear, cubic easing, hold and cubic Bezier interpolation. Positions are project-space pixels.
- Incoming and outgoing cross-dissolves, dip to black, slides and zoom-in use the progress of the corresponding transition. The existing project contract stores transition duration in seconds, rather than frames.
- Browser grading applies exposure, contrast, saturation, temperature/tint gains and per-channel lift/gamma/gain in a fragment shader; black and white uses Pixi matrices. The named LUT choices are immediate preset approximations, not engine 3D LUT assets, and show `preview approx.`. Blur/noise use Pixi filters; vignette/sharpen use browser shaders. Engine parity is unverified.
- Image and video mask textures can be inverted and feathered. Subject/background effect scope composites a filtered masked layer over the unfiltered source. Per-frame RLE masks remain unimplemented. Simultaneous crop and mask is approximate.
- Video elements are pooled per clip and pre-rolled, with frame presentation held while a needed frame is loading. This reduces black flashes; one-frame A/V synchronization has not been measured against a reference.
- Audio is scheduled with Web Audio. Voice activity ducks music by 12 dB with a 300 ms smoothing constant. The current contract has mute but no solo field. Decoding or browser autoplay restrictions can delay audio.
- Eight named text styles are supplied. Font metrics and line wrapping are browser-dependent. Word highlights use available caption timing data; text formatting and animations are editable, while exact server typography parity remains unverified.
- Uploaded filmstrips and waveforms are read from the existing IndexedDB cache when available; otherwise browser extraction is used. Generated filmstrip extraction currently runs on the main thread rather than in a worker.
- The debug latency measures receipt to render submission using browser clocks. It is not a hardware display-presentation measurement.

Phase 7 adds audio gain envelopes, real analyser metering and media-element pitch preservation. Independent pitch preservation for retimed decoded AudioBuffer audio still depends on an engine-grade time-stretch implementation; its stored keepPitch setting is sent to the backend.
