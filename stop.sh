#!/bin/zsh

# ─────────────────────────────────────────────────────────────
#  PinCode Explorer — Stop Script
#  - Graceful termination (SIGTERM -> SIGKILL)
#  - Cleans up via recorded PIDs and ports (5001 & 5173)
#  - Cleans up temporary PID tracking files
# ─────────────────────────────────────────────────────────────

BACKEND_PORT=5001
FRONTEND_PORT=5173
PID_FILE="/tmp/pincode.pids"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

QUIET=false
for arg in "$@"; do
  case $arg in
    --quiet|-q)
      QUIET=true
      ;;
  esac
done

if [ "$QUIET" = false ]; then
  echo ""
  echo "${CYAN}${BOLD}🛑 PinCode Explorer — Stopping all servers${NC}"
  echo "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
fi

# Step 1: Kill tracked PIDs from PID file
if [ -f "$PID_FILE" ]; then
  while IFS= read -r pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      if [ "$QUIET" = false ]; then
        echo "${YELLOW}⚡ Terminating tracked process PID $pid...${NC}"
      fi
      kill -15 "$pid" 2>/dev/null
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

# Step 2: Gracefully free ports (using -n -P for instant lookups without DNS delays)
kill_port() {
  local PORT=$1
  local PIDS
  PIDS=$(lsof -n -P -ti tcp:"$PORT" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    local PIDS_FMT=$(echo "$PIDS" | tr '\n' ' ')
    if [ "$QUIET" = false ]; then
      echo "${YELLOW}⚡ Stopping process(es) on port $PORT (PID: $PIDS_FMT)...${NC}"
    fi
    # Graceful SIGTERM
    echo "$PIDS" | xargs kill -15 2>/dev/null
    sleep 0.8
    # Force SIGKILL if still holding port
    local REMAINING=$(lsof -n -P -ti tcp:"$PORT" 2>/dev/null)
    if [ -n "$REMAINING" ]; then
      echo "$REMAINING" | xargs kill -9 2>/dev/null
    fi
    if [ "$QUIET" = false ]; then
      echo "${GREEN}✓ Port $PORT freed${NC}"
    fi
  else
    if [ "$QUIET" = false ]; then
      echo "${GREEN}✓ Nothing running on port $PORT${NC}"
    fi
  fi
}

kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT

if [ "$QUIET" = false ]; then
  echo ""
  echo "${GREEN}${BOLD}✅ All servers stopped successfully.${NC}"
  echo ""
fi
