#!/usr/bin/env bash
# restart-preview.sh — Reinicia o dev server
cd /c/zapp-web-v3
bash scripts/preview/stop-preview.sh
sleep 1
bash scripts/preview/start-preview.sh
