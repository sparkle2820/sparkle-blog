import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const root = path.resolve(import.meta.dirname, '..');
const backupDir = path.join(root, 'migration-backup', 'api');
const outputDir = path.join(root, 'src', 'content', 'blog');

const [posts, media, categories] = await Promise.all([
  readJson('posts.json'),
  readJson('media.json'),
  readJson('categories.json'),
]);

const mediaById = new Map(media.map((item) => [item.id, item]));
const categoryById = new Map(categories.map((item) => [item.id, item.name]));

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  headingStyle: 'atx',
});
turndown.use(gfm);
turndown.addRule('lineBreak', {
  filter: 'br',
  replacement: () => '  \n',
});

await fs.mkdir(outputDir, { recursive: true });

for (const post of posts) {
  let markdown = convertPostBody(post.content.rendered);
  const featuredImage = localMediaUrl(mediaById.get(post.featured_media)?.source_url ?? '');
  const duplicateCover = `![](${featuredImage})`;
  if (featuredImage && markdown.trimStart().startsWith(duplicateCover)) {
    markdown = markdown.trimStart().slice(duplicateCover.length).trimStart();
  }
  const description = plainText(post.excerpt.rendered)
    .replace(/\[\s*\.\.\.\s*\]$/, '...')
    .replace(/\[…\]$/, '...');
  const category = post.categories.map((id) => categoryById.get(id)).find(Boolean) ?? '博客';
  const frontmatter = [
    '---',
    `title: ${yamlString(decodeEntities(post.title.rendered))}`,
    `description: ${yamlString(description)}`,
    `publishedAt: ${yamlString(post.date)}`,
    `updatedAt: ${yamlString(post.modified)}`,
    `category: ${yamlString(decodeEntities(category))}`,
    `featuredImage: ${yamlString(featuredImage)}`,
    `wordpressId: ${post.id}`,
    `oldUrl: ${yamlString(post.link)}`,
    'draft: false',
    '---',
    '',
  ].join('\n');

  await fs.writeFile(path.join(outputDir, `${post.slug}.md`), frontmatter + markdown.trim() + '\n');
}

console.log(`Migrated ${posts.length} posts to ${path.relative(root, outputDir)}`);

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.join(backupDir, file), 'utf8'));
}

function convertPostBody(html) {
  const $ = load(`<main id="wordpress-content">${html}</main>`, null, false);
  const rootNode = $('#wordpress-content');

  rootNode.find('.wp-block-kevinbatdorf-code-block-pro').each((_, element) => {
    const wrapper = $(element);
    const code = wrapper.find('textarea').first().text() || wrapper.find('pre code').first().text();
    const pre = $('<pre></pre>');
    pre.append($('<code></code>').text(code.trimEnd()));
    wrapper.replaceWith(pre);
  });

  rootNode.find('script, style, svg, .code-block-pro-copy-button').remove();
  rootNode.find('img').each((_, element) => {
    const image = $(element);
    const mediaId = image.attr('class')?.match(/wp-image-(\d+)/)?.[1];
    const original = mediaId ? mediaById.get(Number(mediaId))?.source_url : undefined;
    image.attr('src', localMediaUrl(original ?? image.attr('src') ?? ''));
    image.removeAttr('srcset sizes decoding fetchpriority loading style width height class');
  });

  rootNode.find('a').each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr('href');
    if (!href) return;
    anchor.attr('href', rewriteUrl(href));
  });

  rootNode.find('*').removeAttr('class style id data-code-block-pro-font-family');

  return turndown.turndown(rootNode.html() ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '');
}

function rewriteUrl(value) {
  if (value.includes('/wp-content/uploads/')) return localMediaUrl(value);

  try {
    const url = new URL(value);
    if (url.hostname !== 'www.sparkle1128.top' && url.hostname !== 'sparkle1128.top') return value;
    const match = url.pathname.match(/^\/index\.php\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/?$/);
    if (match) return `/blog/${match[1]}/`;
    if (url.pathname === '/index.php/blog/') return '/blog/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

function localMediaUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    const relative = decodeURIComponent(url.pathname.split('/wp-content/uploads/')[1] ?? '');
    return relative ? `/media/${relative}` : value;
  } catch {
    return value;
  }
}

function plainText(html) {
  const $ = load(html, null, false);
  return decodeEntities($.root().text()).replace(/\s+/g, ' ').trim();
}

function decodeEntities(value) {
  const $ = load(`<span>${value}</span>`, null, false);
  return $('span').text();
}

function yamlString(value) {
  return JSON.stringify(value);
}
