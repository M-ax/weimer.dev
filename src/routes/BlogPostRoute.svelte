<script lang="ts">
  import type { BlogPost } from '../lib/blog';
  import { formatDate } from '../lib/format-date';

  export let post: BlogPost;
  export let onNavigate: (path: string) => void;

  function followLink(event: MouseEvent, path: string) {
    event.preventDefault();
    onNavigate(path);
  }
</script>

<svelte:head>
  <title>Max Weimer · {post.title}</title>
</svelte:head>

<main class="article-page page-width">
  <a class="back-link" href="/blog" onclick={(event) => followLink(event, '/blog')}>← Back to notes</a>
  <article>
    <p class="eyebrow"><span></span>{formatDate(post.date)} · {post.readingTime}</p>
    <h1>{post.title}</h1>
    <p class="article-summary">{post.summary}</p>
    <div class="article-tags">{#each post.tags as tag}<span class="tag">{tag}</span>{/each}</div>
    <div class="markdown-body">{@html post.html}</div>
  </article>
</main>