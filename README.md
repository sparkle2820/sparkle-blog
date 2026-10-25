# Sparkle Blog

`www.sparkle1128.top` 的 Astro 源码，用来替换原来跑在彩虹云上的 WordPress。
内容是 Git 里的 Markdown，推送到 `main` 后由 Cloudflare Workers Builds 自动构建和部署。

当前可直接访问的 Cloudflare 地址：[sparkle-blog.zhaokunxu678.workers.dev](https://sparkle-blog.zhaokunxu678.workers.dev/)。VLA 博客首版：[LingBot-VLA 后训练实验记录](https://sparkle-blog.zhaokunxu678.workers.dev/blog/lingbot-vla-posttraining-lab/)。

## 本地开发

```bash
npm install
npm run dev
```

上线前自检（跑一遍就够，等价于 check + build + check:dist）：

```bash
npm run verify
npm run preview   # 本地看构建产物
```

## 写一篇新文章

```bash
npm run new -- "文章标题" --slug my-post --category engineering
```

会在 `src/content/blog/my-post.md` 生成带好 frontmatter 的骨架，然后：

1. 改 `description` —— 首页和归档列表显示的就是它
2. 改 `featuredImage` —— **必须是 `public/` 下真实存在的文件**，写站内绝对路径
3. 写正文（标准 Markdown，代码块有语法高亮）
4. 把 `draft: true` 改成 `false` 才会发布
5. `npm run verify` 通过后 `git push`，Cloudflare Workers Builds 自动构建上线

`--slug` 决定文章地址 `/blog/<slug>/`，中文标题推导不出 slug，建议手写。
`--category` 不填默认第一个分类。

### 图片

放到 `public/media/` 下（按年月分目录），正文里用绝对路径引用：

```markdown
![说明文字](/media/2026/06/xxx.jpg)
```

### 分类

分类表在 `src/content/categories.ts`，是唯一的事实来源。加一个分类只要往数组里追加一项，
`/blog/category/<slug>/` 归档页和筛选条会自动生成，空分类不会出页面。

frontmatter 里的 `category` 必须是表里的 slug，写错会在 `npm run check` 直接报错。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `src/content/blog/*.md` | 文章正文与 frontmatter |
| `src/content/categories.ts` | 分类表 |
| `src/content.config.ts` | frontmatter schema（zod 校验） |
| `src/utils/posts.ts` | 取文、阅读时长、日期格式化 |
| `src/styles/global.css` | 全站设计系统 |
| `public/media/` | 从 WordPress 迁过来的原始媒体 |
| `public/nostalgia-vr/` | RHET 课程项目站，原样保留 |
| `scripts/check-dist.mjs` | 构建产物体检 |

## 设计与动效

中性界面 + 整幅影像：颜色克制，情绪交给照片本身。动效只做引导视线和交代层级，
不做装饰性表演 —— 整站转场（View Transitions）、标题逐字入场、首屏随滚动退场、
图片进场回正淡入、图带视差、顶部滚动进度线、页脚与图带上的星空。

所有动效都受 `prefers-reduced-motion` 控制；JS 不执行时 `<noscript>` 会强制显示全部内容。

## 部署

Cloudflare Workers Static Assets，项目名 `sparkle-blog`，连接 `sparkle2820/sparkle-blog` 的 `main` 分支：

- Build command：`npm run build`
- Output directory：`dist`
- Node.js：`22`

`wrangler.jsonc` 绑定 `dist` 静态资产，仓库的 `npm run deploy` 调用 Wrangler。GitHub commit 的 `Workers Builds: sparkle-blog` check 提供构建状态、部署版本和 Cloudflare Dashboard 链接。`www.sparkle1128.top` 是站点的 canonical 域名；当前线上预览入口使用上述 `workers.dev` 地址。

`public/_redirects` 保留了全部 WordPress 老链接的 301（含三篇文章、分类页、feed、
`/wp-content/uploads/*` 图片路径）。

`migration-backup/` 是原站的只读备份（8 个 REST API 响应 + 源 HTML + 30 个媒体文件 +
SHA256SUMS），已在 `.gitignore` 里排除，因为可部署的资源都已经在 `public/` 下了。

备案号下来后填到 `src/components/SiteFooter.astro` 顶部的 `icp` / `police` 两个常量里，
页脚会自动出现备案信息条。
