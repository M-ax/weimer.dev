<script lang="ts">
  import { posts } from '../lib/blog';
  import { formatDate } from '../lib/format-date';

  export let onNavigate: (path: string) => void;

  function followLink(event: MouseEvent, path: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
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
    <p>Project notes on shared media, desktop software, game mods, and the details that make them work.</p>
  </section>

  <ul class="post-list" aria-label="Blog posts">
    {#each posts as post}
      <li>
        <article class="post-row">
          <div class="post-meta">
            <time datetime={post.date}>{formatDate(post.date)}</time>
            <span>{post.readingTime}</span>
          </div>
          <div class="post-content">
            <h2><a href={`/blog/${post.slug}`} onclick={(event) => followLink(event, `/blog/${post.slug}`)}>{post.title}<span aria-hidden="true">↗</span></a></h2>
            <p>{post.summary}</p>
            <ul class="post-topics" aria-label="Topics">
              {#each post.tags as tag}<li>{tag}</li>{/each}
            </ul>
          </div>
        </article>
      </li>
    {/each}
  </ul>
</main>
