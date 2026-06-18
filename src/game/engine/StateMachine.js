// Minimal finite state machine used by the Bee and every Enemy.
// Tracks the current state, time spent in it, and fires optional onEnter hooks.

export class StateMachine {
  constructor(initial, states = {}) {
    this.state = initial;
    // states: { STATE_NAME: { onEnter?(machine, owner), onExit?(machine, owner) } }
    this.states = states;
    this.time = 0; // seconds spent in the current state
    this.previous = null;
  }

  is(state) {
    return this.state === state;
  }

  isAny(...list) {
    return list.includes(this.state);
  }

  /** Transition to a new state. Re-entering the same state is a no-op unless forced. */
  set(next, owner, force = false) {
    if (next === this.state && !force) return;
    const prevDef = this.states[this.state];
    if (prevDef && prevDef.onExit) prevDef.onExit(this, owner);
    this.previous = this.state;
    this.state = next;
    this.time = 0;
    const nextDef = this.states[next];
    if (nextDef && nextDef.onEnter) nextDef.onEnter(this, owner);
  }

  update(dt) {
    this.time += dt;
  }

  /** Convenience: has the machine been in this state at least `seconds`? */
  elapsed(seconds) {
    return this.time >= seconds;
  }
}
