# Fact-check eval

Run 16/11/2026, 3:41:42 pm IST against https://loci-vr.vercel.app/api/architect with `npx vite-node scripts/eval-verify.ts`.

- Shipped concepts passing clean: **6 of 6**
- Planted errors flagged: **6 of 6**, on the planted stage: **6 of 6**
- Median server time: **680 ms**

| Concept | As shipped | With one planted error | What it said |
|---|---|---|---|
| How your heart pumps blood | clean | stage 4: caught on that stage | The claim states the left ventricle is the weakest chamber, but the reason correctly notes it pumps blood to the toes and has the thickest wall, making it the strongest. |
| How plants make food | clean | stage 4: caught on that stage | The claim states that oxygen comes from carbon dioxide, but the fact correctly states it comes from splitting water. |
| Why we have seasons | clean | stage 4: caught on that stage | Earth is actually closest to the Sun in early January, not July as stated in the claim. |
| How a vaccine trains your body | clean | stage 2: caught on that stage | Antibodies are actually made by white blood cells (B cells), not red blood cells, and they do not fit every germ equally well because each is specific to one shape. |
| How the water cycle works | clean | stage 2: caught on that stage | The claim states that clouds are made of invisible water vapour, but the fact correctly states they are tiny liquid droplets or ice crystals. |
| How a web page reaches you | clean | stage 0: caught on that stage | The claim states that the browser sends the name directly to every computer, which is factually incorrect; it actually queries the DNS system instead of broadcasting to all computers. |
