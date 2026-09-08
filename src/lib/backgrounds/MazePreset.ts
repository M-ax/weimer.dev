
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
  frontier: number[];
  queued: Set<number>;
  costs: number[];
  parents: number[];
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
const initialSolverProgress = 0.08;
const initialSolverProgressVariance = 0.04;
export const mazeStepInterval = 1_000 / 15;

export class MazePreset implements LayeredBackgroundPreset {
  readonly name = 'maze' as const;
  readonly label = 'Maze solver';
  readonly hasDynamicContent = true;
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

    if (this.layer) context.drawImage(this.layer, 0, 0, width, height);
  }

  drawDynamic(context: CanvasRenderingContext2D, _frame: BackgroundFrame) {
    if (!this.maze || this.maze.solvedAt !== null) return;

    const { cellSize, columns, frontier } = this.maze;
    context.save();
    context.fillStyle = 'rgba(255, 246, 196, 0.96)';
    frontier.forEach((index) => {
      const x = (index % columns) * cellSize;
      const y = Math.floor(index / columns) * cellSize;
      context.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
    });
    context.restore();
  }

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
      frontier: [0],
      queued: new Set([0]),
      costs: cells.map((_, index) => index === 0 ? 0 : Infinity),
      parents: cells.map(() => -1),
      stack: [],
      visited: new Set(),
      current: 0,
      target: columns * rows - 1,
      solvedAt: null,
      routeProgress: 0,
      lastStepAt: 0,
    };

    const initialProgress = Math.floor(cells.length * (
      initialSolverProgress + Math.random() * initialSolverProgressVariance
    ));
    while (maze.visited.size < initialProgress && maze.frontier.length && !maze.frontier.includes(maze.target)) {
      this.advanceSolver(maze);
    }

    return maze;
  }

  private advanceSolver(state: Maze) {
    if (!state.frontier.length) return [];

    const activeBranches = state.frontier.splice(0).sort((first, second) => {
      const firstCost = this.estimatedCost(state, first);
      const secondCost = this.estimatedCost(state, second);
      return firstCost - secondCost || this.distanceToTarget(state, first) - this.distanceToTarget(state, second);
    });
    state.queued.clear();
    activeBranches.forEach((current) => {
      state.current = current;
      state.visited.add(current);
      state.cells[current].solveState = 'explored';
    });

    activeBranches.forEach((current) => {
      getNeighbours(current, state.columns, state.rows)
        .filter((step) => !state.cells[current][step.direction] && !state.visited.has(step.index))
        .forEach((step) => {
          const nextCost = state.costs[current] + 1;
          if (nextCost >= state.costs[step.index]) return;

          state.costs[step.index] = nextCost;
          state.parents[step.index] = current;
          if (!state.queued.has(step.index)) {
            state.frontier.push(step.index);
            state.queued.add(step.index);
          }
        });
    });
    return activeBranches;
  }

  private estimatedCost(state: Maze, index: number) {
    return state.costs[index] + this.distanceToTarget(state, index);
  }

  private distanceToTarget(state: Maze, index: number) {
    const targetColumn = state.target % state.columns;
    const targetRow = Math.floor(state.target / state.columns);
    const column = index % state.columns;
    const row = Math.floor(index / state.columns);
    return Math.abs(targetColumn - column) + Math.abs(targetRow - row);
  }

  private buildRoute(state: Maze) {
    const route: number[] = [];
    for (let index = state.target; index !== -1; index = state.parents[index]) route.push(index);
    return route.reverse();
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
    if (state.solvedAt !== null) {
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
    const exploredIndices = this.advanceSolver(state);
    if (!exploredIndices.length) return;
    this.paintCells(state, exploredIndices);
    if (exploredIndices.includes(state.target)) {
      state.solvedAt = frame.now;
      state.stack = this.buildRoute(state);
      state.stack.forEach((index) => (state.cells[index].solveState = 'route'));
      this.paintCells(state, [state.target]);
      this._staticVersion += 1;
      return;
    }
    this._staticVersion += 1;
  }
}

function getNeighbours(index: number, columns: number, rows: number) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  return directionSteps
    .map((step) => ({ ...step, index: (row + step.row) * columns + column + step.column }))
    .filter((step) => column + step.column >= 0 && column + step.column < columns && row + step.row >= 0 && row + step.row < rows);
}