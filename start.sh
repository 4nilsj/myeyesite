#!/bin/zsh

# ─────────────────────────────────────────────────────────────
#  PinCode Explorer — Start Script
#  Kills anything on ports 5001 & 5173, then launches both
#  the backend API and the Vite frontend, and opens the browser.
# ─────────────────────────────────────────────────────────────

BACKEND_PORT=5001
FRONTEND_PORT=5173
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Colours ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "${CYAN}${BOLD}🚀 PinCode Explorer — Startup Script${NC}"
echo "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Step 1: Kill processes on ports ───────────────────────────
kill_port() {
  local PORT=$1
  local PIDS
  PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "${YELLOW}⚡ Killing process(es) on port $PORT (PID: $PIDS)...${NC}"
    echo "$PIDS" | xargs kill -9 2>/dev/null
    sleep 1
    echo "${GREEN}✓ Port $PORT is now free${NC}"
  else
    echo "${GREEN}✓ Port $PORT is already free${NC}"
  fi
}

echo "${BOLD}[1/3] Freeing ports...${NC}"
kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT
echo ""

# ── Step 2: Start Backend ─────────────────────────────────────
echo "${BOLD}[2/3] Starting backend server (port $BACKEND_PORT)...${NC}"
cd "$PROJECT_DIR/server" || { echo "${RED}✗ Cannot find server directory${NC}"; exit 1; }

node index.js &
BACKEND_PID=$!

# Wait for port to be bound (up to 12 seconds)
WAITED=0
until lsof -ti tcp:$BACKEND_PORT > /dev/null 2>&1; do
  if [ $WAITED -ge 24 ]; then
    echo "${RED}✗ Backend failed to start after 12 s (PID $BACKEND_PID).${NC}"
    exit 1
  fi
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "${RED}✗ Backend process exited unexpectedly.${NC}"
    exit 1
  fi
  sleep 0.5
  WAITED=$((WAITED + 1))
done

echo "${GREEN}✓ Backend running — http://localhost:$BACKEND_PORT  (PID: $BACKEND_PID)${NC}"
echo ""

# ── Step 3: Start Frontend ────────────────────────────────────
echo "${BOLD}[3/3] Starting frontend dev server (port $FRONTEND_PORT)...${NC}"
cd "$PROJECT_DIR/client" || { echo "${RED}✗ Cannot find client directory${NC}"; exit 1; }

npm run dev &
FRONTEND_PID=$!

# Wait for Vite's port to be bound (up to 20 seconds)
WAITED=0
until lsof -ti tcp:$FRONTEND_PORT > /dev/null 2>&1; do
  if [ $WAITED -ge 40 ]; then
    echo "${RED}✗ Frontend failed to start after 20 s (PID $FRONTEND_PID).${NC}"
    exit 1
  fi
  if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "${RED}✗ Frontend process exited unexpectedly.${NC}"
    exit 1
  fi
  sleep 0.5
  WAITED=$((WAITED + 1))
done

echo "${GREEN}✓ Frontend running — http://localhost:$FRONTEND_PORT  (PID: $FRONTEND_PID)${NC}"
echo ""

# ── Summary ───────────────────────────────────────────────────
echo "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${GREEN}${BOLD}✅ All servers running!${NC}"
echo ""
echo "  📡 Backend  →  http://localhost:$BACKEND_PORT"
echo "  🌐 Frontend →  http://localhost:$FRONTEND_PORT"
echo ""
echo "  💡 To view logs:"
echo "     Backend  →  tail -f /tmp/pincode_backend.log"
echo "     Frontend →  tail -f /tmp/pincode_frontend.log"
echo ""
echo "  To stop all servers:  ${YELLOW}./stop.sh${NC}"
echo "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Open browser ──────────────────────────────────────────────
sleep 0.5
open "http://localhost:$FRONTEND_PORT"
