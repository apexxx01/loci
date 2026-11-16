# Loci

**Your room remembers.** Loci is a hands-first mixed-reality memory palace for Meta Quest 3 and 3S. Ask how something works and it is taught to you as a chain of stages, each one resting on a real piece of furniture in your room and joined to the next by a thread of gold light. Come back tomorrow and every stage is still on its object, waiting to be recalled.

Built with the Immersive Web SDK (WebXR) for the Meta VR Start Developer Competition 2026, Productivity track.

**Live:** https://loci-vr.vercel.app

<p>
  <img src="docs/walk-stage.jpg" width="49%" alt="The website walk: stage 1 of how the heart pumps blood, resting on a couch, with its myth check underneath">
  <img src="docs/walk-explain-back.jpg" width="49%" alt="The explain-back step at the door: 3 of 6 stages explained, graded on the device">
</p>
<p>
  <img src="docs/headset-concept.png" width="70%" alt="In the headset emulator: the concept stages for how the heart pumps blood sit on furniture around a seated viewer, joined by a gold thread">
</p>

---

<p align="center"><img src="docs/headset-closeup.png" width="49%" alt="In the headset: a stage glows on a real couch, joined to the next by the gold thread, with a ring of light on the surface it rests on." /> <img src="docs/walk-stage.jpg" width="49%" alt="The website walk: a living room drawn in light, with the first stage and its myth check." /></p>

## Try it in 60 seconds

> **On a Quest 3 or 3S**
> 1. Run **Space Setup** once (Settings > Environment setup > Space Setup) so the headset knows where your table, couch and shelves are. Loci still works without it, but then stages float in an arc in front of you instead of sitting on your furniture.
> 2. Open the **Quest Browser** and go to **https://loci-vr.vercel.app**. Press **Enter your room** and allow the room permissions.
> 3. Sit down. On the panel in front of you, pinch **Ask about anything**, type what you want to understand (starter words like *How does* save typing), then pinch **Teach me**. Ready-made walks are there too if you just want to see it work.
> 4. Follow the gold thread. **Pinch** a stage to turn it over, pick the true statement in its myth check, then hold it and **raise** it if you knew it or **lower** it to see it again soon.
>
> **On any screen (laptop, phone)**
> Open https://loci-vr.vercel.app and scroll. The page is a walk through a room at night: each stage of a concept sits at a different place, you answer its myth check, and at the door you explain it back in your own words and get graded.

## What it does

- **Concepts as linked stages on your real furniture.** A topic becomes 4 to 7 stages of how it works. Each stage sits on a different object, the route runs left to right so one sweep of the head walks it in order, and a gold thread joins each stage to the next and lights up as you recall them.
- **Myth checks.** Most stages carry two statements: a misconception real people hold and the accurate one. Picking the myth shows the correction and brings that stage back within minutes.
- **Explain-back, graded.** At the end of the website walk you explain the whole concept in your own words. The Palace Architect marks which stages you covered, names any misconception, and tells you what to add next. If the server cannot be reached, an offline grader on the device gives a blunter verdict from key words.
- **Spaced repetition with FSRS.** Every recall goes into an FSRS scheduler ([ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)), so each stage comes back just before you would forget it. Using the hint counts as a harder recall.
- **The Palace Architect re-imagines a memory you miss twice.** When a stage lapses twice, its picture is rewritten around the object it sits on (a lamp heats, a couch sinks, a window fogs), up to two times per memory.
- **Your own material.** Besides topics, you can paste notes, a list, a speech, names or numbers. Numbers are turned into pictures on the device and never leave it.
- **Ask from inside the headset.** The panel opens on *Ask about anything* with a keyboard on the panel; its chips turn into finished questions as you type, so most questions take a handful of pinches. On the website you can also type, paste, drop a text file or (where the browser supports it) ask out loud.
- **Rebuild the chain.** A second way to practise a concept: the thread goes dark, stage numbers hide, and you pinch the stages in the order things happen; each right pick relights the thread into that stage.
- **The Architect double-checks itself.** A second, conservative pass reads every generated stage again looking only for clear mistakes; a doubted stage says what to verify, on the website walk and on the opened card in the headset. In [our fact-check eval](docs/verify-eval.md) it passed all 6 shipped concepts clean and caught 6 of 6 planted errors on the right stage, in a median 680 ms.
- **Share or export.** A concept you asked for can be copied as a link or downloaded as flashcards (CSV) for Anki and similar apps.
- **Real furniture hides what is behind it.** Where the headset can sense depth, stages are occluded by the real objects in front of them (requested as an optional feature, so headsets without depth still enter normally).
- **It shows it found your furniture.** A ring of light traces each real surface a stage rests on, in step with the thread igniting, and each label says *on your couch*.
- **A silent first lesson.** The first time, a small drawn hand pinches beside stage 1 and then beside the A and B answers. No text walls.
- **A finish line.** When every stage has been checked, the whole chain lights up again and Loci says when it will come back.
- **Instant repeats.** A concept asked for before comes back instantly from the device or a warm server; if the Architect cannot be reached, questions that match a shipped concept still get their walk.

## How it works

```mermaid
flowchart LR
  subgraph Quest["Meta Quest 3 / 3S (WebXR, Immersive Web SDK)"]
    SU["Scene understanding<br/>XRPlane + XRMesh<br/>(Space Setup labels)"] --> RS["RoomSystem<br/>planes and meshes to Surfaces"]
    RS --> PS["Placement solver<br/>src/core/placement.ts"]
    PS --> AN["Persistent anchor<br/>palace saved in local storage"]
    AN --> ECS["ECS systems<br/>palace, recall, thread, check,<br/>hub, access, guide, trace,<br/>chain, onboarding"]
    ECS --> FS["FSRS scheduler<br/>src/core/scheduler.ts"]
  end
  subgraph Vercel["Vercel serverless: /api/architect"]
    AR["Palace Architect<br/>teach, build, grade,<br/>bind, reimagine"] --> GM["Gemini, hedged:<br/>fast model first, a larger one<br/>starts after 2.5 s without an answer"]
    GM --> VET["Rule-based vetting<br/>schema, safety filter,<br/>myth checks dropped if unsafe"]
  end
  ECS -- "Teach me / reimagine" --> AR
  VET -- "deck of stages" --> ECS
  WEB["Website walk<br/>any screen, same decks,<br/>same schedule"] -- "Teach me / grade" --> AR
```

- **Room to surfaces.** `src/xr/room-system.ts` reads the planes and meshes the headset reports (from Space Setup) and reduces each one to a centre, a normal, a size and a label such as table, couch, shelf, wall or window.
- **Placement solver.** `src/core/placement.ts` is pure TypeScript with no engine imports. It turns surfaces into candidate slots, scores them for comfort (distance, how far you must turn, how distinctive the object is), spreads memories one per object, keeps tiles apart so none hides another from the seat, and orders the route left to right. Same room and same deck always give the same palace.
- **Persistent anchors.** The palace is stored as poses relative to a WebXR persistent anchor, so it comes back in the same place next session.
- **ECS.** The headset app is a set of entity-component systems (IWSDK's [ECS](https://iwsdk.dev)): each system queries the entities it cares about every frame, for example the recall system for tiles being held and the thread system for the gold links.
- **Palace Architect.** `api/architect.ts` runs on Vercel serverless. It asks Gemini for structured JSON. If the primary model has not answered in 3.5 s, the next model in the chain starts in parallel and the first good answer wins. Every line then passes a rule-based check (`src/core/architect.ts`, `src/core/safety.ts`): unsafe scenes are replaced with a plain one and a myth check is dropped if either statement fails.

## Works in rooms we have never seen

Loci never assumes a particular room. Placement falls down a ladder:

1. **Labelled furniture first.** Distinct, nameable objects (table, desk, couch, shelf, lamp, plant) make the strongest places, so they are chosen before blank walls. A table reported twice, once as a labelled mesh and once as a bare plane, counts once.
2. **Then plain planes and walls**, at eye level on walls and just above horizontal tops.
3. **Then a seated arc in front of you**, in up to three rings, filling whatever the room could not. A completely empty or unscanned room still gets an even, symmetric palace.

Every slot stays within 70 degrees of where you face, so you never have to turn round in your chair.

On your return, the palace restores from its anchor and then **re-checks the room by meaning**: do memories still sit near objects with the same labels? If fewer than 40 percent do (you moved, or rearranged), Loci **re-fits** the palace to the furniture that is there now instead of leaving memories floating. You can also re-fit by hand from the panel.

The property test below throws 1,000 random rooms at the solver to back these claims.

## Hands-first and accessible

- **Pinch** with bare hands for everything: turn a stage over, choose a myth check answer, type on the panel keyboard.
- **Look to select:** look at a tile and hold your gaze (head direction on Quest 3) to flip and rate it, so no pinching or lifting is ever required.
- **Seated** by design: the whole palace fits in a comfortable turn from one chair.
- **High contrast**, **larger tiles**, **calm motion** and **read-aloud**, plus a sound switch, all on the panel in your room.
- Tiles on far objects are drawn larger so every one reads the same from your seat.

## Privacy

- **No accounts.** Palaces and progress live in your browser's local storage. Share links carry the palace inside the link itself.
- **Your notes leave the device only when you press Teach me** (or build), and only go to the Palace Architect endpoint to write the stages. After that, only short memory text is sent: a memory's cue and picture with its object's label when it is woven into your room or re-imagined, and your explanation when you ask for it to be graded. The API keeps no copy of any of it; it only counts requests per IP address in memory, for rate limiting.
- **Numbers are converted on the device** with the number-shape system, so a phone number or a date is never sent anywhere.

## Receipts

Every number here comes from a command that can be re-run. Generated 16 Nov 2026 (IST); `node scripts/receipts.mjs` re-runs the unit tests and writes [public/receipts.json](public/receipts.json). That file also carries the room matrix and perf results below (`roomMatrix`, `perf`, copied from `scripts/matrix.py` and `scripts/perf.py` output); `receipts.mjs` does not regenerate those two.

| What | Result | Reproduce |
| --- | --- | --- |
| Unit tests | **99 passing** in 10 files, 0 failing (16 Nov 2026, 13:40 IST), including a check that the per-frame hand-sample ring allocates nothing | `npx vitest run` |
| Placement property test | **1,000 seeded random rooms**, 6 to 12 memories each, 9,037 placements: every memory placed, no two closer than the solver's own minimum spacing, every slot within 70 degrees of forward and none behind the viewer, heights within the solver's limits | `npx vitest run tests/placement-property.test.ts` |
| Concept end-to-end in the Immersive Web Emulator | **15/15 checks** (16 Nov 2026, 00:35 IST): pick a concept, stages land on distinct furniture, threads join and light, myth checks record recalls, exit and re-enter restores everything; restore drift **under 1 mm** | `python3 scripts/e2e-concept.py` with the dev server up |
| Room matrix in the emulator | **8 of 8 synthetic rooms pass all 15 checks** (bedroom, conference room, home office, kitchen, music studio, open office, open studio, sunlit living room; kitchen and music studio on a second run after a missed button press). 47 of 48 stages landed on the room's furniture and walls, 1 on the seated arc; restore drift under 0.1 mm in every room. With no scene data at all, all 6 stages fell back to the seated arc and 14 of 15 checks passed (the one failure is the furniture check, which cannot pass in an empty room). 16 Nov 2026, 11:34 to 13:38 IST. [docs/test-matrix.md](docs/test-matrix.md) | `python3 scripts/matrix.py` with the dev server up |
| Frame cost in the emulator | Concept palace on screen (6 stages, threads, 6 trace rings, hub open), 300 frames: world update + render **6.7 ms p50, 11.3 ms p95** of CPU; 76 draw calls, 23,492 triangles, 22 textures, 88 geometries. Software GL (SwiftShader), so relative numbers only, not Quest frame times. 16 Nov 2026, 11:08 IST. [docs/perf.md](docs/perf.md) | `python3 scripts/perf.py 300` with the dev server up |
| Palace Architect, live teach mode | **20 of 20 topics** taught (science, history, finance, law, tech, everyday, pasted notes, a child audience); median 4 stages, **82 of 87 stages kept a myth check**, median **6.1 s** server time (6.2 s wall) | `node scripts/eval-architect.mjs` |

The full Architect run, with a per-topic table and two complete outputs, is in [docs/architect-eval.md](docs/architect-eval.md). In that run every answer came from the fallback model (`gemini-3.5-flash-lite`), not the primary, which shows the hedging doing its job.

How the property test's 9,037 placements split: 1,263 on furniture tops, 3,439 on walls, 4,335 on the seated arc. 86 of the 1,000 rooms were empty on purpose.

## The research behind it

- **Place cells and grid cells.** The brain has a dedicated system for knowing where you are. [Nobel Prize in Physiology or Medicine 2014](https://www.nobelprize.org/prizes/medicine/2014/summary/) (O'Keefe, Moser and Moser).
- **Memory champions use places, not special brains.** Superior memorizers rely on spatial learning with the method of loci. [Maguire et al., 2003, *Nature Neuroscience*](https://doi.org/10.1038/nn988).
- **The method can be learned, and it lasts.** Six weeks of method-of-loci training made novices' brain networks look like memory athletes' and improved recall four months later. [Dresler et al., 2017, *Neuron*](https://doi.org/10.1016/j.neuron.2017.02.003).
- **Virtual memory palaces work.** People recalled more with a memory palace in a head-mounted display than on a desktop. [Krokos, Plaisant and Varshney, 2018, *Virtual Reality*](https://doi.org/10.1007/s10055-018-0346-3).
- **Testing beats rereading.** Retrieval practice produces better long-term retention than study alone, which is why Loci asks you to recall before it shows you. [Roediger and Karpicke, 2006, *Psychological Science*](https://doi.org/10.1111/j.1467-9280.2006.01693.x).
- **Spacing beats cramming.** [Cepeda et al., 2006, *Psychological Bulletin*](https://doi.org/10.1037/0033-2909.132.3.354), a meta-analysis of distributed practice.
- **FSRS**, the open spaced-repetition scheduler Loci uses: [open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs).

## Development

Requires Node 20.19+, 22.12+ or 24+.

```sh
npm install
npm run dev          # IWSDK CLI managed dev server, opens a browser with the Quest emulator (IWER)
npm test             # unit tests (vitest)
npm run typecheck    # tsc --noEmit
```

- `npm run dev` runs the dev server through the IWSDK CLI (`iwsdk dev`), not plain Vite. `iwsdk.config.json` is the project's source of truth for the scene and XR features. IWER is IWSDK's browser-based XR emulator; see [Testing your experience](https://iwsdk.dev/guides/02-testing-experience.html).
- End-to-end tests drive the emulator with the dev server up: `python3 scripts/e2e.py` (list palace) and `python3 scripts/e2e-concept.py` (concept palace).
- `node scripts/eval-architect.mjs` runs the live Architect evaluation (about 11 minutes; it paces itself under the API's rate limit). `node scripts/receipts.mjs` refreshes `public/receipts.json`.
- The Architect needs `GEMINI_API_KEY` set on the server (see `.env.example`).

```
src/core/     pure logic, no engine imports: placement, scheduler, concepts, safety, grading
src/xr/       headset ECS systems: room, palace, recall, thread, check, hub, access
src/site/     the website walk
api/          Palace Architect (Vercel serverless)
tests/        vitest unit and property tests
scripts/      e2e, evaluation and receipts scripts
```

## Known limits

- **Not yet run on a physical Quest.** All mixed-reality testing so far is in the Immersive Web Emulator with synthetic rooms. Hand tracking, real Space Setup data and real anchor persistence still need a headset session.
- **The emulator e2e runs on software GL**, so it proves behaviour, not frame rate. The [perf receipt](docs/perf.md) measures CPU per frame and draw calls in the emulator only; frame rate and GPU cost on a Quest are unmeasured.
- **The emulator rooms are synthetic.** The [room matrix](docs/test-matrix.md) covers IWER's eight built-in rooms and an empty one; a real Space Setup scan will report different labels and shapes. In the headless emulator (about one frame a second) a short scripted press can miss a frame, so two rooms needed a second run.
- **The Architect can be wrong.** Its stages and myth checks are generated by a language model and only rule-checked for safety and shape, not for truth. The ready-made concepts were checked by hand; generated ones were not. In our 20-topic run, the vetting kept 82 of 87 myth checks; one topic (the Roman Republic) kept only 1 of 4.

## License

[MIT](LICENSE)
