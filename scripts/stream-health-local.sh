#!/usr/bin/env bash
# The half of the nightly `stream-health.yml` that a GitHub runner cannot answer: does a track
# still resolve to a URL that serves the whole file, and is rustypipe's fallback URL fetchable.
#
# WHY THIS IS NOT IN CI: YouTube answers `/player` from an Actions runner with UNPLAYABLE "Sign in
# to confirm you're not a bot", and rustypipe's resolve with the same sentence, because those
# runners sit in Azure ranges. The runner bootstraps a valid visitorData and is refused anyway, so
# no amount of session work fixes it. A home connection gets the real answer, which is also the
# answer the users get. The other four live tests are IP-agnostic and stay in the workflow.
#
#   scripts/stream-health-local.sh            # run once, notify only if something broke
#   scripts/stream-health-local.sh --install  # set up the daily systemd user timer
#   systemctl --user list-timers veluna-stream-health.timer
#
# Full output of the last run is kept at ~/.local/state/veluna/stream-health.log.
#
# ponytail: a timer and notify-send, no alerting stack. It runs on the machine that would ship the
# fix anyway. If this ever needs to reach you when you are away from it, the lazy upgrade is a
# `gh issue create` in the red branch, not a service.
set -uo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOG="${XDG_STATE_HOME:-$HOME/.local/state}/veluna/stream-health.log"
UNITS="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

if [[ "${1:-}" == "--install" ]]; then
  mkdir -p "$UNITS"
  cat > "$UNITS/veluna-stream-health.service" <<EOF
[Unit]
Description=Veluna: can YouTube still stream a whole track
After=network-online.target

[Service]
Type=oneshot
ExecStart=$REPO/scripts/stream-health-local.sh
EOF
  cat > "$UNITS/veluna-stream-health.timer" <<'EOF'
[Unit]
Description=Daily Veluna stream health check

[Timer]
OnCalendar=daily
# Persistent so a machine that was off at the scheduled time runs the check after the next login,
# which is also when a desktop notification can actually be seen.
Persistent=true
RandomizedDelaySec=15m

[Install]
WantedBy=timers.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now veluna-stream-health.timer
  systemctl --user list-timers --no-pager veluna-stream-health.timer
  exit 0
fi

# A laptop on a captive portal or with no network would fail both tests and report a YouTube
# breakage that never happened. That false red is the exact thing this split exists to avoid, so
# an unreachable YouTube is "no answer today", not "red".
if ! curl -sf -o /dev/null --max-time 20 https://music.youtube.com/sw.js_data; then
  echo "youtube unreachable, skipping" >&2
  exit 0
fi

mkdir -p "$(dirname "$LOG")"
{ date -Is; git -C "$REPO" rev-parse --short HEAD; } > "$LOG"

cd "$REPO" || exit 1
cargo test -p innertube --features integration-tests --test live_smoke -- \
  --nocapture direct_clients_resolve_and_stream rustypipe_url_is_fetchable >> "$LOG" 2>&1
status=$?

tail -n 30 "$LOG"
[[ $status -eq 0 ]] && exit 0

# The test's own panic message names which leg of the chain went, so it is the whole notification.
why=$(grep -m3 -E '^(VISIONOS|rustypipe resolve)' "$LOG" | tr '\n' ' ')
notify-send -u critical "Veluna: YouTube stream check failed" \
  "${why:-see $LOG}" 2>/dev/null
exit "$status"
