import type { BackgroundDimensions, BackgroundFrame, LayeredBackgroundPreset } from './types';

interface AttractorPoint { x: number; y: number; z: number; }
interface ProjectedPoint { x: number; y: number; }

type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type StaticCanvas = HTMLCanvasElement | OffscreenCanvas;

const parameter = 1.4;
const integrationStep = 0.0038;
const transientPointCount = 9_000;
const pointsPerPath = 5_000;
const trailPointCount = 180;
const trailGradientSegments = 3;
const trailPointsPerMillisecond = 0.65 / 9;
const maximumTrailElapsed = 250;
const isometricAxisScale = Math.sqrt(3) / 2;
const viewportFill = 0.86;

const initialPoints: AttractorPoint[] = [
  { x: 1, y: 0, z: 0 },
  { x: 1.08, y: 0.06, z: -0.04 },
  { x: 0.94, y: -0.08, z: 0.05 },
  { x: 0.88, y: 0.12, z: 0.1 },
  { x: 1.14, y: -0.06, z: -0.12 },
  { x: 1.02, y: 0.18, z: -0.09 },
  { x: 0.84, y: -0.14, z: 0.08 },
  { x: 1.2, y: 0.1, z: 0.02 },
  { x: 0.92, y: 0.04, z: -0.16 },
  { x: 1.1, y: -0.12, z: 0.14 },
];

export class HalvorsenPreset implements LayeredBackgroundPreset {
  readonly name = 'halvorsen' as const;
  readonly label = 'Halvorsen attractor';
  readonly hasDynamicContent = true;
  private paths: ProjectedPoint[][] = [];
  private staticLayer: StaticCanvas | null = null;
  private width = 0;
  private height = 0;
  private trailHeads: number[] = [];
  private trails: ProjectedPoint[][] = [];
  private trailStates: AttractorPoint[] = [];
  private trailProgress: number[] = [];
  private projectionScale = 1;
  private projectionCenterX = 0;
  private projectionCenterY = 0;
  private _staticVersion = 0;

  get staticVersion() {
    return this._staticVersion;
  }

  resize({ width, height, pixelRatio }: BackgroundDimensions) {
    this.width = width;
    this.height = height;
    const attractorPaths = this.createPaths();
    const isometricPaths = attractorPaths.map((path) => path.map((point) => ({
      x: (point.x - point.y) * isometricAxisScale,
      y: (point.x + point.y) * 0.5 - point.z,
    })));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    isometricPaths.forEach((path) => path.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }));
    this.projectionScale = Math.min(
      width / Math.max(maxX - minX, 1),
      height / Math.max(maxY - minY, 1),
    ) * viewportFill;
    this.projectionCenterX = (minX + maxX) / 2;
    this.projectionCenterY = (minY + maxY) / 2;
    this.paths = attractorPaths.map((path) => path.map((point) => this.projectPoint(point)));
    this.trailHeads = this.paths.map(() => 0);
    this.trails = this.paths.map((path) => path.slice(-trailPointCount));
    this.trailStates = attractorPaths.map((path) => {
      const finalPoint = path[path.length - 1];
      return finalPoint ? { ...finalPoint } : { x: 0, y: 0, z: 0 };
    });
    this.trailProgress = this.paths.map(() => 0);
    this.staticLayer = this.createStaticLayer(pixelRatio);
    this._staticVersion += 1;
  }

  prepareFrame({ elapsed }: BackgroundFrame) {
    if (!this.trails.length) return;

    const distance = Math.min(elapsed, maximumTrailElapsed) * trailPointsPerMillisecond;
    this.trailHeads = this.trailHeads.map((trailHead, index) => {
      const progress = this.trailProgress[index] + distance;
      const pointCount = Math.floor(progress);
      this.trailProgress[index] = progress - pointCount;

      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        const nextPoint = this.nextAttractorPoint(this.trailStates[index]);
        this.trailStates[index] = nextPoint;
        this.trails[index].shift();
        this.trails[index].push(this.projectPoint(nextPoint));
      }

      return trailHead + pointCount;
    });
  }

  drawStatic(context: CanvasRenderingContext2D, { width, height }: BackgroundFrame) {
    if (this.staticLayer) {
      context.drawImage(this.staticLayer, 0, 0, width, height);
      return;
    }

    this.drawAttractor(context, width, height);
  }

  drawDynamic(context: CanvasRenderingContext2D, { width, height }: BackgroundFrame) {
    if (!this.trails.length) return;

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    context.lineWidth = 3.4;
    const trailGlow = this.createGradient(context, width, height, 0.12);
    context.strokeStyle = trailGlow;
    this.trails.forEach((trail) => {
      this.drawPath(context, trail, 0, trail.length);
      context.stroke();

      context.lineWidth = 1.1;
      const pointsPerSegment = trail.length / trailGradientSegments;
      for (let segment = 0; segment < trailGradientSegments; segment += 1) {
        context.strokeStyle = this.trailColor((segment + 1) / trailGradientSegments);
        this.drawPath(context, trail, segment * pointsPerSegment, pointsPerSegment + 1);
        context.stroke();
      }
      context.lineWidth = 3.4;
      context.strokeStyle = trailGlow;
    });
    context.restore();
  }

  private createStaticLayer(pixelRatio: number): StaticCanvas | null {
    if (typeof window === 'undefined') return null;

    const OffscreenCanvasConstructor = window.OffscreenCanvas;
    const layer = OffscreenCanvasConstructor
      ? new OffscreenCanvasConstructor(Math.floor(this.width * pixelRatio), Math.floor(this.height * pixelRatio))
      : document.createElement('canvas');
    layer.width = Math.floor(this.width * pixelRatio);
    layer.height = Math.floor(this.height * pixelRatio);
    const context = layer.getContext('2d');
    if (!context) return null;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.drawAttractor(context, this.width, this.height);
    return layer;
  }

  private drawAttractor(context: RenderContext, width: number, height: number) {
    if (!this.paths.length) return;

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    context.lineWidth = 2.8;
    context.strokeStyle = this.createGradient(context, width, height, 0.075);
    context.beginPath();
    this.paths.forEach((path) => this.drawPath(context, path, 0, path.length, false));
    context.stroke();

    context.lineWidth = 0.7;
    context.strokeStyle = this.createGradient(context, width, height, 0.48);
    context.beginPath();
    this.paths.forEach((path) => this.drawPath(context, path, 0, path.length, false));
    context.stroke();
    context.restore();
  }

  private createGradient(context: RenderContext, width: number, height: number, opacity: number) {
    const gradient = context.createLinearGradient(0, height, width, 0);
    gradient.addColorStop(0, `rgba(189, 111, 255, ${opacity})`);
    gradient.addColorStop(0.48, `rgba(83, 211, 255, ${opacity})`);
    gradient.addColorStop(1, `rgba(96, 255, 184, ${opacity})`);
    return gradient;
  }

  private trailColor(progress: number) {
    const firstHalf = Math.min(1, progress * 2);
    const secondHalf = Math.max(0, progress * 2 - 1);
    const red = Math.round(189 + (83 - 189) * firstHalf + (96 - 83) * secondHalf);
    const green = Math.round(111 + (211 - 111) * firstHalf + (255 - 211) * secondHalf);
    const blue = Math.round(255 + (255 - 255) * firstHalf + (184 - 255) * secondHalf);
    const opacity = 0.28 + progress * 0.66;
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }

  private drawPath(
    context: RenderContext,
    points: ProjectedPoint[],
    start: number,
    count: number,
    startsNewPath = true,
  ) {
    if (startsNewPath) context.beginPath();
    for (let offset = 0; offset < count; offset += 1) {
      const point = points[start + offset];
      if (!point) break;
      if (offset === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
  }

  private projectPoint({ x, y, z }: AttractorPoint): ProjectedPoint {
    const isometricX = (x - y) * isometricAxisScale;
    const isometricY = (x + y) * 0.5 - z;
    return {
      x: this.width / 2 + (isometricX - this.projectionCenterX) * this.projectionScale,
      y: this.height / 2 + (isometricY - this.projectionCenterY) * this.projectionScale,
    };
  }

  private nextAttractorPoint({ x, y, z }: AttractorPoint): AttractorPoint {
    return {
      x: x + integrationStep * (-parameter * x - 4 * y - 4 * z - y * y),
      y: y + integrationStep * (-parameter * y - 4 * z - 4 * x - z * z),
      z: z + integrationStep * (-parameter * z - 4 * x - 4 * y - x * x),
    };
  }

  private createPaths() {
    return initialPoints.map((initialPoint) => {
      const points: AttractorPoint[] = [];
      let { x, y, z } = initialPoint;
      for (let index = 0; index < pointsPerPath + transientPointCount; index += 1) {
        ({ x, y, z } = this.nextAttractorPoint({ x, y, z }));
        if (index >= transientPointCount) points.push({ x, y, z });
      }
      return points;
    });
  }
}