// reeler.js – vertical roulette / reel class  (v3.8R10  — spinTo(label) support)
// -----------------------------------------------------------------------------
//  SUMMARY (2025‑04‑25)
//   • Scroll direction is fixed TOP → BOTTOM.
//   • NEW Feature: spinTo(label, opts)
//       Spin so that the first item matching `label` ends up in the centre.
//       – Example: reel.spinTo("+57 kg", {rotations:8});
//   • spin(index, opts) continues to accept a numeric index (0‑based).
//   • No other behaviour changed (linear deceleration, highlight,...)
// -----------------------------------------------------------------------------
export class Reeler {
  constructor(canvasSel, items, opts = {}) {
    this.canvas =
      typeof canvasSel === "string"
        ? document.querySelector(canvasSel)
        : canvasSel;
    this.ctx = this.canvas.getContext("2d");

    /* options -------------------------------------------------------- */
    this.items = items;
    this.font = opts.font || '120px "Noto Sans JP", sans-serif';
    this.colors = opts.colors || ["#41ACF0", "#D793FF"];
    this.bg = opts.bg || "#05193C";
    this.speed = opts.speed || 1500; // px / s
    this.fontWeight = opts.fontWeight ?? null; // NEW from v3.8R9

    this.fadeOutAlpha = opts.fadeOutAlpha ?? 0.2;
    this.zoomScale = opts.zoomScale || 1.8;
    this.lineSpacing = opts.lineSpacing || 1.25;
    this.highlightDelay = opts.highlightDelay || 400;
    this.highlightAnimDuration = opts.highlightAnimDuration || 1200;
    this.fadeGradientColor = opts.fadeGradientColor || this.bg;
    this.fadeGradientAlpha = opts.fadeGradientAlpha || 0.6;
    this.fadeGradientPower = opts.fadeGradientPower || 1.0;

    /* state ---------------------------------------------------------- */
    this._mode = "loop";
    this._offset = 0;
    this._targetIdx = 0;
    this._spinStart = null;
    this._spinT = 0;
    this._accel = 0;
    this._spinDist = 0;
    this._pauseStart = null;
    this._highlightStart = null;
    this._prevTS = null;

    this._resize();
    window.addEventListener("resize", () => this._resize());
    this.startLoop();
  }

  /* -------------------------- PUBLIC API --------------------------- */
  startLoop(speedPxPerSec) {
    if (speedPxPerSec) this.speed = speedPxPerSec;
    this._mode = "loop";
    this._prevTS = null;
    this._raf ||= requestAnimationFrame((ts) => this._tick(ts));
  }
  stopLoop() {
    this._mode = "idle";
  }

  /**
   * Spin to a numeric index (0‑based).
   */
  spin(targetIndex = null, { rotations = 6 } = {}) {
    if (targetIndex == null) {
      this._targetIdx = Math.floor(Math.random() * this.items.length);
    } else {
      this._targetIdx =
        ((targetIndex % this.items.length) + this.items.length) %
        this.items.length;
    }

    const cycle = this.items.length * this._lineHeight;
    this._spinDist = rotations * cycle + this._targetIdx * this._lineHeight;

    const v0 = this.speed;
    this._accel = (v0 * v0) / (2 * this._spinDist);
    this._spinT = v0 / this._accel;

    this._spinStart = null;
    this._mode = "spin";
  }

  /**
   * Spin so that the row whose text === label is selected.
   * Returns true if label found, false otherwise.
   */
  spinTo(label, opts = {}) {
    const idx = this.items.indexOf(label);
    if (idx === -1) return false;
    this.spin(idx, opts);
    return true;
  }

  onStop(idx) {
    /* optional callback */
  }

  /* ------------------------ INTERNALS ------------------------------ */
  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    const weight = this.fontWeight ? `${this.fontWeight} ` : "";
    this.ctx.font = weight + this.font;
    const m = this.ctx.measureText("Hg");
    this._fontHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    this._lineHeight = this._fontHeight * this.lineSpacing;
  }

  _tick(ts) {
    if (this._prevTS == null) this._prevTS = ts;
    const dt = (ts - this._prevTS) / 1000;

    switch (this._mode) {
      case "loop":
        this._offset += this.speed * dt;
        break;
      case "spin":
        if (this._spinStart == null) this._spinStart = ts;
        const t = (ts - this._spinStart) / 1000;
        if (t <= this._spinT) {
          this._offset = this.speed * t - 0.5 * this._accel * t * t;
        } else {
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
        // nothing
        break;
    }

    const cycle = this.items.length * this._lineHeight;
    const offsetMod = ((this._offset % cycle) + cycle) % cycle;
    this._draw(ts, offsetMod);
    this._prevTS = ts;
    if (this._mode !== "idle")
      this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  _draw(ts, offsetMod) {
    const { width: W, height: H } = this.canvas;
    const ctx = this.ctx;
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, W, H);

    /* gradient vignette */
    if (this.fadeGradientAlpha > 0) {
      const gTop = ctx.createLinearGradient(0, 0, 0, H / 2);
      gTop.addColorStop(
        0,
        this._rgba(this.fadeGradientColor, this.fadeGradientAlpha)
      );
      gTop.addColorStop(1, this._rgba(this.fadeGradientColor, 0));
      ctx.fillStyle = gTop;
      ctx.fillRect(0, 0, W, H / 2);
      const gBot = ctx.createLinearGradient(0, H / 2, 0, H);
      gBot.addColorStop(0, this._rgba(this.fadeGradientColor, 0));
      gBot.addColorStop(
        1,
        this._rgba(this.fadeGradientColor, this.fadeGradientAlpha)
      );
      ctx.fillStyle = gBot;
      ctx.fillRect(0, H / 2, W, H / 2);
    }

    /* text rows */
    const weight = this.fontWeight ? `${this.fontWeight} ` : "";
    ctx.font = weight + this.font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    const centerY = H / 2;
    const baseY = centerY - offsetMod;
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
      const y =
        baseY + i * this._lineHeight - this.items.length * this._lineHeight;
      if (y < -this._lineHeight || y > H + this._lineHeight) continue;

      let alpha = 1,
        scale = 1;
      if (this._mode === "highlight") {
        const inCenter = Math.abs(y - centerY) < this._lineHeight * 0.5;
        if (inCenter) {
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
  _easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
}
