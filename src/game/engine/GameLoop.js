// Fixed-timestep game loop driven by requestAnimationFrame.
// The accumulated frame time is capped at 50ms to avoid the spiral-of-death
// when the tab is blurred and many frames are owed at once.

const MAX_FRAME_MS = 50;

export class GameLoop {
  constructor(updateFn, renderFn) {
    this.updateFn = updateFn; // (dtSeconds) => void
    this.renderFn = renderFn; // () => void
    this.rafId = null;
    this.lastTime = 0;
    this.running = false;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _tick(now) {
    if (!this.running) return;
    let frameMs = now - this.lastTime;
    this.lastTime = now;
    // Clamp to prevent huge dt after the tab regains focus.
    if (frameMs > MAX_FRAME_MS) frameMs = MAX_FRAME_MS;
    const dt = frameMs / 1000;

    this.updateFn(dt);
    this.renderFn();

    this.rafId = requestAnimationFrame(this._tick);
  }
}
