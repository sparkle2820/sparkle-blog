import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/*
 * 新建一篇文章。
 *
 *   npm run new -- "标题" --slug my-post --category engineering
 *
 * slug 决定文章地址 /blog/<slug>/，不给就从标题里的 ASCII 部分推导，
 * 中文标题推导不出来时回落到日期。分类必须是 src/content/categories.ts 里的 slug。
 */

const root = path.resolve(import.meta.dirname, '..');
const blogDir = path.join(root, 'src', 'content', 'blog');

const args = process.argv.slice(2);
const title = args.find((arg) => !arg.startsWith('--'));

if (!title) {
  console.error('用法: npm run new -- "文章标题" [--slug my-post] [--category engineering]');
  process.exit(1);
}

const categories = await readCategories();
const category = readFlag('category') ?? categories[0];

if (!categories.includes(category)) {
  console.error(`未知分类 "${category}"。可用分类：${categories.join('、')}`);
  console.error('要加新分类，先编辑 src/content/categories.ts。');
  process.exit(1);
}

const slug = readFlag('slug') ?? deriveSlug(title);
const file = path.join(blogDir, `${slug}.md`);

if (existsSync(file)) {
  console.error(`已存在同名文章：${path.relative(root, file)}`);
  process.exit(1);
}

const now = new Date();
const stamp = localIsoMinutes(now);

const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
description: "一句话说清这篇写了什么，会显示在首页和归档列表。"
publishedAt: "${stamp}"
category: "${category}"
featuredImage: "/media/2026/04/1.jpg"
draft: true
---

正文从这里开始。

图片放到 public/media/ 下，然后用站内绝对路径引用：

![说明文字](/media/2026/04/1.jpg)
`;

await fs.writeFile(file, frontmatter, 'utf8');

console.log(`已创建 ${path.relative(root, file)}`);
console.log('');
console.log('接下来：');
console.log('  1. 改掉 description 和 featuredImage（主图必须是 public/ 下真实存在的文件）');
console.log('  2. 写正文');
console.log('  3. 把 draft 改成 false 才会发布');
console.log('  4. npm run verify 自检，然后 git commit && git push 自动上线');

function readFlag(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

async function readCategories() {
  const source = await fs.readFile(path.join(root, 'src', 'content', 'categories.ts'), 'utf8');
  const slugs = [...source.matchAll(/slug:\s*'([^']+)'/g)].map((match) => match[1]);

  if (slugs.length === 0) {
    console.error('没能从 src/content/categories.ts 里解析出分类。');
    process.exit(1);
  }

  return slugs;
}

function deriveSlug(value) {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (ascii.length >= 3) return ascii;

  const date = new Date();
  return `post-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 输出本地时区的 YYYY-MM-DDTHH:mm:ss，避免 UTC 让日期串到前一天 */
function localIsoMinutes(date) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function pad(value) {
  return String(value).padStart(2, '0');
}
