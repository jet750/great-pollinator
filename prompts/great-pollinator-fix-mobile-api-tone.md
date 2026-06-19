# Great Pollinator — Fix: Mobile Layout, API Throttle & Writing Tone

**What this fixes:**
1. Mobile event card text completely jumbled — choice buttons overlapping
   narrative text, outcome text bleeding through card boundaries
2. API prompt firing on every encounter redeploy — should fire roughly
   every 5 encounters to reduce cost and latency
3. Writing tone too esoteric — vocabulary inaccessible, sentences too long,
   needs to stay vivid but use plain language an interviewer can read quickly

**Repo:** `C:\dev\great-pollinator\`

**Branch:**
```powershell
git checkout dev
git pull origin dev
git checkout -b fix/mobile-api-tone
```

---

## Fix 1 — Mobile Event Card Layout

The event card modal is rendering with severe z-order and overflow issues on
mobile. Choice buttons are overlapping the narrative paragraph, and outcome
consequence text is bleeding through card boundaries. This is a CSS/layout
problem, not a logic problem.

### Diagnosis first

Open browser DevTools on the event card component. Check:
- Is the card a fixed-height container that overflows on small screens?
- Are the choice buttons absolutely positioned in a way that ignores content height?
- Is the outcome text rendered inside the same container as the narrative
  without a separator or conditional display?

### Fix approach

The card should be a flex column with these sections stacking vertically:
```
[Icon / Title]
[Divider line]
[Narrative paragraph — natural height, wraps freely]
[Choice buttons — stacked vertically on mobile, side by side on desktop]
[Outcome text — only visible after a choice is made, replaces buttons]
```

Key CSS rules to enforce:
```css
.eventCard {
  display: flex;
  flex-direction: column;
  max-height: 85vh;          /* never taller than viewport */
  overflow-y: auto;          /* scroll if somehow still too tall */
  width: min(90vw, 520px);   /* responsive width */
  padding: 1.5rem;
  box-sizing: border-box;
}

.narrative {
  font-size: clamp(0.85rem, 2.5vw, 1rem);  /* scales down on narrow screens */
  line-height: 1.6;
  margin-bottom: 1.25rem;
}

.choiceButtons {
  display: flex;
  flex-direction: column;    /* always stack on mobile */
  gap: 0.75rem;
}

@media (min-width: 600px) {
  .choiceButtons {
    flex-direction: row;     /* side by side on wider screens */
  }
}

.outcomeText {
  margin-top: 1rem;
  font-size: 0.875rem;
  /* ensure this is conditionally rendered — only after choice made */
  /* if it's always in the DOM, use display:none until choice fires */
}
```

Outcome text and choice buttons must be mutually exclusive in the DOM or
via display toggling — both visible simultaneously is what's causing the
overlap. After a choice is made: hide buttons, show outcome text.

---

## Fix 2 — API Call Throttle (Roughly Every 5 Encounters)

Currently the API fires on every encounter card generation. This should be
throttled to approximately every 5 encounters to reduce API cost and latency.
Between API calls, use a local pool of pre-written event templates.

### Implementation

Find the encounter/event generation logic. Add a counter:

```javascript
// In game state or encounter manager
this.encounterCount = 0;
this.apiCallInterval = 5; // call API every N encounters

shouldCallAPI() {
  return this.encounterCount % this.apiCallInterval === 0;
}

generateEncounter() {
  this.encounterCount++;
  if (this.shouldCallAPI()) {
    return this.generateFromAPI();
  } else {
    return this.getFromLocalPool();
  }
}
```

### Local pool

Create a pool of at least 15 pre-written event templates in a local JS file
`src/data/eventPool.js`. These should match the established tone (vivid,
naturalistic, bee-perspective) but use plain vocabulary per Fix 3 below.

Structure each template to match whatever shape the API returns so they're
drop-in compatible:
```javascript
export const EVENT_POOL = [
  {
    title: "The Broken Stem",
    narrative: "A snapdragon has fallen across the path, its stem snapped by last night's wind. You can push through the tangle or find a way around.",
    choices: [
      { label: "Push through", outcome: "You muscle through, wings dusted with extra pollen.", effect: { pollen: +5 } },
      { label: "Go around", outcome: "The detour costs time but you arrive clean and quick.", effect: { speed: +10, duration: 15 } }
    ]
  },
  // ... 14 more
];
```

Write all 15 pool events following the tone guidelines in Fix 3.

The pool should cycle randomly without repeating until all are used, then
reshuffle. Never show the same event twice in a row.

---

## Fix 3 — Writing Tone Recalibration

The current API system prompt and local event writing is too literary —
vocabulary like "parterre," "Digitalis purpurea," "Araneus diadematus,"
"orb-weaver's construction" reads as deliberately obscure. The target reader
is a recruiter or hiring manager reading on their phone. They should feel
immersed and charmed, not like they need a dictionary.

### Tone guidelines — update the system prompt

Find the API system prompt (likely in an `/api/` serverless function or a
`prompts.js` / `systemPrompt.js` file). Update the writing instructions to:

```
You are writing event cards for a browser game where the player is a bee
exploring a garden. Each event is a short narrative moment with two choices.

TONE: Warm, vivid, slightly whimsical. Nature-focused. Written from the bee's
perspective. Like a naturalist's field notes, but approachable and fun.

VOCABULARY: Use plain English. Describe things by what they look like and
what they do — not by Latin names or rare botanical terms. "A tall purple
flower" not "Digitalis purpurea." "A garden spider" not "Araneus diadematus."
"A sticky web" not "silken geometry." The player should never need to look
up a word.

SENTENCE LENGTH: Short to medium. One idea per sentence. No sentences over
25 words. Narrative paragraph is 3-4 sentences maximum.

STRUCTURE — respond ONLY with valid JSON matching this exact shape:
{
  "title": "Short evocative title (4 words max)",
  "narrative": "3-4 sentences. Vivid but plain. Sets the scene.",
  "choices": [
    {
      "label": "2-4 word action label",
      "outcome": "One sentence. What happens. Plain language.",
      "effect": { ... }
    },
    {
      "label": "2-4 word action label", 
      "outcome": "One sentence. What happens. Plain language.",
      "effect": { ... }
    }
  ]
}

Do not add any text outside the JSON. No preamble, no explanation.
```

### Rewrite the local event pool

Apply the same guidelines to all 15 local pool events written in Fix 2.

Good example of the target tone:
```
Title: "Muddy Puddle"
Narrative: "A fresh puddle blocks the shortcut between the roses. It's shallow
but wide, and the mud could weigh down your wings. The long way around is dry
but takes more time."
Choice 1: "Fly low through" → "Your wings clip the surface. You shake off the
water but lose some speed."
Choice 2: "Go the long way" → "Clean landing. You arrive a little later but
at full strength."
```

Notice: plain words, clear stakes, vivid without being obscure.

---

## Deliverables Checklist

```
[ ] Event card renders cleanly on iPhone screen (no text overlap)
[ ] Choice buttons stack vertically on mobile
[ ] Narrative text fully readable, no overflow bleed
[ ] Outcome text only appears after choice is made
[ ] Outcome text does not overlap choice buttons
[ ] Card scrolls if content somehow exceeds viewport height
[ ] API call fires on encounter 1, 6, 11, 16... (every 5th)
[ ] Encounters 2-5, 7-10 etc. draw from local pool
[ ] Local pool has 15+ events, shuffles without immediate repeats
[ ] API system prompt updated with plain language guidelines
[ ] All 15 local events use plain vocabulary — no Latin, no rare words
[ ] Existing gameplay mechanics unaffected
[ ] npm run dev — zero console errors
[ ] Test on mobile browser: event card is fully readable
```

Commit with message: `fix: mobile card layout api throttle and tone recalibration`

---

## After Checklist Passes

```powershell
git checkout dev
git merge fix/mobile-api-tone
git push origin dev
# verify on Vercel preview URL on your phone
# if clean:
git checkout main
git merge dev
git push origin main
```
