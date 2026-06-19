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
