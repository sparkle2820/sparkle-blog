import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** 全站唯一的取文入口：过滤草稿，按发布时间倒序。 */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
}

/** 中英文混排的粗略字数 → 阅读时长（分钟）。 */
export function readingMinutes(body: string | undefined): number {
  const words = body?.split(/\s+|(?<=\p{Script=Han})/u).filter(Boolean).length ?? 0;
  return Math.max(1, Math.ceil(words / 300));
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}
