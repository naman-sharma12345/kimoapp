// Protect existing DNS/services: this distribution deployment may only create
// the dedicated unused hostname, or update its own kimo-downloads Worker.
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
async function get(path) {
  const res = await fetch('https://api.cloudflare.com/client/v4' + path, {
    headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN },
  });
  const j = await res.json();
  if (!res.ok || !j.success)
    throw Error(`Hosting preflight failed: ${JSON.stringify(j.errors)}`);
  return j.result;
}
const zones = await get('/zones?name=getkimo.tech');
if (zones.length !== 1 || zones[0].account.id !== account)
  throw Error('Wrong hosting account/zone');
const domains = await get(`/accounts/${account}/workers/domains`);
const existing = domains.find((d) => d.hostname === 'downloads.getkimo.tech');
if (existing && existing.service !== 'kimo-downloads')
  throw Error('Download hostname already belongs to another service');
const records = await get(
  `/zones/${zones[0].id}/dns_records?name=downloads.getkimo.tech`,
);
if (records.length && !existing)
  throw Error('Download hostname already has unrelated DNS records');
console.log(
  'Dedicated installer hostname is safe to deploy; existing web/API services are untouched',
);
