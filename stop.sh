#!/bin/zsh

# ─────────────────────────────────────────────────────────────
#  PinCode Explorer — Stop Script
#  Kills all processes on ports 5001 & 5173
# ─────────────────────────────────────────────────────────────

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "${CYAN}${BOLD}🛑 PinCode Explorer — Stopping all servers${NC}"
echo "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

kill_port() {
  local PORT=$1
  local PIDS
  PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "${YELLOW}⚡ Killing process(es) on port $PORT (PID: $PIDS)...${NC}"
    echo "$PIDS" | xargs kill -9 2>/dev/null
    echo "${GREEN}✓ Port $PORT freed${NC}"
  else
    echo "${GREEN}✓ Nothing running on port $PORT${NC}"
  fi
}

kill_port 5001
kill_port 5173

echo ""
echo "${GREEN}${BOLD}✅ All servers stopped.${NC}"
echo ""
