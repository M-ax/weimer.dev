import {describe, expect, test} from 'bun:test';
import {ConstellationPreset} from './ConstellationPreset';

interface TestParticle {
  x: number;
  y: number;
  baseVelocity: { x: number; y: number };
  gravityVelocity: { x: number; y: number };
  size: number;
  cometTrail?: Array<{ x: number; y: number; age?: number }>;
  explosionFrames?: number;
}

interface ConstellationPresetTestHarness {
  particles: TestParticle[];
}

class TestContext {
  strokeStyle = '';
  fillStyle = '';
  lineWidth = 1;
  private path: Array<{x: number; y: number}> = [];
  private arcCenter: {x: number; y: number; radius: number} | undefined;
  readonly strokes: Array<{from: {x: number; y: number}; to: {x: number; y: number}}> = [];
  readonly connectionStrokes: Array<{from: {x: number; y: number}; to: {x: number; y: number}}> = [];
  readonly cometStrokes: Array<{from: {x: number; y: number}; to: {x: number; y: number}}> = [];
  readonly cometStrokeOpacities: number[] = [];
  readonly cometLineWidths: number[] = [];
  readonly cometSparkles: Array<{x: number; y: number; radius: number}> = [];

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
    if (!from || !to) return;

    const stroke = {from, to};
    this.strokes.push(stroke);
    if (this.strokeStyle.startsWith('rgba(198, 170, 255,')) this.connectionStrokes.push(stroke);
    if (this.strokeStyle.startsWith('rgba(220, 197, 255,')) {
      this.cometStrokes.push(stroke);
      this.cometStrokeOpacities.push(Number(this.strokeStyle.match(/, ([\d.]+)\)$/)?.[1]));
      this.cometLineWidths.push(this.lineWidth);
    }
  }

  arc(x: number, y: number, radius: number) {
    this.arcCenter = {x, y, radius};
  }

  fill() {
    if (typeof this.fillStyle === 'string' && this.fillStyle.startsWith('rgba(255, 239, 255,') && this.arcCenter) {
      this.cometSparkles.push(this.arcCenter);
    }
  }
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

  test('does not connect an exploding star to neighboring stars', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [
      {x: 0, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
      {x: 60, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1, explosionFrames: 2},
      {x: 120, y: 0, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
    ];
    const context = new TestContext();

    preset.draw(context as unknown as CanvasRenderingContext2D, {
      now: 0,
      elapsed: 0,
      width: 400,
      height: 200,
      pixelRatio: 1,
    });

    expect(context.connectionStrokes).toEqual([
      {from: {x: 0, y: 0}, to: {x: 120, y: 0}},
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

  test('does not pull an exploding star toward a moving cursor', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [{
      x: 100,
      y: 100,
      baseVelocity: {x: 0, y: 0},
      gravityVelocity: {x: 0, y: 0},
      size: 1,
      explosionFrames: 5,
    }];

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      cursor: {x: 300, y: 100, speed: 2_400},
    });

    expect(preset.particles[0].gravityVelocity.x).toBe(0);
    expect(preset.particles[0].gravityVelocity.y).toBe(0);
  });

  test('fades explosion velocity more slowly than ordinary cursor gravity', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [
      {
        x: 100,
        y: 100,
        baseVelocity: {x: 0, y: 0},
        gravityVelocity: {x: 1, y: 0},
        size: 1,
        explosionFrames: 5,
      },
      {x: 300, y: 100, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 1, y: 0}, size: 1},
    ];

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, dimensions);

    expect(preset.particles[0].gravityVelocity.x).toBeGreaterThan(0.995);
    expect(preset.particles[1].gravityVelocity.x).toBeLessThan(0.95);
  });
});

describe('ConstellationPreset clumps', () => {
  const dimensions = {
    now: 0,
    elapsed: 1_000 / 60,
    width: 500,
    height: 200,
    pixelRatio: 1,
  };

  const clump = (count: number): TestParticle[] => Array.from({length: count}, (_, index) => ({
    x: 100 + index % 4 * 8,
    y: 100 + Math.floor(index / 4) * 8,
    baseVelocity: {x: 0, y: 0},
    gravityVelocity: {x: 0.6, y: 0.2},
    size: 1,
  }));

  const linearClump = (spacing: number): TestParticle[] => Array.from({length: 6}, (_, index) => ({
    x: 100 + index * spacing,
    y: 100,
    baseVelocity: {x: 0, y: 0},
    gravityVelocity: {x: 0.6, y: 0.2},
    size: 1,
  }));

  const explosionTestParticles = (): TestParticle[] => [
    {x: 90, y: 290, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
    {x: 110, y: 290, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
    {x: 90, y: 310, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
    {x: 110, y: 310, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
    {x: 100, y: 300, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
    {x: 100, y: 320, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
    {x: 100, y: 245, baseVelocity: {x: 0, y: 0}, gravityVelocity: {x: 0, y: 0}, size: 1},
  ];

  test('explodes clumps larger than five stars after the cursor is idle for one hundred milliseconds', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = clump(6);

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      cursor: {x: 250, y: 100, speed: 0, idleDuration: 100},
    });

    for (const particle of preset.particles) {
      expect(Math.hypot(particle.gravityVelocity.x, particle.gravityVelocity.y)).toBeGreaterThan(28);
      expect(particle.explosionFrames ?? 0).toBeGreaterThan(0);
    }
  });

  test('fans a clump explosion across all directions despite a shared cursor pull', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = clump(6);

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      cursor: {x: 250, y: 100, speed: 0, idleDuration: 100},
    });

    const velocities = preset.particles.map((particle) => particle.gravityVelocity);
    expect(velocities.some((velocity) => velocity.x > 0)).toBe(true);
    expect(velocities.some((velocity) => velocity.x < 0)).toBe(true);
    expect(velocities.some((velocity) => velocity.y > 0)).toBe(true);
    expect(velocities.some((velocity) => velocity.y < 0)).toBe(true);
  });

  test('does not explode a clump of exactly five stars', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = clump(5);

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, dimensions);

    for (const particle of preset.particles) {
      expect(particle.gravityVelocity.x).toBeGreaterThan(0);
      expect(particle.gravityVelocity.y).toBeGreaterThan(0);
      expect(particle.explosionFrames ?? 0).toBe(0);
    }
  });

  test('waits until the cursor has been stopped for one hundred milliseconds before exploding a large clump', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = clump(6);

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      cursor: {x: 250, y: 100, speed: 1_000, idleDuration: 0},
    });

    expect(preset.particles.every((particle) => (particle.explosionFrames ?? 0) === 0)).toBe(true);

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      cursor: {x: 250, y: 100, speed: 0, idleDuration: 99},
    });

    expect(preset.particles.every((particle) => (particle.explosionFrames ?? 0) === 0)).toBe(true);

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      cursor: {x: 250, y: 100, speed: 0, idleDuration: 100},
    });

    expect(preset.particles.every((particle) => (particle.explosionFrames ?? 0) > 0)).toBe(true);
  });

  test('does not treat stars more than thirty-five pixels apart as one clump', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = Array.from({length: 6}, (_, index) => ({
      x: 40 + index * 40,
      y: 100,
      baseVelocity: {x: 0, y: 0},
      gravityVelocity: {x: 0.6, y: 0.2},
      size: 1,
    }));

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      cursor: {x: 250, y: 100, speed: 0, idleDuration: 100},
    });

    expect(preset.particles.every((particle) => (particle.explosionFrames ?? 0) === 0)).toBe(true);
  });

  test('gives tighter clumps a stronger explosion impulse', () => {
    const tightPreset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    const loosePreset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    tightPreset.particles = linearClump(2);
    loosePreset.particles = linearClump(12);

    tightPreset.draw(new TestContext() as unknown as CanvasRenderingContext2D, dimensions);
    loosePreset.draw(new TestContext() as unknown as CanvasRenderingContext2D, dimensions);

    expect(Math.abs(tightPreset.particles[0].gravityVelocity.x)).toBeGreaterThan(
      Math.abs(loosePreset.particles[0].gravityVelocity.x) * 2,
    );
  });

  test('explodes nearby stars outward from the clump center', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = explosionTestParticles();

    preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      height: 500,
      cursor: {x: 250, y: 300, speed: 0, idleDuration: 100},
    });

    const nearbyParticle = preset.particles[6];
    expect(nearbyParticle.explosionFrames ?? 0).toBeGreaterThan(0);
    expect(nearbyParticle.gravityVelocity.y).toBeLessThan(-30);
  });

  test('draws a comet trail for every star affected by an explosion', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = explosionTestParticles();
    const context = new TestContext();

    preset.draw(context as unknown as CanvasRenderingContext2D, {
      ...dimensions,
      height: 500,
      cursor: {x: 250, y: 300, speed: 0, idleDuration: 100},
    });

    expect(preset.particles.every((particle) => particle.cometTrail?.length)).toBe(true);
    expect(context.cometStrokes).toHaveLength(preset.particles.length);
  });

  test('draws a comet trail behind an exploding star', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [{
      x: 100,
      y: 100,
      baseVelocity: {x: 0, y: 0},
      gravityVelocity: {x: 0, y: 0},
      size: 1,
      cometTrail: [{x: 90, y: 100}],
      explosionFrames: 1,
    }];
    const context = new TestContext();

    preset.draw(context as unknown as CanvasRenderingContext2D, dimensions);

    expect(context.strokes).toContainEqual({from: {x: 100, y: 100}, to: {x: 90, y: 100}});
  });

  test('renders a sharply fading comet trail as wide as its star', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [{
      x: 100,
      y: 100,
      baseVelocity: {x: 0, y: 0},
      gravityVelocity: {x: 0, y: 0},
      size: 2,
      cometTrail: [{x: 90, y: 100, age: 0}, {x: 80, y: 100, age: 48}],
      explosionFrames: 1,
    }];
    const context = new TestContext();

    preset.draw(context as unknown as CanvasRenderingContext2D, {...dimensions, elapsed: 0});

    expect(context.cometLineWidths).toEqual([2, 2, 2]);
    expect(context.cometStrokeOpacities.at(-1)).toBeLessThan(context.cometStrokeOpacities[0] * 0.1);
  });

  test('leaves small sparkles beside active comet trail segments', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [{
      x: 100,
      y: 100,
      baseVelocity: {x: 0, y: 0},
      gravityVelocity: {x: 0, y: 0},
      size: 2,
      cometTrail: [{x: 90, y: 100, age: 0}],
      explosionFrames: 1,
    }];
    const context = new TestContext();

    preset.draw(context as unknown as CanvasRenderingContext2D, {...dimensions, elapsed: 0});

    expect(context.cometSparkles).toHaveLength(1);
    expect(context.cometSparkles[0].y).not.toBe(100);
    expect(context.cometSparkles[0].radius).toBeLessThan(2);
  });

  test('does not tether a moving star to its residual comet trail after an explosion', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [{
      x: 100,
      y: 100,
      baseVelocity: {x: 10, y: 0},
      gravityVelocity: {x: 0, y: 0},
      size: 1,
      cometTrail: [{x: 90, y: 100}, {x: 80, y: 100}],
      explosionFrames: 0,
    }];
    const context = new TestContext();

    preset.draw(context as unknown as CanvasRenderingContext2D, dimensions);

    expect(context.cometStrokes).toEqual([
      {from: {x: 90, y: 100}, to: {x: 80, y: 100}},
    ]);
  });

  test('keeps comet trail points for more than forty-eight frames', () => {
    const preset = new ConstellationPreset() as unknown as ConstellationPresetTestHarness & ConstellationPreset;
    preset.particles = [{
      x: 100,
      y: 100,
      baseVelocity: {x: 0, y: 0},
      gravityVelocity: {x: 0, y: 0},
      size: 1,
      cometTrail: [{x: 90, y: 100, age: 0}],
      explosionFrames: 0,
    }];

    for (let frame = 0; frame < 49; frame += 1) {
      preset.draw(new TestContext() as unknown as CanvasRenderingContext2D, dimensions);
    }

    expect(preset.particles[0].cometTrail).toHaveLength(1);
  });
});