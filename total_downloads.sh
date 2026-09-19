#!/usr/bin/env bash
curl -s https://api.github.com/repos/rry0ku/veluna/releases | jq '[.[].assets[] | select(.name != "binaries.zip") | .download_count] | add'
