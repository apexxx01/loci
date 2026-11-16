# Perf receipt (emulator)

**Read this first:** these numbers come from the Immersive Web Emulator (IWER, IWSDK's browser-based XR emulator) in a headless Chromium that renders with **SwiftShader, software GL on the CPU**. They are relative numbers for comparing one build with the next. They are **not Quest frame rates** and say nothing about how the app runs on a headset's GPU. Performance on a Quest 3 or 3S is still unmeasured.

Ran 16 Nov 2026, 11:08 IST, with `python3 scripts/perf.py 300` (dev server up with `--allow-browser-automation`). Raw output: `.tmp/perf.json`.

## What was on screen

The concept palace left behind by `scripts/e2e-concept.py` in the `sunlit_living_room` synthetic room, in an active XR session (an immersive WebXR session, here emulated):

| | |
| --- | --- |
| Deck | How your heart pumps blood |
| Stages placed | 6, restored from the persistent anchor |
| Gold thread | visible, 5 links, 1 lit (stage 1 was recalled in the e2e run) |
| Trace rings | 6, all showing |
| Hub panel | open (docked) |
| Canvas | 1280 x 713, stereo XR views |
| GL | ANGLE (Vulkan 1.3.0, SwiftShader Device (Subzero)) |

## Per-frame CPU time, 300 frames

The IWSDK render loop (`setupRenderLoop` in `@iwsdk/core` `dist/init/world-initializer.js`) calls `world.update()` (every ECS system, in priority order) and then `renderer.render()` once per frame. The script wraps both on their instances and times them with `performance.now()`, then puts the originals back.

| Measure | p50 | p95 | max | mean |
| --- | --- | --- | --- | --- |
| `world.update()` (all ECS systems) | 4.3 ms | 8.0 ms | 10.7 ms | 4.65 ms |
| `renderer.render()` (JS side, GL submission) | 2.0 ms | 5.4 ms | 8.2 ms | 2.36 ms |
| update + render | **6.7 ms** | **11.3 ms** | 15.5 ms | 7.02 ms |

For scale only: a 72 Hz headset frame is 13.9 ms and a 90 Hz frame is 11.1 ms. The emulator's CPU is not a Quest's CPU, so this is a sanity check that nothing in the systems is wildly expensive, not a claim about headset headroom.

## Renderer

`renderer.info`, read straight after each `render()`:

| | |
| --- | --- |
| Draw calls per frame | 76 (identical on every one of the 300 frames) |
| Triangles per frame | 23,492 (identical on every frame) |
| Textures in GPU memory | 22 |
| Geometries in GPU memory | 88 |
| Shader programs | 18 |

The XR camera renders two eye views in one `render()` call, so the draw call and triangle counts cover both eyes. No frame called `render()` more than once.

## JS heap

`performance.memory` in the app frame (Chromium only): 225.6 MB used before sampling, 233.7 MB after, 237.1 MB total. That heap is shared with the emulator, its synthetic room and the editor bridge running in the same page, so it is an upper bound for the app, and the 8 MB rise over the 343 s run includes the sampler's own arrays and has not been through a forced GC. It is not evidence of a leak either way.

## Frame interval (emulator, not the app)

The headless emulator presented one XR frame about every 1.1 s (p50 1,113.7 ms, p95 2,283 ms), so 300 frames took 343 s. The app's own update + render is about 7 ms of that; the rest is outside the app's JS (the emulator's software rasterising of the room and the stereo views). This is why frame rate is not reported here.

## Allocation in the per-frame path

`tests/no-alloc.test.ts` checks that `SampleRing.push` (`src/core/toss.ts`), which the recall system calls every frame while a memory is held, allocates nothing. It measures V8's heap counter around a forced GC over 20,000 calls: in one run the ring used 240 bytes in total (about 0.01 bytes per call, the counter's noise), while a control that allocates one small object per call used 2,243,728 bytes. The test fails above 1 byte per call and also fails if the control stops seeing its allocations.

## Reproduce

```sh
npx @iwsdk/cli dev up --headless --allow-browser-automation --screenshot-width 1280 --screenshot-height 800
python3 scripts/e2e-concept.py               # builds the concept palace (6 stages, threads, rings)
python3 scripts/perf.py 300                  # samples 300 frames, writes .tmp/perf.json
npx vitest run tests/no-alloc.test.ts
```
