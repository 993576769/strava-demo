#!/usr/bin/env bash

set -euo pipefail

cd /root/strava

: "${GHCR_USERNAME:?set GHCR_USERNAME}"
: "${GHCR_TOKEN:?set GHCR_TOKEN}"
: "${FRONTEND_IMAGE:?set FRONTEND_IMAGE}"
: "${SERVER_IMAGE:?set SERVER_IMAGE}"

export IMAGE_TAG="${IMAGE_TAG:-master}"

git reset --hard origin/master

printf '%s' "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
docker compose pull
docker compose run --rm server bun run db:push
docker compose up -d
