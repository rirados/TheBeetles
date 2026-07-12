#!/usr/bin/env bash
# FloodGuardian - Quick Start (dev mode)
# Starts backend + frontend in parallel
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ---- Backend ----
echo "[1/2] Starting backend on :8000 ..."
cd backend
if [ ! -d ".venv" ]; then
  echo "  Creating Python venv ..."
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
python run.py &
BACKEND_PID=$!
cd "$ROOT"

# ---- Frontend ----
echo "[2/2] Starting frontend on :5173 ..."
cd frontend
if [ ! -d "node_modules" ]; then
  echo "  Installing npm dependencies ..."
  npm install
fi
npm run dev &
FRONTEND_PID=$!
cd "$ROOT"

# ---- Cleanup on exit ----
trap "echo; echo 'Shutting down ...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM EXIT

echo
echo "============================================================"
echo "  FloodGuardian is running!"
echo "  Citizen app:    http://localhost:5173/citizen"
echo "  Admin dashboard: http://localhost:5173/admin"
echo "  API docs:        http://localhost:8000/docs"
echo "============================================================"
echo

wait
