import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateUpload,
  initialWarmup,
  updateWarmup,
} from '../lib/warmup/state';
import { WarmupConnection } from '../lib/warmup/connection';
import type { UploadItem } from '../lib/uploads/types';

describe('warm-up progress', () => {
  it('maps probe and watch, never regresses, and recognizes the first action', () => {
    const watching = updateWarmup(initialWarmup, {
      t: 'warmup.step',
      step: 'probe',
      pct: 0.4,
      clipIndex: 1,
      clipCount: 3,
    });
    expect(watching).toMatchObject({
      step: 'watch',
      clipIndex: 1,
      clipCount: 3,
    });
    expect(
      updateWarmup(watching, { t: 'warmup.step', step: 'upload', pct: 0.1 })
        .step,
    ).toBe('watch');
    expect(
      updateWarmup(watching, {
        t: 'agent.action.start',
        id: 'a',
        tool: 'cut',
        title: 'cut',
        args: {},
      }).step,
    ).toBe('ready');
    expect(
      updateWarmup(watching, {
        t: 'error',
        code: 'failed',
        message: 'server failed',
      }).error,
    ).toBe('server failed');
  });
  it('weights upload progress by bytes, not file count', () => {
    const item = (
      size: number,
      bytesSent: number,
      status: UploadItem['status'],
    ): UploadItem => ({
      localId: String(size),
      file: new File(['x'.repeat(size)], 'x.txt'),
      kind: 'doc',
      status,
      progress: 0,
      bytesSent,
      meta: {},
    });
    expect(
      aggregateUpload(
        [item(100, 50, 'uploading'), item(300, 300, 'done')],
        false,
        0,
      ),
    ).toBe(0.875);
    expect(aggregateUpload([], true, 0)).toBe(1);
    expect(aggregateUpload([], false, 0.4)).toBe(0.4);
  });
});

describe('warm-up socket recovery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('retries after 2, 4 and 8 seconds and reports exhaustion', () => {
    vi.useFakeTimers();
    class Socket {
      static CLOSING = 2;
      static instances: Socket[] = [];
      readyState = 1;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        Socket.instances.push(this);
      }
      close() {
        this.readyState = 3;
      }
    }
    vi.stubGlobal('WebSocket', Socket);
    const failed = vi.fn();
    const connection = new WarmupConnection('ws://localhost', vi.fn(), failed);
    connection.start();
    for (const delay of [2000, 4000, 8000]) {
      Socket.instances.at(-1)?.onclose?.();
      vi.advanceTimersByTime(delay - 1);
      expect(Socket.instances).toHaveLength(
        [2000, 4000, 8000].indexOf(delay) + 1,
      );
      vi.advanceTimersByTime(1);
    }
    expect(Socket.instances).toHaveLength(4);
    Socket.instances.at(-1)?.onclose?.();
    expect(failed).toHaveBeenCalledOnce();
    connection.dispose();
  });
});
