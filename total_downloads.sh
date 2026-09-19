#!/usr/bin/env bash

response=$(curl -s https://api.github.com/repos/rry0ku/veluna/releases)

if ! echo "$response" | jq -e . >/dev/null 2>&1; then
  echo "Error: invalid response from GitHub API"
  echo "$response"
  exit 1
fi

data=$(echo "$response" | jq '[.[].assets[] | select(.name != "binaries.zip")]')

total=$(echo "$data" | jq '[.[].download_count] | add // 0')
windows=$(echo "$data" | jq '[.[] | select(.name | test("\\.exe$")) | .download_count] | add // 0')
debian=$(echo "$data" | jq '[.[] | select(.name | test("\\.deb$")) | .download_count] | add // 0')
fedora=$(echo "$data" | jq '[.[] | select(.name | test("\\.rpm$")) | .download_count] | add // 0')
arch=$(echo "$data" | jq '[.[] | select(.name | test("\\.pkg\\.tar\\.(zst|xz)$")) | .download_count] | add // 0')

echo "Total downloads: $total"
echo "Windows: $windows"
echo "Debian: $debian"
echo "Fedora: $fedora"
echo "Arch: $arch"
