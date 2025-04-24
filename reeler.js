// reeler.js – vertical roulette / reel class (v3.7  — constant‑to‑linear‑deceleration, no overshoot)
// ---------------------------------------------------------------------------
//  CHANGE SUMMARY (2025‑04‑25)
//   • spin() で『等速 → 線形減速 → 停止』に完全固定。
//     >>>  途中で速度がループ速度 (v0) を上回ることは絶対にありません。
//   • v0 = 現在のループ速度 (this.speed)。
//   • 目標距離 D = rotations*fullCycle + targetIdx * lineHeight.
//   • 減速度 a = v0^2 / (2D)  （物理公式 v^2 = v0^2 − 2aD）
//   • 停止時間 T = v0 / a  = 2D / v0.
//   • tick() 中で t<=T の間:   s = v0*t − 0.5*a*t^2.
//                             offset = s.
//   • t>=T で mode → 'pause' → 'highlight' （既存ロジック）
// ---------------------------------------------------------------------------
export class Reeler {
  constructor(canvasSel, items, opts = {}) {
    this.canvas =
      typeof canvasSel === "string"
        ? document.querySelector(canvasSel)
        : canvasSel;
    this.ctx = this.canvas.getContext("2d");

    // Data & options ----------------------------------------------------
    this.items = items;
    this.font = opts.font || '120px "Noto Sans JP", sans-serif';
    this.colors = opts.colors || ["#41ACF0", "#D793FF"];
    this.bg = opts.bg || "#05193C";
    this.speed = opts.speed || 1500; // px/s (loop speed)

    this.fadeOutAlpha = opts.fadeOutAlpha ?? 0.2;
    this.zoomScale = opts.zoomScale || 1.8;
    this.lineSpacing = opts.lineSpacing || 1.25;

    // highlight timing
    this.highlightDelay = opts.highlightDelay || 400; // ms
    this.highlightAnimDuration = opts.highlightAnimDuration || 1200; // ms

    // vignette
    this.fadeGradientColor = opts.fadeGradientColor || this.bg;
    this.fadeGradientAlpha = opts.fadeGradientAlpha || 0.6;
    this.fadeGradientPower = opts.fadeGradientPower || 1.0;

    // Internal state ----------------------------------------------------
    this._mode = "loop";
    this._startTime = null;
    this._offset = 0; // scroll distance from origin (px)

    // spin params
    this._targetIdx = 0;
    this._spinStart = null;
    this._spinT = 0; // total time to stop
    this._accel = 0; // deceleration magnitude (px/s^2, positive)
    this._spinDist = 0; // total distance to cover (px)

    // Pause & highlight
    this._pauseStart = null;
    this._highlightStart = null;

    // Init --------------------------------------------------------------
    this._resize();
    window.addEventListener("resize", () => this._resize());
    this.startLoop();
  }

  /* Public API --------------------------------------------------------- */
  startLoop(speedPxPerSec) {
    if (speedPxPerSec) this.speed = speedPxPerSec;
    this._mode = "loop";
    this._startTime = null;
    this._loopRAF ||= requestAnimationFrame((ts) => this._tick(ts));
  }

  stopLoop() {
    this._mode = "idle";
  }

  spin(targetIndex = null, { rotations = 6 } = {}) {
    // pick random target if null
    this._targetIdx =
      targetIndex == null
        ? Math.floor(Math.random() * this.items.length)
        : targetIndex % this.items.length;

    // Compute spin parameters -----------------------------------------
    // total distance to travel so that targetIdx ends up at center
    this._spinDist =
      (rotations * this.items.length + this._targetIdx) * this._lineHeight;

    const v0 = this.speed; // px/s (current loop speed)
    this._accel = (v0 * v0) / (2 * this._spinDist); // positive value
    this._spinT = v0 / this._accel; // time to stop (s)

    this._spinStart = null;
    this._mode = "spin";
  }

  onStop(idx) {
    /* optional callback */
  }

  /* Private helpers ---------------------------------------------------- */
  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    this.ctx.font = this.font;
    const m = this.ctx.measureText("Hg");
    this._fontHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    this._lineHeight = this._fontHeight * this.lineSpacing;
  }

  _tick(ts) {
    if (!this._startTime) this._startTime = ts;
    const dtMs = ts - this._startTime;
    const dt = dtMs / 1000; // seconds

    switch (this._mode) {
      case "loop":
        this._offset += this.speed * dt;
        this._offset %= this._lineHeight * this.items.length;
        break;

      case "spin":
        if (!this._spinStart) this._spinStart = ts;
        const t = (ts - this._spinStart) / 1000; // seconds elapsed in spin
        if (t <= this._spinT) {
          // s = v0*t − 0.5*a*t^2 (a positive)
          const s = this.speed * t - 0.5 * this._accel * t * t;
          this._offset = s;
        } else {
          // arrive at final position
          this._offset = this._spinDist;
          this._mode = "pause";
          this._pauseStart = ts;
        }
        break;

      case "pause":
        if (ts - this._pauseStart >= this.highlightDelay) {
          this._mode = "highlight";
          this._highlightStart = ts;
        }
        break;

      case "highlight":
        // nothing changes in offset; handle zoom timing in _draw()
        break;
    }

    this._draw(ts);
    this._startTime = ts;
    if (this._mode !== "idle")
      this._loopRAF = requestAnimationFrame((t) => this._tick(t));
  }

  _draw(ts) {
    const { width: W, height: H } = this.canvas;
    const ctx = this.ctx;
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, W, H);

    /* vignette -------------------------------------------------------- */
    if (this.fadeGradientAlpha > 0) {
      const gradTop = ctx.createLinearGradient(0, 0, 0, H / 2);
      gradTop.addColorStop(
        0,
        this._rgba(this.fadeGradientColor, this.fadeGradientAlpha)
      );
      gradTop.addColorStop(1, this._rgba(this.fadeGradientColor, 0));
      ctx.fillStyle = gradTop;
      ctx.fillRect(0, 0, W, H / 2);

      const gradBot = ctx.createLinearGradient(0, H / 2, 0, H);
      gradBot.addColorStop(0, this._rgba(this.fadeGradientColor, 0));
      gradBot.addColorStop(
        1,
        this._rgba(this.fadeGradientColor, this.fadeGradientAlpha)
      );
      ctx.fillStyle = gradBot;
      ctx.fillRect(0, H / 2, W, H / 2);
    }

    /* text ------------------------------------------------------------ */
    ctx.font = this.font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    const centerY = H / 2;
    const baseY =
      centerY - (this._offset % (this._lineHeight * this.items.length));

    const now = ts || performance.now();
    let zoomP = 0;
    if (this._mode === "highlight") {
      zoomP = Math.min(
        1,
        (now - this._highlightStart) / this.highlightAnimDuration
      );
    }

    for (let i = 0; i < this.items.length * 3; i++) {
      const idx = i % this.items.length;
      let y =
        baseY + i * this._lineHeight - this.items.length * this._lineHeight;
      if (y < -this._lineHeight || y > H + this._lineHeight) continue;

      let alpha = 1;
      let scale = 1;
      if (this._mode === "highlight") {
        const inCenter = Math.abs(y - centerY) < this._lineHeight * 0.5;
        if (inCenter && idx === this._targetIdx) {
          scale = 1 + (this.zoomScale - 1) * this._easeOutCubic(zoomP);
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

  _rgba(hex, a) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(
      m[3],
      16
    )},${a})`;
  }

  /* easing ------------------------------------------------------------ */
  _easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
}
