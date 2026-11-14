import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { app, bus } from './xr/app-state.js';
import { AccessSystem } from './xr/access-system.js';
import { GuideSystem } from './xr/guide-system.js';
import { HubSystem } from './xr/hub-system.js';
import { PalaceSystem } from './xr/palace-system.js';
import { RecallSystem } from './xr/recall-system.js';
import { RoomSystem } from './xr/room-system.js';
import { mountLanding } from './landing/landing.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then(
  (world) => {
    world
      .registerSystem(RoomSystem)
      .registerSystem(PalaceSystem)
      .registerSystem(RecallSystem)
      .registerSystem(GuideSystem)
      .registerSystem(AccessSystem)
      .registerSystem(HubSystem);
    const landing = mountLanding({
      launchXR: () => world.launchXR(),
      onDeckReady: (deck) => (app.pendingDeck = deck),
      onPreviewDeck: (deck) => {
        if (deck) bus.emit({ type: 'start-deck', deck });
      },
      getPalace: () => app.palace,
    });
    bus.on((e) => {
      if (e.type !== 'own-notes') return;
      world.exitXR();
      landing.focusNotes();
    });
    world.visibilityState.subscribe((v) => {
      if (v === VisibilityState.NonImmersive) landing.show();
      else landing.hide();
    });

    // Read-only debugging/test handle (used by the emulator e2e suite).
    (window as unknown as { __loci?: unknown }).__loci = { world, app, bus };
  },
);
