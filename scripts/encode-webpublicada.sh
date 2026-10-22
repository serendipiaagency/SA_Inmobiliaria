#!/usr/bin/env bash
# Genera el vídeo de la pestaña «Web publicada» paneando verticalmente sobre la
# captura de PÁGINA COMPLETA de la web de Norte Astur (scripts/record-webpublicada.mjs):
# baja por las secciones y vuelve arriba (bucle sin salto). Salida ligera, sin
# audio, para autoplay-muted-loop: public/landing/norte-astur-web.{mp4,webm,webp}.
set -euo pipefail
RAW_DIR="${1:-/tmp/claude-0/-home-user-SA-Inmobiliaria/f61d1155-3a77-5522-81ab-109e654e709b/scratchpad/webvideo}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/landing"
PNG="$RAW_DIR/norte-astur-fullpage.png"
[ -f "$PNG" ] || { echo "No existe la captura: $PNG"; exit 1; }

OUT_W=1280; OUT_H=800            # marco de salida (aspecto ~1.6)
DUR="${DUR:-24}"                 # segundos del recorrido (bajada + subida)
FPS=30

W=$(identify -format '%w' "$PNG")
H=$(identify -format '%h' "$PNG")
CH=$(( W * OUT_H / OUT_W ))      # alto de la ventana recortada (mantiene aspecto)
CH=$(( CH - CH % 2 ))
YMAX=$(( H - CH ))
echo "captura ${W}x${H}; ventana ${W}x${CH}; recorrido vertical ${YMAX}px en ${DUR}s"
[ "$YMAX" -gt 0 ] || { echo "La captura no es más alta que la ventana; nada que panear"; exit 1; }

# y(t): triángulo 0 -> YMAX -> 0 (baja y sube), bucle sin salto.
PAN="crop=${W}:${CH}:0:'(${YMAX})*(1-abs(1-2*t/${DUR}))',scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv420p"

ffmpeg -y -loop 1 -t "$DUR" -i "$PNG" -r "$FPS" -vf "$PAN" \
  -an -c:v libx264 -crf 30 -preset veryslow -movflags +faststart "$OUT_DIR/norte-astur-web.mp4" -loglevel error

ffmpeg -y -loop 1 -t "$DUR" -i "$PNG" -r "$FPS" -vf "$PAN" \
  -an -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 "$OUT_DIR/norte-astur-web.webm" -loglevel error

# Póster: la parte superior (hero), que es como arranca el vídeo.
convert "$PNG" -crop "${W}x${CH}+0+0" +repage -resize "${OUT_W}x${OUT_H}" -quality 80 "$OUT_DIR/norte-astur-web.webp"

echo "=== resultados ==="
for f in norte-astur-web.mp4 norte-astur-web.webm norte-astur-web.webp; do
  echo "  $f -> $(du -h "$OUT_DIR/$f" | cut -f1)"
done
