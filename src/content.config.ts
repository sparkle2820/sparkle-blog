import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { categorySlugs } from './content/categories';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    /** 没改过就不用写 */
    updatedAt: z.coerce.date().optional(),
    /** 必须是 src/content/categories.ts 里的 slug */
    category: z.enum(categorySlugs),
    /** 主图：首页与归档的封面，站内路径如 /media/2026/06/xxx.jpg */
    featuredImage: z.string(),
    draft: z.boolean().default(false),

    /* 以下仅从 WordPress 迁移过来的老文章有，新文章不用写 */
    wordpressId: z.number().optional(),
    oldUrl: z.url().optional(),
  }),
});

export const collections = { blog };
