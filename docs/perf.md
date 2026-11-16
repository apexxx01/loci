# Perf receipt (emulator)

**Read this first:** these numbers come from the Immersive Web Emulator (IWER, IWSDK's browser-based XR emulator) in a headless Chromium that renders with **SwiftShader, software GL on the CPU**. They are relative numbers for comparing one build with the next. They are **not Quest frame rates** and say nothing about how the app runs on a headset's GPU. Performance on a Quest 3 or 3S is still unmeasured.

Ran 16 Nov 2026, 18:27 IST, with `python3 scripts/perf.py 300` (dev server up with `--allow-browser-automation`), on commit `7fff9d1`. Per-system times: `python3 scripts/perf.py 200 --systems`, 18:31 and 18:40 IST. Raw output: `.tmp/perf.json`, `.tmp/perf-systems.json`. The previous receipt (11:08 IST, before the trace-ring and hint changes) is kept in the comparison below.

## What was on screen

The concept palace left behind by `scripts/e2e-concept.py` in the `sunlit_living_room` synthetic room, in an active XR session (an immersive WebXR session, here emulated):

| | |
| --- | --- |
| Deck | How your heart pumps blood |
| Stages placed | 6, restored from the persistent anchor |
| Gold thread | visible, 5 links, 1 lit (stage 1 was recalled in the e2e run) |
| Trace rings | 4, all showing (rings now go on flat tops only; the 11:08 run had 6) |
| Hub panel | open (docked) |
| Canvas | 1280 x 713, stereo XR views |
| GL | ANGLE (Vulkan 1.3.0, SwiftShader Device (Subzero)) |

## Per-frame CPU time, 300 frames

The IWSDK render loop (`setupRenderLoop` in `@iwsdk/core` `dist/init/world-initializer.js`) calls `world.update()` (every ECS system, in priority order) and then `renderer.render()` once per frame. The script wraps both on their instances and times them with `performance.now()`, then puts the originals back.

| Measure | p50 | p95 | max | mean |
| --- | --- | --- | --- | --- |
| `world.update()` (all ECS systems) | 3.0 ms | 5.6 ms | 18.0 ms | 3.31 ms |
| `renderer.render()` (JS side, GL submission) | 1.6 ms | 3.2 ms | 8.7 ms | 1.80 ms |
| update + render | **4.6 ms** | **8.1 ms** | 19.4 ms | 5.12 ms |

Compared with the 11:08 IST receipt (6.7 ms p50, 11.3 ms p95 for update + render), p50 fell by 2.1 ms and p95 by 3.2 ms. Most of that is the scene: two fewer trace rings and 12 fewer draw calls. Emulator timings also vary run to run, so treat differences under about 1 ms as noise.

## Per-system time, 200 frames

`--systems` wraps every registered system's `update()` and records its time per frame into preallocated arrays (timer resolution in this page: 0.1 ms). Systems from IWSDK itself are marked (framework); the rest are Loci's.

| System | p50 | p95 | max | mean |
| --- | --- | --- | --- | --- |
| InputSystem (framework: emulated hands and pointers) | 1.8 ms | 3.4 ms | 5.1 ms | 2.08 ms |
| HubSystem | 0.2 ms | 0.7 ms | 2.4 ms | 0.26 ms |
| ScreenSpaceUISystem (framework) | 0 ms | 1.8 ms | 3.2 ms | 0.20 ms |
| SceneUnderstandingSystem (framework) | 0.2 ms | 0.4 ms | 2.1 ms | 0.22 ms |
| RoomSystem | 0.2 ms | 0.3 ms | 2.8 ms | 0.19 ms |
| Every other system (23 more, including Thread, Recall, Guide, Palace, Trace, Check, Chain) | | 0.2 ms or less each | | 0.11 ms or less each |

`world.update()` over the same frames: p50 3.1 ms, p95 5.7 ms, mean 3.45 ms; the system means add up to 3.4 ms, so the wrappers account for the whole update. **Loci's own systems take well under 1 ms of a frame on average; the largest single cost is the framework's input system processing the emulated hands.**

The first profile (18:31 IST) put HubSystem as the costliest Loci system: mean 0.41 ms, p95 1.0 ms, max 3.8 ms. Its two-second `refresh()` re-sent about 20 text and display properties to the UIKit panel even when nothing had changed, and UIKit re-lays out on each one. The hub now remembers the last value it wrote to each element and skips identical writes. Re-profiled at 18:40 IST: mean 0.26 ms, p95 0.7 ms, max 2.4 ms.

For scale only: a 72 Hz headset frame is 13.9 ms and a 90 Hz frame is 11.1 ms. The emulator's CPU is not a Quest's CPU, so this is a sanity check that nothing in the systems is wildly expensive, not a claim about headset headroom.

## Renderer

`renderer.info`, read straight after each `render()`:

| | |
| --- | --- |
| Draw calls per frame | 64 (66 at most) |
| Triangles per frame | 21,668 (21,680 at most) |
| Textures in GPU memory | 22 |
| Geometries in GPU memory | 86 |
| Shader programs | 19 |

The XR camera renders two eye views in one `render()` call, so the draw call and triangle counts cover both eyes. No frame called `render()` more than once.

## JS heap

`performance.memory` in the app frame (Chromium only): 265.5 MB used before sampling, 255.0 MB after, 290.3 MB total. That heap is shared with the emulator, its synthetic room and the editor bridge running in the same page, so it is an upper bound for the app, and nothing here forces a GC. In this run the heap fell by 10.5 MB over the 300 frames; in the 11:08 run it rose by 8 MB. Neither is evidence of a leak either way.

## Frame interval (emulator, not the app)

The headless emulator presented one XR frame about every 1.0 s (p50 1,044.7 ms, p95 1,185.2 ms). The app's own update + render is about 5 ms of that; the rest is outside the app's JS (the emulator's software rasterising of the room and the stereo views). This is why frame rate is not reported here.

## Allocation in the per-frame path

`tests/no-alloc.test.ts` checks that `SampleRing.push` (`src/core/toss.ts`), which the recall system calls every frame while a memory is held, allocates nothing. It measures V8's heap counter around a forced GC over 20,000 calls: in one run the ring used 240 bytes in total (about 0.01 bytes per call, the counter's noise), while a control that allocates one small object per call used 2,243,728 bytes. The test fails above 1 byte per call and also fails if the control stops seeing its allocations.

## Reproduce

```sh
npx @iwsdk/cli dev up --headless --allow-browser-automation --screenshot-width 1280 --screenshot-height 800
python3 scripts/e2e-concept.py               # builds the concept palace (6 stages, threads, rings)
python3 scripts/perf.py 300                  # samples 300 frames, writes .tmp/perf.json
npx vitest run tests/no-alloc.test.ts
```
