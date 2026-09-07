import type { BackgroundDimensions, BackgroundFrame, BackgroundPreset } from './types';

interface Particle { x: number; y: number; dx: number; dy: number; size: number; }

export class ConstellationPreset implements BackgroundPreset {
  readonly name = 'constellation' as const;
  readonly label = 'Signal constellation';
  private particles: Particle[] = [];

  resize({ width, height }: BackgroundDimensions) {
    this.particles = Array.from({ length: Math.max(42, Math.round((width * height) / 24000)) }, () => ({
      x: Math.random() * width, y: Math.random() * height, dx: (Math.random() - 0.5) * 0.23, dy: (Math.random() - 0.5) * 0.23, size: 1 + Math.random() * 1.4,
    }));
  }

  draw(context: CanvasRenderingContext2D, { width, height, elapsed, cursor }: BackgroundFrame) {
    const movementScale = elapsed / (1_000 / 60);
    this.particles.forEach((particle) => {
      particle.x += particle.dx * movementScale;
      particle.y += particle.dy * movementScale;
      if (particle.x < 0 || particle.x > width) particle.dx *= -1;
      if (particle.y < 0 || particle.y > height) particle.dy *= -1;
    });
    for (let first = 0; first < this.particles.length; first += 1) {
      for (let second = first + 1; second < this.particles.length; second += 1) {
        const horizontal = this.particles[first].x - this.particles[second].x;
        const vertical = this.particles[first].y - this.particles[second].y;
        const distance = Math.hypot(horizontal, vertical);
        if (distance > 145) continue;
        context.strokeStyle = `rgba(174, 137, 255, ${0.24 * (1 - distance / 145)})`;
        context.beginPath();
        context.moveTo(this.particles[first].x, this.particles[first].y);
        context.lineTo(this.particles[second].x, this.particles[second].y);
        context.stroke();
      }
    }
    this.particles.forEach((particle) => {
      const cursorIntensity = cursor
        ? Math.pow(Math.max(0, 1 - Math.hypot(particle.x - cursor.x, particle.y - cursor.y) / 180), 2)
        : 0;
      context.fillStyle = `rgba(226, 210, 255, ${0.82 + cursorIntensity * 0.18})`;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * (1 + cursorIntensity * 0.45), 0, Math.PI * 2);
      context.fill();
    });
  }
}