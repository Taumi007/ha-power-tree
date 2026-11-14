#!/bin/sh
# Kopiert die Integration in die HA-Konfiguration (Samba-Share; --inplace, weil der Share keine Punkt-Dateien erlaubt).
set -eu
ZIEL="${1:-/Volumes/config}/custom_components/stromnetz"
QUELLE="$(cd "$(dirname "$0")/.." && pwd)/custom_components/stromnetz"
mkdir -p "$ZIEL"
rsync -rt --inplace --delete --exclude __pycache__ "$QUELLE/" "$ZIEL/"
echo "Deployt nach $ZIEL"
