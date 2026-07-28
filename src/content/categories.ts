/**
 * 文章分类表 —— 这是唯一的事实来源。
 *
 * 新增一个分类：在下面加一项即可，归档页 /blog/category/<slug>/ 会自动生成，
 * 分类筛选条也会自动出现。文章 frontmatter 里的 category 必须是这里的 slug，
 * 写错会在 `npm run check` 直接报错，不会悄悄漏掉。
 */

export interface Category {
  slug: string;
  name: string;
  description: string;
}

export const categories = [
  {
    slug: 'engineering',
    name: '研发学习',
    description: '机器人、ROS、仿真与建图，连同踩过的坑一起记下来。',
  },
  {
    slug: 'tech',
    name: '科技探索',
    description: '新工具、新论文、新玩具，先上手再说。',
  },
  {
    slug: 'travel',
    name: '旅行',
    description: '路上的风景，和当时在想的事。',
  },
  {
    slug: 'life',
    name: '生活随笔',
    description: '钢琴、校园，以及一些不值得但想留住的片段。',
  },
] as const satisfies readonly Category[];

export type CategorySlug = (typeof categories)[number]['slug'];

export const categorySlugs = categories.map((category) => category.slug) as [
  CategorySlug,
  ...CategorySlug[],
];

const categoryBySlug = new Map<string, Category>(categories.map((category) => [category.slug, category]));

export function getCategory(slug: string): Category {
  const category = categoryBySlug.get(slug);
  if (!category) throw new Error(`未知分类：${slug}`);
  return category;
}
