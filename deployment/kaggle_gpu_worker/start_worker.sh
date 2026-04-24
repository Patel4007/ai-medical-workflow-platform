#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${APP_PORT:-8000}"
NGINX_PORT="${NGINX_PORT:-8080}"
WORKDIR="${WORKDIR:-/kaggle/working/kaggle_gpu_worker}"
TEMPLATE_PATH="${TEMPLATE_PATH:-${WORKDIR}/nginx.conf.template}"
NGINX_CONF="${NGINX_CONF:-/kaggle/working/nginx.conf}"

if ! command -v nginx >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y nginx
fi

pkill -f "uvicorn app:app" >/dev/null 2>&1 || true
pkill nginx >/dev/null 2>&1 || true

sed \
  -e "s/__APP_PORT__/${APP_PORT}/g" \
  -e "s/__NGINX_PORT__/${NGINX_PORT}/g" \
  "${TEMPLATE_PATH}" > "${NGINX_CONF}"

uvicorn app:app --host 127.0.0.1 --port "${APP_PORT}" >/kaggle/working/uvicorn.log 2>&1 &
sleep 5
nginx -p /kaggle/working -c "${NGINX_CONF}"
