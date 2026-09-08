import type {BackgroundDimensions, BackgroundFrame, LayeredBackgroundPreset} from './types';

type Cell = {column: number; row: number};

interface CellTransition {
  from: number;
  to: number;
  startedAt: number;
}

interface LifeSimulation {
  cells: Set<string>;
  lastStepAt: number;
  cellTransitions: Map<string, CellTransition>;
}

interface SceneTransition extends LifeSimulation {
  startedAt: number;
}

interface LifeGrid extends LifeSimulation {
  columns: number;
  rows: number;
  nextResetAt: number;
  simulationNumber: number;
  sceneTransition: SceneTransition | null;
}

const gridSize = 15;
const generationInterval = 140;
const resetInterval = 42_000;
const cellTransitionDuration = generationInterval;
const sceneTransitionDuration = 600;
const bootstrapGenerations = 2;
const lifeformPadding = 4;

const gliderGun: Cell[] = [
  {column: 24, row: 0}, {column: 22, row: 1}, {column: 24, row: 1}, {column: 12, row: 2}, {column: 13, row: 2}, {column: 20, row: 2}, {column: 21, row: 2}, {column: 34, row: 2}, {column: 35, row: 2},
  {column: 11, row: 3}, {column: 15, row: 3}, {column: 20, row: 3}, {column: 21, row: 3}, {column: 34, row: 3}, {column: 35, row: 3},
  {column: 0, row: 4}, {column: 1, row: 4}, {column: 10, row: 4}, {column: 16, row: 4}, {column: 20, row: 4}, {column: 21, row: 4},
  {column: 0, row: 5}, {column: 1, row: 5}, {column: 10, row: 5}, {column: 14, row: 5}, {column: 16, row: 5}, {column: 17, row: 5}, {column: 22, row: 5}, {column: 24, row: 5},
  {column: 10, row: 6}, {column: 16, row: 6}, {column: 24, row: 6},
  {column: 11, row: 7}, {column: 15, row: 7},
  {column: 12, row: 8}, {column: 13, row: 8},
];

const lightweightSpaceship: Cell[] = [
  {column: 1, row: 0}, {column: 4, row: 0}, {column: 0, row: 1}, {column: 0, row: 2}, {column: 4, row: 2}, {column: 0, row: 3}, {column: 1, row: 3}, {column: 2, row: 3}, {column: 3, row: 3},
];

const glider: Cell[] = [
  {column: 1, row: 0}, {column: 2, row: 1}, {column: 0, row: 2}, {column: 1, row: 2}, {column: 2, row: 2},
];

const toad: Cell[] = [
  {column: 1, row: 0}, {column: 2, row: 0}, {column: 3, row: 0}, {column: 0, row: 1}, {column: 1, row: 1}, {column: 2, row: 1},
];

const beacon: Cell[] = [
  {column: 0, row: 0}, {column: 1, row: 0}, {column: 0, row: 1}, {column: 1, row: 1}, {column: 2, row: 2}, {column: 3, row: 2}, {column: 2, row: 3}, {column: 3, row: 3},
];

const rPentomino: Cell[] = [
  {column: 1, row: 0}, {column: 2, row: 0}, {column: 0, row: 1}, {column: 1, row: 1}, {column: 1, row: 2},
];

const acorn: Cell[] = [
  {column: 1, row: 0}, {column: 3, row: 1}, {column: 0, row: 2}, {column: 1, row: 2}, {column: 4, row: 2}, {column: 5, row: 2}, {column: 6, row: 2},
];

const diehard: Cell[] = [
  {column: 6, row: 0}, {column: 0, row: 1}, {column: 1, row: 1}, {column: 1, row: 2}, {column: 5, row: 2}, {column: 6, row: 2}, {column: 7, row: 2},
];

const pulsar: Cell[] = [
  ...[2, 3, 4, 8, 9, 10].flatMap((column) => [{column, row: 0}, {column, row: 5}, {column, row: 7}, {column, row: 12}]),
  ...[0, 5, 7, 12].flatMap((column) => [{column, row: 2}, {column, row: 3}, {column, row: 4}, {column, row: 8}, {column, row: 9}, {column, row: 10}]),
];

const additionalLifeforms = [glider, toad, beacon, rPentomino, acorn, diehard];

export class GameOfLifePreset implements LayeredBackgroundPreset {
  readonly name = 'life' as const;
  readonly label = 'Life laboratory';
  readonly hasDynamicContent = true;
  private grid: LifeGrid | null = null;
  private _staticVersion = 0;

  get staticVersion() {
    return this._staticVersion;
  }

  resize({width, height}: BackgroundDimensions) {
    const columns = Math.ceil(width / gridSize);
    const rows = Math.ceil(height / gridSize);
    this.grid = {
      columns,
      rows,
      cells: this.createInitialCells(columns, rows),
      lastStepAt: Number.NaN,
      nextResetAt: Number.NaN,
      simulationNumber: 0,
      cellTransitions: new Map(),
      sceneTransition: null,
    };
    this._staticVersion += 1;
  }

  draw(context: CanvasRenderingContext2D, frame: BackgroundFrame) {
    this.prepareFrame(frame);
    this.drawStatic(context, frame);
    this.drawDynamic(context, frame);
  }

  prepareFrame({now}: BackgroundFrame) {
    if (!this.grid) return;
    if (!Number.isFinite(this.grid.nextResetAt)) {
      this.grid.lastStepAt = now;
      this.grid.nextResetAt = now + resetInterval;
      return;
    }
    this.completeCellTransitions(this.grid.cellTransitions, now);
    if (this.grid.sceneTransition) {
      this.completeCellTransitions(this.grid.sceneTransition.cellTransitions, now);
      this.advanceSimulation(this.grid.sceneTransition, now);
      this.advanceSimulation(this.grid, now);
      this.advanceSceneTransition(now);
      return;
    }
    if (now >= this.grid.nextResetAt) {
      this.beginSceneTransition(now);
      return;
    }
    this.advanceSimulation(this.grid, now);
  }

  drawStatic(context: CanvasRenderingContext2D, {width, height}: BackgroundFrame) {
    context.save();
    context.strokeStyle = 'rgba(136, 222, 169, 0.09)';
    context.lineWidth = 1;
    for (let x = 0; x <= width; x += gridSize) {
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += gridSize) {
      context.beginPath();
      context.moveTo(0, y + 0.5);
      context.lineTo(width, y + 0.5);
      context.stroke();
    }
    context.restore();
  }

  drawDynamic(context: CanvasRenderingContext2D, {now}: BackgroundFrame) {
    if (!this.grid) return;
    context.save();
    if (this.grid.sceneTransition) {
      const progress = this.sceneTransitionProgress(now);
      this.drawSimulationCells(context, this.grid.sceneTransition, now, 1 - progress);
      this.drawSimulationCells(context, this.grid, now, progress);
    } else {
      const visibleCells = new Set([...this.grid.cells, ...this.grid.cellTransitions.keys()]);
      this.drawCells(context, visibleCells, (key) => this.cellOpacity(key, now));
    }
    context.restore();
  }

  private drawSimulationCells(context: CanvasRenderingContext2D, simulation: LifeSimulation, now: number, sceneOpacity: number) {
    const visibleCells = new Set([...simulation.cells, ...simulation.cellTransitions.keys()]);
    this.drawCells(context, visibleCells, (key) => this.cellOpacityFor(simulation, key, now) * sceneOpacity);
  }

  private drawCells(context: CanvasRenderingContext2D, cells: Iterable<string>, opacityForCell: (key: string) => number) {
    for (const key of cells) {
      const opacity = opacityForCell(key);
      if (opacity <= 0) continue;
      const {column, row} = this.parseCell(key);
      context.fillStyle = `rgba(180, 255, 199, ${0.88 * opacity})`;
      context.fillRect(column * gridSize + 2, row * gridSize + 2, gridSize - 4, gridSize - 4);
    }
  }

  private beginSceneTransition(now: number) {
    if (!this.grid) return;
    this.grid.sceneTransition = {
      cells: this.grid.cells,
      lastStepAt: this.grid.lastStepAt,
      cellTransitions: this.grid.cellTransitions,
      startedAt: now,
    };
    this.grid.simulationNumber += 1;
    this.grid.cells = this.createBootstrappedInitialCells(this.grid.columns, this.grid.rows, this.grid.simulationNumber);
    this.grid.lastStepAt = now;
    this.grid.cellTransitions = new Map();
    this.advanceSimulation(this.grid.sceneTransition, now);
  }

  private advanceSimulation(simulation: LifeSimulation, now: number) {
    if (!this.grid) return;
    while (now - simulation.lastStepAt >= generationInterval) {
      const generationAt = simulation.lastStepAt + generationInterval;
      const nextCells = this.nextGeneration(simulation.cells, this.grid.columns, this.grid.rows);
      const changedCells = new Set([...simulation.cells, ...nextCells]);
      for (const key of changedCells) {
        if (simulation.cells.has(key) === nextCells.has(key)) continue;
        simulation.cellTransitions.set(key, {
          from: this.cellOpacityFor(simulation, key, generationAt),
          to: nextCells.has(key) ? 1 : 0,
          startedAt: generationAt,
        });
      }
      simulation.cells = nextCells;
      simulation.lastStepAt = generationAt;
    }
  }

  private advanceSceneTransition(now: number) {
    if (!this.grid?.sceneTransition || now - this.grid.sceneTransition.startedAt < sceneTransitionDuration) return;
    this.grid.sceneTransition = null;
    this.grid.nextResetAt = now + resetInterval;
  }

  private completeCellTransitions(cellTransitions: Map<string, CellTransition>, now: number) {
    for (const [key, transition] of cellTransitions) {
      if (now - transition.startedAt >= cellTransitionDuration) cellTransitions.delete(key);
    }
  }

  private cellOpacity(key: string, now: number) {
    if (!this.grid) return 0;
    return this.cellOpacityFor(this.grid, key, now);
  }

  private cellOpacityFor(simulation: LifeSimulation, key: string, now: number) {
    const transition = simulation.cellTransitions.get(key);
    if (!transition) return simulation.cells.has(key) ? 1 : 0;
    return transition.from + (transition.to - transition.from) * this.transitionProgress(now - transition.startedAt, cellTransitionDuration);
  }

  private sceneTransitionProgress(now: number) {
    if (!this.grid?.sceneTransition) return 1;
    return this.transitionProgress(now - this.grid.sceneTransition.startedAt, sceneTransitionDuration);
  }

  private transitionProgress(elapsed: number, duration: number) {
    const progress = Math.min(1, Math.max(0, elapsed / duration));
    return progress * progress * (3 - 2 * progress);
  }

  private createBootstrappedInitialCells(columns: number, rows: number, simulationNumber: number) {
    let cells = this.createInitialCells(columns, rows, simulationNumber);
    for (let generation = 0; generation < bootstrapGenerations; generation += 1) {
      cells = this.nextGeneration(cells, columns, rows);
    }
    return cells;
  }

  private createInitialCells(columns: number, rows: number, simulationNumber = 0) {
    const cells = new Set<string>();
    const random = this.createRandom(columns * 73_856_093 ^ rows * 19_349_663 ^ simulationNumber * 83_492_791);
    const spaceshipCount = Math.max(2, Math.min(8, Math.ceil(columns * rows / 2_000)));

    this.placePatternRandomly(cells, gliderGun, columns, rows, random);
    this.placePatternRandomly(cells, pulsar, columns, rows, random);
    additionalLifeforms.forEach((pattern) => {
      this.placePatternRandomly(cells, pattern, columns, rows, random);
    });
    for (let index = 0; index < spaceshipCount; index += 1) {
      this.placePatternRandomly(cells, lightweightSpaceship, columns, rows, random);
    }
    return cells;
  }

  private placePatternRandomly(cells: Set<string>, pattern: Cell[], columns: number, rows: number, random: () => number) {
    const minColumn = Math.min(...pattern.map(({column}) => column));
    const maxColumn = Math.max(...pattern.map(({column}) => column));
    const minRow = Math.min(...pattern.map(({row}) => row));
    const maxRow = Math.max(...pattern.map(({row}) => row));
    const patternColumns = maxColumn - minColumn + 1;
    const patternRows = maxRow - minRow + 1;
    if (patternColumns > columns || patternRows > rows) return false;

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const offsetColumn = Math.floor(random() * (columns - patternColumns + 1)) - minColumn;
      const offsetRow = Math.floor(random() * (rows - patternRows + 1)) - minRow;
      if (!this.hasPatternClearance(cells, pattern, offsetColumn, offsetRow)) continue;

      this.placePattern(cells, pattern, offsetColumn, offsetRow, columns, rows);
      return true;
    }
    return false;
  }

  private placePattern(cells: Set<string>, pattern: Cell[], offsetColumn: number, offsetRow: number, columns: number, rows: number) {
    for (const {column, row} of pattern) {
      const nextColumn = column + offsetColumn;
      const nextRow = row + offsetRow;
      if (nextColumn >= 0 && nextColumn < columns && nextRow >= 0 && nextRow < rows) cells.add(this.cellKey(nextColumn, nextRow));
    }
  }

  private hasPatternClearance(cells: Set<string>, pattern: Cell[], offsetColumn: number, offsetRow: number) {
    return pattern.every(({column, row}) => {
      const targetColumn = column + offsetColumn;
      const targetRow = row + offsetRow;
      for (let rowOffset = -lifeformPadding; rowOffset <= lifeformPadding; rowOffset += 1) {
        for (let columnOffset = -lifeformPadding; columnOffset <= lifeformPadding; columnOffset += 1) {
          if (cells.has(this.cellKey(targetColumn + columnOffset, targetRow + rowOffset))) return false;
        }
      }
      return true;
    });
  }

  private nextGeneration(cells: Set<string>, columns: number, rows: number) {
    const neighbors = new Map<string, number>();
    for (const key of cells) {
      const {column, row} = this.parseCell(key);
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          if (columnOffset === 0 && rowOffset === 0) continue;
          const neighborColumn = column + columnOffset;
          const neighborRow = row + rowOffset;
          if (neighborColumn < 0 || neighborColumn >= columns || neighborRow < 0 || neighborRow >= rows) continue;
          const neighborKey = this.cellKey(neighborColumn, neighborRow);
          neighbors.set(neighborKey, (neighbors.get(neighborKey) ?? 0) + 1);
        }
      }
    }
    return new Set([...neighbors].filter(([key, count]) => count === 3 || (count === 2 && cells.has(key))).map(([key]) => key));
  }

  private cellKey(column: number, row: number) {
    return `${column}:${row}`;
  }

  private parseCell(key: string): Cell {
    const [column, row] = key.split(':').map(Number);
    return {column, row};
  }

  private createRandom(seed: number) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ result >>> 15, result | 1);
      result ^= result + Math.imul(result ^ result >>> 7, result | 61);
      return ((result ^ result >>> 14) >>> 0) / 4_294_967_296;
    };
  }
}