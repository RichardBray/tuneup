# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.3] - 2026-03-20

### Fixed

- Download hanging after processing completes by fully consuming response body before writing to disk

## [0.1.2] - 2026-03-19

### Added

- `--set-preset` flag to save a default preset (`~/.config/tuneup/config.json`)

## [0.1.1] - 2026-03-19

### Fixed

- Install script now updates PATH in all detected shell configs (bash, zsh, fish) instead of only the login shell

### Added

- Windows x64 binary support
- `--version` / `-v` flag

## [0.1.0] - 2026-03-19

### Added

- Initial release
- Upload and process audio files through the Auphonic API
- Preset selection by name (`-p, --preset`)
- Custom output directory (`-o, --output-dir`)
- Configurable timeout (`-t, --timeout`)
- List available presets (`--list-presets`)
- Progress polling with status updates
- Automatic download of processed files
