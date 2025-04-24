// reeler.js – vertical roulette / reel class (v3.3 – linear deceleration without acceleration)
// ---------------------------------------------------------------------------
//  CHANGE LOG (2025‑04‑25)
//   • Bounce‑back removed (v3.1)
//   • 途中加速なし & しっかり減速 → 停止  ←★★ 今回
//       - spin() 開始時のループ速度 (v0 = this.speed) を維持
//       - 物理公式を使って一定減速度 a で v0 → 0 に
//         • 距離 D  = rotations*cycle + targetOffset
//         • a      = v0² / (2D)
//         • 時間 T = v0 / a  (自動計算)
//       - t <= T:  s(t) = v0*t - 0.5*a*t²
//   • lineSpacing option (default 1.25) 維持
// ---------------------------------------------------------------------------

export class Reeler {
  constructor(canvasSel, items, opts = {}) {
    this.canvas =
      typeof canvasSel === "string"
        ? document.querySelector(canvasSel)
        : canvasSel;
    this.ctx = this.canvas.getContext("2d");

    // Data
    this.items = items;

    // Options with defaults
    this.font = opts.font || '120px "Noto Sans JP", sans-serif';
    this.colors = opts.colors || ["#41ACF0", "#D793FF"];
    this.bg = opts.bg || "#05193C";
    this.speed = opts.speed || 1500; // px/s for loop
    this.fadeOutAlpha = opts.fadeOutAlpha ?? 0.2;
    this.zoomScale = opts.zoomScale || 1.6;
    this.lineSpacing = opts.lineSpacing || 1.25; // NEW

    // Internal state
    this._mode = "loop";
    this._startTime = null;
    this._offset = 0;
    this._targetIdx = 0;
    this._loopRAF = null;

    // Setup & begin resize listener
    this._resize();
    window.addEventListener("resize", () => this._resize());
    this.startLoop();
  }

  /* Public API ----------------------------------------------------------- */
  startLoop(speedPxPerSec) {
    if (speedPxPerSec) this.speed = speedPxPerSec;
    this._mode = "loop";
    this._startTime = null;
    if (!this._loopRAF)
      this._loopRAF = requestAnimationFrame((ts) => this._tick(ts));
  }

  stopLoop() {
    this._mode = "idle";
  }

  spin(targetIndex = null, { rotations = 6 } = {}) {
    // pick random target
    if (targetIndex === null)
      this._targetIdx = Math.floor(Math.random() * this.items.length);
    else this._targetIdx = targetIndex % this.items.length;

    // prep spin params
    const cycle = this._lineHeight * this.items.length;
    const targetOffset = this._targetIdx * this._lineHeight;
    this._spinTotalDist = rotations * cycle + targetOffset;

    // physics calc: start velocity = this.speed, constant decel to 0 over D
    this._v0 = this.speed; // start velocity (px/s)
    this._a = (this._v0 * this._v0) / (2 * this._spinTotalDist); // px/s²
    this._spinDurSec = this._v0 / this._a; // seconds until stop

    this._mode = "spin";
    this._spinStart = null;
  }

  onStop(idx) {
    /* user assigns if needed */
  }

  /* Private -------------------------------------------------------------- */
  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Compute usable metrics
    this.ctx.font = this.font;
    const metrics = this.ctx.measureText("Hg");
    this._fontHeight =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    this._lineHeight = this._fontHeight * this.lineSpacing;
  }

  _tick(ts) {
    if (!this._startTime) this._startTime = ts;
    const dt = ts - this._startTime;

    // update offset based on mode
    if (this._mode === "loop") {
      this._offset += (this.speed * dt) / 1000;
      this._offset %= this._lineHeight * this.items.length;
    } else if (this._mode === "spin") {
      if (!this._spinStart) this._spinStart = ts;
      const tSec = (ts - this._spinStart) / 1000; // seconds elapsed
      if (tSec < this._spinDurSec) {
        this._offset = this._v0 * tSec - 0.5 * this._a * tSec * tSec;
      } else {
        // Clamp to total distance and switch to highlight mode
        this._offset = this._spinTotalDist;
        this._mode = "highlight";
        this._highlightStart = ts;
        this.onStop?.(this._targetIdx);
      }
    }

    // draw
    this._draw();

    // loop
    this._startTime = ts;
    if (this._mode !== "idle" && this._loopRAF)
      this._loopRAF = requestAnimationFrame((ts2) => this._tick(ts2));
  }

  _draw() {
    const { width: W, height: H } = this.canvas;
    const ctx = this.ctx;
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.font = this.font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    const centerY = H / 2;
    const baseY =
      centerY - (this._offset % (this._lineHeight * this.items.length));

    for (let i = 0; i < this.items.length * 3; i++) {
      const idx = i % this.items.length;
      let y =
        baseY + i * this._lineHeight - this.items.length * this._lineHeight;

      // visibility check
      if (y < -this._lineHeight || y > H + this._lineHeight) continue;

      // style
      let alpha = 1;
      let scale = 1;
      if (this._mode === "highlight") {
        const inCenter = Math.abs(y - centerY) < this._lineHeight * 0.5;
        if (inCenter && idx === this._targetIdx) {
          scale = this.zoomScale;
        } else {
          alpha = this.fadeOutAlpha;
        }
      }

      ctx.save();
      ctx.translate(W / 2, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = this.colors[idx % this.colors.length];
      ctx.globalAlpha = alpha;
      ctx.fillText(this.items[idx], 0, 0);
      ctx.restore();
    }
  }
}
