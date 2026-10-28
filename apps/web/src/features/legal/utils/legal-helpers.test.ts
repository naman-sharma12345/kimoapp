import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildSectionAnchorUrl,
  calculateReadingProgress,
  hasStatesParam,
  parseInlineLinks,
  resolveDocFromPath,
  resolveLegalContent,
} from './legal-helpers';
import { LEGAL_CONTENT_MAP, PRIVACY_CONTENT, TERMS_CONTENT } from '../content';

test('calculateReadingProgress clamps between 0 and 1 accurately', () => {
  assert.equal(calculateReadingProgress(0, 2000, 1000), 0);
  assert.equal(calculateReadingProgress(500, 2000, 1000), 0.5);
  assert.equal(calculateReadingProgress(1000, 2000, 1000), 1);
  assert.equal(calculateReadingProgress(1500, 2000, 1000), 1);
  assert.equal(calculateReadingProgress(-50, 2000, 1000), 0);
  assert.equal(calculateReadingProgress(0, 800, 1000), 0);
});

test('resolveDocFromPath maps /terms to terms and everything else to privacy', () => {
  assert.equal(resolveDocFromPath('/terms'), 'terms');
  assert.equal(resolveDocFromPath('/terms/'), 'terms');
  assert.equal(resolveDocFromPath('/privacy'), 'privacy');
  assert.equal(resolveDocFromPath('/'), 'privacy');
});

test('hasStatesParam detects ?states=1 strictly', () => {
  assert.equal(hasStatesParam('?states=1'), true);
  assert.equal(hasStatesParam('?foo=bar&states=1'), true);
  assert.equal(hasStatesParam('?states=0'), false);
  assert.equal(hasStatesParam(''), false);
});

test('resolveLegalContent supports both single LegalContent and LegalContentMap', () => {
  assert.equal(
    resolveLegalContent('privacy', PRIVACY_CONTENT).title,
    'privacy',
  );
  assert.equal(
    resolveLegalContent('privacy', LEGAL_CONTENT_MAP).title,
    'privacy',
  );
  assert.equal(resolveLegalContent('terms', LEGAL_CONTENT_MAP).title, 'terms');
  assert.equal(TERMS_CONTENT.sections.length, 10);
  assert.equal(PRIVACY_CONTENT.sections.length, 11);
  // The privacy page must name what is actually built and the user's rights.
  const privacy = JSON.stringify(PRIVACY_CONTENT);
  for (const fact of [
    'cloudflare d1',
    'kimo_session',
    '30 days',
    'export my data',
    'grievance',
    'digital personal data protection act, 2023',
    'gdpr',
    'namanthesharma123@gmail.com',
  ])
    assert.ok(privacy.includes(fact), fact);
  assert.ok(!privacy.includes('cloudflare r2 and'), 'no stale r2 claim');
  assert.ok(PRIVACY_CONTENT.sections.some((s) => s.id === 'cookies'));
});

test('buildSectionAnchorUrl formats clean section anchor URLs', () => {
  assert.equal(
    buildSectionAnchorUrl(
      'https://app.getkimo.tech/',
      'privacy',
      'what-we-collect',
    ),
    'https://app.getkimo.tech/privacy#what-we-collect',
  );
  assert.equal(
    buildSectionAnchorUrl(
      'http://localhost:3000',
      'terms',
      'open-source',
      '?states=1',
    ),
    'http://localhost:3000/terms?states=1#open-source',
  );
});

test('parseInlineLinks extracts mailto, internal, and github links accurately', () => {
  const emailParsed = parseInlineLinks(
    'contact us at hello@getkimo.tech anytime.',
  );
  assert.equal(emailParsed.length, 3);
  assert.deepEqual(emailParsed[1], {
    type: 'link',
    text: 'hello@getkimo.tech',
    href: 'mailto:hello@getkimo.tech',
    external: false,
  });

  const ghParsed = parseInlineLinks(
    'the kimo engine is open source on github at github.com/naman-sharma12345/kimo.',
  );
  assert.equal(
    ghParsed.some(
      (s) =>
        s.type === 'link' &&
        s.href === 'https://github.com/naman-sharma12345/kimo',
    ),
    true,
  );

  const accountParsed = parseInlineLinks('delete account from /account.');
  assert.equal(
    accountParsed.some((s) => s.type === 'link' && s.href === '/account'),
    true,
  );
});
