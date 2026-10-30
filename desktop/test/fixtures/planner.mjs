// Deterministic MCP toolbox fixture: any attempt to render picture here is an error.
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const source = process.env.KIMO_TEST_SOURCE;
let project = {
  width: 192,
  height: 128,
  fps: 25,
  assets: {
    s1: {
      id: 's1',
      path: source,
      width: 192,
      height: 128,
      duration: 1,
      fps: 25,
    },
  },
  editorial: { captions: { cap: { clips: ['caption'] } } },
  tracks: [
    {
      id: 'V1',
      clips: [
        {
          id: 'clip1',
          source: { type: 'media', asset: 's1' },
          start: 0,
          duration: 1,
          in_point: 0,
          speed: 1,
          props: { fit: { base: 1 } },
          audio: { volume: { base: 1 } },
        },
      ],
    },
    {
      id: 'T1',
      clips: [
        {
          id: 'caption',
          source: {
            type: 'text',
            text: 'caption fixture',
            font: 'Arial',
            size: 16,
            color: [1, 1, 1],
          },
          start: 0.1,
          duration: 0.6,
          props: { y: { base: 20 } },
        },
      ],
    },
  ],
};
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  let result = {};
  if (request.method === 'initialize')
    result = {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'test-planner', version: '1' },
    };
  else if (request.method === 'tools/list') result = { tools: [] };
  else if (request.method === 'tools/call') {
    const { name, arguments: a } = request.params;
    appendFileSync(
      process.env.KIMO_TEST_LOG,
      JSON.stringify({ name, args: a }) + '\n',
    );
    try {
      if (
        ['export', 'render_frame', 'contact_sheet', 'lint_edit'].includes(name)
      )
        throw Error('Native picture renderer must never be called');
      let value = { ok: true };
      if (name === 'save_project')
        writeFileSync(a.path, JSON.stringify(project));
      if (name === 'load_project') project = JSON.parse(readFileSync(a.path));
      if (name === 'project_set')
        Object.assign(project, {
          width: a.width,
          height: a.height,
          fps: a.fps,
        });
      if (name === 'import_media')
        value = { asset_id: 's1', duration: 1, fps: 25 };
      if (name === 'add_track') value = { track_id: 'V1' };
      if (name === 'add_clip') value = { clip_id: 'clip1' };
      if (name === 'timeline_summary')
        value = {
          duration: 1,
          tracks_bottom_to_top: project.tracks.map((t) => ({
            track_id: t.id,
            clips: t.clips.map((c) => ({
              id: c.id,
              src: c.source.type === 'text' ? 'text: ' + c.source.text : source,
              start: c.start,
              end: c.start + c.duration,
              in: c.in_point,
            })),
          })),
        };
      result = { content: [{ type: 'text', text: JSON.stringify(value) }] };
    } catch (error) {
      result = {
        isError: true,
        content: [{ type: 'text', text: error.message }],
      };
    }
  }
  if (request.id != null)
    process.stdout.write(
      JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n',
    );
}
