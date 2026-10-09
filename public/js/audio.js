// Synthesised SFX (WebAudio) - no external files needed.
// To use real files: Sfx.register('gun', '/assets/audio/gun.wav') (names: gun, hit, boom, reload, reloadDone, hurt).
class SoundBank {
  constructor() { this.ctx = null; this.files = {}; this.engine = null; this.buf = null; }
  register(name, url) { this.files[name] = url; }
  unlock() { // must be called from a user gesture
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  _noise() {
    if (!this.buf) { const n = this.ctx.sampleRate, b = this.ctx.createBuffer(1, n, n), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.buf = b; }
    return this.buf;
  }
  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, freq, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this._noise(); f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(100, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t, Math.random() * 0.5, dur + 0.02);
  }
  play(name) {
    if (this.files[name]) { const a = new Audio(this.files[name]); a.volume = 0.5; a.play().catch(() => {}); return; }
    if (!this.ctx) return;
    switch (name) {
      case 'gun': this.noise(0.05, 0.16, 2600); this.tone('square', 180, 90, 0.05, 0.06); break;
      case 'hit': this.tone('square', 520, 200, 0.05, 0.08); break;
      case 'boom': this.noise(0.55, 0.4, 900); this.tone('sawtooth', 90, 30, 0.45, 0.18); break;
      case 'hurt': this.tone('sawtooth', 220, 60, 0.22, 0.12); this.noise(0.15, 0.2, 1500); break;
      case 'reload': this.tone('square', 320, 160, 0.04, 0.1); this.tone('square', 260, 120, 0.05, 0.1, 0.35); break;
      case 'reloadDone': this.tone('square', 200, 400, 0.05, 0.1); this.tone('square', 420, 300, 0.04, 0.1, 0.08); break;
    }
  }
  startEngine() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 48; f.type = 'lowpass'; f.frequency.value = 220; g.gain.value = 0.035;
    o.connect(f); f.connect(g); g.connect(c.destination); o.start(); this.engine = { o, g };
  }
  stopEngine() { if (this.engine) { try { this.engine.o.stop(); } catch (e) {} this.engine = null; } }
}
export const Sfx = new SoundBank();
