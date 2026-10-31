// Phase 7 key lockdown, desktop side: no shared secret in the app; AI steps
// need an owner sign-in (loopback + PKCE) or the user's own key (memory only).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiHeaders, setByok, accessStatus, signIn, signOut, configureAuth, isLockedError, AiLockedError, pkceChallenge, _resetAuth, hasAiAccess } from '../kimo-auth.mjs';

beforeEach(() => _resetAuth());

test('no sign-in and no key: AI is locked locally with a clear message', async () => {
  assert.equal(hasAiAccess(), false);
  await assert.rejects(aiHeaders(), (e) => e instanceof AiLockedError && isLockedError(e) && /your own AI key/.test(e.message));
});

test('the app ships no shared desktop secret', () => {
  for (const f of ['../engine.mjs', '../sam.mjs', '../main.cjs', '../kimo-auth.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/X-Kimo-Desktop/.test(src), `${f} still sends the old shared header`);
    assert.ok(!/META_API_KEY\s*[:=]\s*['"]/.test(src), `${f} embeds a key`);
  }
});

test('BYOK: headers carry the user key; the key is never persisted', async () => {
  const saved = [];
  configureAuth({ store: { load: () => null, save: (t) => saved.push(t), clear: () => saved.push('clear') } });
  setByok({ provider: 'openai', key: 'sk-test-12345678', model: 'gpt-x' });
  const h = await aiHeaders();
  assert.equal(h['X-AI-Key'], 'sk-test-12345678');
  assert.equal(h['X-AI-Provider'], 'openai');
  assert.equal(h.Authorization, undefined);
  assert.deepEqual(accessStatus().byok, { provider: 'openai', model: 'gpt-x', last4: '5678' });
  assert.ok(!JSON.stringify(accessStatus()).includes('sk-test'));
  assert.ok(saved.every((t) => !String(t).includes('sk-test')));
  assert.throws(() => setByok({ provider: 'evil', key: 'abcdefgh1', model: 'm' }));
});

test('owner sign-in: loopback + PKCE code exchange, bearer token, refresh before expiry', async () => {
  let now = 1_000_000;
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/v1/desktop/auth/token')) return Response.json({ access_token: 'acc-1', expires_in: 1800, refresh_token: 'kdr_1', subject: 'github-id:1' });
    if (url.endsWith('/v1/desktop/auth/refresh')) return Response.json({ access_token: 'acc-2', expires_in: 1800, refresh_token: 'kdr_2', subject: 'github-id:1' });
    if (url.endsWith('/v1/desktop/auth/signout')) return new Response(null, { status: 204 });
    return new Response('{}', { status: 404 });
  };
  const store = { text: null, load: () => store.text, save: (t) => (store.text = t), clear: () => (store.text = null) };
  configureAuth({ fetch: fakeFetch, now: () => now, store });
  let started;
  const status = await signIn('github', {
    openExternal: async (url) => {
      started = new URL(url);
      assert.equal(started.pathname, '/v1/desktop/auth/start');
      // the Worker would redirect the browser back to the loopback port
      const back = `http://127.0.0.1:${started.searchParams.get('port')}/callback?state=${started.searchParams.get('state')}&code=one-time-code-123456`;
      setTimeout(() => fetch(back).catch(() => undefined), 10);
    },
  });
  assert.equal(status.owner, true);
  const exchange = calls.find((c) => c.url.endsWith('/auth/token'));
  assert.equal(exchange.body.code, 'one-time-code-123456');
  assert.equal(pkceChallenge(exchange.body.verifier), started.searchParams.get('challenge'));
  assert.deepEqual(await aiHeaders(), { Authorization: 'Bearer acc-1' });
  assert.ok(store.text.includes('kdr_1') && !store.text.includes('acc-1'), 'only the refresh token is kept');
  now += 1800 * 1000; // expired → refresh rotates
  assert.deepEqual(await aiHeaders(), { Authorization: 'Bearer acc-2' });
  await signOut();
  assert.equal(store.text, null);
  await assert.rejects(aiHeaders(), AiLockedError);
});

test('a non-allowlisted sign-in comes back as a locked error, not a crash', async () => {
  configureAuth({ fetch: async () => new Response('{}', { status: 500 }) });
  await assert.rejects(
    signIn('google', {
      openExternal: async (url) => {
        const u = new URL(url);
        setTimeout(() => fetch(`http://127.0.0.1:${u.searchParams.get('port')}/callback?state=${u.searchParams.get('state')}&error=not_allowed`).catch(() => undefined), 10);
      },
    }),
    (e) => isLockedError(e),
  );
});
