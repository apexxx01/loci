# Palace Architect: live teach-mode evaluation

Run: 16 Nov 2026, 15:43 IST (2026-11-16T10:13:56.489Z UTC start, 2026-11-16T10:24:29.328Z UTC end), against `https://loci-vr.vercel.app/api/architect`.

Command:

```sh
node scripts/eval-architect.mjs
```

Each topic was sent once as `POST {mode: "teach", topic, audience}`, one at a time, 2 s apart, with at most 14 requests in any 10-minute window (the API allows about 20). Wall time is measured by the client and includes the network; server time is the `ms` the API reports. "Myth checks kept" counts stages whose misconception check survived the rule-based vetting (a check is dropped if either statement fails the safety filter or both say the same thing).

## Summary

| Measure | Value |
| --- | --- |
| Topics | 20 |
| Passed (deck with 3 or more stages) | 20 of 20 (100%) |
| Median stages per concept | 4 |
| Myth checks kept | 83 of 88 stages |
| Scenes replaced by the safety filter | 2 |
| Median server time | 2655 ms |
| Median wall time | 2756 ms |
| Primary model (from GET) | gemini-3.5-flash-lite |
| Models that answered | gemini-3.5-flash-lite (20) |

## Per topic

| # | Topic | Domain | Audience | Result | Stages | Myth checks kept | Model | Server ms | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | How a vaccine trains the immune system | science | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 2483 | 2690 |
| 2 | How photosynthesis turns sunlight into sugar | science | adult | ok | 5 | 5 | gemini-3.5-flash-lite | 3194 | 3311 |
| 3 | How plate tectonics builds mountains | science | teen | ok | 4 | 4 | gemini-3.5-flash-lite | 2417 | 2527 |
| 4 | How the Roman Republic became an empire | history | adult | ok | 4 | 1 | gemini-3.5-flash-lite | 2447 | 2598 |
| 5 | How the printing press helped spread the Reformation | history | adult | ok | 4 | 2 | gemini-3.5-flash-lite | 2783 | 2868 |
| 6 | What caused the 1929 stock market crash | history / finance | adult | ok | 5 | 5 | gemini-3.5-flash-lite | 3230 | 3351 |
| 7 | How compound interest grows savings over time | finance | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 2577 | 2649 |
| 8 | How an index fund works | finance | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 2723 | 2806 |
| 9 | How a UPI payment moves money between two bank accounts | finance / tech | adult | ok | 5 | 5 | gemini-3.5-flash-lite | 2849 | 2935 |
| 10 | How a bill becomes law in the Indian Parliament | law | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 2247 | 2315 |
| 11 | How a contract is formed: offer, acceptance and consideration | law | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 2525 | 2598 |
| 12 | What happens in a criminal case from arrest to verdict | law | adult | ok | 5 | 5 | gemini-3.5-flash-lite | 2891 | 3040 |
| 13 | How HTTPS keeps a connection private | tech | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 2587 | 2692 |
| 14 | How a large language model predicts the next word | tech | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 2066 | 2148 |
| 15 | How Git records and merges changes | tech | adult | ok | 5 | 5 | gemini-3.5-flash-lite | 3288 | 3720 |
| 16 | How a refrigerator keeps food cold | everyday | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 2517 | 2705 |
| 17 | How a flush toilet works | everyday | adult | ok | 6 | 6 | gemini-3.5-flash-lite | 3710 | 3841 |
| 18 | How noise-cancelling headphones work | everyday | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 2495 | 2598 |
| 19 | Pasted notes: water cycle (7 lines) | pasted notes | teen | ok | 5 | 5 | gemini-3.5-flash-lite | 2897 | 3013 |
| 20 | Why is the sky blue? | science (child) | child | ok | 4 | 4 | gemini-3.5-flash-lite | 5169 | 5245 |

The pasted notes sent for row 19:

```text
Water cycle notes (Year 9 geography)
- sun heats oceans/lakes -> evaporation, water vapour rises
- plants lose water from leaves = transpiration
- vapour cools higher up -> condenses on dust -> clouds
- droplets join, get heavy -> precipitation (rain, snow, hail)
- runoff over ground into rivers, some soaks in = infiltration -> groundwater
- rivers + groundwater flow back to sea, cycle repeats
```

## Two full outputs, verbatim

Title and stages exactly as the API returned them (after server-side vetting). Glyph emoji are omitted.

### "Why is the sky blue?"

Topic: "Why is the sky blue?", audience: child, model: gemini-3.5-flash-lite, server 5169 ms.

1. **Sunlight has all colors**: Sunlight looks white to us, but it is actually made of every color of the rainbow mixed together.
   - Why: White light from the sun carries all the colors of the light spectrum travelling together in waves.
   - Scene: A giant glowing sun squeezes a rainbow toothpaste tube across the whole sky.
   - Myth check: wrong "Sunlight is purely white light and contains no other colors inside it." / right "Sunlight is actually a mixture of all the colors of the rainbow combined."
   - Leads on: travels down to touch the air
2. **Light hits the air**: The sunbeams crash into tiny invisible gas particles floating all around our planet.
   - Why: Earth is wrapped in a thick blanket of air made of gases like nitrogen and oxygen.
   - Scene: Bouncing pinballs made of sunlight crash into millions of tiny floating soap bubbles.
   - Myth check: wrong "Sunlight passes straight through the air without touching any gases or particles." / right "Sunlight constantly crashes into tiny gas particles floating everywhere in the air."
   - Leads on: bounces blue light away
3. **Blue bounces around**: Blue light travels in short, choppy waves that crash into gas and scatter in every direction.
   - Why: Shorter light waves hit obstacles much easier than long waves, causing them to bounce wildly.
   - Scene: Little blue frogs hop crazily in every direction off tiny trampoline clouds.
   - Myth check: wrong "Blue light travels in long straight lines and passes through the air without scattering." / right "Blue light travels in short waves that scatter in every direction when hitting gas."
   - Leads on: fills the sky above
4. **We see blue sky**: Our eyes catch all this scattered blue light bouncing around above us, so the sky looks blue.
   - Why: The scattered blue light spreads all across the sky dome before reaching our eyes.
   - Scene: A happy child wearing giant blue sunglasses looks up and smiles at the glowing roof.
   - Myth check: wrong "The sky looks blue because it reflects the color of the deep ocean water." / right "The sky looks blue because scattered blue sunlight reaches our eyes from everywhere."

### "How compound interest grows savings"

Topic: "How compound interest grows savings over time", audience: adult, model: gemini-3.5-flash-lite, server 2577 ms.

1. **Earning initial interest**: Money placed in a savings account earns extra money called interest based on the principal amount.
   - Why: Banks pay you to use your deposited money for their own lending activities.
   - Scene: A shiny golden coin sitting in a glass jar suddenly splits into the original coin plus a smaller silver coin.
   - Myth check: wrong "Interest is a flat fee paid by the bank once per year as a holiday bonus." / right "Interest is calculated continuously or periodically as a percentage of your total current balance."
   - Leads on: adds this new money to the total
2. **Adding to the principal**: The newly earned interest joins your original deposit to form a larger total balance.
   - Why: Your account balance grows so that future calculations use a bigger starting figure.
   - Scene: A tiny silver coin melts into the original golden coin, making the single coin visibly larger and heavier.
   - Myth check: wrong "Earned interest is automatically separated and stored in a different untouchable account." / right "Earned interest merges directly into your main balance, increasing the amount eligible for future gains."
   - Leads on: multiplies the next percentage cycle
3. **Generating interest on interest**: The next interest payment is calculated using the new, larger total rather than just the original deposit.
   - Why: Percentage growth naturally yields bigger returns when applied to a larger overall sum.
   - Scene: A larger golden coin splits into the big coin plus two silver coins instead of just one.
   - Myth check: wrong "Interest is always calculated strictly against the original starting amount forever." / right "Compound interest calculates earnings on both the original principal and all accumulated past interest."
   - Leads on: accelerates the growth speed over time
4. **Snowballing over time**: The cycle repeats continuously, causing the total savings to grow faster and faster over long periods.
   - Why: Exponential growth curves turn small early gains into massive totals if given enough time.
   - Scene: A small rolling snowball rapidly transforms into a massive glowing boulder crashing across the room.
   - Myth check: wrong "Compound interest grows steadily at the exact same straight-line speed every single year." / right "Compound interest accelerates exponentially, meaning the growth gets significantly faster with each passing year."

Raw results for every topic, including full decks: [architect-eval.json](architect-eval.json).
