/**
 * A silent first lesson. The first time someone builds a palace, a small
 * drawn hand pinches beside stage 1 (no words), then beside the A and B
 * answers when the myth check opens. After the first answer it never shows
 * again on this device.
 */
import { CanvasTexture, createSystem, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { bus } from './app-state.js';
import { CheckSystem } from './check-system.js';
import { PalaceSystem } from './palace-system.js';
import { TILE_SIZE } from './tile.js';

const KEY = 'loci.onboarded.v1';

export class OnboardSystem extends createSystem({}) {
  private sprite!: Sprite;
  private ctx!: CanvasRenderingContext2D;
  private tex!: CanvasTexture;
  private step: 'off' | 'pinch' | 'choose' = 'off';
  private t = 0;
  private acc = 1;
  private p = new Vector3();

  init(): void {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    this.ctx = c.getContext('2d')!;
    this.tex = new CanvasTexture(c);
    this.tex.colorSpace = SRGBColorSpace;
    this.sprite = new Sprite(new SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, opacity: 0 }));
    // A picture of a hand, not a target: rays and gaze pass straight through it.
    this.sprite.raycast = () => {};
    this.sprite.scale.setScalar(0.11);
    this.sprite.renderOrder = 5;
    this.sprite.visible = false;
    this.world.scene.add(this.sprite);
    const done = () => {
      try {
        return localStorage.getItem(KEY) === '1';
      } catch {
        return true;
      }
    };
    this.cleanupFuncs.push(
      bus.on((e) => {
        if (done()) return;
        if (e.type === 'palace-ready' && !e.restored) this.go('pinch');
        else if (e.type === 'flipped' && e.face === 4) this.go('choose');
        // The pinch is learned once a stage opens: the hand steps aside, and
        // comes back for the A and B answers the first time a myth check opens.
        else if (e.type === 'flipped' && e.face === 1 && this.step === 'pinch') this.go('off');
        else if (e.type === 'rated') {
          this.go('off');
          try {
            localStorage.setItem(KEY, '1');
          } catch {
            /* private browsing */
          }
        } else if (e.type === 'new-palace' || e.type === 'switch-palace') this.go('off');
      }),
    );
  }

  private go(step: 'off' | 'pinch' | 'choose'): void {
    this.step = step;
    this.t = 0;
    this.sprite.visible = step !== 'off';
  }

  /** A thumb and finger closing into a pinch, with a ring flashing on contact. */
  private draw(k: number): void {
    const g = this.ctx;
    g.clearRect(0, 0, 256, 256);
    const close = Math.min(1, Math.max(0, (Math.sin(k * Math.PI * 2) + 1) / 2));
    const gap = 46 * (1 - close);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255, 244, 230, 0.95)';
    g.shadowColor = 'rgba(255, 207, 122, 0.9)';
    g.shadowBlur = 18;
    g.lineWidth = 16;
    // Index finger from above, thumb from below, meeting in the middle.
    g.beginPath();
    g.moveTo(70, 40);
    g.quadraticCurveTo(120, 70, 128, 128 - gap);
    g.stroke();
    g.beginPath();
    g.moveTo(60, 210);
    g.quadraticCurveTo(110, 190, 128, 128 + gap);
    g.stroke();
    if (close > 0.9) {
      g.lineWidth = 5;
      g.strokeStyle = `rgba(255, 207, 122, ${(close - 0.9) * 10})`;
      g.beginPath();
      g.arc(128, 128, 30 + (1 - close) * 200, 0, Math.PI * 2);
      g.stroke();
    }
    this.tex.needsUpdate = true;
  }

  update(delta: number): void {
    if (this.step === 'off') return;
    this.t += delta;
    const palace = this.world.getSystem(PalaceSystem);
    const first = palace && [...palace.records.values()].sort((a, b) => a.item.order - b.item.order)[0];
    const checks = this.world.getSystem(CheckSystem);
    if (this.step === 'choose' && checks?.active) {
      // Between the two answers.
      const [a, b] = checks.buttons;
      this.p.copy(a.mesh.position).lerp(b.mesh.position, this.t % 4 < 2 ? 0.15 : 0.85);
      this.p.y -= 0.07;
    } else if (first) {
      first.tile.pivot.getWorldPosition(this.p);
      this.p.y -= TILE_SIZE.h * 0.62 * first.tile.root.scale.y;
    } else return;
    this.sprite.position.lerp(this.p, Math.min(1, delta * 6));
    const m = this.sprite.material as SpriteMaterial;
    m.opacity = Math.min(1, this.t * 1.5);
    // Redraw the little hand about 20 times a second, not every frame.
    this.acc += delta;
    if (this.acc > 0.05) {
      this.acc = 0;
      this.draw((this.t * 0.6) % 1);
    }
  }
}
