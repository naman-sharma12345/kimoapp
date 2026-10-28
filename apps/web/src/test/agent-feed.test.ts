import { describe, it, expect } from 'vitest';
import { AgentFeed } from '../lib/agent-feed';
import { agentLabel } from '../lib/agentLabels';
describe('agent feed', () => {
  it('groups consecutive actions and separates responses to an interrupt', () => {
    const feed = new AgentFeed();
    feed.receive({
      t: 'agent.action.start',
      id: 'one',
      tool: 'trim_clip',
      title: 'trim a shot',
      args: {},
      target: { clipId: 'clip' },
    });
    feed.receive({
      t: 'agent.action.end',
      id: 'one',
      ok: true,
      durationMs: 100,
    });
    feed.receive({
      t: 'agent.action.start',
      id: 'two',
      tool: 'color_grade',
      title: 'grade it',
      args: {},
    });
    expect(
      feed.getSnapshot().entries.filter((entry) => entry.type === 'group'),
    ).toHaveLength(1);
    feed.user('make it slower', [], true);
    feed.receive({
      t: 'agent.status',
      state: 'thinking',
      label: 'reading your note',
    });
    expect(
      feed
        .getSnapshot()
        .entries.some((entry) => entry.type === 'user' && entry.read),
    ).toBe(true);
    expect(
      feed
        .getSnapshot()
        .entries.some((entry) => entry.type === 'group' && entry.stopped),
    ).toBe(true);
    feed.receive({
      t: 'agent.action.start',
      id: 'three',
      tool: 'move_clip',
      title: 'move it',
      args: {},
    });
    expect(
      feed
        .getSnapshot()
        .entries.some((entry) => entry.type === 'group' && entry.response),
    ).toBe(true);
  });
  it('updates stream messages by id, groups web assets per action and exposes failures', () => {
    const feed = new AgentFeed();
    feed.receive({
      t: 'agent.message',
      id: 'message',
      role: 'agent',
      kind: 'say',
      text: 'hello',
      stream: true,
    });
    feed.receive({
      t: 'agent.message',
      id: 'message',
      role: 'agent',
      kind: 'say',
      text: 'hello there',
      stream: true,
    });
    expect(feed.getSnapshot().entries).toHaveLength(1);
    for (const id of ['image-one', 'image-two'])
      feed.receive({
        t: 'asset.added',
        actionId: 'search',
        asset: {
          id,
          kind: 'image',
          name: id,
          url: 'https://example.com/image.png',
          source: 'web',
        },
      });
    expect(
      feed.getSnapshot().entries.find((entry) => entry.type === 'images'),
    ).toMatchObject({ assets: [{ id: 'image-one' }, { id: 'image-two' }] });
    feed.receive({
      t: 'agent.action.start',
      id: 'fail',
      tool: 'sam_segment',
      title: 'select person',
      args: {},
    });
    feed.receive({
      t: 'agent.action.end',
      id: 'fail',
      ok: false,
      durationMs: 100,
      error: 'failed mask',
    });
    expect(feed.getSnapshot().actions.fail?.status).toBe('failed');
    expect(feed.getSnapshot().entries.at(-1)).toMatchObject({
      type: 'error',
      text: 'failed mask',
      actionId: 'fail',
    });
  });
  it('maps friendly labels and keeps a safe fallback', () => {
    expect(agentLabel('trim_clip', {}, 'beach_02')).toBe('trimming beach_02');
    expect(agentLabel('sam_segment', { label: 'person' })).toBe(
      'finding the person with sam 3.1',
    );
    expect(agentLabel('custom_tool')).toBe('custom tool');
  });
});
