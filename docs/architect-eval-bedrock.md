# Palace Architect: backup model (Amazon Nova) evaluation

Every request carried `prefer: "bedrock"`, so Gemini was skipped and Amazon Nova on AWS Bedrock answered alone, with no fallback. This measures the backup the live app falls back to when Gemini is overloaded.

Run: 17 Nov 2026, 22:13 IST (2026-11-17T16:43:30.981Z UTC start, 2026-11-17T16:54:09.942Z UTC end), against `https://loci-vr.vercel.app/api/architect`.

Command:

```sh
node scripts/eval-architect.mjs --bedrock
```

Each topic was sent once as `POST {mode: "teach", topic, audience}`, one at a time, 2 s apart, with at most 14 requests in any 10-minute window (the API allows about 20). Wall time is measured by the client and includes the network; server time is the `ms` the API reports. "Myth checks kept" counts stages whose misconception check survived the rule-based vetting (a check is dropped if either statement fails the safety filter or both say the same thing).

## Summary

| Measure | Value |
| --- | --- |
| Topics | 20 |
| Passed (deck with 3 or more stages) | 20 of 20 (100%) |
| Median stages per concept | 5 |
| Myth checks kept | 97 of 106 stages |
| Scenes replaced by the safety filter | 5 |
| Median server time | 3892 ms |
| Median wall time | 3959 ms |
| Primary model (from GET) | bedrock:us.amazon.nova-2-lite-v1:0 |
| Models that answered | bedrock:us.amazon.nova-2-lite-v1:0 (20) |

## Per topic

| # | Topic | Domain | Audience | Result | Stages | Myth checks kept | Model | Server ms | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | How a vaccine trains the immune system | science | adult | ok | 4 | 4 | bedrock:us.amazon.nova-2-lite-v1:0 | 3160 | 3330 |
| 2 | How photosynthesis turns sunlight into sugar | science | adult | ok | 5 | 5 | bedrock:us.amazon.nova-2-lite-v1:0 | 3486 | 3598 |
| 3 | How plate tectonics builds mountains | science | teen | ok | 6 | 6 | bedrock:us.amazon.nova-2-lite-v1:0 | 4561 | 4690 |
| 4 | How the Roman Republic became an empire | history | adult | ok | 7 | 3 | bedrock:us.amazon.nova-2-lite-v1:0 | 5299 | 5416 |
| 5 | How the printing press helped spread the Reformation | history | adult | ok | 6 | 4 | bedrock:us.amazon.nova-2-lite-v1:0 | 4817 | 4926 |
| 6 | What caused the 1929 stock market crash | history / finance | adult | ok | 5 | 5 | bedrock:us.amazon.nova-2-lite-v1:0 | 3817 | 3881 |
| 7 | How compound interest grows savings over time | finance | adult | ok | 5 | 5 | bedrock:us.amazon.nova-2-lite-v1:0 | 3558 | 3657 |
| 8 | How an index fund works | finance | adult | ok | 5 | 5 | bedrock:us.amazon.nova-2-lite-v1:0 | 3504 | 3614 |
| 9 | How a UPI payment moves money between two bank accounts | finance / tech | adult | ok | 5 | 5 | bedrock:us.amazon.nova-2-lite-v1:0 | 3565 | 3656 |
| 10 | How a bill becomes law in the Indian Parliament | law | adult | ok | 5 | 2 | bedrock:us.amazon.nova-2-lite-v1:0 | 3620 | 3711 |
| 11 | How a contract is formed: offer, acceptance and consideration | law | adult | ok | 4 | 4 | bedrock:us.amazon.nova-2-lite-v1:0 | 3090 | 3178 |
| 12 | What happens in a criminal case from arrest to verdict | law | adult | ok | 6 | 6 | bedrock:us.amazon.nova-2-lite-v1:0 | 3607 | 3683 |
| 13 | How HTTPS keeps a connection private | tech | adult | ok | 5 | 5 | bedrock:us.amazon.nova-2-lite-v1:0 | 3987 | 4064 |
| 14 | How a large language model predicts the next word | tech | adult | ok | 6 | 6 | bedrock:us.amazon.nova-2-lite-v1:0 | 3967 | 4037 |
| 15 | How Git records and merges changes | tech | adult | ok | 6 | 6 | bedrock:us.amazon.nova-2-lite-v1:0 | 4454 | 5519 |
| 16 | How a refrigerator keeps food cold | everyday | adult | ok | 5 | 5 | bedrock:us.amazon.nova-2-lite-v1:0 | 4714 | 4797 |
| 17 | How a flush toilet works | everyday | adult | ok | 6 | 6 | bedrock:us.amazon.nova-2-lite-v1:0 | 4437 | 4505 |
| 18 | How noise-cancelling headphones work | everyday | adult | ok | 5 | 5 | bedrock:us.amazon.nova-2-lite-v1:0 | 4155 | 4240 |
| 19 | Pasted notes: water cycle (7 lines) | pasted notes | teen | ok | 6 | 6 | bedrock:us.amazon.nova-2-lite-v1:0 | 4486 | 4564 |
| 20 | Why is the sky blue? | science (child) | child | ok | 4 | 4 | bedrock:us.amazon.nova-2-lite-v1:0 | 3695 | 3786 |

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

Topic: "Why is the sky blue?", audience: child, model: bedrock:us.amazon.nova-2-lite-v1:0, server 3695 ms.

1. **Sunlight hits air**: Sunlight bounces off air molecules in many directions.
   - Why: Air molecules scatter shorter blue light more than longer red light.
   - Scene: Tiny invisible dancers scattering blue glitter from a flashlight beam.
   - Myth check: wrong "The sky is blue because the sun is blue." / right "The sun is yellow; blue light scatters more in our atmosphere."
   - Leads on: leads to
2. **Blue light spreads out**: Blue light spreads more than other colors when it hits air.
   - Why: Shorter blue light waves bounce off molecules more easily than longer red waves.
   - Scene: Blue ribbons fluttering wildly in a gentle breeze, red ribbons barely moving.
   - Myth check: wrong "All colors spread the same in the air." / right "Blue light scatters more than red or yellow light."
   - Leads on: leads to
3. **Our eyes see blue**: Our eyes are most sensitive to the scattered blue light.
   - Why: Human eyes detect blue light strongly, making the sky appear blue.
   - Scene: A baby looking up, seeing a bright blue balloon against white clouds.
   - Myth check: wrong "We see the sky as blue because space is blue." / right "Space is black; we see blue because of scattered sunlight."
   - Leads on: leads to
4. **Sunset turns red**: At sunset, light travels farther, scattering blue away and leaving red.
   - Why: Longer path through air removes more blue light, letting red reach us.
   - Scene: A orange cat sleeping as the sun dips behind red cliffs.
   - Myth check: wrong "Sunsets are red because the sun turns red." / right "Sunsets appear red due to longer light paths scattering blue light."

### "How compound interest grows savings"

Topic: "How compound interest grows savings over time", audience: adult, model: bedrock:us.amazon.nova-2-lite-v1:0, server 3558 ms.

1. **Initial deposit placed**: Money placed in an account becomes the starting point for growth.
   - Why: Growth begins only after funds are committed to earn interest.
   - Scene: A stack of coins lands gently on a velvet cushion in a vault.
   - Myth check: wrong "Interest starts growing before you deposit money." / right "Growth begins only after funds are deposited."
   - Leads on: enables interest calculation
2. **Interest calculated yearly**: Banks add a percentage of your balance as interest each year.
   - Why: This percentage reward encourages saving by increasing your wealth over time.
   - Scene: A tiny golden calculator prints interest coupons onto a growing tree.
   - Myth check: wrong "Interest is added only once to the original amount." / right "Interest is added to the current balance each year."
   - Leads on: creates new interest base
3. **New balance includes interest**: Each year’s interest becomes part of the amount that earns more interest.
   - Why: This compounding effect makes wealth grow faster than simple addition.
   - Scene: A snowball rolling downhill picks up more snow with every revolution.
   - Myth check: wrong "Interest never affects the balance that earns future interest." / right "Interest adds to the balance that earns future interest."
   - Leads on: accelerates growth rate
4. **Growth rate accelerates**: Over many years, the balance grows faster and faster.
   - Why: Each added interest portion itself earns interest in subsequent years.
   - Scene: A rocket climbs steeper with each passing minute, leaving a glowing trail.
   - Myth check: wrong "Growth remains constant regardless of time passed." / right "Growth accelerates because interest earns interest over time."
   - Leads on: demonstrates long-term power
5. **Long-term power shown**: Saving early leads to dramatically larger amounts than saving later.
   - Why: More years allow interest to compound on a larger growing base.
   - Scene: Two trees: one planted early towers over a late sapling.
   - Myth check: wrong "Saving later catches up quickly with larger deposits." / right "Early saving compounds over many more years for greater returns."

Raw results for every topic, including full decks: [architect-eval-bedrock.json](architect-eval-bedrock.json).
