// Read-only hosting capability check. Never serialize credentials or account members.
import { writeFile, mkdir } from 'node:fs/promises';
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw Error('Cloudflare token unavailable');
async function get(path) {
  const r = await fetch('https://api.cloudflare.com/client/v4' + path, {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json();
  return {
    status: r.status,
    success: j.success,
    errors: (j.errors ?? []).map((e) => ({ code: e.code, message: e.message })),
    result: j.result,
  };
}
const accounts = await get('/accounts'),
  zones = await get('/zones?name=getkimo.tech');
const selected = accounts.success
  ? accounts.result.map((a) => ({ id: a.id, name: a.name }))
  : [];
if (!selected.length)
  selected.push({
    id: 'b29c220cfa40ee9d5371b8999294b457',
    name: 'repository-configured account',
  });
const r2 = [];
for (const a of selected) {
  const buckets = await get(`/accounts/${a.id}/r2/buckets`);
  r2.push({
    account: a,
    status: buckets.status,
    success: buckets.success,
    errors: buckets.errors,
    buckets: buckets.success ? buckets.result : undefined,
  });
}
const report = {
  at: new Date().toISOString(),
  accounts: {
    status: accounts.status,
    success: accounts.success,
    errors: accounts.errors,
  },
  zones: {
    status: zones.status,
    success: zones.success,
    errors: zones.errors,
    result: zones.success
      ? zones.result.map((z) => ({
          id: z.id,
          name: z.name,
          status: z.status,
          account: z.account?.id,
        }))
      : undefined,
  },
  r2,
};
await mkdir('distribution-evidence', { recursive: true });
await writeFile(
  'distribution-evidence/hosting-preflight.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
