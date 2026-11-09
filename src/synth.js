/** Original, deterministic sound-effect synthesis. No playback or browser dependencies. */
export const PARAMS = Object.freeze([
  { key: 'wave', label: 'Waveform', type: 'select', options: [
    { value: 'square', label: 'Square' }, { value: 'saw', label: 'Sawtooth' },
    { value: 'triangle', label: 'Triangle' }, { value: 'sine', label: 'Sine' },
    { value: 'noise', label: 'Noise' },
  ] },
  { key: 'frequency', label: 'Pitch', type: 'range', min: 40, max: 2400, step: 1, unit: 'Hz' },
  { key: 'slide', label: 'Pitch slide', type: 'range', min: -36, max: 36, step: 0.1, unit: 'st' },
  { key: 'duration', label: 'Duration', type: 'range', min: 0.06, max: 3, step: 0.01, unit: 's' },
  { key: 'attack', label: 'Attack', type: 'range', min: 0, max: 0.5, step: 0.005, unit: 's' },
  { key: 'release', label: 'Release', type: 'range', min: 0.005, max: 2, step: 0.005, unit: 's' },
  { key: 'vibrato', label: 'Vibrato depth', type: 'range', min: 0, max: 12, step: 0.1, unit: 'st' },
  { key: 'vibratoRate', label: 'Vibrato speed', type: 'range', min: 0, max: 30, step: 0.1, unit: 'Hz' },
  { key: 'punch', label: 'Punch', type: 'range', min: 0, max: 1, step: 0.01 },
  { key: 'lowpass', label: 'Low-pass cutoff', type: 'range', min: 100, max: 20000, step: 10, unit: 'Hz' },
  { key: 'crunch', label: 'Bit crunch', type: 'range', min: 0, max: 1, step: 0.01 },
  { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.01 },
  { key: 'seed', label: 'Noise seed', type: 'number', min: 0, max: 4294967295, step: 1 },
]);
export const DEFAULTS = Object.freeze({ wave: 'square', seed: 12345, frequency: 640,
  slide: 0, duration: 0.35, attack: 0.005, release: 0.22, vibrato: 0,
  vibratoRate: 8, punch: 0.2, lowpass: 12000, volume: 0.65, crunch: 0 });
// Canonicalize negative zero so JSON settings round-trip exactly.
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n)) || 0;
const waves = PARAMS[0].options.map(option => option.value);
export function normalizeParams(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const result = {};
  for (const field of PARAMS) {
    const value = Object.hasOwn(source, field.key) ? source[field.key] : DEFAULTS[field.key];
    result[field.key] = field.key === 'wave' ? (waves.includes(value) ? value : DEFAULTS.wave)
      : typeof value === 'number' && Number.isFinite(value) ? clamp(value, field.min, field.max) : DEFAULTS[field.key];
  }
  result.seed = Math.floor(result.seed);
  return result;
}
export const PRESETS = Object.freeze([
  ['coin', 'Coin', 'A bright reward with a rising finish.', { frequency: 950, slide: 12, duration: 0.22, release: 0.16, punch: 0.5 }],
  ['laser', 'Laser', 'A sharp descending arcade zap.', { wave: 'saw', frequency: 1800, slide: -30, duration: 0.4, release: 0.36, crunch: 0.18 }],
  ['explosion', 'Explosion', 'A low, rolling burst of noise.', { wave: 'noise', seed: 8301, frequency: 90, duration: 1.1, release: 1.05, lowpass: 1200, punch: 0.9 }],
  ['jump', 'Jump', 'A springy upward hop.', { frequency: 260, slide: 17, duration: 0.28, release: 0.2, lowpass: 7000 }],
  ['powerup', 'Power-up', 'A shimmering upward charge.', { wave: 'triangle', frequency: 350, slide: 24, duration: 0.75, attack: 0.04, release: 0.35, vibrato: 2, vibratoRate: 14 }],
  ['hit', 'Hit', 'A compact, crunchy impact.', { wave: 'noise', seed: 722, frequency: 180, duration: 0.16, release: 0.15, lowpass: 4500, crunch: 0.6, punch: 1 }],
  ['blip', 'Blip', 'A soft, rounded interface tone.', { wave: 'sine', frequency: 740, slide: -3, duration: 0.13, release: 0.11, punch: 0 }],
  ['click', 'Click', 'A tiny tactile tick.', { wave: 'noise', seed: 214, duration: 0.06, release: 0.058, lowpass: 8000, punch: 0.8 }],
].map(([id, name, description, params]) => Object.freeze({ id, name, description, params: Object.freeze(normalizeParams({ ...DEFAULTS, ...params })) })));
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function validRate(rate) {
  if (!Number.isInteger(rate) || rate < 8000 || rate > 192000) throw new RangeError('Sample rate must be an integer from 8000 to 192000 Hz.');
  return rate;
}
// Polynomial band-limited step correction smooths square and saw discontinuities.
function polyBlep(phase, increment) {
  if (phase < increment) { const t = phase / increment; return t + t - t * t - 1; }
  if (phase > 1 - increment) { const t = (phase - 1) / increment; return t * t + t + t + 1; }
  return 0;
}
export function renderSound(input, sampleRate = 44100) {
  validRate(sampleRate);
  const p = normalizeParams(input);
  const count = Math.round(p.duration * sampleRate);
  const output = new Float32Array(count);
  const rate = sampleRate * 2; // Two-times oversampling, then average pairs.
  const random = rng(p.seed);
  let attack = Math.max(0.003, p.attack), release = Math.max(0.008, p.release);
  if (attack + release > p.duration) { const scale = p.duration / (attack + release); attack *= scale; release *= scale; }
  const alpha = 1 - Math.exp(-2 * Math.PI * Math.min(p.lowpass, sampleRate * 0.42) / rate);
  const levels = 2 ** (16 - Math.round(p.crunch * 13));
  let phase = 0, filtered = 0;
  for (let i = 0; i < count; i++) {
    let mixed = 0;
    for (let sub = 0; sub < 2; sub++) {
      const time = (i * 2 + sub) / rate;
      const progress = time / p.duration;
      const frequency = clamp(p.frequency * 2 ** ((p.slide * progress + p.vibrato * Math.sin(2 * Math.PI * p.vibratoRate * time)) / 12), 10, sampleRate * 0.42);
      const dt = frequency / rate;
      let value;
      if (p.wave === 'noise') value = random() * 2 - 1;
      else if (p.wave === 'sine') value = Math.sin(phase * 2 * Math.PI);
      else if (p.wave === 'saw') value = phase * 2 - 1 - polyBlep(phase, dt);
      else if (p.wave === 'square') value = (phase < 0.5 ? 1 : -1) + polyBlep(phase, dt) - polyBlep((phase + 0.5) % 1, dt);
      else {
        // Band-limited triangle: only harmonics below the output Nyquist limit.
        value = 0;
        for (let harmonic = 1; harmonic <= 15 && frequency * harmonic < sampleRate * 0.48; harmonic += 2)
          value += (harmonic % 4 === 1 ? 1 : -1) * Math.sin(phase * 2 * Math.PI * harmonic) / (harmonic * harmonic);
        value *= 8 / (Math.PI * Math.PI);
      }
      phase = (phase + dt) % 1;
      if (p.crunch > 0) value = Math.round(value * levels) / levels;
      filtered += alpha * (value - filtered);
      mixed += filtered * 0.5;
    }
    const time = i / sampleRate;
    const tail = (count - 1 - i) / sampleRate;
    const envelope = Math.min(1, time / attack) * Math.min(1, tail / release);
    const punch = (1 + p.punch * Math.exp(-time * 35)) / (1 + p.punch);
    output[i] = clamp(mixed * envelope * envelope * punch * p.volume * 0.9, -1, 1);
  }
  output[0] = 0; output[count - 1] = 0;
  return output;
}
export function encodeWav(samples, sampleRate = 44100) {
  validRate(sampleRate);
  if (!(samples instanceof Float32Array) && !Array.isArray(samples)) throw new TypeError('Expected an array of audio samples.');
  if (samples.length > sampleRate * 60) throw new RangeError('Audio exceeds the 60-second export limit.');
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = typeof samples[i] === 'number' && Number.isFinite(samples[i]) ? clamp(samples[i], -1, 1) : 0;
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return buffer;
}
export function randomizeParams(seed = DEFAULTS.seed) {
  const normalizedSeed = normalizeParams({ seed }).seed, random = rng(normalizedSeed);
  return normalizeParams({ ...DEFAULTS, seed: normalizedSeed, wave: waves[Math.floor(random() * waves.length)],
    frequency: Math.round(100 * 2 ** (random() * 4)), slide: Math.round(random() * 48 - 24),
    duration: 0.1 + random() * 0.9, attack: random() * 0.04, release: 0.05 + random() * 0.8,
    vibrato: random() < 0.5 ? 0 : random() * 5, vibratoRate: 3 + random() * 18,
    punch: random(), lowpass: Math.round(800 + random() * 15000), crunch: random() < 0.6 ? 0 : random() * 0.8 });
}
export function mutateParams(input, seed = DEFAULTS.seed) {
  const p = normalizeParams(input), random = rng(normalizeParams({ seed }).seed);
  for (const field of PARAMS) {
    if (field.key === 'wave' || field.key === 'seed' || field.key === 'volume') continue;
    p[field.key] += (random() * 2 - 1) * (field.max - field.min) * 0.05;
  }
  return normalizeParams(p);
}
export function serializeSettings(input) {
  return JSON.stringify({ format: 'kata-sound-lab', version: 1, params: normalizeParams(input) }, null, 2);
}
export function parseSettings(text) {
  if (typeof text !== 'string' || text.length > 16384) throw new Error('Settings must be a JSON document smaller than 16 KB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Settings are not valid JSON.'); }
  if (!data || data.format !== 'kata-sound-lab' || data.version !== 1 || !data.params || typeof data.params !== 'object' || Array.isArray(data.params))
    throw new Error('Expected Kata Sound Lab settings, version 1.');
  const keys = PARAMS.map(field => field.key);
  if (Object.keys(data).some(key => !['format', 'version', 'params'].includes(key)) || Object.keys(data.params).some(key => !keys.includes(key)))
    throw new Error('Settings contain unsupported fields.');
  for (const key of keys) {
    if (!Object.hasOwn(data.params, key)) throw new Error(`Missing setting: ${key}.`);
    const value = data.params[key];
    if (key === 'wave' ? !waves.includes(value) : typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid setting: ${key}.`);
  }
  return normalizeParams(data.params);
}
