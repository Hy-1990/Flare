# Flare development

- This project is independent from Henge. Do not read or alter Henge.
- **Do not push source, tags, releases or deploy without the user's explicit post-review approval.**
- Keep `.flare/`, credentials, logs, generated media and `.loop-runs/` out of Git.
- Do not use existing account credentials for paid tests. Real generation requires the user's explicit in-app action.
- Default to loopback-only operation. Never execute model-generated code.
- Keep input validation shared across UI, persistence and rendering. Model outputs are untrusted data.
- Keep preview and export on `shared/film.js`; avoid a second rendering implementation.
- The original UI direction is a quiet editing desk: film first, storyboard second, inspector third. Use restrained graphite surfaces, ember accent, real film frames and Lucide icons. See the unslop acknowledgment.
- Run `npm test`, `npm run build`, `npm run test:e2e` and `npm run format:check` before handing over changes affecting these paths. E2E uses temporary data and no paid services.
- Be explicit about external integrations not validated against a real account. Do not describe mocked provider tests as live validation.
