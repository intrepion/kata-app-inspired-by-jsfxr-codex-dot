# Verification record

Checked 2026-11-09 in Chromium on the cloud Linux computer, using **http://127.0.0.1:4173/**. No application file was opened directly in the browser.

## Automated checks

`npm run check` runs syntax validation plus the Node test suite. Coverage includes:

- All eight presets: finite, bounded, non-silent samples, expected duration and zero endpoints.
- Every waveform at extreme parameter combinations.
- Seed determinism, 200 randomized sounds, mutation determinism, and input immutability.
- Settings round trips, exact JSON equality, unsupported versions, malformed fields, large imports, and clamping.
- Sample-rate validation and RIFF/WAVE header/PCM16 clipping.
- HTTP root, module and icon serving; hidden-path, missing-path, and non-GET rejection.

`npm run build` creates a static `dist/` copy without dependencies. See current command output for pass/fail counts.

## Browser checks completed

- First load: preset grid, waveform, editable controls, export panel, and no automatic playback.
- Preview started, signaled PLAYING, finished, and could be stopped. Changing sounds interrupts old playback. Auto-preview starts on changes when enabled.
- Preset switching; numeric duration editing; Randomize/Mutate; Undo/Redo; reset to preset.
- Texture disclosure expands/collapses with all extra controls available.
- WAV and JSON downloads completed. A two-second Explosion WAV was 176,444 bytes. Its downloaded bytes exactly matched rendering the downloaded settings with the engine.
- JSON import reproduced the exported parameters. Invalid JSON format was rejected without changing the current sound.
- Reload restored the last sound with playback off and a fresh history.
- Desktop and 500 CSS-pixel narrow layouts were inspected. Narrow export-grid ordering issue found and fixed. No horizontal overflow in the checked layout.
- App-generated console errors were not observed. Browser-extension metadata errors were unrelated to this app.

## Limits

Browser playback state was verified, but this is not a human acoustic listening or mastering assessment. Browser coverage is Chromium only. Physical touch devices, Safari, Firefox, narrow widths below 500 CSS pixels, and assistive-technology combinations were not exercised. Anti-aliasing is approximate. Generated noise has no musical pitch. No external publication, GitHub Actions run, or deployed-site check was performed.

## Screenshots

Unedited full-page browser captures are in `screenshots/`, with dimensions, SHA-256 checksums, and localhost provenance in `manifest.json`. A 15-pixel scrollbar is excluded from the captured images: desktop 1,165 px wide from a 1,180 CSS-pixel viewport; narrow 485 px wide from a 500 CSS-pixel viewport.

## Publication follow-up

The public repository and GitHub Pages app were published on 2026-11-09. Initial deployment of `0ec166160635772f52d726fc10161108cc57e21b` passed all 12 tests and its build/deploy jobs: https://github.com/intrepion/kata-app-inspired-by-jsfxr-codex-dot/actions/runs/42713042074 . Public HTML, CSS, both JavaScript modules, favicon, and screenshots returned HTTP 200 and matched the built bytes.

Additional Chrome-on-macOS localhost checks covered audio preview and 390/320 CSS-pixel responsive layouts. A cramped 320-pixel transport row was corrected by wrapping the preview button above secondary controls. This is viewport testing, not physical-phone testing.
