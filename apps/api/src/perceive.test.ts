import { describe, expect, it } from 'vitest';
import { requestPerception, type AiConfig } from './ai.ts';

const config: AiConfig = {
  source: 'kimo',
  provider: 'meta',
  wire: 'openai',
  key: 'k',
  baseUrl: 'https://api.meta.ai/v1',
  model: 'muse-spark-1.2-contributor',
};

describe('look-and-listen pass', () => {
  it('sends frames and sound as content parts and keeps only clean text notes', async () => {
    let sent: { messages: { content: { type: string }[] }[] } | undefined;
    const fetcher = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'a talk to camera',
                  scenes: [
                    { t: 1, note: 'close up' },
                    { t: 99, note: 'too late' },
                  ],
                  words: [
                    { t: 0.5, d: 0.6, w: 'hey guys' },
                    { t: -1, d: 1, w: 'bad' },
                  ],
                }),
              },
            },
          ],
        }),
      );
    }) as typeof fetch;
    const notes = await requestPerception(config, fetcher, {
      durationSec: 10,
      audio: 'UklGRg==',
      frames: [{ t: 1, image: 'data:image/jpeg;base64,AAAA' }],
    });
    const types = sent?.messages[0]?.content.map((part) => part.type);
    expect(types).toContain('image_url');
    expect(types).toContain('input_audio');
    expect(notes).toEqual({
      summary: 'a talk to camera',
      scenes: [{ t: 1, note: 'close up' }],
      words: [{ t: 0.5, d: 0.6, w: 'hey guys' }],
    });
  });
});
