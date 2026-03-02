<# Windows bootstrap script to install Node.js (via Chocolatey), install dependencies, and prepare env #>
Param()
Set-ExecutionPolicy Bypass -Scope Process -Force

Write-Host "Bootstrapping Service App on Windows..."

if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
  Write-Host "Chocolatey not found. Installing Chocolatey..."
  Set-ExecutionPolicy Bypass -Scope Process -Force
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
  iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
}

Write-Host "Installing Node.js LTS..."
choco install -y nodejs-lts

Write-Host "Installing npm dependencies..."
cd ${PSScriptRoot}\..
npm install

if (-not (Test-Path .env) -and (Test-Path .env.sample)) {
  Copy-Item .env.sample .env -Force
  Write-Host ".env created from .env.sample. Please customize DATABASE_URL and JWT_SECRET if needed."
}

Write-Host "Bootstrap complete. You can start the app with: npm run dev"
