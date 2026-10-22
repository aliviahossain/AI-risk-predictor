#!/bin/bash
# Compute Engine startup script: installs Docker + Compose and adds swap so the
# R/Bioconductor build and limma runs don't OOM on a 4 GB machine. Idempotent.
set -euo pipefail

if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
