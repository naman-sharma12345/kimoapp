import manifest from './assets/manifest.json';
import { createHandler } from './stream.mjs';

// FixedLengthStream is a Workers native stream: exact Content-Length and
// backpressure without accumulating a 369 MB response in the 128 MB isolate.
export default {
  fetch: createHandler(manifest, (length) => new FixedLengthStream(length)),
};
