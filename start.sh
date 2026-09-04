#!/bin/zsh

# ─────────────────────────────────────────────────────────────
#  PinCode Explorer — Enhanced Start Script
#  - Pre-flight checks (Node.js, npm, .env, dependencies)
#  - Clean port & process management (SIGTERM -> SIGKILL)
#  - Log redirection to /tmp/pincode_{backend,frontend}.log
#  - HTTP /health probe verification
#  - Automatic browser launch
# ─────────────────────────────────────────────────────────────

BACKEND_PORT=5001
FRONTEND_PORT=5173
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_LOG="/tmp/pincode_backend.log"
FRONTEND_LOG="/tmp/pincode_frontend.log"
PID_FILE="/tmp/pincode.pids"

# ── Colours ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Check command line flags
OPEN_BROWSER=true
for arg in "$@"; do
  case $arg in
    --no-browser|--no-open|-n)
      OPEN_BROWSER=false
      ;;
  esac
done

echo ""
echo "${CYAN}${BOLD}🚀 PinCode Explorer — Startup Script${NC}"
echo "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Step 0: Pre-flight checks ─────────────────────────────────
echo "${BOLD}[1/4] Running pre-flight environment checks...${NC}"

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "${RED}✗ Node.js is not installed or not in your PATH.${NC}"
  echo "  Please install Node.js (v18+ recommended): https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -v | tr -d 'v' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "${YELLOW}⚠️  Node.js $(node -v) detected. v18+ is recommended for optimal compatibility.${NC}"
else
  echo "${GREEN}✓ Node.js $(node -v) detected${NC}"
fi

# Check npm
if ! command -v npm >/dev/null 2>&1; then
  echo "${RED}✗ npm is not installed or not in your PATH.${NC}"
  exit 1
fi

# Check server .env
if [ ! -f "$PROJECT_DIR/server/.env" ]; then
  if [ -f "$PROJECT_DIR/server/.env.example" ]; then
    echo "${YELLOW}⚠️  server/.env missing. Creating from server/.env.example...${NC}"
    cp "$PROJECT_DIR/server/.env.example" "$PROJECT_DIR/server/.env"
  else
    echo "${YELLOW}⚠️  server/.env missing. Server may need configuration.${NC}"
  fi
fi

# Check if API key is configured
if [ -f "$PROJECT_DIR/server/.env" ]; then
  if grep -Eq 'GOOGLE_SERVER_API_KEY=(your_server_key_here|$)' "$PROJECT_DIR/server/.env" 2>/dev/null; then
    echo "${YELLOW}⚠️  Notice: GOOGLE_SERVER_API_KEY in server/.env is empty or using placeholder.${NC}"
  else
    echo "${GREEN}✓ Backend configuration found${NC}"
  fi
fi

# Check client dependencies
if [ ! -d "$PROJECT_DIR/client/node_modules" ]; then
  echo "${YELLOW}📦 client/node_modules missing. Running npm install...${NC}"
  (cd "$PROJECT_DIR/client" && npm install) || { echo "${RED}✗ Failed to install client dependencies${NC}"; exit 1; }
fi

# Check server dependencies
if [ ! -d "$PROJECT_DIR/server/node_modules" ]; then
  echo "${YELLOW}📦 server/node_modules missing. Running npm install...${NC}"
  (cd "$PROJECT_DIR/server" && npm install) || { echo "${RED}✗ Failed to install server dependencies${NC}"; exit 1; }
fi

echo "${GREEN}✓ Pre-flight checks passed${NC}"
echo ""

# ── Step 1: Kill processes on ports / old PIDs ────────────────
echo "${BOLD}[2/4] Ensuring ports are free...${NC}"

# Clean up stale recorded PIDs if any
if [ -f "$PID_FILE" ]; then
  while IFS= read -r pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill -15 "$pid" 2>/dev/null
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

kill_port() {
  local PORT=$1
  local PIDS
  # Using -n -P avoids DNS lookup stalls on macOS
  PIDS=$(lsof -n -P -ti tcp:"$PORT" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    local PIDS_FMT=$(echo "$PIDS" | tr '\n' ' ')
    echo "${YELLOW}⚡ Freeing port $PORT (stopping PID: $PIDS_FMT)...${NC}"
    echo "$PIDS" | xargs kill -15 2>/dev/null
    sleep 0.8
    local REMAINING=$(lsof -n -P -ti tcp:"$PORT" 2>/dev/null)
    if [ -n "$REMAINING" ]; then
      echo "$REMAINING" | xargs kill -9 2>/dev/null
    fi
    echo "${GREEN}✓ Port $PORT is now free${NC}"
  else
    echo "${GREEN}✓ Port $PORT is already free${NC}"
  fi
}

kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT
echo ""

# ── Step 2: Initialize logs and launch Backend ────────────────
echo "${BOLD}[3/4] Starting backend server (port $BACKEND_PORT)...${NC}"
echo "=== PinCode Explorer Backend Log [$(date)] ===" > "$BACKEND_LOG"

cd "$PROJECT_DIR/server" || { echo "${RED}✗ Cannot find server directory${NC}"; exit 1; }
node index.js >> "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# Wait for backend health endpoint to respond (up to 40 seconds)
WAITED=0
BACKEND_READY=0
while [ $WAITED -lt 80 ]; do
  if curl -sf "http://127.0.0.1:$BACKEND_PORT/health" > /dev/null 2>&1 || curl -sf "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
    BACKEND_READY=1
    break
  fi
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    break
  fi
  sleep 0.5
  WAITED=$((WAITED + 1))
done

if [ $BACKEND_READY -ne 1 ]; then
  echo "${RED}✗ Backend failed to start properly (PID: $BACKEND_PID).${NC}"
  echo "${YELLOW}── Last log entries ($BACKEND_LOG) ────────────────${NC}"
  tail -n 20 "$BACKEND_LOG" 2>/dev/null
  echo "${YELLOW}────────────────────────────────────────────────────────${NC}"
  kill -9 $BACKEND_PID 2>/dev/null
  exit 1
fi

echo "${GREEN}✓ Backend running & healthy — http://localhost:$BACKEND_PORT (PID: $BACKEND_PID)${NC}"
echo ""

# ── Step 3: Launch Frontend ───────────────────────────────────
echo "${BOLD}[4/4] Starting frontend dev server (port $FRONTEND_PORT)...${NC}"
echo "=== PinCode Explorer Frontend Log [$(date)] ===" > "$FRONTEND_LOG"

cd "$PROJECT_DIR/client" || { echo "${RED}✗ Cannot find client directory${NC}"; exit 1; }
node "$PROJECT_DIR/client/node_modules/vite/bin/vite.js" >> "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

# Save active PIDs for stop.sh
echo "$BACKEND_PID" > "$PID_FILE"
echo "$FRONTEND_PID" >> "$PID_FILE"

# Wait for frontend dev server to bind port (up to 60 seconds)
WAITED=0
FRONTEND_READY=0
while [ $WAITED -lt 120 ]; do
  if lsof -n -P -iTCP:$FRONTEND_PORT -sTCP:LISTEN > /dev/null 2>&1 || curl -sf "http://127.0.0.1:$FRONTEND_PORT" > /dev/null 2>&1; then
    FRONTEND_READY=1
    break
  fi
  if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    break
  fi
  sleep 0.5
  WAITED=$((WAITED + 1))
done

if [ $FRONTEND_READY -ne 1 ]; then
  echo "${RED}✗ Frontend dev server failed to start (PID: $FRONTEND_PID).${NC}"
  echo "${YELLOW}── Last log entries ($FRONTEND_LOG) ───────────────${NC}"
  tail -n 20 "$FRONTEND_LOG" 2>/dev/null
  echo "${YELLOW}────────────────────────────────────────────────────────${NC}"
  "$PROJECT_DIR/stop.sh" -q > /dev/null 2>&1
  exit 1
fi

echo "${GREEN}✓ Frontend running — http://localhost:$FRONTEND_PORT (PID: $FRONTEND_PID)${NC}"
echo ""

# ── Summary ───────────────────────────────────────────────────
echo "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${GREEN}${BOLD}✅ All servers successfully running!${NC}"
echo ""
echo "  📡 Backend API  →  ${BOLD}http://localhost:$BACKEND_PORT${NC} (Health: /health)"
echo "  🌐 Web Client   →  ${BOLD}http://localhost:$FRONTEND_PORT${NC}"
echo ""
echo "  📄 Live Logs:"
echo "     Backend  →  ${DIM}tail -f $BACKEND_LOG${NC}"
echo "     Frontend →  ${DIM}tail -f $FRONTEND_LOG${NC}"
echo ""
echo "  🛑 Stop command: ${YELLOW}./stop.sh${NC}"
echo "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Open browser ──────────────────────────────────────────────
if [ "$OPEN_BROWSER" = true ]; then
  sleep 0.5
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:$FRONTEND_PORT"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:$FRONTEND_PORT"
  fi
fi
