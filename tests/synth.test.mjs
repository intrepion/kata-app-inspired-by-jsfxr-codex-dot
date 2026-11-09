import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS, DEFAULTS, PRESETS, normalizeParams, renderSound, encodeWav, randomizeParams, mutateParams, parseSettings, serializeSettings } from '../src/synth.js';
test('all presets are bounded, finite, non-silent, duration-correct, and ramped', () => {
  for (const preset of PRESETS) {
    const samples = renderSound(preset.params, 22050);
    assert.equal(samples.length, Math.round(preset.params.duration * 22050));
    assert.equal(samples[0], 0); assert.equal(samples.at(-1), 0);
    assert.ok(samples.every(x => Number.isFinite(x) && Math.abs(x) <= 1), preset.id);
    assert.ok(samples.some(x => Math.abs(x) > 0.01), preset.id);
    assert.ok(Math.abs(samples[1]) < 0.01); assert.ok(Math.abs(samples.at(-2)) < 0.01);
  }
});
test('every waveform is deterministic and safe at extreme parameter combinations', () => {
  for (const { value: wave } of PARAMS[0].options) {
    for (const endpoint of ['min', 'max']) {
      const p = Object.fromEntries(PARAMS.filter(f => f.key !== 'wave').map(f => [f.key, f[endpoint]]));
      p.wave = wave; p.volume = 1;
      const a = renderSound(p, 8000), b = renderSound(p, 8000);
      assert.deepEqual(a, b); assert.ok(a.every(x => Number.isFinite(x) && Math.abs(x) <= 1));
      assert.ok(a.some(x => x !== 0)); assert.equal(a[0], 0); assert.equal(a.at(-1), 0);
    }
  }
});
test('seed changes noise while identical settings reproduce samples', () => {
  const a = renderSound({ wave: 'noise', seed: 0 });
  assert.deepEqual(a, renderSound({ wave: 'noise', seed: 0 }));
  assert.notDeepEqual(a, renderSound({ wave: 'noise', seed: 1 }));
  assert.deepEqual(randomizeParams(0), randomizeParams(0));
  assert.deepEqual(mutateParams(DEFAULTS, 9), mutateParams(DEFAULTS, 9));
  assert.notDeepEqual(randomizeParams(1), randomizeParams(2));
});
test('normalization clamps values without accepting numeric strings or invalid values', () => {
  assert.deepEqual(normalizeParams(null), DEFAULTS);
  const p = normalizeParams({ duration: 99, seed: -1, frequency: '300', volume: NaN, wave: 'bad', release: Infinity });
  assert.equal(p.duration, 3); assert.equal(p.seed, 0); assert.equal(p.frequency, DEFAULTS.frequency);
  assert.equal(p.volume, DEFAULTS.volume); assert.equal(p.wave, DEFAULTS.wave);
  assert.ok(renderSound({ volume: 0 }).every(x => x === 0));
});
test('settings round-trip, clamp numeric ranges, and reject malformed or incompatible files', () => {
  assert.deepEqual(parseSettings(serializeSettings(DEFAULTS)), DEFAULTS);
  const data = JSON.parse(serializeSettings(DEFAULTS)); data.params.frequency = 999999;
  assert.equal(parseSettings(JSON.stringify(data)).frequency, 2400);
  for (const text of ['', 'null', '[]', '{}', 'alert(1)', 'x'.repeat(16385), '{"format":"kata-sound-lab","version":2,"params":{}}']) assert.throws(() => parseSettings(text));
  for (const alteration of [d => { d.params.wave = 'custom'; }, d => { d.params.duration = '1'; }, d => { delete d.params.volume; }, d => { d.params.extra = 1; }, d => { d.params.duration = null; }, d => { d.extra = 1; }]) {
    const d = JSON.parse(serializeSettings(DEFAULTS)); alteration(d); assert.throws(() => parseSettings(JSON.stringify(d)));
  }
  assert.throws(() => parseSettings(42));
});
test('sample rates are validated rather than silently creating invalid audio', () => {
  for (const rate of [0, -1, 7999, 192001, 44100.5, NaN, Infinity, '44100', null]) {
    assert.throws(() => renderSound(DEFAULTS, rate), RangeError);
    assert.throws(() => encodeWav([], rate), RangeError);
  }
  assert.equal(renderSound({ duration: 0.06 }, 192000).length, 11520);
});
test('WAV is little-endian mono PCM16 with correct lengths and clipped samples', () => {
  const samples = new Float32Array([-2, -1, 0, 1, 2, NaN, Infinity]);
  const buffer = encodeWav(samples, 22050), view = new DataView(buffer);
  const text = (offset, length) => String.fromCharCode(...new Uint8Array(buffer, offset, length));
  assert.equal(text(0, 4), 'RIFF'); assert.equal(text(8, 4), 'WAVE'); assert.equal(text(12, 4), 'fmt '); assert.equal(text(36, 4), 'data');
  assert.equal(view.getUint32(4, true), buffer.byteLength - 8); assert.equal(view.getUint32(16, true), 16);
  assert.equal(view.getUint16(20, true), 1); assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 22050); assert.equal(view.getUint32(28, true), 44100);
  assert.equal(view.getUint16(32, true), 2); assert.equal(view.getUint16(34, true), 16); assert.equal(view.getUint32(40, true), samples.length * 2);
  assert.deepEqual(Array.from({ length: samples.length }, (_, i) => view.getInt16(44 + i * 2, true)), [-32768, -32768, 0, 32767, 32767, 0, 0]);
  assert.throws(() => encodeWav('bad'), TypeError);
  assert.throws(() => encodeWav(new Float32Array(480001), 8000), RangeError);
});

test('200 seeded randomized sounds are deterministic, finite, bounded, and non-silent', () => {
  for (let seed = 0; seed < 200; seed++) {
    const p = randomizeParams(seed);
    assert.deepEqual(p, randomizeParams(seed), `random settings seed ${seed}`);
    assert.deepEqual(p, normalizeParams(p));
    const a = renderSound(p, 8000);
    assert.deepEqual(a, renderSound(p, 8000), `render seed ${seed}`);
    assert.equal(a.length, Math.round(p.duration * 8000));
    assert.equal(a[0], 0); assert.equal(a.at(-1), 0);
    assert.ok(a.every(value => Number.isFinite(value) && Math.abs(value) <= 1), `bounds seed ${seed}`);
    assert.ok(a.some(value => Math.abs(value) > 0.001), `audible seed ${seed}`);
    assert.deepEqual(parseSettings(serializeSettings(p)), p, `round-trip seed ${seed}`);
  }
});

test('mutations are reproducible, seed-dependent, normalized, and retain wave, volume, noise seed', () => {
  for (let seed = 0; seed < 200; seed++) {
    const original = randomizeParams(seed);
    const mutation = mutateParams(original, seed);
    assert.deepEqual(mutation, mutateParams(original, seed));
    assert.deepEqual(mutation, normalizeParams(mutation));
    assert.notDeepEqual(mutation, mutateParams(original, seed + 1));
    assert.equal(mutation.wave, original.wave);
    assert.equal(mutation.volume, original.volume);
    assert.equal(mutation.seed, original.seed);
    assert.deepEqual(parseSettings(serializeSettings(mutation)), mutation);
  }
});

test('normalization, rendering, mutation, serialization, and export leave caller input unchanged', () => {
  const input = Object.freeze({ ...DEFAULTS, frequency: 987, wave: 'noise' });
  const before = structuredClone(input);
  normalizeParams(input); renderSound(input, 8000); mutateParams(input, 37); serializeSettings(input);
  assert.deepEqual(input, before);
  for (const preset of PRESETS) {
    const saved = structuredClone(preset.params);
    renderSound(preset.params, 8000); mutateParams(preset.params, 4); serializeSettings(preset.params);
    assert.deepEqual(preset.params, saved);
  }
  const samples = new Float32Array([-2, -0.5, 0, 0.5, 2, NaN]);
  const savedSamples = samples.slice();
  encodeWav(samples);
  assert.deepEqual(samples, savedSamples);
});

test('oversized otherwise valid settings are rejected before parsing', () => {
  const valid = serializeSettings(DEFAULTS);
  assert.deepEqual(parseSettings(valid.padEnd(16384, ' ')), DEFAULTS);
  assert.throws(() => parseSettings(valid.padEnd(16385, ' ')), /smaller than 16 KB/);
  assert.throws(() => parseSettings(valid.padEnd(1024 * 1024, ' ')), /smaller than 16 KB/);
});
