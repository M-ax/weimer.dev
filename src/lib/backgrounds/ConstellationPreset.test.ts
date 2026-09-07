import {describe, expect, test} from 'bun:test';
import {ConstellationPreset} from './ConstellationPreset';

interface TestParticle {
  x: number;
  y: number;
  dx: number;
  dy: number;
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
      {x: 0, y: 0, dx: 0, dy: 0, size: 1},
      {x: 144, y: 0, dx: 0, dy: 0, size: 1},
      {x: 146, y: 0, dx: 0, dy: 0, size: 1},
      {x: 290, y: 0, dx: 0, dy: 0, size: 1},
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