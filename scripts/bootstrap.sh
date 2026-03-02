#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
echo "Bootstrapping Service App Backend on POSIX..."

if command -v docker >/dev/null 2>&1; then
  read -p "Docker detected. Start via Docker Compose? (y/N) " USE_DOCKER
  if [[ "$USE_DOCKER" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Starting services with Docker..."
    docker-compose up --build -d
    echo "Apps are starting. Access http://localhost:3000/"
    exit 0
  fi
fi

echo "Installing Node.js via NVM (recommended)."
if ! command -v bash >/dev/null 2>&1; then
  echo "This script requires Bash. Please run on a shell with Bash support (e.g., Git Bash, WSL, macOS/Linux)."
  exit 1
fi

if ! command -v nvm >/dev/null 2>&1; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi

if command -v nvm >/dev/null 2>&1; then
  nvm install --lts
  nvm use --lts
else
  echo "NVM installation failed. Aborting. Install Node.js manually and re-run this script."
  exit 1
fi

echo "Installing project dependencies..."
cd "$ROOT_DIR"
npm install

if [ ! -f .env ]; then
  if [ -f .env.sample ]; then
    cp .env.sample .env
    echo ".env created from .env.sample. Please customize DATABASE_URL and JWT_SECRET if needed."
  else
    echo "No .env.sample found. Create a .env with DATABASE_URL and JWT_SECRET."
  fi
fi

echo "Bootstrap complete. Start the app with: npm run dev (dev) or npm run start (prod)."
