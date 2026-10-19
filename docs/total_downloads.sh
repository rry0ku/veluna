#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-rry0ku/veluna}"
API="https://api.github.com/repos/${REPO}/releases"

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: $cmd is required but not installed" >&2
    exit 1
  fi
done

curl_with_retry() {
  local url="$1"
  local tries=3
  local delay=2
  local resp
  local -a headers=(-s -w "\n%{http_code}")
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    headers+=(-H "Authorization: Bearer $GITHUB_TOKEN")
  fi

  for ((i = 1; i <= tries; i++)); do
    if resp=$(curl "${headers[@]}" "$url"); then
      echo "$resp"
      return 0
    fi
    sleep "$delay"
    delay=$((delay * 2))
  done
  echo "Error: failed to reach GitHub API after $tries attempts" >&2
  exit 1
}

fetch_all_releases() {
  local page=1
  local all="[]"
  while true; do
    local resp http_code body count
    resp=$(curl_with_retry "${API}?per_page=100&page=${page}")
    http_code=$(echo "$resp" | tail -n1)
    body=$(echo "$resp" | sed '$d')

    if [ "$http_code" != "200" ]; then
      echo "Error: GitHub API returned HTTP $http_code" >&2
      echo "$body" | jq -r '.message // .' 2>/dev/null >&2 || echo "$body" >&2
      exit 1
    fi

    if ! echo "$body" | jq -e . >/dev/null 2>&1; then
      echo "Error: received invalid JSON from GitHub API" >&2
      exit 1
    fi

    count=$(echo "$body" | jq 'length')
    [ "$count" -eq 0 ] && break

    all=$(jq -s '.[0] + .[1]' <(echo "$all") <(echo "$body"))
    [ "$count" -lt 100 ] && break
    page=$((page + 1))
  done
  echo "$all"
}

sum_by_pattern() {
  echo "$1" | jq --arg p "$2" '[.[] | select(.name | test($p; "i")) | .download_count] | add // 0'
}

print_breakdown() {
  local data="$1"
  local total appimage debian fedora arch win_exe win_msi macos_dmg macos_tar
  local windows linux macos categorized other

  total=$(echo "$data" | jq '[.[].download_count] | add // 0')

  # Linux formats
  appimage=$(sum_by_pattern "$data" '\.appimage(\.tar\.gz)?$')
  debian=$(sum_by_pattern "$data" '\.deb$')
  fedora=$(sum_by_pattern "$data" '\.rpm$')
  arch=$(sum_by_pattern "$data" '\.pkg\.tar\.(zst|xz)$')
  linux=$((appimage + debian + fedora + arch))

  # Windows formats
  win_exe=$(sum_by_pattern "$data" '\.exe$')
  win_msi=$(sum_by_pattern "$data" '\.msi$')
  windows=$((win_exe + win_msi))

  # macOS formats
  macos_dmg=$(sum_by_pattern "$data" '\.dmg$')
  macos_tar=$(sum_by_pattern "$data" '\.app\.tar\.gz$')
  macos=$((macos_dmg + macos_tar))

  categorized=$((linux + windows + macos))
  other=$((total - categorized))

  echo "  Total: $total"
  echo "  Linux: $linux"
  echo "    AppImage: $appimage"
  echo "    Debian (.deb): $debian"
  echo "    Fedora (.rpm): $fedora"
  echo "    Arch (.pkg.tar.zst): $arch"
  echo "  Windows: $windows"
  echo "    Installer (.exe): $win_exe"
  echo "    MSI (.msi): $win_msi"
  echo "  macOS: $macos"
  echo "    Disk Image (.dmg): $macos_dmg"
  if [ "$macos_tar" -gt 0 ]; then
    echo "    Archive (.app.tar.gz): $macos_tar"
  fi
  if [ "$other" -gt 0 ]; then
    echo "  Other: $other"
  fi
}

releases=$(fetch_all_releases)

if [ "$(echo "$releases" | jq 'length')" -eq 0 ]; then
  echo "No releases found for $REPO"
  exit 0
fi

# Filter pattern to ignore updater signatures, manifests, and internal updater archives
IGNORE_PATTERN='\.(sig)$|latest\.json$|binaries\.zip$|\.nsis\.zip$'

echo "=== Lifetime ==="
all_data=$(echo "$releases" | jq --arg pat "$IGNORE_PATTERN" '[.[].assets[]? | select(.name | test($pat; "i") | not)]')
print_breakdown "$all_data"
echo

echo "=== Per Release ==="
echo "$releases" | jq -r --arg pat "$IGNORE_PATTERN" '
  .[] |
  "\(.tag_name): \([.assets[]? | select(.name | test($pat; "i") | not) | .download_count] | add // 0) downloads"
'
