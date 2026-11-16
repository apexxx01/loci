/**
 * Rebuild the chain: a second way to practise a concept. The thread goes
 * dark and the stage numbers hide; you pinch the stages in the order things
 * happen. Each right pick relights the thread into that stage; a wrong pick
 * shows where you are in the chain. Finishing runs the ignite pulse.
 * This is practice for the whole mechanism, so it does not change the
 * schedule of any single stage.
 */
import { createSystem, Vector3 } from '@iwsdk/core';
import { app, bus, setStatus } from './app-state.js';
import { MemoryTile, TileFace } from './components.js';
import { PalaceSystem, type TileRecord } from './palace-system.js';
import { playAgain, playLand, playSuccess } from './sound.js';
import { speak } from './settings.js';

export class ChainSystem extends createSystem({}) {
  private next = 0;
  private misses = 0;
  private started = 0;
  private p = new Vector3();

  init(): void {
    this.cleanupFuncs.push(
      bus.on((e) => {
        if (e.type === 'new-palace' || e.type === 'switch-palace' || e.type === 'refit') this.stop();
      }),
    );
  }

  get active(): boolean {
    return app.chainMode;
  }

  toggle(): void {
    if (app.chainMode) this.stop(true);
    else this.start();
  }

  start(): void {
    const palace = app.palace;
    if (!palace || palace.deck.kind !== 'concept') return;
    app.chainMode = true;
    this.next = 0;
    this.misses = 0;
    this.started = performance.now();
    const sys = this.world.getSystem(PalaceSystem);
    // Every stage rests face-down so only its place and name are left.
    sys?.records.forEach((rec) => {
      rec.entity.setValue(MemoryTile, 'face', TileFace.Cue);
      sys.renderTile(rec);
    });
    bus.emit({ type: 'chain', on: true });
    setStatus(`Rebuild the chain: pinch the stage where ${palace.deck.title.toLowerCase().replace(/^how /, '').replace(/^why /, '')} begins.`);
  }

  stop(silent = false): void {
    if (!app.chainMode) return;
    app.chainMode = false;
    const sys = this.world.getSystem(PalaceSystem);
    sys?.records.forEach((rec) => sys.renderTile(rec));
    bus.emit({ type: 'chain', on: false });
    if (!silent) setStatus('Chain practice ended.');
  }

  pick(rec: TileRecord): void {
    const palace = app.palace;
    if (!palace || !app.chainMode) return;
    rec.tile.root.getWorldPosition(this.p);
    if (rec.item.order === this.next) {
      bus.emit({ type: 'chain-link', index: this.next });
      playLand(this.p, this.next);
      speak(rec.item.cue);
      this.next++;
      if (this.next >= palace.deck.items.length) return this.finish();
      setStatus(`${rec.item.cue}. ${rec.item.link ? `It ${rec.item.link}...` : 'What comes next?'}`);
      return;
    }
    this.misses++;
    playAgain(this.p);
    const prev = palace.deck.items.find((i) => i.order === this.next - 1);
    setStatus(this.next === 0 ? 'Not the first stage. Where does it all begin?' : `Not yet. What happens right after "${prev?.cue}"?`);
  }

  private finish(): void {
    const palace = app.palace!;
    const secs = Math.round((performance.now() - this.started) / 1000);
    const n = palace.deck.items.length;
    const p = this.world.getSystem(PalaceSystem)?.records.values().next().value as TileRecord | undefined;
    if (p) {
      p.tile.root.getWorldPosition(this.p);
      playSuccess(this.p);
    }
    this.stop(true);
    setStatus(
      this.misses === 0
        ? `All ${n} stages in order, first try, in ${secs} seconds. You have the whole mechanism.`
        : `Chain rebuilt in ${secs} seconds with ${this.misses} ${this.misses === 1 ? 'slip' : 'slips'}. Try it again to make it flawless.`,
    );
    bus.emit({ type: 'palace-ready', restored: true });
  }
}
