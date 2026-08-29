#!/usr/bin/env bash
# Build + deploy both Cloud Run services and wire the Pub/Sub push subscription.
set -euo pipefail
source "$(dirname "$0")/vars.env"
cd "$(dirname "$0")/.."

gcloud config set project "$PROJECT_ID"
API_SA="deckhand-api@${PROJECT_ID}.iam.gserviceaccount.com"
WORKER_SA="deckhand-worker@${PROJECT_ID}.iam.gserviceaccount.com"

echo "--- Deploying API service ---"
# max-instances 1: session media (generated images, pptx) lives on instance-local
# disk; one instance keeps every /media URL valid. Fine for demo-scale traffic.
gcloud run deploy deckhand-api \
  --source backend \
  --region "$REGION" \
  --service-account "$API_SA" \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 1 --memory 1Gi \
  --timeout 3600 --session-affinity \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=true,LOCAL_STORE=false,PUBSUB_TOPIC=$PUBSUB_TOPIC,GCS_BUCKET=$GCS_BUCKET,FRONTEND_ORIGIN=$FRONTEND_ORIGIN,GOOGLE_OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID,ENABLE_TRACING=true" \
  --set-secrets "GOOGLE_OAUTH_CLIENT_SECRET=oauth-client-secret:latest"

API_URL=$(gcloud run services describe deckhand-api --region "$REGION" --format 'value(status.url)')
gcloud run services update deckhand-api --region "$REGION" \
  --update-env-vars "OAUTH_REDIRECT_URI=${API_URL}/auth/google/callback,PUBLIC_BASE_URL=${API_URL}"
echo "API: $API_URL  (add ${API_URL}/auth/google/callback to the OAuth client's redirect URIs)"

echo "--- Deploying frontend (Next.js via buildpacks) ---"
gcloud run deploy deckhand-web \
  --source frontend \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 --memory 1Gi \
  --set-build-env-vars "NEXT_PUBLIC_API_BASE=${API_URL}"

WEB_URL=$(gcloud run services describe deckhand-web --region "$REGION" --format 'value(status.url)')
gcloud run services update deckhand-api --region "$REGION" \
  --update-env-vars "FRONTEND_ORIGIN=${WEB_URL}"
echo "Frontend: $WEB_URL"

echo "--- Deploying worker service (build context = repo root, so shared modules copy in) ---"
gcloud builds submit --config deploy/cloudbuild-worker.yaml .

gcloud run deploy deckhand-worker \
  --image "gcr.io/$PROJECT_ID/deckhand-worker" \
  --region "$REGION" \
  --service-account "$WORKER_SA" \
  --no-allow-unauthenticated \
  --min-instances 0 --max-instances 2 --memory 1Gi --timeout 900 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=true,PUBSUB_TOPIC=$PUBSUB_TOPIC,GCS_BUCKET=$GCS_BUCKET,GOOGLE_OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID" \
  --set-secrets "GOOGLE_OAUTH_CLIENT_SECRET=oauth-client-secret:latest"

WORKER_URL=$(gcloud run services describe deckhand-worker --region "$REGION" --format 'value(status.url)')

echo "--- Pub/Sub push subscription -> worker ---"
gcloud iam service-accounts create deckhand-pubsub --display-name "Pub/Sub pusher" || true
PUSH_SA="deckhand-pubsub@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud run services add-iam-policy-binding deckhand-worker --region "$REGION" \
  --member "serviceAccount:$PUSH_SA" --role roles/run.invoker -q
gcloud pubsub subscriptions create deckhand-jobs-push \
  --topic "$PUBSUB_TOPIC" \
  --push-endpoint "${WORKER_URL}/pubsub" \
  --push-auth-service-account "$PUSH_SA" \
  --ack-deadline 600 \
  --min-retry-delay 30s --max-retry-delay 300s || true

echo "Done."
echo "  Web:    $WEB_URL"
echo "  API:    $API_URL"
echo "  Worker: $WORKER_URL"
echo "Remember: add ${API_URL}/auth/google/callback to the OAuth client's redirect URIs."
