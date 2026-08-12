#!/usr/bin/env node

/**
 * Pre-Compression Helper Script for Boutq Storefront & Admin Media
 *
 * Usage:
 *   node scripts/compress-video.js <input-file> [output-dir]
 *
 * Generates dual optimized renditions:
 * 1. WebM (VP9 codec, ~600k bitrate, muted for hero loops / compressed audio for content)
 * 2. MP4 (H.264, CRF 28, faststart for streaming)
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const inputFile = process.argv[2];
const outputDir = process.argv[3] || path.dirname(inputFile || ".");

if (!inputFile) {
  console.log(`
Boutq Media Pre-Compression CLI
--------------------------------
Usage:
  node scripts/compress-video.js <input.mp4> [output-directory]

Commands run under the hood:
  # Hero / Background Loops (Max compression, 720p, 600k bitrate, no audio):
  ffmpeg -i input.mp4 -an -vf "scale=1280:-2" -c:v libvpx-vp9 -b:v 600k output.webm
  ffmpeg -i input.mp4 -an -vf "scale=1280:-2" -c:v libx264 -crf 28 -preset slow -movflags +faststart output.mp4

  # Standard / Interactive Content Videos (720p, audio preserved):
  ffmpeg -i input.mp4 -vf "scale=1280:-2" -c:v libvpx-vp9 -b:v 800k -c:a libopus -b:a 96k output.webm
  ffmpeg -i input.mp4 -vf "scale=1280:-2" -c:v libx264 -crf 26 -c:a aac -b:a 128k -movflags +faststart output.mp4
`);
  process.exit(0);
}

if (!fs.existsSync(inputFile)) {
  console.error(`Error: Input file "${inputFile}" does not exist.`);
  process.exit(1);
}

const parsed = path.parse(inputFile);
const baseName = parsed.name;

const webmOutput = path.join(outputDir, `${baseName}.webm`);
const mp4Output = path.join(outputDir, `${baseName}-optimized.mp4`);

console.log(`Compressing "${inputFile}"...`);

try {
  // Check if ffmpeg is installed
  execSync("ffmpeg -version", { stdio: "ignore" });
} catch {
  console.error("Error: FFmpeg is not installed or not in PATH.");
  console.error("Please install FFmpeg (e.g. `brew install ffmpeg` or `winget install ffmpeg`).");
  process.exit(1);
}

console.log(`[1/2] Generating WebM (VP9)...`);
execSync(
  `ffmpeg -i "${inputFile}" -an -vf "scale=1280:-2" -c:v libvpx-vp9 -b:v 600k -y "${webmOutput}"`,
  { stdio: "inherit" },
);

console.log(`[2/2] Generating MP4 (H.264 FastStart)...`);
execSync(
  `ffmpeg -i "${inputFile}" -an -vf "scale=1280:-2" -c:v libx264 -crf 28 -preset slow -movflags +faststart -y "${mp4Output}"`,
  { stdio: "inherit" },
);

console.log(`\nCompression complete!`);
console.log(`WebM: ${webmOutput}`);
console.log(`MP4:  ${mp4Output}`);
