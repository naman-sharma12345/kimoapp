import fs from 'node:fs';
const report = JSON.parse(fs.readFileSync('docs/bundle-budget.json', 'utf8'));
export default report.routes.map((route) => ({
  name: route.name,
  path: route.files,
  limit: route.limit,
  gzip: true,
  brotli: false,
}));
