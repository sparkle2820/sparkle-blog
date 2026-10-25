import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

const run = promisify(execFile);

/**
 * 把 Pagefind 索引挂进 astro build 本身，而不是靠 package.json 里的 `&& pagefind`。
 *
 * 原因：托管平台不一定用我们写的那条构建命令 —— Cloudflare 的 Astro 预设直接跑
 * `astro build`，结果 pagefind 那半截被吞掉，线上 /pagefind/* 全部 404、搜索框
 * 渲染不出来。放进 astro:build:done 之后，只要 astro build 跑过就一定有索引。
 */
function pagefind() {
  return {
    name: 'pagefind',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const site = fileURLToPath(dir);
        // On Windows npm keeps the executable in a shell shim without an
        // extension; spawning that path directly raises ENOENT. Invoke the
        // package's real Node wrapper so local Windows builds and CI use the
        // same Pagefind binary resolution.
        const runner = fileURLToPath(new URL('./node_modules/pagefind/lib/runner/bin.cjs', import.meta.url));

        if (!existsSync(runner)) {
          throw new Error(
            'pagefind 没装上，站内搜索会失效。它在 dependencies 里，' +
              '如果构建环境设了 NODE_ENV=production 也应该照常安装 —— 检查依赖安装步骤。',
          );
        }

        const { stdout } = await run(process.execPath, [runner, '--site', site]);
        const indexed = stdout.match(/Indexed (\d+) pages/)?.[1];
        logger.info(`已建立站内搜索索引${indexed ? `（${indexed} 个页面）` : ''}`);
      },
    },
  };
}

export default defineConfig({
  site: 'https://www.sparkle1128.top',
  integrations: [sitemap(), pagefind()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});
