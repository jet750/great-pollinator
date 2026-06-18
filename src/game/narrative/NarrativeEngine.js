// NarrativeEngine: generates procedural field journal events via the Anthropic
// API — through the /api/narrative serverless proxy, never calling Anthropic
// directly from the browser (the API key stays server-side, per CLAUDE.md).
//
// Fires on hive exit (not on a timer). The API call begins when the player
// ENTERS the hive so it resolves during their Bank/Store/Hangar session; by the
// time they hit Fly Out the event is usually already waiting, so it shows with
// no loading delay. Max 5 events per run. Any failure is swallowed and the game
// continues without an event.

export class NarrativeEngine {
  constructor() {
    this.activeEvent = null;
    this.loading = false;
    this._eventCount = 0;
    this._pending = null; // Promise in-flight during hive session
  }

  // Call this when player ENTERS the hive — begins the API call in background.
  onHiveEnter(runContext) {
    if (this._eventCount >= 5) return; // session cap
    if (this.loading || this.activeEvent) return; // already one pending or active
    this.loading = true;
    this._pending = fetchNarrativeEvent(this._eventCount + 1, runContext)
      .then((event) => {
        this.activeEvent = event;
        this._eventCount++;
      })
      .catch((err) => {
        console.warn('[NarrativeEngine] skipping event:', err.message);
      })
      .finally(() => {
        this.loading = false;
        this._pending = null;
      });
  }

  // Call this when player EXITS the hive — returns true if an event is waiting.
  onHiveExit() {
    return this.activeEvent !== null || this.loading;
  }

  resolveChoice(choiceIndex) {
    if (!this.activeEvent) return null;
    const choice = this.activeEvent.choices[choiceIndex];
    const consequence = choice ? choice.consequence : null;
    this.activeEvent = null;
    return consequence;
  }

  hasActiveEvent() {
    return this.activeEvent !== null;
  }
  isLoading() {
    return this.loading;
  }

  reset() {
    this.activeEvent = null;
    this.loading = false;
    this._eventCount = 0;
    this._pending = null;
  }
}

// Classifies a consequence as beneficial (gold) or harmful (crimson) for the UI.
export function isBeneficialConsequence(c) {
  if (!c) return true;
  switch (c.type) {
    case 'heal':
    case 'pollen_bonus':
      return true;
    case 'pollen_modifier':
    case 'speed_modifier':
      return c.value >= 1;
    case 'damage_modifier':
      return c.value <= 1;
    default:
      return true;
  }
}

async function fetchNarrativeEvent(eventNumber, runContext = {}) {
  const response = await fetch('/api/narrative', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventNumber, runContext }),
  });

  if (!response.ok) throw new Error(`API ${response.status}`);

  const event = await response.json();
  if (event && event.error) throw new Error(event.error);

  // Defensive shape validation so a malformed event never reaches the UI.
  if (
    !event ||
    typeof event.title !== 'string' ||
    typeof event.text !== 'string' ||
    !Array.isArray(event.choices) ||
    event.choices.length < 2 ||
    !event.choices[0]?.consequence ||
    !event.choices[1]?.consequence
  ) {
    throw new Error('malformed event');
  }

  return event;
}
