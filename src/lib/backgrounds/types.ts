export type PresetName = 'maze' | 'circuit' | 'life' | 'constellation' | 'halvorsen';

export interface BackgroundDimensions {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface BackgroundFrame extends BackgroundDimensions {
  now: number;
  elapsed: number;
  cursor?: { x: number; y: number; speed: number; idleDuration: number };
}

export interface BackgroundPreset {
  readonly name: PresetName;
  readonly label: string;
  resize(dimensions: BackgroundDimensions): void;
  draw(context: CanvasRenderingContext2D, frame: BackgroundFrame): void;
}

export interface LayeredBackgroundPreset extends BackgroundPreset {
  readonly staticVersion: number;
  readonly hasDynamicContent: boolean;
  prepareFrame(frame: BackgroundFrame): void;
  drawStatic(context: CanvasRenderingContext2D, frame: BackgroundFrame): void;
  drawDynamic(context: CanvasRenderingContext2D, frame: BackgroundFrame): void;
}