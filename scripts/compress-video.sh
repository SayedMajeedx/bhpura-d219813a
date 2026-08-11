#!/usr/bin/env bash
# Boutq Native Video Pre-Compression Helper Script
# Usage: ./scripts/compress-video.sh input.mp4

INPUT="$1"
OUTPUT_DIR="${2:-$(dirname "$INPUT")}"

if [ -z "$INPUT" ]; then
  echo "Usage: ./scripts/compress-video.sh <input.mp4> [output_directory]"
  exit 1
fi

BASENAME=$(basename "$INPUT" | cut -f 1 -d '.')

echo "Processing $INPUT..."

# Hero / Background Loop Renditions (No Audio, 720p, Max Speed)
ffmpeg -i "$INPUT" -an -vf "scale=1280:-2" -c:v libvpx-vp9 -b:v 600k -y "$OUTPUT_DIR/${BASENAME}.webm"
ffmpeg -i "$INPUT" -an -vf "scale=1280:-2" -c:v libx264 -crf 28 -preset slow -movflags +faststart -y "$OUTPUT_DIR/${BASENAME}-optimized.mp4"

echo "Done! Generated $OUTPUT_DIR/${BASENAME}.webm and $OUTPUT_DIR/${BASENAME}-optimized.mp4"
