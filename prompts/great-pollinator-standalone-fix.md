# Claude Code Fix Prompt — Great Pollinator Standalone Deployment

You are fixing the standalone deployment of The Great Pollinator at `github.com/jet750/great-pollinator`. The game logic is fully built but is not rendering because the entry point does not mount the game to the page. There are also two missing files that need to be created.

Read every instruction carefully. Only modify files inside this repository.

---

## CRITICAL: READ THESE FILES FIRST

Before writing any code, read the current state of:

```
index.html
src/game/main.js
```

---

## PROBLEM SUMMARY

The game was originally built inside a React portfolio site where `PollinatorPage.jsx` created a `<canvas>` element and instantiated the game class like this:

```js
const game = new PollinatorGame(canvas);
game.start();
```

In this standalone repo there is no React, no `PollinatorPage.jsx`. The `index.html` loads `src/game/main.js` as a module but nothing creates the canvas or calls `.start()`. The result is a blank black screen — the game class is imported but never instantiated.

---

## FIX 1 — Create a standalone entry point

**Do not modify `src/game/main.js`** — it is the complete game engine and must stay untouched.

Instead, create a new file `src/main.js` at the repo root's `src/` folder that acts as the standalone bootstrap:

```js
// src/main.js — standalone entry point for pollinator.jaxontravis.com
// Mounts the game canvas into #game-container and starts the engine.

import PollinatorGame from './game/main.js';

// Wait for DOM to be ready
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container');
  if (!container) {
    console.error('[Pollinator] #game-container not found in DOM');
    return;
  }

  // Create canvas sized to fill the container
  const canvas = document.createElement('canvas');
  canvas.style.width  = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none'; // prevent browser scroll/zoom over canvas
  container.appendChild(canvas);

  // Instantiate and start the game engine
  const game = new PollinatorGame(canvas);
  game.start();

  // Clean up on page unload
  window.addEventListener('unload', () => game.destroy());
});
```

---

## FIX 2 — Update index.html

Update `index.html` to:
1. Point the script src to `/src/main.js` (the new bootstrap, not the game engine directly)
2. Add `viewport-fit=cover` for iOS safe area support (already in the game's CSS logic)
3. Make the container fill the full viewport correctly for the game's canvas sizing expectations

Replace the entire `index.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>The Great Pollinator</title>
  <style>
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #141210;
      -webkit-user-select: none;
      user-select: none;
    }

    #game-container {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;

      /* Respect iOS home indicator and Android nav bar */
      padding-top:    env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left:   env(safe-area-inset-left);
      padding-right:  env(safe-area-inset-right);

      /* dvh excludes browser chrome on mobile */
      height: 100vh;
      height: 100dvh;
    }

    canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
    }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

---

## FIX 3 — Create the Narrative API Proxy

The game's AI narrative layer calls `/api/narrative` but that serverless function file was not migrated from the portfolio repo. Without it, narrative events silently fail (which is fine — the game runs — but the AI feature won't work).

Create `api/narrative.js` at the repo root:

```js
// api/narrative.js — Vercel serverless proxy for the Anthropic narrative API.
// Keeps the API key server-side. Called by NarrativeEngine.js via POST /api/narrative.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { eventNumber = 1, runContext = {} } = body;

  const contextLine = runContext.pollenBanked != null
    ? `Current run context: ${runContext.pollenBanked} pollen banked this run, HP at ${Math.round((runContext.hp / runContext.maxHp) * 100)}%, active craft: ${runContext.craft || 'bee'}.`
    : '';

  const systemPrompt = `You are the narrator of a Victorian botanical field journal game called The Great Pollinator.
The player is a naturalist's bee collecting pollen specimens across garden biomes.
Generate a brief field journal entry describing an unexpected event the bee encounters on re-deployment.
The event should feel authentic to Victorian natural history writing — precise, observational, slightly formal.
${contextLine}

Respond ONLY with a valid JSON object in this exact shape, no preamble, no markdown fences:
{
  "title": "short event title (max 5 words)",
  "text": "2-3 sentences describing the event in Victorian naturalist voice",
  "choices": [
    {
      "label": "short action label (max 4 words)",
      "description": "one sentence outcome description",
      "consequence": {
        "type": "pollen_modifier | damage_modifier | heal | speed_modifier | pollen_bonus",
        "value": <number>,
        "duration": <seconds or 0 for instant>,
        "description": "brief mechanical effect shown to player"
      }
    },
    {
      "label": "short action label (max 4 words)",
      "description": "one sentence outcome description",
      "consequence": {
        "type": "pollen_modifier | damage_modifier | heal | speed_modifier | pollen_bonus",
        "value": <number>,
        "duration": <seconds or 0 for instant>,
        "description": "brief mechanical effect shown to player"
      }
    }
  ]
}

Consequence types:
- pollen_modifier: multiplier on pollen yield (e.g. 1.3 = 30% more, 0.7 = 30% less)
- damage_modifier: multiplier on incoming damage (e.g. 1.5 = 50% more damage)
- heal: instant HP as fraction of max HP (e.g. 0.25 = 25% heal)
- speed_modifier: multiplier on movement speed (e.g. 0.6 = 40% slower)
- pollen_bonus: flat pollen added to carried count (e.g. 5 = +5 pollen)

One choice should be favorable, one risky or neutral.
Vary the scenario — it is event number ${eventNumber} of this session.`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Generate the next field journal event.' }],
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      console.error('[narrative] Anthropic error:', err);
      return res.status(502).json({ error: 'Upstream API error' });
    }

    const data  = await upstream.json();
    const raw   = data.content?.[0]?.text ?? '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let event;
    try {
      event = JSON.parse(clean);
    } catch {
      console.error('[narrative] JSON parse failed:', clean);
      return res.status(502).json({ error: 'Malformed API response' });
    }

    // Validate shape before sending to client
    if (
      !event?.title ||
      !event?.text ||
      !Array.isArray(event?.choices) ||
      event.choices.length < 2 ||
      !event.choices[0]?.consequence ||
      !event.choices[1]?.consequence
    ) {
      return res.status(502).json({ error: 'Invalid event shape' });
    }

    return res.status(200).json(event);

  } catch (err) {
    console.error('[narrative] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

---

## FIX 4 — Verify vite.config.js is correct

Read `vite.config.js`. Confirm it has `base: './'`. If it does not, update it to:

```js
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 3002,
    open: true,
  },
});
```

---

## COMPLETION CHECKLIST

Before finishing, verify:

- [ ] `src/main.js` exists and creates a canvas, appends it to `#game-container`, instantiates `PollinatorGame`, and calls `.start()`
- [ ] `index.html` points to `/src/main.js` (not `/src/game/main.js`)
- [ ] `index.html` has `viewport-fit=cover` in the viewport meta tag
- [ ] `index.html` container CSS uses `position: fixed; inset: 0` and `dvh`
- [ ] `api/narrative.js` exists at repo root with the Anthropic proxy
- [ ] `vite.config.js` has `base: './'`
- [ ] `src/game/main.js` is NOT modified — leave the game engine exactly as it is
- [ ] No new npm packages installed

---

## DO NOT TOUCH

- `src/game/` — any file inside this directory, leave completely untouched
- Any existing file not listed above as a target for modification
