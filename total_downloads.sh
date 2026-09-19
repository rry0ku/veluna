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
  for ((i = 1; i <= tries; i++)); do
    if resp=$(curl -s -w "\n%{http_code}" "$url"); then
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
  echo "$1" | jq --arg p "$2" '[.[] | select(.name | test($p)) | .download_count] | add // 0'
}

print_breakdown() {
  local data="$1"
  local total windows debian fedora arch categorized other

  total=$(echo "$data" | jq '[.[].download_count] | add // 0')
  windows=$(sum_by_pattern "$data" '\.exe$')
  debian=$(sum_by_pattern "$data" '\.deb$')
  fedora=$(sum_by_pattern "$data" '\.rpm$')
  arch=$(sum_by_pattern "$data" '\.pkg\.tar\.(zst|xz)$')

  categorized=$((windows + debian + fedora + arch))
  other=$((total - categorized))

  echo "  Total: $total"
  echo "  Windows: $windows"
  echo "  Debian: $debian"
  echo "  Fedora: $fedora"
  echo "  Arch: $arch"
  if [ "$other" -gt 0 ]; then
    echo "  Other: $other"
  fi
}

releases=$(fetch_all_releases)

if [ "$(echo "$releases" | jq 'length')" -eq 0 ]; then
  echo "No releases found for $REPO"
  exit 0
fi

echo "=== Lifetime ==="
all_data=$(echo "$releases" | jq '[.[].assets[]? | select(.name != "binaries.zip")]')
print_breakdown "$all_data"
echo

echo "=== Per Release ==="
echo "$releases" | jq -c '.[]' | while read -r rel; do
  tag=$(echo "$rel" | jq -r '.tag_name')
  rel_data=$(echo "$rel" | jq '[.assets[]? | select(.name != "binaries.zip")]')
  rel_total=$(echo "$rel_data" | jq '[.[].download_count] | add // 0')
  echo "$tag: $rel_total downloads"
done
