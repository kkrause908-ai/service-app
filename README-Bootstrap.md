# Local bootstrap instructions

This repository includes a small bootstrap to install Node.js, dependencies and prepare the environment on both POSIX (Linux/macOS) and Windows.

Prerequisites:
- OS with Bash (Linux/macOS or Windows with Git Bash/MSYS2/WSL) for the POSIX script.
- Optionally Docker for an isolated environment with DB.
- Administrative rights may be required to install system packages on Windows.

POSIX (Linux/macOS) bootstrap:
- Run: bash scripts/bootstrap.sh
- Answer prompts: choose whether to start via Docker (optional) and whether to proceed with Node/NVM install.
- After completion, run: npm run dev

Windows bootstrap:
- Run Windows PowerShell as Administrator and execute:
  - For Node installation: scripts/windows/bootstrap.ps1
- After completion: npm run dev

- Environment:
  - A .env or .env.sample in repo with DATABASE_URL and JWT_SECRET. You can copy .env.sample to .env and customize values.

Docker option:
- If you prefer Docker, use docker-compose.yml and run: docker-compose up --build
- This will boot Postgres DB and the backend API inside containers.

Notes:
- The bootstrap scripts are safe to run multiple times; re-running will skip already installed parts.
- If you run into permissions errors on Windows regarding TLS or script execution, ensure PowerShell execution policy allows running scripts (Set-ExecutionPolicy Bypass -Scope Process -Force).
