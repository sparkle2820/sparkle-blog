import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const htmlFiles = (await walk(dist)).filter((file) => file.endsWith('.html'));
const errors = [];
let checkedReferences = 0;

for (const file of htmlFiles) {
  const html = await fs.readFile(file, 'utf8');
  const relativeFile = path.relative(dist, file);
  const $ = load(html);

  if (/Hestia|ThemeIsle/i.test($.root().text())) {
    errors.push(`${relativeFile}: contains legacy theme credit`);
  }

  if (/http:\/\/(?:www\.)?sparkle1128\.top/i.test(html)) {
    errors.push(`${relativeFile}: contains an insecure internal URL`);
  }

  $('img').each((_, image) => {
    if ($(image).attr('alt') === undefined) errors.push(`${relativeFile}: image without alt attribute`);
  });

  $('[href], [src]').each((_, element) => {
    const value = $(element).attr('href') ?? $(element).attr('src');
    if (!value || shouldSkip(value)) return;
    checkedReferences += 1;
    const target = resolveTarget(relativeFile, value);
    if (target && !existsSync(target)) errors.push(`${relativeFile}: missing ${value}`);
  });
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked ${htmlFiles.length} HTML files and ${checkedReferences} local references.`);
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  }));
  return files.flat();
}

function shouldSkip(value) {
  return /^(?:[a-z]+:|\/\/|#)/i.test(value) || value.startsWith('data:');
}

function resolveTarget(fromFile, value) {
  const clean = decodeURIComponent(value.split(/[?#]/, 1)[0]);
  if (!clean) return null;
  const relative = clean.startsWith('/')
    ? clean.slice(1)
    : path.normalize(path.join(path.dirname(fromFile), clean));
  const absolute = path.join(dist, relative);

  if (path.extname(relative)) return absolute;
  if (clean.endsWith('/')) return path.join(absolute, 'index.html');
  return existsSync(absolute) ? absolute : path.join(absolute, 'index.html');
}
