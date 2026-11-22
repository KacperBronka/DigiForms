#!/bin/sh
set -eu

mkdir -p "${NGINX_ENVSUBST_OUTPUT_DIR:-/tmp/nginx-conf}"

for value in "$RATE_LIMIT_RPS" "$RATE_LIMIT_BURST" "$UPLOAD_RATE_LIMIT_RPM" "$UPLOAD_RATE_LIMIT_BURST"; do
    case "$value" in
        ''|*[!0-9]*) echo 'Rate limits and bursts must be positive integers.' >&2; exit 1 ;;
    esac
    if ! [ "$value" -gt 0 ]; then
        echo 'Rate limits and bursts must be positive integers.' >&2
        exit 1
    fi
done
