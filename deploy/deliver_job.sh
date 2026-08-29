#!/usr/bin/env bash
# Local stand-in for the Pub/Sub push subscription: hand one job to the worker.
#   bash deploy/deliver_job.sh <job_id> [worker_url]
set -euo pipefail
JOB_ID="${1:?usage: deliver_job.sh <job_id> [worker_url]}"
WORKER="${2:-http://localhost:8081}"
DATA=$(printf '{"job_id":"%s"}' "$JOB_ID" | base64 | tr -d '\n')
curl -s -X POST "$WORKER/pubsub" \
  -H "content-type: application/json" \
  -d "{\"message\":{\"data\":\"$DATA\"}}"
echo
