# Fact-check eval

Run 17/11/2026, 1:57:43 pm IST against https://loci-vr.vercel.app/api/architect with `npx vite-node scripts/eval-verify.ts`.

- Shipped concepts passing clean: **8 of 8**
- Planted errors flagged: **6 of 8**, on the planted stage: **6 of 8**
- Median server time: **905 ms**

| Concept | As shipped | With one planted error | What it said |
|---|---|---|---|
| How your heart pumps blood | clean | stage 4: caught on that stage | The claim states the left ventricle is the weakest chamber, but the reason correctly notes it pumps to the whole body and has the thickest wall, making it the strongest. |
| How plants make food | clean | stage 4: caught on that stage | The claim states that oxygen comes from carbon dioxide, but the fact correctly states it comes from splitting water. |
| Why we have seasons | clean | stage 4: caught on that stage | Earth is actually closest to the Sun in early January, not early July as the claim states. |
| How a vaccine trains your body | clean | stage 2: caught on that stage | Antibodies are made by white blood cells (B cells), not red blood cells, and they do not fit every germ equally well. |
| How the water cycle works | clean | stage 2: missed |  |
| How a pull request gets merged | clean | stage 2: caught on that stage | The claim states that a pull request immediately merges the change, but it actually only proposes the change. |
| How a web page reaches you | clean | stage 0: caught on that stage | The claim states that browsers send names directly to every computer, which is wrong; they actually query DNS servers to resolve IP addresses. |
| How Loci works | clean | stage 3: missed |  |

## Run history

| Run (IST) | Shipped concepts clean | Planted errors caught on the right stage | Missed |
|---|---|---|---|
| 16 Nov, afternoon (6 concepts) | 6 of 6 | 6 of 6 | none |
| 17 Nov 13:52 (8 concepts, before the prompt change) | 8 of 8 | 6 of 8 | pull request, How Loci works |
| 17 Nov 13:57 (8 concepts, after asking the checker to read each claim on its own first) | 8 of 8 | 6 of 8 | water cycle, How Loci works |

The checker is a language model, so which planted error slips through varies from run to run; across runs it has never flagged a correct shipped stage. It backs up, and does not replace, the hand checks on the shipped concepts.
