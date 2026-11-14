#!/usr/bin/env bash
# Wait until the managed IWSDK app frame is command-ready.
for i in $(seq 1 15); do
  if npx @iwsdk/cli dev status 2>/dev/null | python3 -c '
import json, sys
d = json.load(sys.stdin)["data"]["state"]
cl = ((d.get("session") or {}).get("browser") or {}).get("clients", [])
sys.exit(0 if any(c["role"] == "app" and c["commandReady"] for c in cl) else 1)
'; then echo READY; exit 0; fi
  sleep 3
done
echo NOT_READY; exit 1
