#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-latest}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1" >&2
    exit "$2"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

detect_platform() {
    OS=$(uname -s)
    ARCH=$(uname -m)

    case "$OS" in
        Darwin)
            case "$ARCH" in
                arm64)
                    BINARY="tuneup-macos-apple-silicon"
                    ;;
                x86_64)
                    BINARY="tuneup-macos-intel"
                    ;;
                *)
                    log_error "Unsupported architecture: $ARCH (only arm64 and x86_64 are supported on macOS)" 1
                    ;;
            esac
            ;;
        Linux)
            case "$ARCH" in
                x86_64)
                    BINARY="tuneup-linux-x64"
                    ;;
                *)
                    log_error "Unsupported architecture: $ARCH (only x86_64 is supported on Linux)" 1
                    ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            BINARY="tuneup-windows-x64.exe"
            ;;
        *)
            log_error "Unsupported operating system: $OS (only macOS, Linux, and Windows are supported)" 1
            ;;
    esac

    log_info "Detected platform: $OS $ARCH"
    log_info "Binary to download: $BINARY"
}

detect_shells() {
    SHELL_CONFIGS=()

    # Check for bash config
    if [[ "$OS" == "Darwin" ]]; then
        [[ -f "$HOME/.bash_profile" ]] && SHELL_CONFIGS+=("bash:$HOME/.bash_profile")
    else
        [[ -f "$HOME/.bashrc" ]] && SHELL_CONFIGS+=("bash:$HOME/.bashrc")
    fi

    # Check for zsh config
    [[ -f "$HOME/.zshrc" ]] && SHELL_CONFIGS+=("zsh:$HOME/.zshrc")

    # Check for fish config
    [[ -f "$HOME/.config/fish/config.fish" ]] && SHELL_CONFIGS+=("fish:$HOME/.config/fish/config.fish")

    if [[ ${#SHELL_CONFIGS[@]} -eq 0 ]]; then
        log_warn "No shell config files found. You may need to add ~/.local/bin to your PATH manually."
    else
        for entry in "${SHELL_CONFIGS[@]}"; do
            local shell_name="${entry%%:*}"
            log_info "Found shell config: $shell_name"
        done
    fi
}

install_binary() {
    local install_dir="$HOME/.local/bin"

    if [[ ! -d "$install_dir" ]]; then
        mkdir -p "$install_dir"
        log_info "Created directory: $install_dir"
    fi

    if [[ ! -w "$install_dir" ]]; then
        log_error "No write permission for $install_dir" 3
    fi
}

download_binary() {
    local install_dir="$HOME/.local/bin"
    local binary_path="$install_dir/tuneup"
    local download_url

    if [[ "$VERSION" == "latest" ]]; then
        download_url="https://github.com/RichardBray/tuneup/releases/latest/download/$BINARY"
    else
        download_url="https://github.com/RichardBray/tuneup/releases/download/$VERSION/$BINARY"
    fi

    log_info "Downloading binary from GitHub releases (version: $VERSION)..."

    if ! curl -fsSL "$download_url" -o "$binary_path"; then
        log_error "Failed to download binary from $download_url" 2
    fi

    log_info "Binary downloaded successfully"
}

download_checksums() {
    local checksums_url

    if [[ "$VERSION" == "latest" ]]; then
        checksums_url="https://github.com/RichardBray/tuneup/releases/latest/download/checksums.txt"
    else
        checksums_url="https://github.com/RichardBray/tuneup/releases/download/$VERSION/checksums.txt"
    fi

    log_info "Downloading checksums for verification (version: $VERSION)..."

    CHECKSUMS=$(curl -fsSL "$checksums_url" 2>/dev/null || echo "")

    if [[ -z "$CHECKSUMS" ]]; then
        log_warn "Failed to download checksums. Skipping verification."
        return 1
    fi

    log_info "Checksums downloaded successfully"
    return 0
}

verify_checksum() {
    local binary_path="$HOME/.local/bin/tuneup"

    if [[ -z "$CHECKSUMS" ]]; then
        return 0
    fi

    log_info "Verifying binary integrity..."

    EXPECTED_SHA=$(echo "$CHECKSUMS" | grep "$BINARY" | awk '{print $1}')

    if [[ -z "$EXPECTED_SHA" ]]; then
        log_warn "Checksum not found for $BINARY. Skipping verification."
        return 0
    fi

    ACTUAL_SHA=$(shasum -a 256 "$binary_path" | awk '{print $1}')

    if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
        rm -f "$binary_path"
        log_error "Checksum verification failed! Expected: $EXPECTED_SHA Actual: $ACTUAL_SHA. Removed corrupted file." 4
    fi

    log_info "Checksum verified successfully"
}

verify_binary() {
    local binary_path="$HOME/.local/bin/tuneup"

    if [[ ! -f "$binary_path" ]]; then
        log_error "Binary not found at $binary_path" 3
    fi

    if [[ ! -x "$binary_path" ]]; then
        chmod +x "$binary_path"
        log_info "Made binary executable"
    fi

    if ! "$binary_path" --version &>/dev/null; then
        log_error "Binary verification failed" 4
    fi

    log_info "Binary verified successfully"
}

update_path() {
    local install_dir="$HOME/.local/bin"
    local path_line='export PATH="$HOME/.local/bin:$PATH"'

    if echo "$PATH" | grep -q "$install_dir"; then
        log_info "$install_dir is already in PATH"
        return 0
    fi

    if [[ ${#SHELL_CONFIGS[@]} -eq 0 ]]; then
        return 0
    fi

    for entry in "${SHELL_CONFIGS[@]}"; do
        local shell_name="${entry%%:*}"
        local config_file="${entry#*:}"

        case "$shell_name" in
            fish)
                local fish_path_line="fish_add_path $install_dir"
                if ! grep -q "fish_add_path.*$install_dir" "$config_file"; then
                    echo "$fish_path_line" >> "$config_file"
                    log_info "Added $install_dir to PATH in $config_file"
                else
                    log_info "$install_dir already configured in $config_file"
                fi
                ;;
            *)
                if ! grep -q "$path_line" "$config_file"; then
                    echo "" >> "$config_file"
                    echo "# Added by tuneup installer" >> "$config_file"
                    echo "$path_line" >> "$config_file"
                    log_info "Added $install_dir to PATH in $config_file"
                else
                    log_info "$install_dir already configured in $config_file"
                fi
                ;;
        esac
    done
}

print_summary() {
    echo ""
    echo "========================================="
    echo "  tuneup Installation Complete!"
    echo "========================================="
    echo ""
    echo "Binary location: $HOME/.local/bin/tuneup"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Restart your shell or reload your config"
    echo ""
    echo "2. Set your API key:"
    echo "   export AUPHONIC_API_KEY=\"your-api-key\""
    echo ""
    echo "3. Process audio:"
    echo "   tuneup recording.wav -p \"My Preset\""
    echo ""
    echo "========================================="
    echo ""
}

main() {
    echo ""
    echo "========================================="
    echo "  tuneup Installer"
    echo "========================================="
    echo ""

    detect_platform
    detect_shells
    install_binary
    download_binary
    download_checksums
    verify_checksum
    verify_binary
    update_path
    print_summary
}

main "$@"
