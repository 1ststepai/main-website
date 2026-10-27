# PostPath by 1stStep.ai — Windows launcher
# Double-click Open-PostPath.bat, or run this script in PowerShell.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Show-NodeRequired {
  param([string]$Detail)
  Write-Host ""
  Write-Host "PostPath needs Node.js 20 or newer." -ForegroundColor Yellow
  if ($Detail) { Write-Host $Detail -ForegroundColor Yellow }
  Write-Host "Download the LTS installer from https://nodejs.org" -ForegroundColor Yellow
  Write-Host "Then close this window and run Open-PostPath.bat again." -ForegroundColor Yellow
  Write-Host ""
  try { Start-Process "https://nodejs.org" } catch { }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Show-NodeRequired "Node.js was not found on PATH."
  exit 1
}

try {
  $raw = (& node -v 2>$null)
  if (-not $raw) { throw "empty version" }
  $major = [int](($raw -replace '^v', '').Split('.')[0])
} catch {
  Show-NodeRequired "Could not read the Node.js version."
  exit 1
}

if ($major -lt 20) {
  Show-NodeRequired "Found Node.js $raw — PostPath requires 20+."
  exit 1
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "First run: installing dependencies (this may take a minute)..."
  try {
    npm install
  } catch {
    Write-Host ""
    Write-Host "Dependency install failed. Check your network, then try again." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
  }
}

Write-Host "Starting PostPath by 1stStep.ai (Node $raw)..."
try {
  node .\bin\social-mcp.js app
} catch {
  Write-Host ""
  Write-Host "PostPath could not start." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "From this folder you can also run: npm start" -ForegroundColor Yellow
  exit 1
}
