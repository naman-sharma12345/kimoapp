import { serverEventSchema, type ServerEvent } from '@kimo/client';

export const RECONNECT_DELAYS = [2000, 4000, 8000] as const;
export class WarmupConnection {
  private socket: WebSocket | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  private stopped = false;
  private waitingOnline = false;
  constructor(
    private readonly url: string,
    private readonly onEvent: (event: ServerEvent) => void,
    private readonly onFailure: () => void,
  ) {}
  start() {
    window.addEventListener('online', this.online);
    this.open();
  }
  private online = () => {
    if (this.waitingOnline && !this.stopped) {
      this.waitingOnline = false;
      this.open();
    }
  };
  private open() {
    if (this.stopped) return;
    if (!navigator.onLine) {
      this.waitingOnline = true;
      return;
    }
    try {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.onmessage = (message: MessageEvent<unknown>) => {
        try {
          if (typeof message.data !== 'string')
            throw new Error('Invalid event');
          const event = serverEventSchema.parse(JSON.parse(message.data));
          if (event.t !== 'hello') this.retries = 0;
          this.onEvent(event);
        } catch {
          this.dispose();
          this.onFailure();
        }
      };
      socket.onclose = () => {
        if (!this.stopped) this.reconnect();
      };
      socket.onerror = () => {
        /* A failed browser socket always follows with close. */
      };
    } catch {
      this.reconnect();
    }
  }
  private reconnect() {
    if (this.stopped) return;
    if (!navigator.onLine) {
      this.waitingOnline = true;
      return;
    }
    const delay = RECONNECT_DELAYS[this.retries++];
    if (delay === undefined) {
      this.dispose();
      this.onFailure();
      return;
    }
    this.timer = setTimeout(() => this.open(), delay);
  }
  dispose() {
    this.stopped = true;
    window.removeEventListener('online', this.online);
    if (this.timer) clearTimeout(this.timer);
    if (this.socket && this.socket.readyState < WebSocket.CLOSING)
      this.socket.close(1000, 'warmup closed');
  }
}
export function sessionSocketUrl(sessionId: string, supplied?: string) {
  if (supplied) return supplied;
  const url = new URL(
    new URL(
      '/v1/sessions/' + encodeURIComponent(sessionId) + '/ws',
      process.env.NEXT_PUBLIC_KIMO_API ?? 'http://localhost:8787',
    ),
  );
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
