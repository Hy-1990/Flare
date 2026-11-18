# Release policy

Every shipped fix must have a GitHub Release explaining the changes in English. Local experiments do not require a release; distributing a fix does. Do not reuse or move a published tag.

1. Increase the patch version in `package.json` and `package-lock.json` for a fix (use a minor version for a feature release).
2. Add `docs/releases/vX.Y.Z.md` in English with Changes, Installation, Validation and Known limitations sections. Describe user-visible behavior and distinguish real-account testing from mocks.
3. Run `npm test`, `npm run build`, `npm run doctor`, `npm run test:e2e`, `npm run test:ui`, `npm run format:check` and `npm run release:check`.
4. Commit the code, matching versions and release notes together. Publish only within the user's authorized scope.
5. The `Verify and release` workflow tests macOS and Windows. On main, it creates the version tag and GitHub Release only after both platforms pass. Pull requests run checks without publishing. A repeated version on a different commit is rejected; use a new patch version.
6. Inspect the workflow and release URL before announcing that the release is available. If checks fail, fix them before publication; never describe a pending release as shipped.

The automatic source ZIP/tarball is the distribution artifact. It does not bundle credentials, project data, node_modules, browser binaries or native installers. Install dependencies as described in the installation guide.
