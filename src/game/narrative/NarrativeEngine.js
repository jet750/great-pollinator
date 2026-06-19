// NarrativeEngine — local prompt bank replacing the Anthropic API call.
// 30 hand-authored events drawn randomly without replacement until the bank
// is exhausted, then reshuffled. Fires between every 3rd and 5th hive return
// (randomly chosen each cycle) so it never feels routine.
//
// Consequence type distribution across the 30 events (intentional weighting):
//   damage_modifier ×8  (buffs and debuffs — most common)
//   speed_modifier  ×6
//   pollen_modifier ×6
//   heal            ×5
//   pollen_bonus    ×3  (rare — small amounts only, never fills carry cap)
//   enemy_clear     ×2  (kills all enemies within 300px)
//
// pollen_bonus value is capped at 2 across all 30 events. Never more.

const EVENTS = [
  {
    title: 'Sudden Downpour',
    text: 'Storm clouds gather without warning. The rain drums the petals flat.',
    choices: [
      { label: 'Shelter under a leaf', consequence: { type: 'damage_modifier', value: 0.6, duration: 45, description: 'Sheltered — incoming damage reduced for 45s' } },
      { label: 'Fly through it', consequence: { type: 'speed_modifier', value: 1.3, duration: 30, description: 'Adrenaline — speed boosted for 30s' } },
    ],
  },
  {
    title: 'Spider Silk Tangle',
    text: 'A loose web strand catches your wing mid-flight. Every movement costs effort.',
    choices: [
      { label: 'Tear free immediately', consequence: { type: 'damage_modifier', value: 1.4, duration: 20, description: 'Disoriented — damage taken increased for 20s' } },
      { label: 'Work free carefully', consequence: { type: 'speed_modifier', value: 0.7, duration: 35, description: 'Slowed — movement reduced for 35s' } },
    ],
  },
  {
    title: 'Warm Thermal',
    text: 'A column of warm air rises from the sun-baked stone. It carries you effortlessly.',
    choices: [
      { label: 'Ride the thermal high', consequence: { type: 'speed_modifier', value: 1.5, duration: 40, description: 'Thermal lift — speed greatly boosted for 40s' } },
      { label: 'Stay low and collect', consequence: { type: 'pollen_modifier', value: 1.5, duration: 30, description: 'Focused foraging — pollen value boosted for 30s' } },
    ],
  },
  {
    title: 'Rival Drone',
    text: 'A scout from a competing hive is shadowing your route.',
    choices: [
      { label: 'Chase it off', consequence: { type: 'damage_modifier', value: 1.3, duration: 25, description: 'Territorial — incoming damage increased for 25s' } },
      { label: 'Take an alternate path', consequence: { type: 'speed_modifier', value: 0.8, duration: 30, description: 'Cautious route — movement slightly slowed for 30s' } },
    ],
  },
  {
    title: 'Pollen Cloud',
    text: 'A meadow sedge releases its full season of pollen at once. The air turns gold.',
    choices: [
      { label: 'Fly through the cloud', consequence: { type: 'pollen_modifier', value: 2.0, duration: 20, description: 'Pollen surge — collection value doubled for 20s' } },
      { label: 'Wait for it to settle', consequence: { type: 'heal', value: 0.25, description: 'Rested — recovered 25% HP' } },
    ],
  },
  {
    title: 'Sudden Cold Snap',
    text: 'The temperature drops sharply. Your wings stiffen at the joints.',
    choices: [
      { label: 'Push through the cold', consequence: { type: 'speed_modifier', value: 0.65, duration: 40, description: 'Cold-stiffened — movement reduced for 40s' } },
      { label: 'Vibrate wings to warm up', consequence: { type: 'damage_modifier', value: 1.25, duration: 30, description: 'Exposed — damage taken increased while warming for 30s' } },
    ],
  },
  {
    title: 'Old Wax Seal',
    text: 'You find a cache of old propolis sealed by a previous generation. It smells of ancient summers.',
    choices: [
      { label: 'Eat it for energy', consequence: { type: 'heal', value: 0.4, description: 'Old propolis — recovered 40% HP' } },
      { label: 'Rub it on your wings', consequence: { type: 'damage_modifier', value: 0.7, duration: 50, description: 'Propolis armor — damage reduced for 50s' } },
    ],
  },
  {
    title: 'Wind Shift',
    text: 'The prevailing wind swings 180 degrees. Your mental map inverts.',
    choices: [
      { label: 'Use the tailwind', consequence: { type: 'speed_modifier', value: 1.4, duration: 35, description: 'Tailwind — speed boosted for 35s' } },
      { label: 'Fight the headwind', consequence: { type: 'pollen_modifier', value: 1.3, duration: 40, description: 'Hard-won — pollen value increased for 40s' } },
    ],
  },
  {
    title: 'Ant Column',
    text: 'A foraging column of ants is crossing your usual path. They carry fragments of leaf and seed.',
    choices: [
      { label: 'Follow the column', consequence: { type: 'pollen_bonus', value: 2, description: 'Ant scouts — found 2 pollen along their trail' } },
      { label: 'Cross overhead', consequence: { type: 'speed_modifier', value: 1.2, duration: 25, description: 'Shortcut — movement boosted for 25s' } },
    ],
  },
  {
    title: 'Thunderclap',
    text: 'A single massive thunderclap shakes the petals loose across the whole meadow.',
    choices: [
      { label: 'Dive for cover', consequence: { type: 'damage_modifier', value: 0.75, duration: 30, description: 'Sheltered — damage reduced for 30s' } },
      { label: 'Use the chaos', consequence: { type: 'enemy_clear', value: 300, description: 'Thunder startled enemies within 300px — they scattered' } },
    ],
  },
  {
    title: 'Morning Dew',
    text: 'Heavy dew has pooled in every cup and hollow. The world sparkles.',
    choices: [
      { label: 'Drink deeply', consequence: { type: 'heal', value: 0.5, description: 'Refreshed — recovered 50% HP' } },
      { label: 'Use it to clean wings', consequence: { type: 'speed_modifier', value: 1.25, duration: 40, description: 'Clean wings — speed slightly boosted for 40s' } },
    ],
  },
  {
    title: 'Territorial Wasp',
    text: 'A paper wasp hovers at the boundary of its nest zone, wings drumming a warning.',
    choices: [
      { label: 'Retreat and regroup', consequence: { type: 'speed_modifier', value: 0.75, duration: 20, description: 'Rerouted — speed reduced briefly' } },
      { label: 'Hold your line', consequence: { type: 'damage_modifier', value: 1.35, duration: 25, description: 'Contested zone — incoming damage increased for 25s' } },
    ],
  },
  {
    title: 'Abandoned Larder',
    text: 'A shallow burrow holds a cache of dried pollen left by a solitary bee that never returned.',
    choices: [
      { label: 'Take what you can carry', consequence: { type: 'pollen_bonus', value: 2, description: 'Larder find — recovered 2 pollen' } },
      { label: 'Leave it — press on', consequence: { type: 'speed_modifier', value: 1.3, duration: 30, description: 'Motivated — speed boosted for 30s' } },
    ],
  },
  {
    title: 'Noon Heat',
    text: 'The sun reaches its peak. Heat shimmer rises from every surface.',
    choices: [
      { label: 'Rest in shade', consequence: { type: 'heal', value: 0.35, description: 'Midday rest — recovered 35% HP' } },
      { label: 'Forage through the heat', consequence: { type: 'pollen_modifier', value: 1.4, duration: 25, description: 'Peak bloom — pollen value increased for 25s' } },
    ],
  },
  {
    title: 'Spore Burst',
    text: 'A puffball fungus detonates directly in your path. You fly through a cloud of brown dust.',
    choices: [
      { label: 'Bank away sharply', consequence: { type: 'speed_modifier', value: 1.35, duration: 20, description: 'Evasive — speed boosted briefly' } },
      { label: 'Fly straight through', consequence: { type: 'damage_modifier', value: 1.3, duration: 30, description: 'Spore-dusted — damage taken increased for 30s' } },
    ],
  },
  {
    title: 'Old Orb-Weaver',
    text: 'A massive orb-weaver has rebuilt her web overnight across your best route.',
    choices: [
      { label: 'Cut through the web', consequence: { type: 'damage_modifier', value: 1.2, duration: 20, description: 'Tangled briefly — damage increased for 20s' } },
      { label: 'Detour around her', consequence: { type: 'pollen_modifier', value: 1.25, duration: 35, description: 'Scenic detour — pollen value increased for 35s' } },
    ],
  },
  {
    title: 'Static Charge',
    text: 'Dry air and fast movement build a static charge across your body. Pollen leaps toward you unbidden.',
    choices: [
      { label: 'Exploit the charge', consequence: { type: 'pollen_modifier', value: 1.6, duration: 20, description: 'Electrostatic — pollen collection value boosted for 20s' } },
      { label: 'Discharge on a stem', consequence: { type: 'heal', value: 0.2, description: 'Grounded — discharged safely, minor HP recovered' } },
    ],
  },
  {
    title: 'Predator Overhead',
    text: 'A shadow passes — a swallow hunting on the wing. Every insect in the meadow freezes.',
    choices: [
      { label: 'Stay perfectly still', consequence: { type: 'enemy_clear', value: 300, description: 'Predator panic — nearby enemies fled the area' } },
      { label: 'Use the distraction', consequence: { type: 'pollen_bonus', value: 1, description: 'Opportunist — collected 1 pollen while enemies froze' } },
    ],
  },
  {
    title: 'Fungal Mat',
    text: 'A patch of mycelium network hums faintly underfoot. Something old and slow is thinking here.',
    choices: [
      { label: 'Absorb the signal', consequence: { type: 'damage_modifier', value: 0.65, duration: 45, description: 'Network calm — damage received greatly reduced for 45s' } },
      { label: 'Carry a spore', consequence: { type: 'pollen_modifier', value: 1.3, duration: 40, description: 'Spore carrier — pollen value boosted for 40s' } },
    ],
  },
  {
    title: 'Broken Antenna',
    text: 'One antenna took a hit from a branch. Perception is reduced but the sting is stronger.',
    choices: [
      { label: 'Fight through it', consequence: { type: 'damage_modifier', value: 1.2, duration: 35, description: 'Half-blind — damage received increased for 35s' } },
      { label: 'Compensate carefully', consequence: { type: 'speed_modifier', value: 0.8, duration: 30, description: 'Cautious — movement slowed while compensating' } },
    ],
  },
  {
    title: 'Late Bloomer',
    text: 'A patch of flowers missed the main season. They are blooming now, unpollinated, heavy with nectar.',
    choices: [
      { label: 'Focus on them', consequence: { type: 'pollen_modifier', value: 1.8, duration: 25, description: 'Late bloom — pollen value greatly boosted for 25s' } },
      { label: 'Mark them and move on', consequence: { type: 'speed_modifier', value: 1.2, duration: 35, description: 'Good intel — movement boosted for 35s' } },
    ],
  },
  {
    title: 'Beetle Standoff',
    text: 'A rhinoceros beetle blocks the path, horns lowered. It will not yield.',
    choices: [
      { label: 'Go over it', consequence: { type: 'speed_modifier', value: 1.3, duration: 20, description: 'Cleared obstacle — brief speed boost' } },
      { label: 'Sting it and push through', consequence: { type: 'damage_modifier', value: 1.25, duration: 20, description: 'Spent venom — damage received increased for 20s' } },
    ],
  },
  {
    title: 'Damp Hollow',
    text: 'A mossy hollow holds trapped cool air. The moisture restores something in you.',
    choices: [
      { label: 'Rest here fully', consequence: { type: 'heal', value: 0.6, description: 'Deep rest — recovered 60% HP' } },
      { label: 'Fill up and fly', consequence: { type: 'heal', value: 0.3, description: 'Quick rest — recovered 30% HP' } },
    ],
  },
  {
    title: 'Magnetic Anomaly',
    text: 'Something underground is interfering with your navigation sense. The hive seems further than it should.',
    choices: [
      { label: 'Trust your memory', consequence: { type: 'pollen_modifier', value: 1.35, duration: 30, description: 'Forced focus — pollen value increased for 30s' } },
      { label: 'Fly in circles to recalibrate', consequence: { type: 'speed_modifier', value: 0.7, duration: 25, description: 'Disoriented — movement slowed for 25s' } },
    ],
  },
  {
    title: 'Hive Memory',
    text: 'A waggle dance from a returning forager is still fresh in your memory. You know exactly where to go.',
    choices: [
      { label: 'Follow the route precisely', consequence: { type: 'pollen_modifier', value: 1.5, duration: 30, description: 'Hive intel — pollen value boosted for 30s' } },
      { label: 'Extend the route', consequence: { type: 'speed_modifier', value: 1.35, duration: 40, description: 'Ambitious forager — speed boosted for 40s' } },
    ],
  },
  {
    title: 'Wildfire Smoke',
    text: 'Distant smoke drifts in. It calms the insects but stings the eyes.',
    choices: [
      { label: 'Use the calm', consequence: { type: 'enemy_clear', value: 300, description: 'Smoke calm — nearby enemies became docile' } },
      { label: 'Fly below the smoke layer', consequence: { type: 'damage_modifier', value: 0.75, duration: 35, description: 'Low flight — damage reduced for 35s' } },
    ],
  },
  {
    title: 'First Frost Warning',
    text: 'A single frosted petal tells you the season is turning. Every run feels more urgent.',
    choices: [
      { label: 'Forage harder', consequence: { type: 'pollen_modifier', value: 1.4, duration: 35, description: 'Urgency — pollen value increased for 35s' } },
      { label: 'Prepare for the cold', consequence: { type: 'damage_modifier', value: 0.7, duration: 45, description: 'Fortified — damage reduced for 45s' } },
    ],
  },
  {
    title: 'Caterpillar Trail',
    text: 'A processionary caterpillar column winds across a leaf cluster, leaving a sticky silk trail.',
    choices: [
      { label: 'Leap over the trail', consequence: { type: 'speed_modifier', value: 1.25, duration: 25, description: 'Clean jump — speed briefly boosted' } },
      { label: 'Crawl through carefully', consequence: { type: 'damage_modifier', value: 1.15, duration: 20, description: 'Silk-slowed — minor damage increase for 20s' } },
    ],
  },
  {
    title: 'Raindrop Impact',
    text: 'A single fat raindrop hits your thorax at full speed. You spin and recover.',
    choices: [
      { label: 'Shake it off', consequence: { type: 'heal', value: 0.15, description: 'Recovered — minor HP restored from the shock' } },
      { label: 'Use the momentum', consequence: { type: 'speed_modifier', value: 1.4, duration: 15, description: 'Slingshot — brief speed surge' } },
    ],
  },
  {
    title: 'Quiet Hour',
    text: 'An unexpected stillness settles over the meadow. Even the predators seem to pause.',
    choices: [
      { label: 'Forage freely', consequence: { type: 'pollen_modifier', value: 1.6, duration: 30, description: 'Quiet hour — pollen value greatly boosted for 30s' } },
      { label: 'Recover while you can', consequence: { type: 'heal', value: 0.45, description: 'Rest — recovered 45% HP' } },
    ],
  },
];

export class NarrativeEngine {
  constructor() {
    this.activeEvent = null;
    this.loading = false;      // kept for UI compatibility (EventUI checks this)
    this._deck = [];           // remaining unplayed indices
    this._nextTriggerIn = this._rollTrigger(); // hive returns until next event
    this._returnsSinceEvent = 0;
  }

  // Rolls how many hive returns until the next event fires (3, 4, or 5).
  _rollTrigger() {
    return 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
  }

  // Draw a random event from the deck without replacement.
  _drawEvent() {
    if (this._deck.length === 0) {
      // Reshuffle all 30
      this._deck = EVENTS.map((_, i) => i).sort(() => Math.random() - 0.5);
    }
    return EVENTS[this._deck.pop()];
  }

  // Called when player ENTERS the hive.
  onHiveEnter(/* runContext — kept for API compatibility */) {
    this._returnsSinceEvent += 1;

    if (this.activeEvent) return; // one at a time

    const shouldFire = this._returnsSinceEvent >= this._nextTriggerIn;
    if (!shouldFire) return;

    this.activeEvent = this._drawEvent();
    this._returnsSinceEvent = 0;
    this._nextTriggerIn = this._rollTrigger();
  }

  // Called when player EXITS the hive — returns true if an event is waiting.
  onHiveExit() {
    return this.activeEvent !== null;
  }

  resolveChoice(choiceIndex) {
    if (!this.activeEvent) return null;
    const choice = this.activeEvent.choices[choiceIndex];
    const consequence = choice ? choice.consequence : null;
    this.activeEvent = null;
    return consequence;
  }

  hasActiveEvent() { return this.activeEvent !== null; }
  isLoading()      { return false; } // no async — always false
  reset() {
    this.activeEvent = null;
    this._returnsSinceEvent = 0;
    this._nextTriggerIn = this._rollTrigger();
  }
}

export function isBeneficialConsequence(c) {
  if (!c) return true;
  switch (c.type) {
    case 'heal':
    case 'pollen_bonus':
    case 'enemy_clear':
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
