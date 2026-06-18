// Procedural audio for The Great Pollinator.
//
// Web Audio API only — no external libraries, no audio files. Every sound is
// synthesised on the fly with oscillators / noise buffers and short gain
// envelopes (each effect under ~300ms). The AudioContext is created lazily on
// the first user interaction to satisfy browser autoplay policies; until then
// every play method is a no-op. A master gain caps overall loudness, and mute
// simply drops it to 0.

export class AudioManager {
  constructor() {
    this._ctx = null;
    this._muted = false;
    this._master = null;
  }

  init() {
    // Defer AudioContext creation to first user interaction (browser autoplay policy).
    if (this._ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return; // no Web Audio support — every play method stays a no-op
    this._ctx = new Ctx();
    this._master = this._ctx.createGain();
    this._master.gain.value = this._muted ? 0 : 0.4;
    this._master.connect(this._ctx.destination);
  }

  get muted() {
    return this._muted;
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._master) this._master.gain.value = this._muted ? 0 : 0.4;
    return this._muted;
  }

  // --- Sound effect methods ---

  playCollect(pollenType) {
    if (!this._ctx || this._muted) return;
    const pitches = { common: 523, uncommon: 659, rare: 784 }; // C5, E5, G5
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._master);
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
    gain.connect(this._master);
    gain.gain.value = 0.25;
    src.start();
  }

  playHitReceived() {
    if (!this._ctx || this._muted) return;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._master);
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
    gain.connect(this._master);
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
      gain.connect(this._master);
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
    gain.connect(this._master);
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
    gain.connect(this._master);
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
      gain.connect(this._master);
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
    gain.connect(this._master);
    gain.gain.value = 0.5;
    src.start();
  }
}
