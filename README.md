# tuneup

A fast, zero-dependency CLI for processing audio files through [Auphonic](https://auphonic.com). Upload, process, and download your audio — all from the terminal.

## What makes it different

Most Auphonic wrappers stop at "upload, wait, download." This one adds a **second, local polish pass** on top of Auphonic's output, so a single command gives you a fully finished file:

- **Two-stage pipeline** — Auphonic handles loudness, leveling, and noise reduction in the cloud; then `ffmpeg` runs `adeclick` → `adeclip` → `deesser` locally to clean up mouth clicks, clipped peaks, and sibilance that Auphonic doesn't target.
- **Non-destructive** — the post-processed file is saved as `<name>.cleaned.<ext>` alongside the original Auphonic output, so you can A/B them.
- **Tunable de-essing** — `--deesser 0..1` lets you dial sibilance reduction without touching ffmpeg flags.
- **Zero-dependency single binary** — Bun-compiled for macOS, Linux, and Windows. No Node, no `npm install`, no Python.
- **Preset-name workflow with a persisted default** — `--set-preset "My Podcast"` once, then just `tuneup recording.wav` forever after.
- **Claude Code-native install/update/uninstall** — drop-in prompts in the README so the agent handles platform detection and PATH setup for you.

## Installation

### Quick install (macOS & Linux)

```bash
curl -fsSL https://github.com/RichardBray/tuneup/releases/latest/download/install.sh | bash
```

### Install a specific version

```bash
VERSION=v0.1.0 curl -fsSL https://github.com/RichardBray/tuneup/releases/latest/download/install.sh | bash
```

### Windows

Download `tuneup-windows-x64.exe` from the [latest release](https://github.com/RichardBray/tuneup/releases/latest) and add it to your PATH.

### With Claude Code

Paste this prompt into [Claude Code](https://claude.com/claude-code):

```
Download the latest tuneup binary for my OS and architecture from
https://github.com/RichardBray/tuneup/releases/latest — install it
to the appropriate location for my platform, make it executable if needed,
and add it to my PATH if it isn't already.
```

### From source

```bash
git clone https://github.com/RichardBray/tuneup.git
cd tuneup
bun install
```

## Setup

Get your API key from [Auphonic API settings](https://auphonic.com/engine/api/) and set it as an environment variable:

```bash
export AUPHONIC_API_KEY="your-api-key-here"
```

Add this to your shell profile (`~/.bashrc`, `~/.zshrc`, `~/.config/fish/config.fish`, etc.) to persist it.

## Usage

```bash
tuneup <file> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --preset <name>` | Auphonic preset name | `Usual-2` or saved default |
| `-o, --output-dir <path>` | Directory to save processed files | `~/Downloads/auphonic_results` |
| `-t, --timeout <seconds>` | Max time to wait for processing | `300` |
| `--set-preset <name>` | Set the default preset and exit | |
| `--list-presets` | List available presets and exit | |
| `--post-process` | Run ffmpeg de-click/de-clip/de-ess on downloaded audio | off |
| `--deesser <0..1>` | De-esser intensity when `--post-process` is set | `0.2` |
| `-v, --version` | Show version | |
| `-h, --help` | Show help | |

### Examples

Process a file with the default preset:

```bash
tuneup recording.wav
```

Use a specific preset:

```bash
tuneup recording.wav -p "My Podcast Preset"
```

Save output to a custom directory:

```bash
tuneup recording.wav -o ./processed
```

List your available presets:

```bash
tuneup --list-presets
```

Run post-processing on the Auphonic output (requires `ffmpeg` on your PATH):

```bash
tuneup recording.wav --post-process
```

`--post-process` runs three ffmpeg filters in sequence on every downloaded audio file:

1. **`adeclick`** — removes mouth clicks, pops, and impulsive noise
2. **`adeclip`** — repairs clipped/distorted peaks
3. **`deesser`** — reduces sibilance ("s"/"sh" harshness)

All three run together; they are not individually toggleable. The result is saved as `recording.cleaned.wav` alongside the original Auphonic output (non-destructive).

Tune de-esser intensity with `--deesser` (0 = off, 1 = aggressive, default `0.2`):

```bash
tuneup recording.wav --post-process --deesser 0.4
```

### Running from source

If you cloned the repo instead of installing globally:

```bash
bun run index.ts recording.wav -p "My Preset"
```

## Uninstallation

Remove the binary:

```bash
rm ~/.local/bin/tuneup
```

Then remove the PATH entry added by the installer from your shell config(s). Look for and delete these lines:

- **bash/zsh** (`~/.bashrc`, `~/.bash_profile`, or `~/.zshrc`):
  ```
  # Added by tuneup installer
  export PATH="$HOME/.local/bin:$PATH"
  ```
- **fish** (`~/.config/fish/config.fish`):
  ```
  fish_add_path /Users/<your-username>/.local/bin
  ```

> Skip removing the PATH entry if other tools in `~/.local/bin` depend on it.

## Using Claude Code

If you use [Claude Code](https://claude.com/claude-code), you can install, update, or uninstall by pasting these prompts:

**Install:**
```
Download the latest tuneup binary for my OS and architecture from
https://github.com/RichardBray/tuneup/releases/latest — install it
to the appropriate location for my platform, make it executable if needed,
and add it to my PATH if it isn't already.
```

**Update:**
```
Update tuneup to the latest version by downloading the correct binary
for my OS and architecture from
https://github.com/RichardBray/tuneup/releases/latest and replacing
~/.local/bin/tuneup with it.
```

**Uninstall:**
```
Remove ~/.local/bin/tuneup and remove any "Added by tuneup installer"
PATH entries from my shell config files.
```

## How it works

1. Looks up your preset by name via the Auphonic API
2. Uploads your audio file and creates a production
3. Starts the production and polls for completion (every 15s)
4. Downloads the processed output files to your output directory
5. *(Optional, with `--post-process`)* Runs `ffmpeg` with the `adeclick,adeclip,deesser` filter chain on each downloaded audio file, saving the result as `<name>.cleaned.<ext>`

## License

MIT
