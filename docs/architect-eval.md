# Palace Architect: live teach-mode evaluation

Run: 16 Nov 2026, 00:25 IST (2026-11-15T18:55:07.913Z UTC start, 2026-11-15T19:05:51.902Z UTC end), against `https://loci-vr.vercel.app/api/architect`.

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
| Myth checks kept | 82 of 87 stages |
| Scenes replaced by the safety filter | 0 |
| Median server time | 6112 ms |
| Median wall time | 6234 ms |
| Primary model (from GET) | gemini-3.8-flash |
| Models that answered | gemini-3.5-flash-lite (20) |

## Per topic

| # | Topic | Domain | Audience | Result | Stages | Myth checks kept | Model | Server ms | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | How a vaccine trains the immune system | science | adult | ok | 5 | 4 | gemini-3.5-flash-lite | 4997 | 5075 |
| 2 | How photosynthesis turns sunlight into sugar | science | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 2847 | 3005 |
| 3 | How plate tectonics builds mountains | science | teen | ok | 4 | 4 | gemini-3.5-flash-lite | 6314 | 6392 |
| 4 | How the Roman Republic became an empire | history | adult | ok | 4 | 1 | gemini-3.5-flash-lite | 6263 | 6350 |
| 5 | How the printing press helped spread the Reformation | history | adult | ok | 5 | 4 | gemini-3.5-flash-lite | 6844 | 6928 |
| 6 | What caused the 1929 stock market crash | history / finance | adult | ok | 5 | 5 | gemini-3.5-flash-lite | 7108 | 7180 |
| 7 | How compound interest grows savings over time | finance | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 6067 | 6145 |
| 8 | How an index fund works | finance | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 2890 | 2970 |
| 9 | How a UPI payment moves money between two bank accounts | finance / tech | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 6109 | 6242 |
| 10 | How a bill becomes law in the Indian Parliament | law | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 5899 | 6004 |
| 11 | How a contract is formed: offer, acceptance and consideration | law | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 6379 | 6443 |
| 12 | What happens in a criminal case from arrest to verdict | law | adult | ok | 5 | 5 | gemini-3.5-flash-lite | 8027 | 8095 |
| 13 | How HTTPS keeps a connection private | tech | adult | ok | 5 | 5 | gemini-3.5-flash-lite | 6114 | 6187 |
| 14 | How a large language model predicts the next word | tech | adult | ok | 5 | 5 | gemini-3.5-flash-lite | 6385 | 6487 |
| 15 | How Git records and merges changes | tech | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 5840 | 6855 |
| 16 | How a refrigerator keeps food cold | everyday | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 5772 | 5855 |
| 17 | How a flush toilet works | everyday | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 6149 | 6226 |
| 18 | How noise-cancelling headphones work | everyday | adult | ok | 4 | 4 | gemini-3.5-flash-lite | 4294 | 4368 |
| 19 | Pasted notes: water cycle (7 lines) | pasted notes | teen | ok | 5 | 5 | gemini-3.5-flash-lite | 6486 | 6571 |
| 20 | Why is the sky blue? | science (child) | child | ok | 4 | 4 | gemini-3.5-flash-lite | 2544 | 2635 |

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

### "Why the sky is blue"

Topic: "Why is the sky blue?", audience: child, model: gemini-3.5-flash-lite, server 2544 ms.

1. **Sunlight has all colors**: Sunlight looks white, but it is actually made of every color of the rainbow mixed together.
   - Why: White light from the sun carries all the colors of light traveling through space as waves.
   - Scene: A giant sun wearing a superhero cape made of all the colors of the rainbow, spinning around.
   - Myth check: wrong "Sunlight is pure white light that contains no other colors until it hits a cloud." / right "Sunlight is secretly made of all the colors of the rainbow mixed together."
   - Leads on: travels through space
2. **Light hits the air**: The colorful sunlight reaches Earth and crashes into tiny invisible gas pieces in the sky.
   - Why: Earth is wrapped in an atmosphere full of tiny invisible bits of air called molecules that trap and bounce light.
   - Scene: A million tiny bouncy green trampoline sponges floating in the air, catching bouncing laser beams.
   - Myth check: wrong "Sunlight passes straight through the air without touching anything until it reaches the ground." / right "Sunlight crashes into tiny gas pieces floating all around in the air."
   - Leads on: bounces off gas
3. **Blue light scatters**: Blue light waves travel in tiny short steps, so they bounce off the gas pieces in every direction.
   - Why: Short light waves bump into tiny things much easier than long red waves, making blue bounce away fast.
   - Scene: Tiny blue bouncy balls pinballing everywhere in a giant room full of sleeping giant clouds.
   - Myth check: wrong "Red light bounces around the most because it is the strongest color in sunlight." / right "Blue light bounces around the most because its waves are short and easy to scatter."
   - Leads on: fills the sky
4. **We see blue overhead**: All the scattered blue light spreads across the whole sky, and our eyes see it from everywhere.
   - Why: When we look up, we are seeing all that bounced blue light shining down on us from the air.
   - Scene: A happy child wearing giant blue sunglasses, looking up at a sky made of sparkling blue paint.
   - Myth check: wrong "The sky is blue because it is acting like a giant mirror reflecting the salty ocean." / right "The sky is blue because air scatters blue light waves all around us."

### "How compound interest grows savings"

Topic: "How compound interest grows savings over time", audience: adult, model: gemini-3.5-flash-lite, server 6067 ms.

1. **Principal earns initial interest**: Your deposited money earns a percentage based on the starting balance over a set time period.
   - Why: Banks pay you to use your money, providing a baseline return that fuels future growth.
   - Scene: A shiny gold coin sits on a table, slowly sweating a smaller silver coin next to itself.
   - Myth check: wrong "Interest is calculated using the total amount currently in the account including previous earnings." / right "Initial interest is calculated only on the original deposit amount during the first cycle."
   - Leads on: adds earnings back into the balance
2. **Interest joins the principal**: The interest earned in the first period is added directly to your original starting balance.
   - Why: Merging earnings with the base amount increases the total size of the pot for the next calculation.
   - Scene: A tiny silver coin melts into the gold coin, visibly swelling the original coin to a larger size.
   - Myth check: wrong "The interest earned is automatically sent to a separate account so the main balance never changes." / right "The interest earned is merged directly into the main balance to increase the total amount."
   - Leads on: enables earning interest on interest
3. **Growing balance generates more**: The next interest payment is calculated using the new, larger total including past earnings.
   - Why: A larger base number naturally produces a bigger payout when multiplied by the exact same percentage rate.
   - Scene: The swollen gold coin drops bigger rain droplets of silver onto the table below.
   - Myth check: wrong "Interest payments stay the exact same size every single period because the percentage rate increases." / right "Interest payments grow larger each period because the base amount being multiplied keeps increasing."
   - Leads on: accelerates the overall growth rate
4. **Exponential snowball effect occurs**: The speed of wealth accumulation accelerates rapidly over time as earnings continuously compound upon themselves.
   - Why: Cumulative layering creates a curve that shoots upward steeply rather than growing in a straight, predictable line.
   - Scene: A tiny snowball rolls down a short hill, instantly transforming into a massive boulder crushing a fence.
   - Myth check: wrong "Savings grow in a straight, steady diagonal line where the exact same amount is added every year." / right "Savings grow in an accelerating curve where the amount added gets bigger every single year."

Raw results for every topic, including full decks: [architect-eval.json](architect-eval.json).
