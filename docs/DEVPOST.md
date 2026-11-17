# Loci: Devpost submission text (draft)

> Paste each section into the matching Devpost field. Numbers come from real runs in this repo; re-check them against `public/receipts.json` on submission day.

## Images to upload (in this order)

1. `docs/headset-closeup.png`: stages on the table, couch and lamp of the emulator's living room, joined by the gold thread, with rings of light on the couch and table tops.
2. `docs/headset-card.png`: a stage pinched open: the claim, why it is true, a Fact-checked badge and a chip naming the next stage.
3. `docs/headset-return.png`: the day after (emulator, dates moved back four days): every stage back on its furniture and awake, the panel saying "Welcome back. 6 memories are glowing, ready to recall." and the guide arrow pointing at the first.
4. `docs/headset-concept.png`: the whole six-stage chain around the room, with the hub panel in front of the viewer.
5. `docs/walk-stage.jpg`: the website walk.
6. `docs/walk-explain-back.jpg`: explain-back graded.

## Tagline

Your room remembers. Ask about anything, and Loci turns it into a chain of stages that live on your real furniture, joined by a thread of light.

## Inspiration

The oldest memory trick there is, the method of loci, works because the brain keeps facts by place. Place cells and grid cells won the 2014 Nobel Prize; 9 of the 10 memory champions scanned in a 2003 study used the method; people with ordinary memory went from 26 to 62 of 72 words after 40 days of practice. The hard part was always imagining the palace. Quest 3 can see your room, so it never has to be imagined again.

We also wanted to go past memorising lists. Most of what people need to learn is how something WORKS: how a heart pumps, how a bill becomes law, how compound interest grows. A mechanism is a chain of causes, and a chain of causes maps beautifully onto a walk around a room.

## What it does

- **Ask anything, or paste your notes.** The Palace Architect explains it as 4 to 7 linked stages. Each stage has the claim, *why* it is true, a vivid picture, the link to the next stage, and one common misconception.
- **Your room becomes the model.** Using Quest scene understanding, each stage lands on a real object: your couch, your lamp, your shelf. A ring of light traces the top it rests on, and a gold thread joins the stages in causal order, so walking the room is walking the mechanism. When the palace is ready the thread ignites, stage by stage, with rising tones.
- **Learning, not just reading.** Stages rest as small glowing labels with one headline. Pinch to open the full stage. On recall, a stage turns into a myth check: two statements, one true and one a common misconception. Pinch the true one. Wrong answers show the correction and come back sooner.
- **Rebuild the chain.** The thread goes dark and the numbers hide; pinch the stages in the order things happen and relight it link by link.
- **It checks its own work.** A second pass fact-checks every generated stage; anything doubtful says what to verify. In our latest eval it passed all 8 shipped concepts clean and caught 6 of 8 planted errors on the right stage; it has never flagged a correct shipped stage.
- **It brings you back.** Spaced repetition (FSRS) decides when each stage returns. Persistent anchors keep every stage on the same piece of furniture between sessions. A stage missed twice gets a brand-new picture from the Architect. On the website, one button puts your next three walks (tomorrow, in three days, in a week) in your calendar, each linking straight back to the palace.
- **Built for sitting down, and for every body.** Everything stays within a comfortable seated view. Hands only, no controllers. On Meta VR Glasses you look and pinch with either hand. Look to select runs the entire loop with no hands at all. Read-aloud, high contrast, larger tiles and calm motion are one panel away.
- **The website is a palace too.** A living room drawn in lines of light: scroll and the gold thread draws from object to object, each holding a stage with its myth check. At the door you explain it back in your own words and the Architect grades which stages you covered and names any misconception. Then put it in your room.

## Why it fits the awards

**Best New Productivity Experience.** Learn what your work needs, in the room where you work. Ask how anything in your job works (how a pull request gets merged ships as a ready-made walk), or paste your own notes, an onboarding checklist or a process, and it becomes a walk you can test yourself on, explain back and keep. It is about understanding, not memorising lists: each stage carries why it is true and the misconception people actually hold. Walks share as a link, export to flashcards, and put your next three reviews in your calendar.

**Best Reason to Come Back.** Coming back is the whole method, and we test the day after: in the emulator we study a walk, move every saved date back four days, leave and come back. Every stage is exactly where it was, the stages due are drawn awake, the panel says how many are waiting, and the guide points at the first (7 of 7 checks). FSRS schedules each stage just before you would forget it, the stages wait on the same furniture through persistent anchors, due stages glow when you return, and a stage you keep missing comes back with a brand-new picture. The website puts your next three walks in your calendar with a link back in.

**Best First Five Minutes.** There is one gesture, and the first time a drawn hand shows it, beside your first stage and then beside the two answers. It is three pinches to your first opened stage (Ready-made walks, a concept, a stage), or a few more to ask your own question: the panel keyboard's chips turn into finished questions as you type, and the Architect answers in a median 2.8 s. When the palace lands, the thread ignites stage by stage and each label says which of your things it is on.

**Best Accessibility Forward Experience.** Every interaction has a path with no hands: Look to select presses panel buttons, opens stages, answers myth checks and rebuilds the chain, and our emulator test runs that whole loop with the hands disconnected (9 of 9). On Meta VR Glasses your eyes aim and a pinch from either hand selects; on the glasses profile the panel fits their narrower view (9 of 9). It is seated by design, with read-aloud, high contrast, larger tiles, calm motion (on automatically if the system asks for reduced motion) and a sound switch where every cue also shows as text.

**Best Agentic Interaction.** The Palace Architect does more than answer: it plans a concept as linked stages with real misconceptions, fact-checks its own output in a second pass (6 of 8 planted errors caught on the right stage in our latest eval, no false alarms), re-imagines any picture you miss twice around the object it sits on, and grades your own explanation against the stages. Everything it writes is vetted by rules before it reaches your room.

**Boldest Original Concept.** Your room becomes the model of the idea. The method of loci is 2,500 years old; mixed reality is the first time nobody has to imagine the palace.

## How we built it

- **IWSDK (WebXR, Three.js + ECS)** on Quest Browser: planes and meshes with semantic labels, persistent anchors, hand tracking, spatial audio, UIKitML panels.
- **Placement solver** (`src/core/placement.ts`): scores real surfaces by label, size, distance and seated comfort, keeps stages in walk order, and falls back to a seated arc. Tested over 1,000 seeded random rooms.
- **Anchors and re-fit:** each stage restores from its anchor; if the room changed, a semantic check notices and re-fits.
- **Systems:** placement, recall, myth check, thread (one ribbon, one draw call, no per-frame allocation), surface traces, chain practice, first-run lesson, access.
- **Palace Architect:** a Vercel serverless function calling Gemini with a hedged fallback chain, structured JSON output, and rule-based vetting of every line (brands, real people, unsafe content) before anything reaches the room.
- **Tests:** unit and property tests with vitest; end-to-end flows in the Immersive Web Emulator driven from the IWSDK CLI.

## Challenges

- No headset. Everything was built and tested in the emulator, so we leaned on automated end-to-end tests and a 1,000-room property test rather than eyeballing.
- Making text readable at room distance: we moved from paragraph cards to one-headline labels that open on a pinch.
- Keeping generated content honest: myth checks must be real misconceptions, not strawmen, so the prompt asks for beliefs teachers actually correct, and the vetting drops any check that fails the safety rules.

## Accomplishments

- A learning loop that uses the room itself: stages on real furniture, a causal thread, myth checks, rebuilding the chain, and spaced returns.
- End-to-end emulator suite passing, including asking, building, the myth check, the thread, and restoring every stage to within 0.1 mm after re-entering.
- All 8 of the emulator's synthetic rooms passed all 15 concept checks on the first try, with 47 of 48 stages on the room's own furniture and walls; with no scene data at all, every stage fell back to the seated arc and all 15 checks still passed.
- Look to select passed 9 of 9 emulator checks with the hands disconnected, and the Meta VR Glasses profile passed 9 of 9 (gaze plus a pinch from either hand, the panel inside the glasses' view, hand rays when gaze drops out).
- Profiled per system in the emulator, Loci's own systems take well under 1 ms of a frame on average; 106 unit tests, including a 1,000-room placement property test and a no-allocation check on the per-frame path.
- 20 of 20 live Architect topics produced a full concept in our eval, in a median 2.8 s each, and the fact-check pass caught 6 of 8 planted errors on the right stage with no false alarms on the 8 shipped concepts.

## What we learned

Mixed reality is at its best when the real room is the content, not the backdrop. And "understand how it works" is a better promise than "memorise this".

## What's next

Shared palaces for a class or team, voice questions in the headset, and teacher-made walks.

## How are hands used? (hand interactions answer)

Loci is hands-first end to end; no controller is ever needed.
- **Pinch** a glowing label to open a stage, pinch again to close it.
- **Pinch A or B** beside a stage to answer its myth check.
- **Pinch the stages in order** to rebuild the chain.
- **Pinch keys** on the panel keyboard to ask a question; finished-question chips mean most questions take a few pinches.
- **Gaze and pinch:** on Meta VR Glasses, look at a button or stage and pinch with either hand.
- **Look to select** (dwell) runs the whole loop with no hands for anyone who cannot pinch comfortably.
Everything is reachable while seated.

## Built with

IWSDK, WebXR, Three.js, TypeScript, Vite, Gemini API, Vercel, ts-fsrs, zod, vitest, Immersive Web Emulator (driven through the IWSDK CLI).
