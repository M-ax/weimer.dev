import { describe, expect, test } from 'bun:test';
import { HalvorsenPreset } from './HalvorsenPreset';

class TestGradient {
  readonly stops: Array<{ offset: number; color: string }> = [];

  addColorStop(offset: number, color: string) {
    this.stops.push({ offset, color });
  }
}

class TestContext {
  strokeStyle: string | TestGradient = '';
  lineWidth = 0;
  segments: Array<{ x: number; y: number }> = [];
  paths: Array<Array<{ x: number; y: number }>> = [];
  gradients: TestGradient[] = [];
  pathStarts = 0;
  save() {}
  restore() {}
  beginPath() {
    this.pathStarts += 1;
    this.paths.push([]);
  }
  moveTo(x: number, y: number) {
    const point = { x, y };
    this.segments.push(point);
    this.paths.at(-1)?.push(point);
  }
  lineTo(x: number, y: number) {
    const point = { x, y };
    this.segments.push(point);
    this.paths.at(-1)?.push(point);
  }
  stroke() {}
  createLinearGradient() {
    const gradient = new TestGradient();
    this.gradients.push(gradient);
    return gradient as unknown as CanvasGradient;
  }
  set lineCap(_value: CanvasLineCap) {}
  set lineJoin(_value: CanvasLineJoin) {}
}

describe('HalvorsenPreset', () => {
  test('caches ten gradient attractor paths and advances continuous moving trails', () => {
    const preset = new HalvorsenPreset();
    const staticContext = new TestContext();
    const dynamicContext = new TestContext();
    preset.resize({ width: 1200, height: 800, pixelRatio: 1 });
    preset.drawStatic(staticContext as unknown as CanvasRenderingContext2D, {
      now: 0, elapsed: 16, width: 1200, height: 800, pixelRatio: 1,
    });

    expect(preset.hasDynamicContent).toBe(true);
    expect(preset.staticVersion).toBe(1);
    expect(staticContext.segments).toHaveLength(100_000);
    expect(staticContext.pathStarts).toBe(2);
    expect(staticContext.gradients).toHaveLength(2);
    expect(staticContext.gradients.every(({ stops }) => stops.length === 3)).toBe(true);
    expect(staticContext.segments.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    const staticWidth = Math.max(...staticContext.segments.map(({ x }) => x))
      - Math.min(...staticContext.segments.map(({ x }) => x));
    const staticHeight = Math.max(...staticContext.segments.map(({ y }) => y))
      - Math.min(...staticContext.segments.map(({ y }) => y));
    expect(Math.max(staticWidth, staticHeight)).toBeGreaterThan(680);

    preset.prepareFrame({ now: 8, elapsed: 8, width: 1200, height: 800, pixelRatio: 1 });
    preset.drawDynamic(dynamicContext as unknown as CanvasRenderingContext2D, {
      now: 8, elapsed: 8, width: 1200, height: 800, pixelRatio: 1,
    });
    const firstTrailStart = dynamicContext.segments[0];
    const pointsPerPath = staticContext.segments.length / 20;
    expect(firstTrailStart).toEqual(staticContext.segments[pointsPerPath - 180]);
    expect(dynamicContext.segments[177]).not.toEqual(staticContext.segments[0]);
    expect(dynamicContext.paths[3]).toHaveLength(60);
    expect(dynamicContext.paths[3].at(-1)).not.toEqual(dynamicContext.paths[0][0]);

    dynamicContext.segments = [];
    dynamicContext.paths = [];
    dynamicContext.pathStarts = 0;
    preset.prepareFrame({ now: 16, elapsed: 8, width: 1200, height: 800, pixelRatio: 1 });
    preset.drawDynamic(dynamicContext as unknown as CanvasRenderingContext2D, {
      now: 16, elapsed: 8, width: 1200, height: 800, pixelRatio: 1,
    });

    expect(dynamicContext.pathStarts).toBe(40);
    expect(dynamicContext.segments).toHaveLength(3_620);
    expect(dynamicContext.segments[0]).toEqual(staticContext.segments[pointsPerPath - 179]);
    expect(dynamicContext.segments[0]).not.toEqual(firstTrailStart);
  });
});