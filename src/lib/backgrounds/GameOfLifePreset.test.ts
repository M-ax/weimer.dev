import {describe, expect, test} from 'bun:test';
import {GameOfLifePreset} from './GameOfLifePreset';

type LifeGrid = {
  columns: number;
  rows: number;
  cells: Set<string>;
  lastStepAt: number;
  nextResetAt: number;
  simulationNumber: number;
  cellTransitions: Map<string, {from: number; to: number; startedAt: number}>;
  sceneTransition: {
    cells: Set<string>;
    lastStepAt: number;
    cellTransitions: Map<string, {from: number; to: number; startedAt: number}>;
    startedAt: number;
  } | null;
};

type GameOfLifeTestHarness = {
  grid: LifeGrid | null;
  createInitialCells(columns: number, rows: number, simulationNumber?: number): Set<string>;
  createBootstrappedInitialCells(columns: number, rows: number, simulationNumber: number): Set<string>;
  placePatternRandomly(cells: Set<string>, pattern: Array<{column: number; row: number}>, columns: number, rows: number, random: () => number): boolean;
  nextGeneration(cells: Set<string>, columns: number, rows: number): Set<string>;
  cellOpacity(key: string, now: number): number;
  sceneTransitionProgress(now: number): number;
};

describe('GameOfLifePreset', () => {
  test('uses the circuit grid size and seeds a varied collection of lifeforms', () => {
    const preset = new GameOfLifePreset() as unknown as GameOfLifeTestHarness;
    const cells = preset.createInitialCells(100, 80);

    expect(cells.size).toBeGreaterThan(150);
    expect(preset.createInitialCells(100, 80)).toEqual(cells);
    expect(preset.createInitialCells(101, 80)).not.toEqual(cells);
    expect(preset.createInitialCells(100, 80, 1)).not.toEqual(cells);
  });

  test('positions complete lifeforms at clear random grid locations', () => {
    const preset = new GameOfLifePreset() as unknown as GameOfLifeTestHarness;
    const cells = new Set(['0:0']);
    const randomValues = [0, 0, 0.9, 0.9];
    const random = () => randomValues.shift() ?? 0;

    expect(preset.placePatternRandomly(cells, [{column: 0, row: 0}, {column: 1, row: 0}], 8, 7, random)).toBe(true);
    expect(cells).toEqual(new Set(['0:0', '6:6', '7:6']));
  });

  test('applies Conway survival and birth rules', () => {
    const preset = new GameOfLifePreset() as unknown as GameOfLifeTestHarness;
    const verticalBlinker = new Set(['2:1', '2:2', '2:3']);

    expect(preset.nextGeneration(verticalBlinker, 6, 6)).toEqual(new Set(['1:2', '2:2', '3:2']));
  });

  test('fades cell changes across one generation interval', () => {
    const preset = new GameOfLifePreset() as unknown as GameOfLifePreset & GameOfLifeTestHarness;
    preset.grid = {
      columns: 6,
      rows: 6,
      cells: new Set(['2:1', '2:2', '2:3']),
      lastStepAt: 0,
      nextResetAt: 42_000,
      simulationNumber: 0,
      cellTransitions: new Map(),
      sceneTransition: null,
    };

    preset.prepareFrame({now: 140, elapsed: 140, width: 90, height: 90, pixelRatio: 1});

    expect(preset.grid.cells).toEqual(new Set(['1:2', '2:2', '3:2']));
    expect(preset.cellOpacity('1:2', 210)).toBeCloseTo(0.5);
    expect(preset.cellOpacity('2:1', 210)).toBeCloseTo(0.5);

    preset.prepareFrame({now: 280, elapsed: 140, width: 90, height: 90, pixelRatio: 1});

    expect(preset.grid.cells).toEqual(new Set(['2:1', '2:2', '2:3']));
    expect(preset.cellOpacity('2:1', 350)).toBeCloseTo(0.5);
  });

  test('crossfades two evolving simulations into a bootstrapped replacement', () => {
    const preset = new GameOfLifePreset() as unknown as GameOfLifePreset & GameOfLifeTestHarness;
    preset.grid = {
      columns: 40,
      rows: 40,
      cells: new Set(['2:1', '2:2', '2:3']),
      lastStepAt: 0,
      nextResetAt: 42_000,
      simulationNumber: 0,
      cellTransitions: new Map(),
      sceneTransition: null,
    };

    preset.prepareFrame({now: 42_000, elapsed: 16, width: 600, height: 600, pixelRatio: 1});

    expect(preset.grid.sceneTransition?.cells).toEqual(new Set(['2:1', '2:2', '2:3']));
    expect(preset.grid.sceneTransition?.lastStepAt).toBe(42_000);
    expect(preset.grid.cells).toEqual(preset.createBootstrappedInitialCells(40, 40, 1));
    expect(preset.grid.lastStepAt).toBe(42_000);
    expect(preset.grid.simulationNumber).toBe(1);
    expect(preset.sceneTransitionProgress(42_300)).toBeCloseTo(0.5);

    preset.prepareFrame({now: 42_140, elapsed: 16, width: 600, height: 600, pixelRatio: 1});

    expect(preset.grid.sceneTransition?.lastStepAt).toBe(42_140);
    expect(preset.grid.lastStepAt).toBe(42_140);

    preset.prepareFrame({now: 42_600, elapsed: 16, width: 600, height: 600, pixelRatio: 1});

    expect(preset.grid.sceneTransition).toBeNull();
    expect(preset.grid.lastStepAt).toBe(42_560);
    expect(preset.grid.nextResetAt).toBe(84_600);
  });
});