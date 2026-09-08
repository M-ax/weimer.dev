<script lang="ts">
  import { onMount } from 'svelte';
  import ProceduralBackground from './lib/components/ProceduralBackground.svelte';
  import { posts } from './lib/blog';
  import { profile } from './lib/profile.generated';
  import BlogIndexRoute from './routes/BlogIndexRoute.svelte';
  import BlogPostRoute from './routes/BlogPostRoute.svelte';
  import HomeRoute from './routes/HomeRoute.svelte';
  import NotFoundRoute from './routes/NotFoundRoute.svelte';
  import type { PresetName } from './lib/backgrounds/types';

  type Route =
    | { page: 'home' }
    | { page: 'blog' }
    | { page: 'post'; slug: string }
    | { page: 'background'; presetName: PresetName }
    | { page: 'not-found' };

  let route: Route = getRoute();
  let scrollOffset = 0;

  $: currentPost = route.page === 'post' ? posts.find((post) => post.slug === route.slug) : undefined;

  function getRoute(): Route {
    const parts = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (parts[0] === 'background' && isPresetName(parts[1])) return { page: 'background', presetName: parts[1] };
    if (parts[0] === 'background') return { page: 'not-found' };
    if (parts[0] === 'blog' && parts[1]) return { page: 'post', slug: parts[1] };
    if (parts[0] === 'blog') return { page: 'blog' };
    return { page: 'home' };
  }

  function isPresetName(value: string | undefined): value is PresetName {
    return value === 'maze' || value === 'circuit' || value === 'life' || value === 'constellation' || value === 'halvorsen';
  }

  function navigate(path: string) {
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    route = getRoute();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function followLink(event: MouseEvent, path: string) {
    event.preventDefault();
    navigate(path);
  }

  onMount(() => {
    const handleHistory = () => {
      route = getRoute();
      window.scrollTo({ top: 0 });
    };
    const handleScroll = () => {
      scrollOffset = window.scrollY;
    };

    window.addEventListener('popstate', handleHistory);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('popstate', handleHistory);
      window.removeEventListener('scroll', handleScroll);
    };
  });
</script>

{#if route.page === 'background'}
  <ProceduralBackground presetName={route.presetName} unfiltered showLabel={false} />
{:else}
  <ProceduralBackground {scrollOffset} />

  <header class="site-header">
    <a class="wordmark" href="/" onclick={(event) => followLink(event, '/')} aria-label="Max Weimer home">MW</a>
    <nav aria-label="Main navigation">
      <a class:active={route.page === 'home'} href="/" onclick={(event) => followLink(event, '/')}>Home</a>
      <a class:active={route.page === 'blog' || route.page === 'post'} href="/blog" onclick={(event) => followLink(event, '/blog')}>Blog</a>
    </nav>
  </header>

  {#if route.page === 'home'}
    <HomeRoute onNavigate={navigate} />
  {:else if route.page === 'blog'}
    <BlogIndexRoute onNavigate={navigate} />
  {:else if currentPost}
    <BlogPostRoute post={currentPost} onNavigate={navigate} />
  {:else}
    <NotFoundRoute onNavigate={navigate} />
  {/if}

  <footer class="site-footer page-width">
    <span>© {new Date().getFullYear()} {profile.name}</span>
    <span>Built for clarity in complex systems.</span>
  </footer>
{/if}