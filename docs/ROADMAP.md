# Flare implementation plan

## First local release — implemented for acceptance

Script-to-storyboard, three original styles, deterministic live animation, per-shot editing and undo, project persistence/import/export, original background score, opted-in DeepSeek planning and shot revision, opted-in DreamAPI image/TTS jobs, MP4/SRT/snapshot export, bounded local execution and automated verification.

## Next gate — user acceptance

Check the interface and film output locally. Configure your own provider keys and test actual model behavior, available voices, latency and account cost. Tune prompts against observed DeepSeek output. Do not publish until this gate is approved.

## Later options

1. Portable project bundles containing assets.
2. More original animation components and richer shot-specific mechanics.
3. DreamAPI generated video shots with consistent timing, audio and references.
4. More providers through a stable adapter contract.
5. Optional desktop packaging, then cloud architecture only if needed.

These are future work, not advertised as working in this release.
