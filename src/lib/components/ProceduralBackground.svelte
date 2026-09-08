<script lang="ts">
  import { onMount } from 'svelte';
  import { CircuitPreset } from '../backgrounds/CircuitPreset';
  import { ConstellationPreset } from '../backgrounds/ConstellationPreset';
  import { GameOfLifePreset } from '../backgrounds/GameOfLifePreset';
  import { HalvorsenPreset } from '../backgrounds/HalvorsenPreset';
  import { MazePreset, mazeStepInterval } from '../backgrounds/MazePreset';
  import type {
    BackgroundDimensions,
    BackgroundPreset,
    LayeredBackgroundPreset,
    PresetName,
  } from '../backgrounds/types';

  export let scrollOffset = 0;
  export let presetName: PresetName | undefined = undefined;
  export let unfiltered = false;
  export let showLabel = true;

  const maxCanvasPixels = 2_000_000;
  const parallaxFactor = 0.11;
  const resizeIdleDelay = 200;

  let background: HTMLDivElement;
  let canvasStack: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let dynamicCanvas: HTMLCanvasElement;
  let transitionCanvas: HTMLCanvasElement;
  let canvasHeight = 0;
  let presetMenuButton: HTMLButtonElement;
  let presetMenuOpen = false;

  const presets: Record<PresetName, BackgroundPreset> = {
    maze: new MazePreset(),
    circuit: new CircuitPreset(),
    life: new GameOfLifePreset(),
    constellation: new ConstellationPreset(),
    halvorsen: new HalvorsenPreset(),
  };
  const presetNames: PresetName[] = ['maze', 'circuit', 'life', 'constellation', 'halvorsen'];

  let preset: BackgroundPreset = presets.maze;
  let activatePreset = (_name: PresetName) => {};

  function randomPreset(): BackgroundPreset {
    const availablePresets = Object.values(presets);
    return availablePresets[Math.floor(Math.random() * availablePresets.length)];
  }

  function isLayeredPreset(candidate: BackgroundPreset): candidate is LayeredBackgroundPreset {
    return 'staticVersion' in candidate
      && 'prepareFrame' in candidate
      && 'drawStatic' in candidate
      && 'drawDynamic' in candidate;
  }

  function selectPreset(name: PresetName) {
    activatePreset(name);
    presetMenuOpen = false;
  }

  function closePresetMenuWhenFocusLeaves(event: FocusEvent) {
    const picker = event.currentTarget as HTMLElement;
    if (!picker.contains(event.relatedTarget as Node | null)) presetMenuOpen = false;
  }

  function handlePresetMenuKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;

    presetMenuOpen = false;
    presetMenuButton.focus();
  }

  onMount(() => {
    const context = canvas.getContext('2d', { alpha: false });
    const dynamicContext = dynamicCanvas.getContext('2d');
    if (!context || !dynamicContext) return;

    preset = presetName ? presets[presetName] : randomPreset();
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let animationFrame = 0;
    let smoothedScroll = scrollOffset;
    let backdrop: CanvasGradient;
    let lastFrameAt = 0;
    let isResizing = false;
    let resizeTimeout: number | undefined;
    let hasDrawn = false;
    let transitionAnimation: Animation | null = null;
    let sizeAnimation: Animation | null = null;
    let transitionDimensions: BackgroundDimensions | null = null;
    let cursor: { x: number; y: number; speed: number; observedAt: number } | undefined;
    let renderedStaticVersion = -1;
    let renderedStaticOffset = Number.NaN;

    const measureViewport = () => {
      const bounds = background.getBoundingClientRect();
      return {
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height),
      };
    };

    const measureDimensions = (): BackgroundDimensions => {
      const viewport = measureViewport();
      const nextWidth = viewport.width;
      const nextViewportHeight = viewport.height;
      const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const nextHeight = Math.ceil(
        nextViewportHeight + Math.max(0, documentHeight - nextViewportHeight) * parallaxFactor,
      );
      const nextPixelRatio = Math.min(
        window.devicePixelRatio || 1,
        Math.sqrt(maxCanvasPixels / (nextWidth * nextHeight)),
      );

      return { width: nextWidth, height: nextHeight, pixelRatio: nextPixelRatio };
    };

    const dimensionsAreCurrent = (dimensions: BackgroundDimensions) =>
      dimensions.width === width && dimensions.height === height && dimensions.pixelRatio === pixelRatio;

    const resize = (dimensions = measureDimensions()) => {
      width = dimensions.width;
      height = dimensions.height;
      canvasHeight = height;
      pixelRatio = dimensions.pixelRatio;
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      dynamicCanvas.width = canvas.width;
      dynamicCanvas.height = canvas.height;
      preset.resize(dimensions);
      renderedStaticVersion = -1;
      backdrop = context.createLinearGradient(0, 0, width, height);
      backdrop.addColorStop(0, '#07151a');
      backdrop.addColorStop(1, '#101222');
    };

    const clearCanvas = (target: HTMLCanvasElement, targetContext: CanvasRenderingContext2D) => {
      targetContext.setTransform(1, 0, 0, 1, 0, 0);
      targetContext.clearRect(0, 0, target.width, target.height);
    };

    activatePreset = (name) => {
      if (preset.name === name) return;

      transitionAnimation?.cancel();
      sizeAnimation?.cancel();
      transitionAnimation = null;
      sizeAnimation = null;
      transitionDimensions = null;
      transitionCanvas.style.opacity = '';
      transitionCanvas.style.height = '';
      clearCanvas(canvas, context);
      clearCanvas(dynamicCanvas, dynamicContext);
      const transitionContext = transitionCanvas.getContext('2d');
      if (transitionContext) clearCanvas(transitionCanvas, transitionContext);

      preset = presets[name];
      preset.resize({ width, height, pixelRatio });
      renderedStaticVersion = -1;
      renderedStaticOffset = Number.NaN;
      lastFrameAt = 0;
      drawFrame(performance.now());
    };

    const drawFrame = (now: number) => {
      const elapsed = lastFrameAt ? Math.min(now - lastFrameAt, 100) : mazeStepInterval;
      lastFrameAt = now;
      const scrollSmoothing = 1 - Math.pow(1 - 0.035, elapsed / mazeStepInterval);
      smoothedScroll += (scrollOffset - smoothedScroll) * scrollSmoothing;
      const frameCursor = cursor && {
        x: cursor.x,
        y: cursor.y + smoothedScroll * parallaxFactor,
        speed: cursor.speed,
        idleDuration: Math.max(0, now - cursor.observedAt),
      };
      if (cursor) cursor.speed = 0;
      const frame = {
        now,
        elapsed,
        width,
        height,
        pixelRatio,
        cursor: frameCursor,
      };
      const staticOffset = -smoothedScroll * parallaxFactor;

      if (isLayeredPreset(preset)) {
        preset.prepareFrame(frame);
        if (renderedStaticVersion !== preset.staticVersion || renderedStaticOffset !== staticOffset) {
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          context.fillStyle = backdrop;
          context.fillRect(0, 0, width, height);
          context.translate(0, staticOffset);
          preset.drawStatic(context, frame);
          renderedStaticVersion = preset.staticVersion;
          renderedStaticOffset = staticOffset;
        }

        if (preset.hasDynamicContent) {
          dynamicContext.setTransform(1, 0, 0, 1, 0, 0);
          dynamicContext.clearRect(0, 0, dynamicCanvas.width, dynamicCanvas.height);
          dynamicContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          dynamicContext.translate(0, staticOffset);
          preset.drawDynamic(dynamicContext, frame);
        }
      } else {
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.fillStyle = backdrop;
        context.fillRect(0, 0, width, height);
        context.translate(0, staticOffset);
        preset.draw(context, frame);
      }

      hasDrawn = true;
    };

    const render = (now: number) => {
      if (document.hidden || isResizing) {
        animationFrame = 0;
        return;
      }

      drawFrame(now);

      animationFrame = requestAnimationFrame(render);
    };

    const pauseAnimation = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const resumeAnimation = () => {
      if (document.hidden || isResizing || animationFrame) return;
      lastFrameAt = 0;
      animationFrame = requestAnimationFrame(render);
    };

    const beginResizeTransition = () => {
      if (!hasDrawn) return false;

      transitionAnimation?.cancel();
      sizeAnimation?.cancel();
      transitionDimensions = { width, height, pixelRatio };
      transitionCanvas.style.opacity = '1';
      transitionCanvas.width = canvas.width;
      transitionCanvas.height = canvas.height;
      transitionCanvas.style.height = `${transitionDimensions.height}px`;
      const transitionContext = transitionCanvas.getContext('2d');
      transitionContext?.drawImage(canvas, 0, 0);
      transitionContext?.drawImage(dynamicCanvas, 0, 0);
      return true;
    };

    const completeResizeTransition = (shouldTransition: boolean) => {
      if (!shouldTransition || !transitionDimensions) return;

      const fromDimensions = transitionDimensions;
      transitionDimensions = null;
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 520;
      const timing = { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' as const };
      const newSizeAnimation = canvasStack.animate(
        [{ height: `${fromDimensions.height}px` }, { height: `${height}px` }],
        timing,
      );
      sizeAnimation = newSizeAnimation;
      const animation = transitionCanvas.animate(
        [
          { opacity: 1, height: `${fromDimensions.height}px` },
          { opacity: 0, height: `${height}px` },
        ],
        timing,
      );
      transitionAnimation = animation;
      animation.onfinish = () => {
        if (transitionAnimation !== animation) return;
        animation.cancel();
        transitionCanvas.style.opacity = '';
        transitionCanvas.style.height = '';
        transitionAnimation = null;
        if (sizeAnimation === newSizeAnimation) {
          newSizeAnimation.cancel();
          sizeAnimation = null;
        }
      };
    };

    const handleResize = () => {
      const dimensions = measureDimensions();
      if (dimensionsAreCurrent(dimensions)) return;

      isResizing = true;
      pauseAnimation();
      if (resizeTimeout !== undefined) window.clearTimeout(resizeTimeout);

      resizeTimeout = window.setTimeout(() => {
        resizeTimeout = undefined;
        const nextDimensions = measureDimensions();
        const shouldTransition = !dimensionsAreCurrent(nextDimensions) && beginResizeTransition();
        if (!dimensionsAreCurrent(nextDimensions)) {
          resize(nextDimensions);
          lastFrameAt = 0;
          drawFrame(performance.now());
        }
        isResizing = false;
        completeResizeTransition(shouldTransition);
        resumeAnimation();
      }, resizeIdleDelay);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseAnimation();
      } else resumeAnimation();
    };

    const handlePointerMove = ({ clientX, clientY }: PointerEvent) => {
      const bounds = canvasStack.getBoundingClientRect();
      const observedAt = performance.now();
      const nextCursor = {
        x: (clientX - bounds.left) * width / bounds.width,
        y: (clientY - bounds.top) * height / bounds.height,
      };
      const elapsed = cursor ? Math.max(observedAt - cursor.observedAt, 1) : 0;
      const speed = cursor ? Math.hypot(nextCursor.x - cursor.x, nextCursor.y - cursor.y) / elapsed * 1_000 : 0;
      cursor = { ...nextCursor, speed, observedAt };
    };

    const clearCursor = () => {
      cursor = undefined;
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(background);
    observer.observe(document.body);
    resize();
    resumeAnimation();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('blur', clearCursor);

    return () => {
      activatePreset = (_name: PresetName) => {};
      observer.disconnect();
      pauseAnimation();
      transitionAnimation?.cancel();
      sizeAnimation?.cancel();
      if (resizeTimeout !== undefined) window.clearTimeout(resizeTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', clearCursor);
    };
  });
</script>

<div class:unfiltered class="background" bind:this={background} aria-hidden="true">
  <div class="canvas-stack" bind:this={canvasStack} style:height={`${canvasHeight}px`}>
    <canvas class="background-canvas" bind:this={canvas}></canvas>
    <canvas class="dynamic-canvas" bind:this={dynamicCanvas}></canvas>
  </div>
  <canvas class="transition-canvas" bind:this={transitionCanvas}></canvas>
</div>

{#if showLabel}
  <div class="background-control">
    <a class="background-page-link" href={`/background/${preset.name}`} aria-label={`View ${preset.label} without filters`}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.2 9.8 9.8 6.2M5.1 12.8l-1.5 1.5a2.55 2.55 0 1 1-3.6-3.6L3.4 7.3a2.55 2.55 0 0 1 3.6 0M10.9 3.2l1.5-1.5a2.55 2.55 0 0 1 3.6 3.6l-3.4 3.4a2.55 2.55 0 0 1-3.6 0" />
      </svg>
    </a>
    <div
      class="background-picker"
      role="group"
      aria-label="Background selector"
      onfocusout={closePresetMenuWhenFocusLeaves}
    >
      <button
        class="background-picker-button"
        type="button"
        bind:this={presetMenuButton}
        aria-controls="background-preset-menu"
        aria-expanded={presetMenuOpen}
        aria-haspopup="menu"
        onclick={() => presetMenuOpen = !presetMenuOpen}
        onkeydown={handlePresetMenuKeydown}
      >
        <span>{preset.label} · live</span>
        <span class="preset-menu-arrow" aria-hidden="true">↑</span>
      </button>
      {#if presetMenuOpen}
        <div id="background-preset-menu" class="background-preset-menu" role="menu" aria-label="Background presets">
          {#each presetNames as name}
            <button
              class:active={preset.name === name}
              type="button"
              role="menuitem"
              aria-current={preset.name === name ? 'true' : undefined}
              onclick={() => selectPreset(name)}
              onkeydown={handlePresetMenuKeydown}
            >{presets[name].label}</button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .background {
    position: fixed;
    z-index: 0;
    inset: 0;
    overflow: hidden;
    background: #07151a;
    pointer-events: none;
  }

  .canvas-stack,
  .transition-canvas {
    filter: blur(2px) brightness(0.48) saturate(0.82);
    transform: scale(1.035);
  }

  .canvas-stack {
    position: absolute;
    inset: 0;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .dynamic-canvas {
    position: absolute;
    inset: 0;
  }

  .unfiltered .canvas-stack,
  .unfiltered .transition-canvas {
    filter: none;
    transform: none;
  }

  .transition-canvas {
    position: absolute;
    z-index: 1;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }

  .background-control {
    position: fixed;
    z-index: 2;
    right: 1.5rem;
    bottom: 1.25rem;
    display: flex;
    align-items: center;
    color: rgba(220, 244, 239, 0.54);
    font: 500 0.65rem/1 var(--font-mono);
    letter-spacing: 0.09em;
    pointer-events: auto;
    text-transform: uppercase;
  }

  .background-page-link {
    display: grid;
    width: 1.2rem;
    height: 1.2rem;
    place-items: center;
    margin-right: 0.55rem;
    border-right: 1px solid rgba(220, 244, 239, 0.25);
    color: inherit;
    text-decoration: none;
  }

  .background-page-link svg {
    width: 0.73rem;
    height: 0.73rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.35;
  }

  .background-picker {
    position: relative;
  }

  .background-picker-button,
  .background-preset-menu button {
    border: 0;
    padding: 0;
    background: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
  }

  .background-picker-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .preset-menu-arrow {
    color: var(--accent);
    font-size: 0.82rem;
    line-height: 0.8;
  }

  .background-preset-menu {
    position: absolute;
    right: -0.45rem;
    bottom: calc(100% + 0.65rem);
    display: grid;
    min-width: max-content;
    gap: 0.15rem;
    border: 1px solid rgba(220, 244, 239, 0.22);
    padding: 0.4rem;
    background: rgba(7, 21, 26, 0.92);
    box-shadow: 0 0.6rem 1.8rem rgba(0, 0, 0, 0.22);
  }

  .background-preset-menu button {
    padding: 0.42rem 0.5rem;
    color: rgba(220, 244, 239, 0.55);
    cursor: pointer;
    text-align: left;
  }

  .background-page-link:hover,
  .background-picker-button:hover,
  .background-picker-button:focus-visible,
  .background-preset-menu button:hover,
  .background-preset-menu button:focus-visible,
  .background-preset-menu button.active {
    color: rgba(220, 244, 239, 0.82);
  }

  .background-picker-button:focus-visible,
  .background-preset-menu button:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: 0.28rem;
  }

  @media (max-width: 640px) {
    .background-control {
      right: 1rem;
      bottom: 0.9rem;
    }
  }
</style>