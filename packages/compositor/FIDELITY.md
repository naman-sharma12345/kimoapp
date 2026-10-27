# Preview fidelity

The preview is a browser-side approximation, not a server-render comparison. The server rendering equations and reference frames are not supplied, so exact parity cannot yet be claimed.

- Timeline positions and keyframes use seconds. A visible clip samples its source at `in + (time - start) * speed`; clips use a half-open time interval. Transform keyframes support linear, cubic easing, hold and cubic Bezier interpolation. Positions are project-space pixels.
- Incoming and outgoing cross-dissolves, dip to black, slides and zoom-in use the progress of the corresponding transition. The existing project contract stores transition duration in seconds, rather than frames.
- Pixi color matrices approximate exposure as `2 ** exposure`, contrast and saturation; black and white uses Pixi's matrix. Blur and noise use Pixi filters. Vignette and sharpen use browser shaders. These choices are not verified against the engine. Temperature, tint, lift/gamma/gain, LUTs, whip blur and other unsupported effects are indicated with `preview approx.` rather than claimed as exact.
- Image and video mask textures can be inverted and feathered. Per-frame RLE masks and applying an effect selectively inside or outside a mask are not implemented. Simultaneous crop and mask is approximate.
- Video elements are pooled per clip and pre-rolled, with frame presentation held while a needed frame is loading. This reduces black flashes; one-frame A/V synchronization has not been measured against a reference.
- Audio is scheduled with Web Audio. Voice activity ducks music by 12 dB with a 300 ms smoothing constant. The current contract has mute but no solo field. Decoding or browser autoplay restrictions can delay audio.
- Eight named text styles are supplied. Font metrics and line wrapping are browser-dependent. Word highlights use available caption timing data; some server layout and text editing behaviors remain future work.
- Uploaded filmstrips and waveforms are read from the existing IndexedDB cache when available; otherwise browser extraction is used. Generated filmstrip extraction currently runs on the main thread rather than in a worker.
- The debug latency measures receipt to render submission using browser clocks. It is not a hardware display-presentation measurement.
