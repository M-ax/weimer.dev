import {describe, expect, test} from 'bun:test';
import {ConstellationPreset} from './ConstellationPreset';

interface TestParticle {
  x: number;
  y: number;
  baseVelocity: { x: number; y: number };
  gravityVelocity: { x: number; y: number };
  size: number;
}

interface ConstellationPresetTestHarness {
  particles: TestParticle[];
}

class TestContext {
  strokeStyle = '';
  fillStyle = '';
  private path: Array<{x: number; y: number}> = [];
  readonly strokes: Array<{from: {x: number; y: number}; to: {x: number; y: number}}> = [];

  beginPath() {
    this.path = [];
  }

  moveTo(x: number, y: number) {
    this.path.push({x, y});
  }

  lineTo(x: number, y: number) {
    this.path.push({x, y});
  }

  createRadialGradient() {
    return {addColorStop() {}};
  }

  stroke() {
    const [from, to] = this.path;
    if (from && to) this.strokes.push({from, to});
  }

  arc() {}

  fill() {}
}

describe('ConstellationPreset connection culling', () => {
  test('draws all neighboring-cell connections in their original particle order', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [
      {x: 0, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
      {x: 144, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
      {x: 146, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
      {x: 290, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
    ];
    const context = new TestContext();

    preset.draw(context as unknown as CanvasRenderingContext2D, {
      now: 0,
      elapsed: 0,
      width: 400,
      height: 200,
      pixelRatio: 1,
    });

    expect(context.strokes).toEqual([
      {from: {x: 0, y: 0}, to: {x: 144, y: 0}},
      {from: {x: 144, y: 0}, to: {x: 146, y: 0}},
      {from: {x: 146, y: 0}, to: {x: 290, y: 0}},
    ]);
  });
});

describe('ConstellationPreset cursor gravity', () => {
  const dimensions = {
    now: 0,
    elapsed: 1_000 / 60,
    width: 500,
    height: 200,
    pixelRatio: 1,
  };

  test('pulls stars on either side of a moving cursor', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [
      {x: 0, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
      {x: 400, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
    ];

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      cursor: {x: 200, y: 0, speed: 1_000},
    });

    expect(preset.particles[0].gravityVelocity.x).toBeGreaterThan(0);
    expect(preset.particles[1].gravityVelocity.x).toBeLessThan(0);
  });

  test('scales the pull with cursor speed', () => {
    const slowPreset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    const fastPreset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    slowPreset.particles = [{x: 0, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1}];
    fastPreset.particles = [{x: 0, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1}];

    slowPreset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      cursor: {x: 200, y: 0, speed: 500},
    });
    fastPreset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      cursor: {x: 200, y: 0, speed: 1_000},
    });

    expect(fastPreset.particles[0].gravityVelocity.x).toBeCloseTo(slowPreset.particles[0].gravityVelocity.x * 2);
  });

  test('does not pull stars when the cursor is still', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [{x: 0, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1}];

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      cursor: {x: 200, y: 0, speed: 0},
    });

    expect(preset.particles[0].gravityVelocity.x).toBe(0);
    expect(preset.particles[0].gravityVelocity.y).toBe(0);
  });

  test('fades residual gravity while retaining generated movement', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [{
      x: 0,
      y: 0,
      baseVelocity: {x: 0.2, y: 0},
      gravityVelocity: {x: 1, y: 0},
      size: 1,
    }];

    for (let frame = 0; frame < 60; frame += 1) {
      preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
        ...dimensions,
        cursor: {x: 200, y: 0, speed: 0},
      });
    }

    expect(preset.particles[0].gravityVelocity.x).toBeLessThan(0.03);
    expect(preset.particles[0].x).toBeGreaterThan(12);
  });
});