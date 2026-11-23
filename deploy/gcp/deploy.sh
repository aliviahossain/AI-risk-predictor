#!/usr/bin/env bash
# Deploys the whole stack (React site + FastAPI/R API behind Caddy) to a single
# Compute Engine VM.
#
#   ./deploy/gcp/deploy.sh provision   # one-time: API, static IP, firewall, VM
#   ./deploy/gcp/deploy.sh deploy      # upload current code and (re)build
#   ./deploy/gcp/deploy.sh ip          # print the static IP for DNS records
#   ./deploy/gcp/deploy.sh logs        # tail container logs
#
# Override any of these via environment variables.
set -euo pipefail

PROJECT="${PROJECT:-$(gcloud config get project 2>/dev/null)}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-${REGION}-a}"
VM="${VM:-online-omics}"
MACHINE="${MACHINE:-e2-medium}"
DISK_GB="${DISK_GB:-30}"
SITE_DOMAIN="${SITE_DOMAIN:-online-omics.com}"
IP_NAME="${VM}-ip"
APP_DIR="/opt/online-omics"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
g() { gcloud --project "$PROJECT" "$@"; }
remote() { g compute ssh "$VM" --zone "$ZONE" --command "$1"; }

provision() {
  g services enable compute.googleapis.com

  g compute addresses describe "$IP_NAME" --region "$REGION" >/dev/null 2>&1 \
    || g compute addresses create "$IP_NAME" --region "$REGION"

  g compute firewall-rules describe allow-web >/dev/null 2>&1 \
    || g compute firewall-rules create allow-web \
         --allow tcp:80,tcp:443,udp:443 --target-tags web --direction INGRESS

  if ! g compute instances describe "$VM" --zone "$ZONE" >/dev/null 2>&1; then
    g compute instances create "$VM" \
      --zone "$ZONE" \
      --machine-type "$MACHINE" \
      --image-family debian-12 --image-project debian-cloud \
      --boot-disk-size "${DISK_GB}GB" --boot-disk-type pd-balanced \
      --address "$IP_NAME" \
      --tags web \
      --metadata-from-file startup-script="$ROOT/deploy/gcp/startup.sh"
  fi

  echo "Waiting for Docker to be installed on the VM..."
  until remote "command -v docker >/dev/null && docker compose version >/dev/null" 2>/dev/null; do
    sleep 15
  done
  echo "VM ready. Static IP: $(ip)"
}

ip() {
  g compute addresses describe "$IP_NAME" --region "$REGION" --format 'value(address)'
}

deploy() {
  local tarball
  tarball="$(mktemp -d)/app.tar.gz"
  # Tracked + untracked-but-not-ignored files, i.e. the working tree as it stands.
  (cd "$ROOT" && git ls-files -co --exclude-standard | tar -czf "$tarball" -T -)

  g compute scp "$tarball" "$VM:/tmp/app.tar.gz" --zone "$ZONE"
  remote "sudo mkdir -p $APP_DIR \
    && sudo tar -xzf /tmp/app.tar.gz -C $APP_DIR \
    && echo SITE_DOMAIN=$SITE_DOMAIN | sudo tee $APP_DIR/.env >/dev/null \
    && cd $APP_DIR \
    && sudo docker compose up -d --build --remove-orphans \
    && sudo docker image prune -f"
  echo "Deployed. Site: https://$SITE_DOMAIN  API: https://api.$SITE_DOMAIN/health"
}

logs() { remote "cd $APP_DIR && sudo docker compose logs -f --tail 200"; }

case "${1:-}" in
  provision) provision ;;
  deploy) deploy ;;
  ip) ip ;;
  logs) logs ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
