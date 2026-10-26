import { KimoClient, serverEventSchema } from '@kimo/client';

const client = new KimoClient(
  process.env.NEXT_PUBLIC_KIMO_API ?? 'http://localhost:8787',
);
const session = await client.createSession({
  prompt: 'make a quiet film with a title, captions and music',
  assetIds: [],
  aspect: '16:9',
});
console.log(`session ${session.sessionId}`);
const ws = new WebSocket(session.wsUrl);
const timeout = setTimeout(() => {
  console.error('Demo timed out');
  ws.close();
  process.exitCode = 1;
}, 120000);
ws.onmessage = (message: MessageEvent<unknown>) => {
  if (typeof message.data !== 'string') return;
  const event = serverEventSchema.parse(JSON.parse(message.data));
  console.log(JSON.stringify(event));
  if (event.t === 'agent.message' && event.kind === 'ask_review') {
    clearTimeout(timeout);
    ws.close();
  }
};
ws.onerror = () => {
  clearTimeout(timeout);
  console.error('WebSocket failed');
  process.exitCode = 1;
};
