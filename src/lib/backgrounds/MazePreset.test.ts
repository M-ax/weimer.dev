import {describe, expect, test} from 'bun:test';
import {MazePreset} from './MazePreset';

type TestCell = {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
  carved: boolean;
  solveState: 'unseen' | 'explored' | 'route';
};

class TestContext {
  fillStyle = '';
  readonly fills: Array<{ x: number; y: number; width: number; height: number; color: string }> = [];

  fillRect(x: number, y: number, width: number, height: number) {
    this.fills.push({ x, y, width, height, color: this.fillStyle });
  }

  save() {}

  restore() {}
}

describe('MazePreset solver', () => {
  test('advances every active branch together, including a misleading branch', () => {
    const cells: TestCell[] = Array.from({length: 9}, () => ({
      north: true,
      east: true,
      south: true,
      west: true,
      carved: true,
      solveState: 'unseen',
    }));
    const connect = (from: number, direction: 'north' | 'east' | 'south' | 'west', to: number) => {
      const opposite = {north: 'south', east: 'west', south: 'north', west: 'east'}[direction];
      cells[from][direction] = false;
      cells[to][opposite] = false;
    };
    connect(0, 'east', 1);
    connect(1, 'east', 2);
    connect(2, 'south', 5);
    connect(5, 'south', 8);
    connect(1, 'south', 4);
    connect(4, 'south', 7);

    const state = {
      cellSize: 15,
      columns: 3,
      rows: 3,
      cells,
      frontier: [0],
      queued: new Set([0]),
      costs: [0, ...Array.from({length: 8}, () => Infinity)],
      parents: Array.from({length: 9}, () => -1),
      stack: [],
      visited: new Set<number>(),
      current: 0,
      target: 8,
      solvedAt: null,
      routeProgress: 0,
      lastStepAt: 0,
    };
    const preset = new MazePreset() as unknown as {advanceSolver: (maze: typeof state) => number[]};
    preset.advanceSolver(state);
    preset.advanceSolver(state);
    preset.advanceSolver(state);

    expect(state.parents).toEqual([-1, 0, 1, -1, 1, 2, -1, 4, -1]);
    expect(state.visited).toEqual(new Set([0, 1, 2, 4]));
    expect(state.frontier).toEqual([5, 7]);
  });

  test('displays every active solution candidate at once', () => {
    const preset = new MazePreset() as unknown as MazePreset & {
      maze: { cellSize: number; columns: number; frontier: number[]; solvedAt: number | null } | null;
    };
    const context = new TestContext();
    preset.maze = { cellSize: 15, columns: 3, frontier: [1, 3], solvedAt: null };

    expect(preset.hasDynamicContent).toBe(true);
    preset.drawDynamic(context as unknown as CanvasRenderingContext2D, {
      now: 0, elapsed: 0, width: 45, height: 45, pixelRatio: 1,
    });

    expect(context.fills).toEqual([
      { x: 17, y: 2, width: 11, height: 11, color: 'rgba(255, 246, 196, 0.96)' },
      { x: 2, y: 17, width: 11, height: 11, color: 'rgba(255, 246, 196, 0.96)' },
    ]);
  });

  test('marks the exit as part of the route as soon as it is reached', () => {
    const cells: TestCell[] = [{
      north: true,
      east: true,
      south: true,
      west: true,
      carved: true,
      solveState: 'unseen',
    }];
    const state = {
      cellSize: 15,
      columns: 1,
      rows: 1,
      cells,
      frontier: [0],
      queued: new Set([0]),
      costs: [0],
      parents: [-1],
      stack: [],
      visited: new Set<number>(),
      current: 0,
      target: 0,
      solvedAt: null,
      routeProgress: 0,
      lastStepAt: 0,
    };
    const context = new TestContext();
    const preset = new MazePreset() as unknown as {
      layerContext: TestContext | null;
      advance: (maze: unknown, frame: unknown) => void;
    };
    preset.layerContext = context;

    preset.advance(state, { now: 1_000 / 15, elapsed: 0, width: 15, height: 15, pixelRatio: 1 });

    expect(state.solvedAt).toBe(1_000 / 15);
    expect(cells[0].solveState).toBe('route');
    expect(context.fills.at(-1)).toEqual({
      x: 2, y: 2, width: 11, height: 11, color: 'rgba(242, 226, 168, 0.55)',
    });
  });
});