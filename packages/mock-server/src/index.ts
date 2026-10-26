import { createMockServer } from './server.ts';

const mock = createMockServer({
  port: Number(process.env.MOCK_PORT ?? 8787),
  speed: Number(process.env.MOCK_SPEED ?? 1),
  fail: process.env.MOCK_FAIL,
});
console.log(`kimo mock ready at ${await mock.start()}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void mock.close().then(() => process.exit(0));
  });
