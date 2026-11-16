# Room matrix

The concept end-to-end test (`scripts/e2e-concept.py`, 15 checks) run in every synthetic room the Immersive Web Emulator (IWER, IWSDK's browser-based XR emulator) ships, plus one run with no scene data at all. The latest full pass ran on 16 Nov 2026, 15:50 to 17:57 IST, in the headless managed emulator (Meta Quest 3 profile, software GL), on the code at commits `1aac580` to `4a51993` (the page reloads before each room, so each room ran the code current when it started; nothing in that span changed placement or restore):

```sh
python3 scripts/matrix.py --tag=pass1          # all 8 rooms + the empty room, 15:50 to 17:57 IST
python3 scripts/matrix.py --tag=none2 none     # the empty room again after its check was corrected, 18:07 IST
```

## How rooms are switched

IWSDK lists the emulator's rooms in `@iwsdk/core` `dist/project/environments.js` (`PROJECT_EMULATOR_ROOMS`): `bedroom`, `conference_room`, `home_office`, `kitchen`, `music_studio`, `open_office`, `open_studio`, `sunlit_living_room`. The CLI's `xr` domain has no room action, but the emulator's Synthetic Environment Module is reachable in the app frame as `window.IWER_DEVICE.sem`, and its room picker calls `sem.loadDefaultEnvironment(name)` (or `sem.deleteAll()` for no room). `scripts/matrix.py` makes the same calls, so `iwsdk.config.json` was never edited. At the end it loads the configured room (`sunlit_living_room`) again.

For each room the script reloads the page (a fresh launch), clears any saved palace, exits XR, loads the room, re-enters XR, waits until the surface list the app derives from scene understanding is stable, then runs the e2e. Scene understanding means the planes and meshes the headset reports (from Space Setup on a real Quest); `src/xr/room-system.ts` turns them into labelled surfaces.

The empty room (`none`) calls `sem.deleteAll()` before and after entering XR, so the session reports no planes and no meshes.

## Results

"On room surfaces" counts stages placed on a real plane or mesh (furniture, walls, windows, doors), from the app's own build status line. "On the seated arc" counts stages on the virtual fallback arc in front of the viewer. Restore drift is the largest distance any stage moved between before exit and after re-entering XR; the e2e prints it to 0.1 mm.

| Room | Surfaces found (planes + meshes) | On room surfaces | On the seated arc | Stage objects, in route order | Checks | Restore drift | Run time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bedroom | 24 (14 + 10) | 6 | 0 | plant, table, bed, wall art, lamp, wall | **15/15** | 0.0000 m | 657 s |
| conference_room | 23 (12 + 11) | 6 | 0 | window, other, table, other, wall art, wall | **15/15** | 0.0000 m | 587 s |
| home_office | 21 (13 + 8) | 6 | 0 | wall, shelf, window, desk, shelf, wall | **15/15** | 0.0000 m | 635 s |
| kitchen | 29 (14 + 15) | 6 | 0 | shelf, lamp, window, table, plant, other | **15/15** | 0.0000 m | 621 s |
| music_studio | 23 (11 + 12) | 6 | 0 | wall, plant, other, window, desk, lamp | **15/15** | 0.0000 m | 539 s |
| open_office | 32 (17 + 15) | 6 | 0 | other, desk, wall, shelf, couch, table | **15/15** | 0.0000 m | 764 s |
| open_studio | 11 (9 + 2) | 5 | 1 | (arc), other, wall, wall, door, plant | **15/15** | 0.0000 m | 445 s |
| sunlit_living_room | 28 (15 + 13) | 6 | 0 | window, lamp, table, couch, shelf, screen | **15/15** | 0.0000 m | 695 s |
| none (no planes, no meshes) | 0 | 0 | 6 | all six on the arc | **15/15** (re-run 18:07 IST) | 0.0000 m | 237 s |

**All 8 synthetic rooms passed all 15 checks on the first try**, in one full pass with no re-runs; in those rooms 47 of 48 stages landed on a real surface and 1 on the arc. The earlier pass (11:34 IST) needed second runs for kitchen and music_studio; the fix was holding the emulated pinch for 1.4 s in `aim_select` (`scripts/e2e.py`), longer than the emulator's p95 frame interval. A second back-to-back full pass was started and stopped after its first room, because a full pass takes about two hours at one emulator frame a second.

The empty room needed its one furniture check corrected, not the app. In the full pass it scored 14/15, failing "stages spread across distinct objects", which cannot pass with no furniture. The e2e now checks, when every placement label is empty, that all six stages went to the seated arc instead; with that, the empty room passed 15/15.

Logs: `.tmp/matrix-pass1-<room>.log` (one per room, with `ranAt`), `.tmp/matrix-pass1.json`, `.tmp/matrix-none2.json`. `.tmp` is not committed; re-run the commands above to regenerate.

## Failures and their causes

### sunlit_living_room, 20:20 IST regression run: palace re-fitted on re-entering (fixed in the app)

A single-room regression run after the card and thread changes failed "stages restored in place after re-entering" with a 1.93 m drift; the restored stages had moved to different furniture. A second run with no change passed 15/15. Cause: after re-entering XR, `verifyRestore` in `src/xr/palace-system.ts` judged whether the room still matched 1.5 s of frame time after the anchors attached. At one emulator frame a second the surface list can still be filling in then, so too few stages found their labelled furniture and the app re-fitted a palace that was fine. It now waits until the surface count has held still for 1.5 s (within a 10 s window) before judging. Re-run at 20:58 IST on the fix: 15/15, restore drift 0.0000 m (`python3 scripts/matrix.py --tag=final3 sunlit_living_room`).

### Empty room: "stages spread across distinct objects" (fixed in the test)

The check in `scripts/e2e-concept.py` asserts `len(set(labels)) >= 4` over the placement labels. With no scene data, `planPlacement` in `src/core/placement.ts` falls back entirely to `arcSlots()`, which creates every slot with `label: ''` (there is no object to name). So the six labels are all empty and the set has one member. The app did what the README promises for an unscanned room (an even arc, status "No furniture found yet, so memories are floating around you. Run Space Setup for a room-anchored palace."); the check is a furniture assertion that does not apply when there is no furniture. The other 14 checks, including restore and threads, passed.

### kitchen and music_studio in the 11:34 IST pass: a press that never landed (fixed in the test)

- kitchen, 12:11 IST: the ready-made walks opened, the heart walk was pressed, and no palace was built within 60 s (`0 placements, frame=reference`). The script then stopped with `KeyError: 'tile:concept-heart:0'`.
- music_studio, 12:16 IST: Ask was pressed and the keyboard never opened. The script stopped with `KeyError: 'ask-cancel'`.

Both rooms passed 15/15 when re-run with no change to the app, so neither is a room-dependent placement bug. In both cases one UI press was not seen by the app. Hub buttons fire only on a pointer down followed by a pointer up on the same element (`bind()` in `HubSystem.init`, `src/xr/hub-system.ts`, with `pointerleave` cancelling), and pointer state is only sampled when the emulator presents a frame. `aim_select()` in `scripts/e2e.py` holds the select for 0.4 s, while the headless emulator presents an XR frame only about once a second (median interval 1,037 ms in kitchen and 846 ms in music_studio, sampled by the matrix before each re-run; p50 1,114 ms and p95 2,283 ms in `docs/perf.md`). A 0.4 s press can fall wholly between two frames. That is the most likely cause; it is inferred from those timings and the clean re-runs, not traced frame by frame. Holding the select for longer than the p95 frame interval in `aim_select` would remove it. On a headset at 72 to 90 fps a 0.4 s pinch spans about 30 frames.

The `KeyError` exits come from `scripts/e2e-concept.py` indexing `targets()` directly after a failed check, so a run stops instead of recording the remaining checks as failed. The matrix counts such a run against all 15 checks.

### Running rooms back to back in one page: the hub keeps the walks list open (found while building the matrix)

The first matrix attempt ran rooms in the same page without reloading. The run after sunlit_living_room (bedroom, 11:17 IST, log kept as `.tmp/matrix-bedroom-same-page.log`) failed "hub opens on asking, with no topic pushed first" because the ready-made walks list was already showing, then stopped when its press on "Ready-made walks" hid the list. Cause: `HubSystem.browsing` (`src/xr/hub-system.ts`) is set only by the `btn-browse` handler and is re-applied by `refresh()`, and nothing resets it when a palace is put away (`new-palace`). So after one walk is picked from the list, the next empty hub opens with the list still expanded. The e2e assumes a freshly loaded hub. The matrix now reloads the page before every room (`--same-page` turns that off); with the reload, bedroom passed 15/15. Whether the list should collapse on a new palace is a product choice; src was not changed.

## Other observations

- `npx @iwsdk/cli browser reload` left the managed browser not running after 3 of the 9 reloads in the full run and both reloads in the re-run (each shows as "app frame not ready" in the matrix output). `scripts/matrix.py` recovers with `npx @iwsdk/cli runtime recover` and waits for the app before continuing. Nothing in the app was involved.
- A complete e2e run takes 4 to 12 minutes per room (234 s for the empty room, 455 to 716 s for the others), mostly the e2e's fixed waits for hover and animation at about one emulator frame a second.
- Labels are what the emulator's synthetic rooms report; a real Quest room after Space Setup will differ. These runs prove the placement ladder and the restore path across nine different scene-understanding inputs, not behaviour on a physical headset.
