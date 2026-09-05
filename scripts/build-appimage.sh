#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"

VERSION="${1:-}"
if [ -z "${VERSION}" ]; then
  VERSION="0.1.6"
fi

VERSION="${VERSION#v}"

BINARY_PATH="${2:-target/release/veluna}"

if [ ! -f "${BINARY_PATH}" ]; then
  echo "Error: Binary not found at ${BINARY_PATH}." >&2
  echo "Please build the release binary first: cargo build --release -p veluna" >&2
  exit 1
fi

echo "==> Building AppImage for Veluna v${VERSION}..."

BUILD_DIR=$(mktemp -d)
APPDIR="${BUILD_DIR}/AppDir"

cleanup() {
  rm -rf "${BUILD_DIR}"
}
trap cleanup EXIT

mkdir -p "${APPDIR}/usr/bin"
mkdir -p "${APPDIR}/usr/share/applications"
mkdir -p "${APPDIR}/usr/share/icons/hicolor/512x512/apps"
mkdir -p "${APPDIR}/usr/share/icons/hicolor/scalable/apps"

install -Dm755 "${BINARY_PATH}" "${APPDIR}/usr/bin/veluna"

if [ -f "packaging/veluna.desktop" ]; then
  install -Dm644 "packaging/veluna.desktop" "${APPDIR}/veluna.desktop"
  install -Dm644 "packaging/veluna.desktop" "${APPDIR}/usr/share/applications/veluna.desktop"
fi

if [ -f "assets/linux/icons/hicolor/512x512/apps/veluna.png" ]; then
  install -Dm644 "assets/linux/icons/hicolor/512x512/apps/veluna.png" "${APPDIR}/veluna.png"
  install -Dm644 "assets/linux/icons/hicolor/512x512/apps/veluna.png" "${APPDIR}/usr/share/icons/hicolor/512x512/apps/veluna.png"
fi

if [ -f "assets/linux/veluna.svg" ]; then
  install -Dm644 "assets/linux/veluna.svg" "${APPDIR}/usr/share/icons/hicolor/scalable/apps/veluna.svg"
fi

cat <<'EOF' > "${APPDIR}/AppRun"
#!/bin/sh
HERE="$(dirname "$(readlink -f "${0}")")"
export PATH="${HERE}/usr/bin:${PATH}"
export LD_LIBRARY_PATH="${HERE}/usr/lib:${LD_LIBRARY_PATH}"
export XDG_DATA_DIRS="${HERE}/usr/share:${XDG_DATA_DIRS}"
exec "${HERE}/usr/bin/veluna" "$@"
EOF
chmod +x "${APPDIR}/AppRun"

if ! command -v appimagetool >/dev/null 2>&1; then
  echo "==> Downloading appimagetool..."
  curl -sSL "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage" -o "${BUILD_DIR}/appimagetool"
  chmod +x "${BUILD_DIR}/appimagetool"
  (cd "${BUILD_DIR}" && ./appimagetool --appimage-extract >/dev/null 2>&1)
  TOOL_CMD="${BUILD_DIR}/squashfs-root/AppRun"
else
  TOOL_CMD="appimagetool"
fi

OUTPUT_FILE="veluna-${VERSION}-x86_64.AppImage"
OUTPUT_PATH="${ROOT_DIR}/${OUTPUT_FILE}"

ARCH=x86_64 "${TOOL_CMD}" --no-appstream "${APPDIR}" "${OUTPUT_PATH}"

echo "==> Successfully created AppImage: ${OUTPUT_FILE}"
