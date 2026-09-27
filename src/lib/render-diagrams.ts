import { tick } from 'svelte';
import type { Mermaid } from 'mermaid';

let renderer: Promise<Mermaid> | undefined;
let nextDiagramId = 0;

function loadRenderer() {
  renderer ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: 'base',
      look: 'classic',
      fontFamily: 'Arial, sans-serif',
      themeVariables: {
        darkMode: true,
        background: '#07151a',
        primaryColor: '#123039',
        primaryTextColor: '#f3f1e9',
        primaryBorderColor: '#aee8d6',
        secondaryColor: '#28352e',
        tertiaryColor: '#242c32',
        lineColor: '#aee8d6',
        textColor: '#f3f1e9',
        edgeLabelBackground: '#07151a',
        fontSize: '16px',
      },
    });
    return mermaid;
  }).catch((error) => {
    renderer = undefined;
    throw error;
  });
  return renderer;
}

// The HTML parameter reruns the action when Svelte replaces an article's body.
export function renderDiagrams(node: HTMLElement, html: string) {
  let revision = 0;

  async function render() {
    const current = ++revision;
    await tick();
    if (current !== revision) return;

    const blocks = [...node.querySelectorAll<HTMLElement>('pre > code.language-mermaid')]
      .filter((code) => !code.closest('.diagram'));
    for (const code of blocks) {
      if (current !== revision || !node.contains(code)) return;
      const pre = code.parentElement!;
      const source = code.textContent ?? '';
      const figure = document.createElement('figure');
      figure.className = 'diagram';
      const viewport = document.createElement('div');
      viewport.className = 'diagram-viewport';
      viewport.setAttribute('aria-busy', 'true');
      viewport.textContent = 'Loading diagram…';
      const details = document.createElement('details');
      details.className = 'diagram-source';
      const summary = document.createElement('summary');
      summary.textContent = 'View diagram source';
      details.append(summary);
      pre.replaceWith(figure);
      details.append(pre);
      figure.append(viewport, details);

      try {
        const mermaid = await loadRenderer();
        if (current !== revision) return;
        const { svg } = await mermaid.render(`blog-diagram-${++nextDiagramId}`, source, viewport);
        if (current !== revision) return;
        viewport.innerHTML = svg;
        const diagram = viewport.querySelector('svg');
        const title = diagram?.querySelector('title')?.textContent || 'Article diagram';
        viewport.setAttribute('role', 'region');
        viewport.setAttribute('aria-label', title);
        viewport.tabIndex = 0;
        // Preserve readable labels on small screens; the viewport scrolls horizontally.
        const width = diagram?.viewBox.baseVal.width;
        if (diagram && width) {
          diagram.style.width = `${width}px`;
          diagram.style.maxWidth = '100%';
          diagram.style.minWidth = `${Math.min(width, 640)}px`;
        }
        if (diagram && !diagram.hasAttribute('aria-labelledby')) {
          diagram.setAttribute('aria-label', title);
        }
      } catch {
        if (current !== revision) return;
        viewport.textContent = 'This diagram could not be displayed. Its source is available below.';
        details.open = true;
      } finally {
        viewport.removeAttribute('aria-busy');
      }
    }
  }

  void render();
  return {
    update(nextHtml: string) {
      if (nextHtml === html) return;
      html = nextHtml;
      void render();
    },
    destroy() { revision++; },
  };
}
