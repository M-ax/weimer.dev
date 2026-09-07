
type Direction = 'north' | 'east' | 'south' | 'west';
type SolveState = 'unseen' | 'explored' | 'route';

interface MazeCell {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
  carved: boolean;
  solveState: SolveState;
}

interface Maze {
  cellSize: number;
  columns: number;
  rows: number;
  cells: MazeCell[];
  stack: number[];
  visited: Set<number>;
  current: number;
  target: number;
  solvedAt: number | null;
  routeProgress: number;
  lastStepAt: number;
}

const directionSteps: Array<{
  direction: Direction;
  opposite: Direction;
  column: number;
  row: number;
}> = [
  { direction: 'north', opposite: 'south', column: 0, row: -1 },
  { direction: 'east', opposite: 'west', column: 1, row: 0 },
  { direction: 'south', opposite: 'north', column: 0, row: 1 },
  { direction: 'west', opposite: 'east', column: -1, row: 0 },
];

const mazeCellSize = 15;
const mazeRebuildDelay = 8_000;
const routeBatchSize = 500;
export const mazeStepInterval = 1_000 / 15;

export class MazePreset implements LayeredBackgroundPreset {
  readonly name = 'maze' as const;
  readonly label = 'Maze solver';
  readonly hasDynamicContent = false;
  private maze: Maze | null = null;
  private layer: HTMLCanvasElement | null = null;
  private layerContext: CanvasRenderingContext2D | null = null;
  private _staticVersion = 0;

  get staticVersion() {
    return this._staticVersion;
  }

  resize(dimensions: BackgroundDimensions) {
    this.maze = this.createMaze(dimensions.width, dimensions.height);
    this.buildLayer(this.maze, dimensions);
    this._staticVersion += 1;
  }

  draw(context: CanvasRenderingContext2D, frame: BackgroundFrame) {
    this.prepareFrame(frame);
    this.drawStatic(context, frame);
    this.drawDynamic(context, frame);
  }

  prepareFrame(frame: BackgroundFrame) {
    if (!this.maze) return;
    this.advance(this.maze, frame);
  }

  drawStatic(context: CanvasRenderingContext2D, { width, height }: BackgroundFrame) {
    if (!this.maze) return;

    const { cellSize, columns, current } = this.maze;
    if (this.layer) context.drawImage(this.layer, 0, 0, width, height);

    const currentX = (current % columns) * cellSize;
    const currentY = Math.floor(current / columns) * cellSize;
    context.fillStyle = 'rgba(255, 246, 196, 0.96)';
    context.fillRect(currentX + 2, currentY + 2, cellSize - 4, cellSize - 4);
  }

  drawDynamic(_context: CanvasRenderingContext2D, _frame: BackgroundFrame) {}

  private createMaze(width: number, height: number): Maze {
    const cellSize = mazeCellSize;
    const columns = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const cells = Array.from({ length: columns * rows }, () => ({
      north: true,
      east: true,
      south: true,
      west: true,
      carved: false,
      solveState: 'unseen' as SolveState,
    }));
    const carveStack = [0];
    cells[0].carved = true;

    while (carveStack.length) {
      const index = carveStack[carveStack.length - 1];
      const available = getNeighbours(index, columns, rows).filter(({ index: neighbour }) => !cells[neighbour].carved);

      if (!available.length) {
        carveStack.pop();
        continue;
      }

      const step = available[Math.floor(Math.random() * available.length)];
      const cell = cells[index];
      const neighbour = cells[step.index];
      cell[step.direction] = false;
      neighbour[step.opposite] = false;
      neighbour.carved = true;
      carveStack.push(step.index);
    }

    const maze: Maze = {
      cellSize,
      columns,
      rows,
      cells,
      stack: [0],
      visited: new Set([0]),
      current: 0,
      target: columns * rows - 1,
      solvedAt: null,
      routeProgress: 0,
      lastStepAt: 0,
    };

    const initialProgress = Math.floor(cells.length * (0.35 + Math.random() * 0.15));
    while (maze.visited.size < initialProgress && maze.current !== maze.target) {
      this.advanceSolver(maze);
    }

    return maze;
  }

  private advanceSolver(state: Maze) {
    const candidates = getNeighbours(state.current, state.columns, state.rows).filter(
      (step) => !state.cells[state.current][step.direction] && !state.visited.has(step.index),
    );

    if (candidates.length) {
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      state.visited.add(next.index);
      state.cells[next.index].solveState = 'explored';
      state.stack.push(next.index);
      state.current = next.index;
      return next.index;
    }

    state.stack.pop();
    state.current = state.stack[state.stack.length - 1] ?? 0;
    return null;
  }

  private paintCells(state: Maze, indices: Iterable<number>) {
    if (!this.layerContext) return;

    const { cellSize, columns, cells } = state;
    for (const index of indices) {
      const cell = cells[index];
      const x = (index % columns) * cellSize;
      const y = Math.floor(index / columns) * cellSize;

      if (cell.solveState === 'explored') {
        this.layerContext.fillStyle = 'rgba(71, 213, 190, 0.18)';
        this.layerContext.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      }
      if (cell.solveState === 'route') {
        this.layerContext.fillStyle = 'rgba(242, 226, 168, 0.55)';
        this.layerContext.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      }
    }
  }

  private buildLayer(state: Maze, dimensions: BackgroundDimensions) {
    this.layer = document.createElement('canvas');
    this.layer.width = Math.floor(dimensions.width * dimensions.pixelRatio);
    this.layer.height = Math.floor(dimensions.height * dimensions.pixelRatio);
    this.layerContext = this.layer.getContext('2d');
    if (!this.layerContext) return;

    this.layerContext.setTransform(dimensions.pixelRatio, 0, 0, dimensions.pixelRatio, 0, 0);
    this.paintCells(state, state.cells.keys());

    const { cellSize, columns, cells } = state;
    this.layerContext.lineWidth = 1;
    this.layerContext.strokeStyle = 'rgba(110, 245, 219, 0.38)';
    this.layerContext.beginPath();
    cells.forEach((cell, index) => {
      const x = (index % columns) * cellSize;
      const y = Math.floor(index / columns) * cellSize;
      if (cell.north) { this.layerContext?.moveTo(x, y); this.layerContext?.lineTo(x + cellSize, y); }
      if (cell.east) { this.layerContext?.moveTo(x + cellSize, y); this.layerContext?.lineTo(x + cellSize, y + cellSize); }
      if (cell.south) { this.layerContext?.moveTo(x, y + cellSize); this.layerContext?.lineTo(x + cellSize, y + cellSize); }
      if (cell.west) { this.layerContext?.moveTo(x, y); this.layerContext?.lineTo(x, y + cellSize); }
    });
    this.layerContext.stroke();
  }

  private advance(state: Maze, frame: BackgroundFrame) {
    if (state.solvedAt) {
      if (frame.now - state.solvedAt > mazeRebuildDelay) {
        this.resize(frame);
        return;
      }
      if (frame.now - state.lastStepAt < mazeStepInterval) return;
      state.lastStepAt = frame.now;
      const nextRouteProgress = Math.min(state.routeProgress + routeBatchSize, state.stack.length);
      if (nextRouteProgress === state.routeProgress) return;
      this.paintCells(state, state.stack.slice(state.routeProgress, nextRouteProgress));
      state.routeProgress = nextRouteProgress;
      this._staticVersion += 1;
      return;
    }

    if (frame.now - state.lastStepAt < mazeStepInterval) return;
    state.lastStepAt = frame.now;
    if (state.current === state.target) {
      state.solvedAt = frame.now;
      state.stack.forEach((index) => (state.cells[index].solveState = 'route'));
      return;
    }

    const previousCurrent = state.current;
    const exploredIndex = this.advanceSolver(state);
    if (exploredIndex !== null) this.paintCells(state, [exploredIndex]);
    if (exploredIndex !== null || state.current !== previousCurrent) this._staticVersion += 1;
  }
}

function getNeighbours(index: number, columns: number, rows: number) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  return directionSteps
    .map((step) => ({ ...step, index: (row + step.row) * columns + column + step.column }))
    .filter((step) => column + step.column >= 0 && column + step.column < columns && row + step.row >= 0 && row + step.row < rows);
}