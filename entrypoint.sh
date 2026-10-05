#!/bin/sh
# Ensure /data is writable by appuser (uid 1000)
if [ -d /data ]; then
    chown -R appuser:appuser /data 2>/dev/null || true
fi

# Run as appuser
exec su-exec appuser sparkkeep