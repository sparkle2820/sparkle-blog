import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const media = path.join(root, 'public/media/2026/10/lingbot-vla');
const article = path.join(root, 'src/content/blog/lingbot-vla-posttraining-lab.md');

export function validate(data) {
  assert.equal(data.schema_version, 1, 'Expected schema version1');
  assert.equal(data.team_id, 'PHIZJU', 'Unexpected team identity');
  assert.deepEqual(Object.keys(data.results).sort(), ['clean', 'randomized']);
  const names = Object.keys(data.results.clean);
  assert.equal(names.length, 50, 'Expected50tasks');
  assert.deepEqual([...names].sort(), Object.keys(data.results.randomized).sort(), 'Task sets differ');
  for (const domain of ['clean', 'randomized']) {
    for (const [task, row] of Object.entries(data.results[domain])) {
      assert.match(task, /^[a-z0-9_]+$/, 'Unexpected task identifier');
      assert.equal(row.attempts, 20, 'Each task must have20attempts');
      assert(Number.isInteger(row.successes) && row.successes >= 0 && row.successes <= row.attempts, 'Invalid success count');
    }
  }
  return names;
}

const raw = await readFile(path.join(media, 'results_185800.json'));
const data = JSON.parse(raw.toString('utf8'));
const names = validate(data);
const flags = new Set(process.argv.slice(2));
if (flags.has('--self-test')) {
  const invalid = [
    d => { d.results.clean.adjust_bottle.successes = 21; },
    d => { delete d.results.randomized.turn_switch; },
    d => { d.results.clean.adjust_bottle.attempts = 0; },
  ];
  for (const mutate of invalid) {
    const bad = structuredClone(data);
    mutate(bad);
    assert.throws(() => validate(bad), 'Invalid final counts were accepted');
  }
  console.log('PASS: three malformed-count/coverage negative cases rejected');
}

const summary = Object.fromEntries(['clean', 'randomized'].map(domain => {
  const rows = Object.values(data.results[domain]);
  const successes = rows.reduce((n, row) => n + row.successes, 0);
  const attempts = rows.reduce((n, row) => n + row.attempts, 0);
  return [domain, { tasks: rows.length, successes, attempts, rate: successes / attempts,
    zero_success_tasks: rows.filter(row => row.successes === 0).length }];
}));
assert.deepEqual([summary.clean.successes, summary.clean.attempts, summary.randomized.successes, summary.randomized.attempts], [719, 1000, 234, 1000],
  'Totals differ from independently recomputed author input');
assert.equal(summary.randomized.zero_success_tasks, 12);
const pct = row => (row.successes / row.attempts * 100).toFixed(2);
const table = [
  '| task | clean | randomized |',
  '|---|---:|---:|',
  ...names.map(task => {
    const c = data.results.clean[task], r = data.results.randomized[task];
    return '| ' + task + ' | ' + c.successes + '/' + c.attempts + '（' + pct(c) + '%） | ' + r.successes + '/' + r.attempts + '（' + pct(r) + '%） |';
  }),
].join('\n');
const digest = createHash('sha256').update(raw).digest('hex');

const grid = [0, 25, 50, 75, 100].map(n => {
  const x = 200 + 6 * n;
  return '<line x1="' + x + '" y1="106" x2="' + x + '" y2="273" stroke="#d8e0e2"/>' +
    '<text x="' + x + '" y="299" text-anchor="middle" font-size="14" fill="#52626c">' + n + '%</text>';
}).join('\n');
const bars = ['clean', 'randomized'].map((domain, i) => {
  const row = summary[domain], y = 118 + i * 100, color = i ? '#cf7c58' : '#2a8c82';
  return '<text x="40" y="' + (y + 31) + '" font-size="19" font-weight="600">' + (i ? 'Randomized' : 'Clean') + '</text>' +
    '<rect x="200" y="' + y + '" width="600" height="48" rx="5" fill="#eaf0f0"/>' +
    '<rect x="200" y="' + y + '" width="' + (row.rate * 600) + '" height="48" rx="5" fill="' + color + '"/>' +
    '<text x="950" y="' + (y + 29) + '" text-anchor="end" font-size="30" font-weight="700" fill="' + color + '">' + (row.rate * 100).toFixed(2) + '%</text>' +
    '<text x="950" y="' + (y + 51) + '" text-anchor="end" font-size="14" fill="#52626c">' + row.successes + ' / ' + row.attempts + ' episodes</text>';
}).join('\n');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="380" viewBox="0 0 1000 380" role="img" aria-labelledby="title desc">' +
  '<title id="title">185800 steps final results: clean71.90%, randomized23.40%</title>' +
  '<desc id="desc">Author-confirmed training endpoint. Fifty tasks and twenty episodes per task in each domain. Counts are read from the supplied PHIZJU results JSON.</desc>' +
  '<metadata>source SHA256: ' + digest + '</metadata>' +
  '<rect width="1000" height="380" rx="12" fill="#fcfcfc"/>' +
  '<g font-family="Segoe UI, Arial, sans-serif" fill="#202d36">' +
  '<text x="40" y="44" font-size="25" font-weight="700">Final evaluation / 185800 steps</text>' +
  '<text x="40" y="75" font-size="15" fill="#52626c">PHIZJU · 50 tasks × 20 episodes per split</text>' +
  grid + bars +
  '<text x="40" y="351" font-size="13" fill="#52626c">Source: results_185800.json · descriptive success rates</text></g></svg>\n';

const startMarker = '<!-- final-task-table:start -->', endMarker = '<!-- final-task-table:end -->';
const current = await readFile(article, 'utf8');
const start = current.indexOf(startMarker), end = current.indexOf(endMarker);
assert(start >= 0 && end > start, 'Final task-table markers missing');
const next = current.slice(0, start + startMarker.length) + '\n' + table + '\n' + current.slice(end);

if (flags.has('--check')) {
  assert.equal(next, current, 'Published task table differs from source counts');
  assert.equal(await readFile(path.join(media, 'final_results_185800.svg'), 'utf8'), svg, 'Chart differs from source counts');
  const metadata = await sharp(path.join(media, 'final_results_185800.png')).metadata();
  assert.equal(metadata.width, 2000);
  assert.equal(metadata.height, 760);
} else {
  await writeFile(article, next, 'utf8');
  await writeFile(path.join(media, 'final_results_185800.svg'), svg, 'utf8');
  await sharp(Buffer.from(svg)).resize(2000, 760).png({ compressionLevel: 9 }).toFile(path.join(media, 'final_results_185800.png'));
}
console.log(JSON.stringify({ status: 'PASS', checkpoint_steps_author_confirmed: 185800, source_sha256: digest, summary }));
