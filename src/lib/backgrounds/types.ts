export type PresetName = 'maze' | 'circuit' | 'constellation';

export interface BackgroundDimensions {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface BackgroundFrame extends BackgroundDimensions {
  now: number;
  elapsed: number;
  cursor?: { x: number; y: number };
}

export interface BackgroundPreset {
  readonly name: PresetName;
  readonly label: string;
  resize(dimensions: BackgroundDimensions): void;
  draw(context: CanvasRenderingContext2D, frame: BackgroundFrame): void;
}