#!/bin/sh
# Démarre le relais Tor embarqué (sauf TOKFLOW_TOR=0 ou proxy configuré), puis le serveur.
set -e
if [ "${TOKFLOW_TOR:-1}" != "0" ] && [ -z "$TOKFLOW_PROXY_URL" ] && command -v tor >/dev/null 2>&1; then
  export TOKFLOW_TOR_PORT="${TOKFLOW_TOR_PORT:-9050}"
  mkdir -p /tmp/tor
  tor --SocksPort "127.0.0.1:${TOKFLOW_TOR_PORT}" --DataDirectory /tmp/tor --ClientOnly 1 --AvoidDiskWrites 1 \
      --Log "notice stdout" --MaxMemInQueues "64 MB" 2>&1 | sed -u 's/^/[tor] /' &
fi
exec node server.js
