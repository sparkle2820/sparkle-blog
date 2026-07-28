import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const htmlFiles = (await walk(dist)).filter((file) => file.endsWith('.html'));
const errors = [];
let checkedReferences = 0;

// 搜索索引整个目录都可能因为构建命令被换掉而静默消失，单独兜一条。
// 下面的逐个引用检查只覆盖 HTML 里写死的那两个文件，覆盖不到运行时按需拉取的分片。
for (const required of ['pagefind/pagefind-ui.js', 'pagefind/pagefind-ui.css', 'pagefind/pagefind-entry.json']) {
  if (!existsSync(path.join(dist, required))) {
    errors.push(`缺少 ${required} —— 站内搜索会开天窗，检查 astro build 是否跑了 pagefind 集成`);
  }
}

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
