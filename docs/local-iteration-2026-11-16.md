# Local iteration: safer shot edits and model backends

User review completed on 2026-11-16; approved for GitHub publication. This is a source update, not a tagged release.

## Delivered

1. **Replace visual · keep timing**: edit visual description, artwork, accent or image while retaining shot identity, title, duration, narration and voice. The visual-only endpoint accepts only visual fields. Other shots and SRT timing remain unchanged. Voice controls are disabled in this mode. Undo that would change protected fields requires unlocking first.
2. **Edit impact**: duration edits display the signed time shift; narration edits disclose subtitle changes and detachment of existing voice. Applying requires acknowledgement. AI revisions are drafts until reviewed and applied. Undo previews the previous shot and asks before restoring timing/narration/voice; undo on an unsaved draft discards the draft first.
3. **Text model choice**: DeepSeek (existing), GPT/OpenAI Responses API, Claude/Anthropic Messages API, local Codex CLI and local Claude CLI. All backends use the same validated storyboard schema. DreamAPI remains the image/voice backend.

## Setup

Open Settings → Storyboarding and revision model. API modes require a key. Choose a named model from the preset dropdown, or use Custom model for an account-specific ID. Presets were checked against official model documentation on 2026-11-16; they do not guarantee account entitlement. Only the selected text provider configuration is shown. The official endpoints are used; custom gateways are not included in this iteration.

CLI modes require a current CLI installed and already signed in. Choose CLI · Default, or select a model available to that account. CLI detection does not prove authentication or model entitlement. Flare launches an isolated temporary session, disables tools/custom instructions and passes text plus the output schema. It does not read the Flare project directory through the CLI, and does not send Flare's stored API keys to the subprocess. Calls still use cloud models/account quota. Older CLI versions missing the required isolation flags must be updated.

## Validation scope

- **Live Codex on this Mac:** generated a 15-second, three-shot storyboard from a generic seed/rain/sunlight brief; then revised one shot successfully with its ID preserved. No project secrets or private user content were used.
- **Mocked:** GPT/OpenAI API and Claude API payloads, structured responses, shared validation, failed/truncated responses; Codex and Claude CLI subprocess arguments, structured response parsing, timeout recovery and sanitized errors.
- **Editing:** server-side locked-field rejection, unchanged SRT/other shots, AI preview without persistence, stale revision conflicts; browser checks for disabled locked fields, explicit duration/narration acknowledgement and undo confirmation/cancellation.
- Real-account **GPT/OpenAI API, Claude API and Claude CLI are not yet validated**. Existing DeepSeek/DreamAPI test coverage remains in place. A user-requested live DreamAPI image was subsequently generated and applied in visual-only mode: the first shot remained 5 seconds, the film remained 26 seconds, and narration and subsequent shot boundaries were unchanged.

## Claude coworker acceptance

1. On the coworker's machine, install/update Claude CLI and sign in in the terminal. Start Flare, select Claude CLI in Settings and save. Check that it is detected; leave the model blank initially.
2. Create a new, disposable 15-second film with a short generic script using AI planning. Verify the film appears with valid shot durations and narration. Do not use private material for the first check.
3. Enable Replace visual, ask for a different visual, then inspect the draft. Apply it and verify narration, duration, voice references and subtitle timing remain unchanged.
4. Turn off Replace visual and request a narration or duration change. Verify the impact acknowledgement appears before applying. Test undo and cancel once before accepting.
5. Repeat with Claude API using a test key and model ID available to the account. Each AI request uses the account quota. Never put a key in an issue, screenshot or test report.
6. Test an unavailable model or signed-out CLI: an actionable error should appear, existing project content must remain unchanged, and no automatic fallback or retry should create unexpected usage.

Record OS, CLI version, model ID, outcome and sanitized error text. Do not include credentials or CLI diagnostic logs.

## Model picker and settings refinement

Follow-up: replaced free-text-first model configuration with named presets for all five providers, keeping Custom model for existing or account-specific IDs. CLI defaults require no model-name knowledge. Selecting a CLI no longer displays DeepSeek configuration. Saved custom values survive reloads.

Impeccable 4.8.1 was run with `context --target src/main.tsx`, followed by the polish playbook and craft floor. The incumbent Cinematheque Operate surface was preserved. Settings now share a native select wrapper with Lucide disclosure icons, theme-aware hover/focus states, consistent field spacing, and inline save feedback. The sticky action row uses the dialog's spacing token and remains inside the visible dialog on narrow screens.

Verification: manual detector returned no findings; rendered settings checked in English/Chinese, light/dark, 1440/1024/390 widths. Browser assertions cover preset selection, custom persistence, absence of unrelated DeepSeek controls, icon insets, overflow and fully visible action buttons. Unit tests, build, full video export E2E and formatting passed. No model-generation requests were made for this UI refinement.
