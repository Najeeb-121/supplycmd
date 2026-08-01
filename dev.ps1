# One-command local dev startup for Windows: Postgres container + API server + frontend.
# First run does `pnpm install` and pushes the DB schema too, so it works
# as a first-time setup script as well as every-day startup.
#
# Usage (PowerShell):
#   .\dev.ps1

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Test-CommandExists($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

if (-not (Test-CommandExists "pnpm")) {
    Write-Host "pnpm is not installed. Install it first: npm i -g pnpm (requires Node.js)" -ForegroundColor Red
    exit 1
}
if (-not (Test-CommandExists "docker")) {
    Write-Host "Docker is not installed or not on PATH. Install Docker Desktop first: https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
    exit 1
}

# --- Env vars (child windows inherit these automatically, no need to re-set them there) ---
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/supply_chain"
$env:PORT = "8080"
$env:NODE_ENV = "development"
$env:AI_INTEGRATIONS_OPENAI_BASE_URL = "https://api.openai.com/v1"
if (-not $env:AI_INTEGRATIONS_OPENAI_API_KEY) { $env:AI_INTEGRATIONS_OPENAI_API_KEY = "placeholder-not-set" }
if (-not $env:ENCRYPTION_KEY) { $env:ENCRYPTION_KEY = "1fa2ea5c0921937aa643f0da750a4bd60fd81aedab06f26f622ff3ae9917a317" }

# --- Install dependencies ---
Write-Host "Installing dependencies (pnpm install)..." -ForegroundColor Cyan
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "pnpm install failed (exit code $LASTEXITCODE) — fix the error above before continuing." -ForegroundColor Red
    exit 1
}

# --- Make sure Postgres is up ---
$running = docker ps --format "{{.Names}}" | Select-String -Pattern "^scf-postgres$"
if (-not $running) {
    $exists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^scf-postgres$"
    if ($exists) {
        Write-Host "Starting existing scf-postgres container..." -ForegroundColor Cyan
        docker start scf-postgres
    } else {
        Write-Host "Creating scf-postgres container..." -ForegroundColor Cyan
        docker run --name scf-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=supply_chain -p 5432:5432 -d postgres:16
        Start-Sleep -Seconds 5
    }
}

# --- Push DB schema (safe to run every time) ---
Write-Host "Pushing DB schema..." -ForegroundColor Cyan
pnpm --filter @workspace/db run push
if ($LASTEXITCODE -ne 0) {
    Write-Host "DB schema push failed (exit code $LASTEXITCODE) — fix the error above before continuing." -ForegroundColor Red
    exit 1
}

# --- Start API server and frontend, each in its own window ---
# Using -WorkingDirectory (not an embedded `cd '...'` string) so this
# works even when the folder path itself contains a quote character.
Write-Host "Starting API server on :8080 in a new window..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList @(
    "-NoExit", "-Command", "pnpm --filter @workspace/api-server run dev"
)

Start-Sleep -Seconds 2

# Frontend needs different PORT/BASE_PATH — update env here, then spawn.
# The new process inherits the environment at the moment it's created.
$env:PORT = "21927"
$env:BASE_PATH = "/"

Write-Host "Starting frontend on :21927 in a new window..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList @(
    "-NoExit", "-Command", "pnpm --filter @workspace/supply-chain-dashboard run dev"
)

Write-Host ""
Write-Host "Both servers are starting in separate windows." -ForegroundColor Green
Write-Host "Once ready, open http://localhost:21927" -ForegroundColor Green
Write-Host "Close those two windows (or Ctrl+C in each) to stop them." -ForegroundColor Green