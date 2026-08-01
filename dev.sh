#!/usr/bin/env bash
# One-command local dev startup: Postgres container + API server + frontend.
# Usage: ./dev.sh
set -e

cd "$(dirname "$0")"

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/supply_chain"
export PORT=8080
export NODE_ENV=development
export AI_INTEGRATIONS_OPENAI_BASE_URL="https://api.openai.com/v1"
export AI_INTEGRATIONS_OPENAI_API_KEY="${AI_INTEGRATIONS_OPENAI_API_KEY:-placeholder-not-set}"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-1fa2ea5c0921937aa643f0da750a4bd60fd81aedab06f26f622ff3ae9917a317}"

# Make sure Postgres is up.
if ! docker ps --format '{{.Names}}' | grep -q '^scf-postgres$'; then
  if docker ps -a --format '{{.Names}}' | grep -q '^scf-postgres$'; then
    docker start scf-postgres
  else
    docker run --name scf-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=supply_chain -p 5432:5432 -d postgres:16
    sleep 3
  fi
fi

cleanup() {
  echo ""
  echo "Stopping API server and frontend..."
  kill 0
}
trap cleanup EXIT INT TERM

echo "Starting API server on :8080..."
pnpm --filter @workspace/api-server run dev &

sleep 2

echo "Starting frontend on :21927..."
PORT=21927 BASE_PATH=/ pnpm --filter @workspace/supply-chain-dashboard run dev &

wait