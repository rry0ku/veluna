#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"

VERSION="${1:-}"
if [ -z "${VERSION}" ]; then
  if [ -f "package.json" ]; then
    VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "0.1.6")
  else
    VERSION="0.1.6"
  fi
fi

VERSION="${VERSION#v}"

BINARY_PATH="src-tauri/target/release/veluna"

if [ ! -f "${BINARY_PATH}" ]; then
  echo "Error: Binary not found at ${BINARY_PATH}." >&2
  echo "Please build the Tauri release binary first ('npm run tauri build' or 'cargo build --release --manifest-path src-tauri/Cargo.toml')." >&2
  exit 1
fi

echo "==> Building Arch Linux package (.pkg.tar.zst) for Veluna v${VERSION}..."

BUILD_DIR=$(mktemp -d)
PKG_DIR="${BUILD_DIR}/pkg"

cleanup() {
  rm -rf "${BUILD_DIR}"
}
trap cleanup EXIT

mkdir -p "${PKG_DIR}/usr/bin"
mkdir -p "${PKG_DIR}/usr/share/applications"
mkdir -p "${PKG_DIR}/usr/share/icons/hicolor/32x32/apps"
mkdir -p "${PKG_DIR}/usr/share/icons/hicolor/128x128/apps"
mkdir -p "${PKG_DIR}/usr/share/icons/hicolor/256x256/apps"
mkdir -p "${PKG_DIR}/usr/share/licenses/veluna"

install -Dm755 "${BINARY_PATH}" "${PKG_DIR}/usr/bin/veluna"

if [ -f "packaging/veluna.desktop" ]; then
  install -Dm644 "packaging/veluna.desktop" "${PKG_DIR}/usr/share/applications/veluna.desktop"
fi

if [ -f "src-tauri/icons/32x32.png" ]; then
  install -Dm644 "src-tauri/icons/32x32.png" "${PKG_DIR}/usr/share/icons/hicolor/32x32/apps/veluna.png"
fi
if [ -f "src-tauri/icons/128x128.png" ]; then
  install -Dm644 "src-tauri/icons/128x128.png" "${PKG_DIR}/usr/share/icons/hicolor/128x128/apps/veluna.png"
fi
if [ -f "src-tauri/icons/128x128@2x.png" ]; then
  install -Dm644 "src-tauri/icons/128x128@2x.png" "${PKG_DIR}/usr/share/icons/hicolor/256x256/apps/veluna.png"
fi

if [ -f "LICENSE" ]; then
  install -Dm644 "LICENSE" "${PKG_DIR}/usr/share/licenses/veluna/LICENSE"
fi

PKG_SIZE=$(du -sb "${PKG_DIR}" | awk '{print $1}')
BUILD_DATE=$(date +%s)

cat <<EOF >"${PKG_DIR}/.PKGINFO"
pkgname = veluna
pkgbase = veluna
pkgver = ${VERSION}-1
pkgdesc = Ad-free desktop music streaming powered by YouTube
url = https://github.com/rry0ku/veluna
builddate = ${BUILD_DATE}
packager = Veluna CI <https://github.com/rry0ku/veluna>
size = ${PKG_SIZE}
arch = x86_64
license = MIT
depend = mpv
depend = yt-dlp
depend = ffmpeg
depend = webkit2gtk-4.1
depend = libayatana-appindicator
depend = gtk3
depend = hicolor-icon-theme
EOF

if command -v bsdtar >/dev/null 2>&1; then
  TAR_CMD="bsdtar"
else
  TAR_CMD="tar"
fi

(cd "${PKG_DIR}" && "${TAR_CMD}" -czf .MTREE --format=mtree \
  --options='!all,use-set,type,uid,gid,mode,time,size,md5,sha256,link' \
  .PKGINFO usr 2>/dev/null || true)

OUTPUT_FILE="veluna-${VERSION}-1-x86_64.pkg.tar.zst"
OUTPUT_PATH="${ROOT_DIR}/${OUTPUT_FILE}"

if [ -f "${PKG_DIR}/.MTREE" ]; then
  (cd "${PKG_DIR}" && "${TAR_CMD}" -cf - .PKGINFO .MTREE usr | zstd -c -T0 -19 - >"${OUTPUT_PATH}")
else
  (cd "${PKG_DIR}" && "${TAR_CMD}" -cf - .PKGINFO usr | zstd -c -T0 -19 - >"${OUTPUT_PATH}")
fi

echo "==> Successfully created Arch Linux package: ${OUTPUT_FILE}"
