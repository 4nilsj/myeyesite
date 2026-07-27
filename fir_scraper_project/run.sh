#!/usr/bin/env bash
# ============================================================
# FIR Scraper CLI
# Usage: ./run.sh [--station <name|id>] [--all] [<scraper args>]
#
# Station presets:
#   --station madbool    Police Station 717 (Madbool)       -> fir_ps717_XXXX.pdf
#   --station kalagi     Police Station 718 (Kalagi)        -> fir_ps718_XXXX.pdf
#   --station cybercrime Police Station 2256 (Cybercrime)   -> fir_ps2256_XXXX.pdf
#   --station <id>       Any raw numeric station ID
#   --all                Run for ALL three stations in sequence
#
# All other arguments are passed directly to fir_scraper.py
# Example:
#   ./run.sh --station kalagi --start-fir 1 --end-fir 50
#   ./run.sh --all --start-fir 1 --end-fir 10
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Activate venv ────────────────────────────────────────────
if [[ ! -d ".venv" ]]; then
  echo "[run.sh] Creating virtual environment..."
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt > /dev/null 2>&1 || true

# ── Station map ───────────────────────────────────────────────
STATION_NAMES=(
  "717:Madbool Station"
  "718:Kalagi Station"
  "2256:Cybercrime Station"
)

resolve_station() {
  local key="${1,,}"  # lowercase
  case "$key" in
    madbool|kgf|717) echo "717"  ;;
    kalagi|718)     echo "718"  ;;
    cybercrime|cyber|2256) echo "2256" ;;
    *)              echo "$1"   ;;  # pass through raw id
  esac
}

run_for_station() {
  local ps_id="$1"
  shift
  local label="$ps_id"
  for entry in "${STATION_NAMES[@]}"; do
    if [[ "${entry%%:*}" == "$ps_id" ]]; then
      label="${entry#*:} ($ps_id)"
      break
    fi
  done

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  📍 Station : $label"
  echo "  📄 Files   : fir_ps${ps_id}_XXXX.pdf"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  python3 fir_scraper.py --ps-id "$ps_id" "$@"
}

# ── Parse our flags before passing remaining args to scraper ──
RUN_ALL=false
STATION_ARG=""
PASSTHROUGH=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --station)
      STATION_ARG="$2"
      shift 2
      ;;
    --all)
      RUN_ALL=true
      shift
      ;;
    --help|-h)
      head -20 "$0" | grep "^#" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      PASSTHROUGH+=("$1")
      shift
      ;;
  esac
done

# ── Execute ───────────────────────────────────────────────────
if $RUN_ALL; then
  for entry in "${STATION_NAMES[@]}"; do
    ps_id="${entry%%:*}"
    run_for_station "$ps_id" "${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}"
  done
elif [[ -n "$STATION_ARG" ]]; then
  PS_ID=$(resolve_station "$STATION_ARG")
  run_for_station "$PS_ID" "${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}"
else
  # Fall back to .env FIR_PS_ID or default 717
  PS_ID="${FIR_PS_ID:-717}"
  echo "[run.sh] No --station flag set, using FIR_PS_ID=$PS_ID"
  run_for_station "$PS_ID" "${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}"
fi
