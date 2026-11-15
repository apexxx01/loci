import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { deletePalace, listPalaces, reviewInLibrary, savePalace } from './core/palace.js';
import { app, bus, getStorage } from './xr/app-state.js';
import { AccessSystem } from './xr/access-system.js';
import { GuideSystem } from './xr/guide-system.js';
import { HubSystem } from './xr/hub-system.js';
import { PalaceSystem } from './xr/palace-system.js';
import { RecallSystem } from './xr/recall-system.js';
import { RoomSystem } from './xr/room-system.js';
import { mountSite } from './site/site.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then(
  (world) => {
    world
      .registerSystem(RoomSystem)
      .registerSystem(PalaceSystem)
      .registerSystem(RecallSystem)
      .registerSystem(GuideSystem)
      .registerSystem(AccessSystem)
      .registerSystem(HubSystem);
    const palaces = world.getSystem(PalaceSystem)!;
    const landing = mountSite({
      launchXR: () => world.launchXR(),
      onDeckReady: (deck) => (app.pendingDeck = deck),
      onPreviewDeck: (deck) => {
        if (deck) bus.emit({ type: 'start-deck', deck });
      },
      getPalace: () => app.palace,
      library: {
        list: () => {
          const store = getStorage();
          return store ? listPalaces(store) : app.palace ? [app.palace] : [];
        },
        activate: (id) => palaces.activate(id),
        remove: (id) => {
          const store = getStorage();
          if (!store) return;
          if (app.palace?.id === id) bus.emit({ type: 'new-palace' }); // puts it away first
          deletePalace(store, id);
        },
        review: (id, memoryId, rating) => {
          const store = getStorage();
          if (!store) return null;
          const next = reviewInLibrary(store, id, memoryId, rating, new Date());
          if (next && app.palace?.id === id) app.palace = next;
          return next;
        },
        restore: (palace) => {
          const store = getStorage();
          if (!store || !savePalace(store, palace)) return false;
          palaces.activate(palace.id);
          return true;
        },
      },
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
