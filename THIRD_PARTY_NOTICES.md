# Sources and dependencies

Flare's application, renderers and workflow are independently implemented. The style catalog incorporates metadata from **Lemo-Opuscar by Lemomo (LemoLab)**, https://github.com/lemomo-ai/lemo-opuscar, pinned revision `3a7132b996be0241c1ea0ab180d519f06e6f10b6`. Its MIT copyright and license are retained in `licenses/lemo-opuscar-metadata-MIT.txt`. Metadata is normalized into Chinese-facing fields, category IDs, production modes and source hashes; these are Flare additions, not upstream capability claims.

The optional/automatic runtime cache `.flare/style-library/` contains original, unmodified `STYLE.md` guides under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) and original posters under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), with third-party exclusions. The cache and videos are not included in the source repository. The UI shows original posters and links/streams complete original demo films as published, separately from the user's own preview. Guide excerpts are placed in provider requests at runtime. They are not relicensed as Flare MIT.

Contributed styles: **Memphis Diorama by EianLu, in Lemo-Opuscar by Lemomo (LemoLab)**; **Crayon World 3D by 2nd1st, in Lemo-Opuscar by Lemomo (LemoLab)**. The detail pages credit the relevant author.

Read the [pinned upstream LICENSE](https://github.com/lemomo-ai/lemo-opuscar/blob/3a7132b996be0241c1ea0ab180d519f06e6f10b6/LICENSE) and each style's `demo/CREDITS` before reusing assets. Third-party media, maps, models, fonts, product interfaces, names and marks retain their terms. No Clawd character, third-party trademarks or excluded narration is licensed by Flare. Original videos may be viewed/shared whole subject to upstream exceptions; do not extract excluded narration.

The upstream additional docs permission covers making your own films, including commercial films, and delivering their project files to the people working on that film. Other commercial use of original/adapted docs in a product or service needs the upstream commercial license. Downloading docs at runtime does not remove that restriction.

UI design process informed by **unslop by Damir Sokolovsky**, [heydamir.design/unslop](https://heydamir.design/unslop), CC BY 4.0. The skill itself is not redistributed or adapted into the application.

Runtime and build dependencies retain their respective licenses. The installed packages include full license notices:

- React / React DOM — MIT
- Express — MIT
- Zod — MIT
- Lucide — ISC
- Playwright — Apache-2.0
- Vite / TypeScript / Prettier — MIT / Apache-2.0 / MIT respectively
- Source Sans 3 variable, Noto Sans SC variable, and IBM Plex Mono (Fontsource distributions) — SIL Open Font License 1.1; see the corresponding `public/fonts/OFL-*.txt` notices. The DM Sans license remains for previously distributed assets.
- FFmpeg and Chromium are external runtime tools, not bundled in this repository. Their own licenses apply.

The starter illustrations, procedural score, animation components and base workflow prompts are original to this repository; runtime style-guide excerpts retain upstream terms. User-provided media and outputs from external services are not relicensed by the Flare source-code license.

Interface refinement follows the **Impeccable** skill by Paul Bakaus, with an Operate-mode focus on task hierarchy, readable typography, accessible controls, localization and semantic themes. The skill is not bundled in the application.
