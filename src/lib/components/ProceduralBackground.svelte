<script lang="ts">
  import { onMount } from 'svelte';
  import { CircuitPreset } from '../backgrounds/CircuitPreset';
  import { ConstellationPreset } from '../backgrounds/ConstellationPreset';
  import { MazePreset, mazeStepInterval } from '../backgrounds/MazePreset';
  import type { BackgroundDimensions, BackgroundPreset, PresetName } from '../backgrounds/types';

  export let scrollOffset = 0;
  export let presetName: PresetName | undefined = undefined;
  export let unfiltered = false;
  export let showLabel = true;

  const maxCanvasPixels = 2_000_000;
  const parallaxFactor = 0.11;
  const resizeIdleDelay = 200;

  let background: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let transitionCanvas: HTMLCanvasElement;
  let canvasHeight = 0;

  const presets: Record<PresetName, BackgroundPreset> = {
    maze: new MazePreset(),
    circuit: new CircuitPreset(),
    constellation: new ConstellationPreset(),
  };

  let preset: BackgroundPreset = presets.maze;

  function randomPreset(): BackgroundPreset {
    const availablePresets = Object.values(presets);
    return availablePresets[Math.floor(Math.random() * availablePresets.length)];
  }

  onMount(() => {
    const context = canvas.getContext('2d');
    if (!context) return;

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
    let cursor: { x: number; y: number } | undefined;

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
      preset.resize(dimensions);
      backdrop = context.createLinearGradient(0, 0, width, height);
      backdrop.addColorStop(0, '#07151a');
      backdrop.addColorStop(1, '#101222');
    };

    const drawFrame = (now: number) => {
      const elapsed = lastFrameAt ? Math.min(now - lastFrameAt, 100) : mazeStepInterval;
      lastFrameAt = now;
      const scrollSmoothing = 1 - Math.pow(1 - 0.035, elapsed / mazeStepInterval);
      smoothedScroll += (scrollOffset - smoothedScroll) * scrollSmoothing;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.fillStyle = backdrop;
      context.fillRect(0, 0, width, height);

      context.save();
      context.translate(0, -smoothedScroll * parallaxFactor);
      preset.draw(context, {
        now,
        elapsed,
        width,
        height,
        pixelRatio,
        cursor: cursor && { x: cursor.x, y: cursor.y + smoothedScroll * parallaxFactor },
      });
      context.restore();

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
      transitionCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
      return true;
    };

    const completeResizeTransition = (shouldTransition: boolean) => {
      if (!shouldTransition || !transitionDimensions) return;

      const fromDimensions = transitionDimensions;
      transitionDimensions = null;
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 520;
      const timing = { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' as const };
      const newSizeAnimation = canvas.animate(
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
      const bounds = background.getBoundingClientRect();
      cursor = { x: clientX - bounds.left, y: clientY - bounds.top };
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

<div class:unfiltered class="background" bind:this={background} aria-hidden={!showLabel}>
  <canvas class="background-canvas" bind:this={canvas} style:height={`${canvasHeight}px`}></canvas>
  <canvas class="transition-canvas" bind:this={transitionCanvas}></canvas>
  {#if showLabel}
    <a href={`/background/${preset.name}`} aria-label={`View ${preset.label} without filters`}>{preset.label} · live</a>
  {/if}
</div>

<style>
  .background {
    position: fixed;
    z-index: 0;
    inset: 0;
    overflow: hidden;
    background: #07151a;
    pointer-events: none;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
    filter: blur(2.4px) brightness(0.48) saturate(0.82);
    transform: scale(1.035);
  }

  .unfiltered canvas {
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

  a {
    position: absolute;
    z-index: 2;
    right: 1.5rem;
    bottom: 1.25rem;
    color: rgba(220, 244, 239, 0.54);
    font: 500 0.65rem/1 var(--font-mono);
    letter-spacing: 0.09em;
    pointer-events: auto;
    text-decoration: none;
    text-transform: uppercase;
  }

  a:hover {
    color: rgba(220, 244, 239, 0.82);
  }

  @media (max-width: 640px) {
    a {
      right: 1rem;
      bottom: 0.9rem;
    }
  }
</style>