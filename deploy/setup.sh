#!/usr/bin/env bash
# One-time Google Cloud project setup for Deckhand.
# Prereqs: gcloud CLI authenticated (gcloud auth login), deploy/vars.env filled in.
set -euo pipefail
source "$(dirname "$0")/vars.env"

gcloud config set project "$PROJECT_ID"

echo "--- Enabling APIs ---"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  pubsub.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  drive.googleapis.com docs.googleapis.com sheets.googleapis.com \
  slides.googleapis.com gmail.googleapis.com calendar-json.googleapis.com \
  tasks.googleapis.com \
  cloudtrace.googleapis.com

echo "--- Firestore (native mode) ---"
gcloud firestore databases create --location="$REGION" --type=firestore-native || true

echo "--- Cloud Storage bucket ---"
gcloud storage buckets create "gs://$GCS_BUCKET" --location="$REGION" \
  --uniform-bucket-level-access || true

echo "--- Pub/Sub topic ---"
gcloud pubsub topics create "$PUBSUB_TOPIC" || true

echo "--- Service accounts ---"
gcloud iam service-accounts create deckhand-api --display-name "Deckhand API" || true
gcloud iam service-accounts create deckhand-worker --display-name "Deckhand Worker" || true
API_SA="deckhand-api@${PROJECT_ID}.iam.gserviceaccount.com"
WORKER_SA="deckhand-worker@${PROJECT_ID}.iam.gserviceaccount.com"

for SA in "$API_SA" "$WORKER_SA"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA" \
    --role roles/datastore.user --condition=None -q
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA" \
    --role roles/aiplatform.user --condition=None -q
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA" \
    --role roles/cloudtrace.agent --condition=None -q
  gcloud storage buckets add-iam-policy-binding "gs://$GCS_BUCKET" \
    --member "serviceAccount:$SA" --role roles/storage.objectAdmin -q
  # Needed to sign GCS URLs from Cloud Run (no key file):
  gcloud iam service-accounts add-iam-policy-binding "$SA" \
    --member "serviceAccount:$SA" --role roles/iam.serviceAccountTokenCreator -q
done
gcloud pubsub topics add-iam-policy-binding "$PUBSUB_TOPIC" \
  --member "serviceAccount:$API_SA" --role roles/pubsub.publisher -q

echo "--- Secret: OAuth client secret ---"
if ! gcloud secrets describe oauth-client-secret >/dev/null 2>&1; then
  read -r -s -p "Paste the OAuth client secret: " SECRET; echo
  printf '%s' "$SECRET" | gcloud secrets create oauth-client-secret --data-file=-
fi
gcloud secrets add-iam-policy-binding oauth-client-secret \
  --member "serviceAccount:$API_SA" --role roles/secretmanager.secretAccessor -q

echo "Setup complete. Next: bash deploy/deploy.sh"
