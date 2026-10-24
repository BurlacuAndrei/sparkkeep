#!/bin/sh
if [ "$(id -u)" = "0" ]; then
    if [ -d /data ]; then
        chown -R appuser:appuser /data 2>/dev/null || true
    fi
    exec su-exec appuser sparkkeep "$@"
fi

exec sparkkeep "$@"
