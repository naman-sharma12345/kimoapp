import { readJson, writeJson, isMain, options } from './io.mjs';

// Snapshots are cumulative; summing duplicates spends, replacing can reset it.
export function mergeLedger(current, seed) {
  for (const ledger of [current, seed]) {
    if (
      !Number.isFinite(ledger.reservedUsd) ||
      ledger.reservedUsd < 0 ||
      !Number.isInteger(ledger.networkRequests) ||
      ledger.networkRequests < 0
    )
      throw new Error('Invalid spending ledger snapshot');
  }
  const higher = current.reservedUsd >= seed.reservedUsd ? current : seed;
  return {
    ...higher,
    reservedUsd: Math.max(current.reservedUsd, seed.reservedUsd),
    networkRequests: Math.max(current.networkRequests, seed.networkRequests),
    requestCountIsMinimum: Boolean(
      current.requestCountIsMinimum || seed.requestCountIsMinimum,
    ),
    authorizedUsd: current.authorizedUsd ?? seed.authorizedUsd,
    authorization: current.authorization ?? seed.authorization,
  };
}
if (isMain(import.meta.url)) {
  const args = options(process.argv.slice(2));
  const seed = await readJson(args.seed),
    current = await readJson(args.current);
  await writeJson(args.current, mergeLedger(current, seed));
}
