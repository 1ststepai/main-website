# PostPath by 1stStep.ai — Windows launcher
# Double-click Open-PostPath.bat, or run this script in PowerShell.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is required. Install from https://nodejs.org and try again."
  exit 1
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "Installing dependencies..."
  npm install
}

Write-Host "Starting PostPath by 1stStep.ai..."
node .\bin\social-mcp.js app
