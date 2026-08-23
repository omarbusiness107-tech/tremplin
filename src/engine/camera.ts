import { clamp } from "../core/math";
import { VIEW_H, VIEW_W } from "./canvas";

/**
 * Follows a target with a soft deadzone and a look-ahead in the facing
 * direction, then clamps to the room bounds so the void never shows.
 */
export class Camera {
  x = 0;
  y = 0;
  private lookAhead = 0;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  bounds = { w: VIEW_W, h: VIEW_H };

  setBounds(w: number, h: number): void {
    this.bounds.w = w;
    this.bounds.h = h;
  }

  snapTo(cx: number, cy: number): void {
    this.lookAhead = 0;
    this.x = this.clampX(cx - VIEW_W / 2);
    this.y = this.clampY(cy - VIEW_H / 2);
  }

  follow(cx: number, cy: number, facing: number, grounded: boolean): void {
    this.lookAhead += (facing * 34 - this.lookAhead) * 0.045;

    const desiredX = cx + this.lookAhead - VIEW_W / 2;
    // Vertical easing is slower and biased upward so falls read clearly
    // without the camera bouncing on every small hop.
    const desiredY = cy - VIEW_H * 0.56;

    this.x += (this.clampX(desiredX) - this.x) * 0.12;
    this.y += (this.clampY(desiredY) - this.y) * (grounded ? 0.09 : 0.05);
  }

  private clampX(x: number): number {
    return this.bounds.w <= VIEW_W ? (this.bounds.w - VIEW_W) / 2 : clamp(x, 0, this.bounds.w - VIEW_W);
  }

  private clampY(y: number): number {
    return this.bounds.h <= VIEW_H ? (this.bounds.h - VIEW_H) / 2 : clamp(y, 0, this.bounds.h - VIEW_H);
  }

  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount, 12);
  }

  update(): void {
    if (this.shake > 0.05) {
      this.shakeX = (Math.random() * 2 - 1) * this.shake;
      this.shakeY = (Math.random() * 2 - 1) * this.shake;
      this.shake *= 0.82;
    } else {
      this.shake = this.shakeX = this.shakeY = 0;
    }
  }

  /** Rounded to whole pixels so the tile grid never shimmers. */
  get renderX(): number {
    return Math.round(this.x + this.shakeX);
  }

  get renderY(): number {
    return Math.round(this.y + this.shakeY);
  }
}
