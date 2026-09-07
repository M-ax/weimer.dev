<script lang="ts">
  export let onNavigate: (path: string) => void;

  function followLink(event: MouseEvent, path: string) {
    event.preventDefault();
    onNavigate(path);
  }
</script>

<svelte:head>
  <title>Max Weimer · Note not found</title>
</svelte:head>

<main class="missing page-width">
  <p class="eyebrow"><span></span>404</p>
  <h1>That note wandered<br /><em>off the map.</em></h1>
  <a class="pill-link" href="/blog" onclick={(event) => followLink(event, '/blog')}>See all notes <span>→</span></a>
</main>