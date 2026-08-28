#!/usr/bin/env bash
# Copy the shared single-source-of-truth modules from backend/ into worker/ for
# LOCAL runs. (Docker builds do this in worker/Dockerfile; do not edit the copies.)
set -euo pipefail
cd "$(dirname "$0")/.."
for f in schemas.py config.py firestore.py google_apis.py localstore.py; do
  cp "backend/app/$f" "worker/app/$f"
done
echo "synced shared modules into worker/app/"
