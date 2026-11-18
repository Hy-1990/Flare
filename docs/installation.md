# Install Flare on macOS or Windows

Flare runs as a local Node.js server with a browser interface. Both platforms use the same source and commands; there is no desktop installer. CI covers macOS and Windows, including actual video export. A passing CI run does not certify every OS version, processor or external model account.

## Requirements

- Node.js 22.13 or newer (Node.js 22 is used in CI), including npm.
- Git, unless you download and extract the release source archive.
- FFmpeg 7 or newer, with both `ffmpeg` and `ffprobe` on PATH.
- An OS supported by [Playwright](https://playwright.dev/docs/intro), and internet access for the first dependency/browser installation.

## macOS

If you already use [Homebrew](https://brew.sh/):

```bash
brew install node@22 ffmpeg git
export PATH="$(brew --prefix node@22)/bin:$PATH"
```

Alternatively install Node.js from [nodejs.org](https://nodejs.org/en/download) and FFmpeg using an option listed by [FFmpeg](https://ffmpeg.org/download.html). Do not run Flare with sudo.

```bash
git clone https://github.com/Hy-1990/Flare.git
cd Flare
npm ci
npm run setup:browser
npm run build
npm run doctor
npm start
```

## Windows (PowerShell)

Install the prerequisites using Windows Package Manager, or use the official Node.js, Git and FFmpeg download instructions:

```powershell
winget install --exact --id OpenJS.NodeJS.LTS
winget install --exact --id Git.Git
winget install --exact --id Gyan.FFmpeg
```

Close and reopen PowerShell so it sees the updated PATH. Use a folder owned by your account, outside OneDrive or shared folders. Paths with spaces are supported; quote them when using `cd`.

```powershell
git clone https://github.com/Hy-1990/Flare.git
cd Flare
npm.cmd ci
npm.cmd run setup:browser
npm.cmd run build
npm.cmd run doctor
npm.cmd start
```

`npm.cmd` avoids PowerShell's script-execution-policy restriction on `npm.ps1`; do not weaken your system execution policy. A source ZIP works too: extract it, open PowerShell in its folder, then start at `npm.cmd ci`.

## Open, stop and change ports

Open **http://127.0.0.1:4317**. Keep the terminal open. Press **Ctrl+C** in that terminal to stop Flare (on Windows, confirm termination if prompted). Flare binds to loopback only; no inbound firewall exception or public deployment is required.

macOS:

```bash
PORT=4318 npm start
```

Windows PowerShell:

```powershell
$env:PORT = "4318"
npm.cmd start
```

Then open http://127.0.0.1:4318. For development use `npm run dev` (`npm.cmd run dev` in PowerShell).

## Data, upgrades and recovery

Projects, media, settings and exports live in `.flare` inside the project by default. Stop Flare before backing up this whole directory. It includes unencrypted API keys: do not upload it to GitHub or share it.

To use a different private directory, set `FLARE_DATA_DIR` before starting:

```bash
FLARE_DATA_DIR="$HOME/FlareData" npm start
```

```powershell
$env:FLARE_DATA_DIR = "$env:LOCALAPPDATA\Flare\data"
npm.cmd start
```

Move existing data to the new location while Flare is stopped; changing the variable alone does not migrate it. Windows uses inherited filesystem ACLs; POSIX permission bits do not provide equivalent protection there.

For an upgrade: stop Flare, back up `.flare`, run `git pull --ff-only`, then repeat `npm ci`, `npm run setup:browser`, `npm run build`, `npm run doctor`. Start again. For ZIP installs, extract to a new folder and restore the data backup there. Do not delete the old copy until you have checked your projects and exports.

## Model connections

API providers work without a local coding CLI. Configure keys in Settings. For Codex or Claude CLI mode, install the provider's current official CLI, sign in in a terminal, and choose **CLI · Default** in Flare. Restart Flare after installing a CLI or changing PATH.

Windows native `.exe` installations and the standard npm entry points for `@openai/codex` and `@anthropic-ai/claude-code` are detected. Flare does not execute arbitrary `.cmd`/`.bat` wrappers. A CLI installed only inside WSL is not visible to native Windows Flare; keep the server and CLI in the same environment. Detection is not proof of successful login or model entitlement. Live Windows CLI model calls are not yet certified.

## Troubleshooting

- **Missing FFmpeg/FFprobe:** run `ffmpeg -version` and `ffprobe -version`; install both or add their `bin` folder to PATH, then reopen the terminal.
- **Missing renderer:** run `npm run setup:browser` as the same user who runs Flare. Browser caches differ by OS; see [Playwright's browser documentation](https://playwright.dev/docs/browsers). A custom `FLARE_CHROMIUM` must point to a compatible executable.
- **Port already in use:** stop the other Flare terminal or choose another port as shown above.
- **Install or export fails:** run `npm run doctor` and include its output, OS and Node version when reporting an issue. Never include `.flare/settings.json` or API keys.
- **Offline style references:** `npm run styles:sync` caches guides/posters. Demo videos and external AI providers still require network access.
