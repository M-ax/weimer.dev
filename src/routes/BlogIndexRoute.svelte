<script lang="ts">
  import { posts } from '../lib/blog';
  import { formatDate } from '../lib/format-date';

  export let onNavigate: (path: string) => void;

  function followLink(event: MouseEvent, path: string) {
    event.preventDefault();
    onNavigate(path);
  }
</script>

<svelte:head>
  <title>Max Weimer · Notes</title>
</svelte:head>

<main class="blog-page page-width">
  <section class="page-intro">
    <p class="eyebrow"><span></span>Field notes</p>
    <h1>Ideas from the<br /><em>workbench.</em></h1>
    <p>Notes on software, manufacturing systems, and the practical craft of building tools that hold up.</p>
  </section>

  <section class="post-list" aria-label="Blog posts">
    {#each posts as post}
      <article class="post-card">
        <div class="post-meta"><span>{formatDate(post.date)}</span><span>{post.readingTime}</span></div>
        <h2><a href={`/blog/${post.slug}`} onclick={(event) => followLink(event, `/blog/${post.slug}`)}>{post.title}</a></h2>
        <p>{post.summary}</p>
        <div class="post-footer">
          <div>{#each post.tags as tag}<span class="tag">{tag}</span>{/each}</div>
          <a class="arrow-link" href={`/blog/${post.slug}`} onclick={(event) => followLink(event, `/blog/${post.slug}`)} aria-label={`Read ${post.title}`}>↗</a>
        </div>
      </article>
    {/each}
  </section>
</main>