import type { BackgroundDimensions, BackgroundFrame, BackgroundPreset } from './types';

interface Particle { x: number; y: number; dx: number; dy: number; size: number; }

const connectionDistance = 145;
const cursorRadius = 180;
const cursorRadiusSquared = cursorRadius * cursorRadius;

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
    const particleCells = new Map<string, number[]>();
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      particle.x += particle.dx * movementScale;
      particle.y += particle.dy * movementScale;
      if (particle.x < 0 || particle.x > width) particle.dx *= -1;
      if (particle.y < 0 || particle.y > height) particle.dy *= -1;

      const key = this.cellKey(particle.x, particle.y);
      const cell = particleCells.get(key);
      if (cell) cell.push(index);
      else particleCells.set(key, [index]);
    }
    const candidates: number[] = [];
    for (let first = 0; first < this.particles.length; first += 1) {
      const firstParticle = this.particles[first];
      const cellX = Math.floor(firstParticle.x / connectionDistance);
      const cellY = Math.floor(firstParticle.y / connectionDistance);
      candidates.length = 0;

      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          const cell = particleCells.get(`${cellX + columnOffset}:${cellY + rowOffset}`);
          if (!cell) continue;
          for (const second of cell) {
            if (second > first) candidates.push(second);
          }
        }
      }

      candidates.sort((left, right) => left - right);
      for (const second of candidates) {
        const horizontal = this.particles[first].x - this.particles[second].x;
        const vertical = this.particles[first].y - this.particles[second].y;
        if (horizontal * horizontal + vertical * vertical > connectionDistance * connectionDistance) continue;
        const distance = Math.hypot(horizontal, vertical);
        const connectionIntensity = Math.max(
          this.cursorIntensity(this.particles[first], cursor),
          this.cursorIntensity(this.particles[second], cursor),
        );
        const opacity = 0.3 * (1 - distance / connectionDistance) + connectionIntensity * 0.46;
        context.strokeStyle = `rgba(198, 170, 255, ${opacity})`;
        context.beginPath();
        context.moveTo(this.particles[first].x, this.particles[first].y);
        context.lineTo(this.particles[second].x, this.particles[second].y);
        context.stroke();
      }
    }
    const particleColor = 'rgba(226, 210, 255, 0.82)';
    context.fillStyle = particleColor;
    for (const particle of this.particles) {
      const cursorIntensity = this.cursorIntensity(particle, cursor);
      if (cursorIntensity) {
        const glowRadius = particle.size * (4 + cursorIntensity * 6);
        const glow = context.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, glowRadius);
        glow.addColorStop(0, `rgba(238, 226, 255, ${cursorIntensity * 0.5})`);
        glow.addColorStop(0.3, `rgba(203, 174, 255, ${cursorIntensity * 0.22})`);
        glow.addColorStop(1, 'rgba(203, 174, 255, 0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = `rgba(226, 210, 255, ${0.82 + cursorIntensity * 0.18})`;
      } else {
        context.fillStyle = particleColor;
      }
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * (1 + cursorIntensity * 0.45), 0, Math.PI * 2);
      context.fill();
    }
  }

  private cellKey(x: number, y: number) {
    return `${Math.floor(x / connectionDistance)}:${Math.floor(y / connectionDistance)}`;
  }

  private cursorIntensity(particle: Particle, cursor: BackgroundFrame['cursor']) {
    if (!cursor) return 0;

    const horizontal = particle.x - cursor.x;
    const vertical = particle.y - cursor.y;
    if (horizontal * horizontal + vertical * vertical >= cursorRadiusSquared) return 0;
    return Math.pow(1 - Math.hypot(horizontal, vertical) / cursorRadius, 2);
  }
}