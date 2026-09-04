#!/usr/bin/env bash
set -euo pipefail

ARCH_URL="https://github.com/rry0ku/veluna/releases/download/v0.1.6/veluna-0.1.6-1-x86_64.pkg.tar.zst"
DEB_URL="https://github.com/rry0ku/veluna/releases/download/v0.1.6/veluna_0.1.6_amd64.deb"
RPM_URL="https://github.com/rry0ku/veluna/releases/download/v0.1.6/veluna-0.1.6-1.x86_64.rpm"

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

error() {
  echo -e "\033[1;31mError:\033[0m $1"
  exit 1
}

main() {
  if command -v pacman >/dev/null 2>&1; then
    PACKAGE_PATH="$TEMP_DIR/veluna-0.1.6-1-x86_64.pkg.tar.zst"
    curl -fsSL# "$ARCH_URL" -o "$PACKAGE_PATH" || error "Download failed."
    sudo pacman -U --noconfirm "$PACKAGE_PATH"
  elif command -v apt >/dev/null 2>&1; then
    PACKAGE_PATH="$TEMP_DIR/veluna_0.1.6_amd64.deb"
    curl -fsSL# "$DEB_URL" -o "$PACKAGE_PATH" || error "Download failed."
    sudo apt install -y "$PACKAGE_PATH"
  elif command -v dnf >/dev/null 2>&1; then
    PACKAGE_PATH="$TEMP_DIR/veluna-0.1.6-1.x86_64.rpm"
    curl -fsSL# "$RPM_URL" -o "$PACKAGE_PATH" || error "Download failed."
    sudo dnf install -y "$PACKAGE_PATH"
  else
    error "Unsupported package manager. Supported: pacman, apt, dnf."
  fi
}

main
