<script lang="ts">
  import { profile } from '../lib/profile.generated';

  export let onNavigate: (path: string) => void;

  function followLink(event: MouseEvent, path: string) {
    event.preventDefault();
    onNavigate(path);
  }
</script>

<svelte:head>
  <title>Max Weimer · Software Engineer</title>
</svelte:head>

<main>
  <section class="hero page-width">
    <p class="eyebrow"><span></span>{profile.role}</p>
    <h1>Software with a clear<br /><em>line of sight.</em></h1>
    <div class="hero-copy">
      <p>{profile.introduction}</p>
      <a class="text-link" href="#capabilities">Explore the work <span>↓</span></a>
    </div>
    <div class="availability"><i></i>{profile.availability}</div>
  </section>

  <section class="statement page-width" aria-labelledby="mission-heading">
    <p class="section-index">01 / Approach</p>
    <div>
      <h2 id="mission-heading">{profile.mission}</h2>
      <p>{profile.perspective}</p>
    </div>
  </section>

  <section id="capabilities" class="capabilities page-width" aria-labelledby="capabilities-heading">
    <div class="section-heading">
      <p class="section-index">02 / Capabilities</p>
      <h2 id="capabilities-heading">A steady hand for<br />complex work.</h2>
    </div>
    <div class="capability-list">
      {#each profile.capabilities as capability, index}
        <article class="capability">
          <div class="capability-number">0{index + 1}</div>
          <div>
            <h3>{capability.title}</h3>
            <p>{capability.description}</p>
            <ul aria-label={`${capability.title} technologies`}>
              {#each capability.technologies as technology}
                <li>{technology}</li>
              {/each}
            </ul>
          </div>
        </article>
      {/each}
    </div>
  </section>

  <section class="closing page-width">
    <p class="section-index">03 / Next</p>
    <div>
      <h2>{profile.contact}</h2>
      <a class="pill-link" href="/blog" onclick={(event) => followLink(event, '/blog')}>Read the notes <span>→</span></a>
    </div>
  </section>
</main>