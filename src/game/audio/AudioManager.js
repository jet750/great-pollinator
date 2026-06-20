// Procedural audio for The Great Pollinator.
//
// Web Audio API only — no external libraries, no audio files. Every sound is
// synthesised on the fly with oscillators / noise buffers and short gain
// envelopes (each effect under ~300ms). The AudioContext is created lazily on
// the first user interaction to satisfy browser autoplay policies; until then
// every play method is a no-op.
//
// Signal graph: each effect's gain → _sfxGain → _master → destination.
//   _master  caps overall loudness (Master Volume slider, scaled 0–0.8).
//   _sfxGain scales sound-effect loudness (SFX Volume slider, 0–1.0).
//   mute simply drops _master to 0.

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class AudioManager {
  constructor() {
    this._ctx = null;
    this._muted = false;
    this._master = null;
    this._sfxGain = null;
    // Target gain values, applied to the nodes on init() and live thereafter.
    this._masterGain = 0.4; // 0–0.8 (Master Volume slider × 0.8)
    this._sfxLevel = 0.8;   // 0–1.0 (SFX Volume slider)
  }

  init() {
    // Defer AudioContext creation to first user interaction (browser autoplay policy).
    if (this._ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return; // no Web Audio support — every play method stays a no-op
    this._ctx = new Ctx();
    this._master = this._ctx.createGain();
    this._master.gain.value = this._muted ? 0 : this._masterGain;
    this._master.connect(this._ctx.destination);
    // SFX submix sits between individual effect gains and the master.
    this._sfxGain = this._ctx.createGain();
    this._sfxGain.gain.value = this._sfxLevel;
    this._sfxGain.connect(this._master);
  }

  get muted() {
    return this._muted;
  }

  /** Master Volume as a 0–100 slider value. */
  get masterVolume() {
    return Math.round((this._masterGain / 0.8) * 100);
  }

  /** SFX Volume as a 0–100 slider value. */
  get sfxVolume() {
    return Math.round(this._sfxLevel * 100);
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._master) this._master.gain.value = this._muted ? 0 : this._masterGain;
    return this._muted;
  }

  /** Set master volume from a 0–100 slider value (scaled to 0–0.8 gain). */
  setMasterVolume(slider) {
    this._masterGain = clamp01(slider / 100) * 0.8;
    if (this._master && !this._muted) this._master.gain.value = this._masterGain;
  }

  /** Set SFX volume from a 0–100 slider value (scaled to 0–1.0 gain). */
  setSfxVolume(slider) {
    this._sfxLevel = clamp01(slider / 100);
    if (this._sfxGain) this._sfxGain.gain.value = this._sfxLevel;
  }

  // --- Sound effect methods ---

  playCollect(pollenType) {
    if (!this._ctx || this._muted) return;
    const pitches = { common: 523, uncommon: 659, rare: 784 }; // C5, E5, G5
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.type = 'sine';
    osc.frequency.value = pitches[pollenType] || 523;
    gain.gain.setValueAtTime(0.3, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.12);
    osc.start();
    osc.stop(this._ctx.currentTime + 0.12);
  }

  playAttackDash() {
    if (!this._ctx || this._muted) return;
    const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * 0.1, this._ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this._ctx.createBufferSource();
    const gain = this._ctx.createGain();
    const filt = this._ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 800;
    src.buffer = buf;
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this._sfxGain);
    gain.gain.value = 0.25;
    src.start();
  }

  playHitReceived() {
    if (!this._ctx || this._muted) return;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, this._ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, this._ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.4, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.15);
    osc.start();
    osc.stop(this._ctx.currentTime + 0.15);
  }

  playHitLanded() {
    if (!this._ctx || this._muted) return;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, this._ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, this._ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.35, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.08);
    osc.start();
    osc.stop(this._ctx.currentTime + 0.08);
  }

  playPollenDeposit() {
    if (!this._ctx || this._muted) return;
    [523, 659, 784].forEach((freq, i) => {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = this._ctx.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  playPowerUpActivate() {
    if (!this._ctx || this._muted) return;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this._ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this._ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.3, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.25);
    osc.start();
    osc.stop(this._ctx.currentTime + 0.25);
  }

  playDeath() {
    if (!this._ctx || this._muted) return;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this._ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, this._ctx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.4, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.6);
    osc.start();
    osc.stop(this._ctx.currentTime + 0.6);
  }

  playHiveEnter() {
    if (!this._ctx || this._muted) return;
    [330, 415, 494].forEach((freq, i) => {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = this._ctx.currentTime + i * 0.04;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  playEventTrigger() {
    if (!this._ctx || this._muted) return;
    // Soft noise burst simulating a page turn.
    const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * 0.2, this._ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.sin((i / data.length) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env * 0.3;
    }
    const src = this._ctx.createBufferSource();
    const filt = this._ctx.createBiquadFilter();
    const gain = this._ctx.createGain();
    filt.type = 'highpass';
    filt.frequency.value = 2000;
    src.buffer = buf;
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this._sfxGain);
    gain.gain.value = 0.5;
    src.start();
  }
}
