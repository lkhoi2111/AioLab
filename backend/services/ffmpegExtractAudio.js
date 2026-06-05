import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { isInsidePath, normalizeDisplayName } from '../utils/files.js';

const supportedFormats = new Set(['mp3', 'wav', 'm4a']);
const mimeByFormat = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4'
};

export async function extractAudioFromVideo({ inputPath, originalName, format }) {
  const outputFormat = String(format || '').toLowerCase();
  if (!supportedFormats.has(outputFormat)) {
    const error = new Error('Unsupported audio format.');
    error.statusCode = 400;
    throw error;
  }

  const probe = await probeMedia(inputPath);
  if (!probe.audioStream) {
    const error = new Error('Video does not contain an audio stream.');
    error.statusCode = 400;
    throw error;
  }

  await fsp.mkdir(config.outputDir, { recursive: true });
  const filename = await makeUniqueAudioFileName(originalName, outputFormat);
  const outputPath = path.resolve(config.outputDir, filename);

  if (!isInsidePath(config.outputDir, outputPath)) {
    throw new Error('Invalid output path.');
  }

  const args = buildFfmpegArgs(inputPath, outputPath, outputFormat, probe.audioStream);
  await runProcess(getFfmpegPath(), args, 'ffmpeg');

  const stat = await fsp.stat(outputPath);
  return {
    filename,
    outputPath,
    downloadUrl: `/downloads/${filename}`,
    mimeType: mimeByFormat[outputFormat],
    size: stat.size,
    duration: probe.duration,
    audioCodec: probe.audioStream.codec_name || ''
  };
}

export async function safeExtractOutputPath(fileName) {
  const safeName = path.basename(String(fileName || ''));
  if (!/^[^/\\]+\.(mp3|wav|m4a)$/i.test(safeName)) {
    const error = new Error('Invalid output filename.');
    error.statusCode = 400;
    throw error;
  }

  const outputPath = path.resolve(config.outputDir, safeName);
  if (!isInsidePath(config.outputDir, outputPath)) {
    const error = new Error('Invalid output path.');
    error.statusCode = 400;
    throw error;
  }

  return outputPath;
}

export function contentTypeForOutput(fileName) {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return mimeByFormat[ext] || 'application/octet-stream';
}

async function probeMedia(inputPath) {
  const stdout = await runProcess(getFfprobePath(), [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=index,codec_type,codec_name',
    '-of',
    'json',
    inputPath
  ], 'ffprobe');

  const data = JSON.parse(stdout || '{}');
  const audioStream = Array.isArray(data.streams)
    ? data.streams.find((stream) => stream.codec_type === 'audio')
    : null;
  const duration = Number(data.format?.duration || 0);

  return {
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    audioStream
  };
}

function buildFfmpegArgs(inputPath, outputPath, format, audioStream) {
  const base = ['-y', '-i', inputPath, '-vn'];

  if (format === 'mp3') {
    return [...base, '-codec:a', 'libmp3lame', '-q:a', '0', outputPath];
  }

  if (format === 'wav') {
    return [...base, outputPath];
  }

  if (audioStream?.codec_name === 'aac') {
    return [...base, '-acodec', 'copy', outputPath];
  }

  return [...base, '-c:a', 'aac', '-b:a', '320k', outputPath];
}

async function makeUniqueAudioFileName(originalName, format) {
  const baseName = sanitizeBaseName(originalName);
  let candidate = `${baseName}[audio].${format}`;
  let outputPath = path.resolve(config.outputDir, candidate);

  if (!fs.existsSync(outputPath)) {
    return candidate;
  }

  candidate = `${baseName}-${Date.now()}[audio].${format}`;
  outputPath = path.resolve(config.outputDir, candidate);
  if (!isInsidePath(config.outputDir, outputPath)) {
    throw new Error('Invalid output filename.');
  }

  return candidate;
}

function sanitizeBaseName(originalName) {
  const displayName = normalizeDisplayName(originalName || 'video');
  const baseName = displayName
    .replace(/\.[^/.]+$/, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
    .replace(/\.+$/g, '')
    .slice(0, 140);

  return baseName || 'video';
}

function getFfmpegPath() {
  return config.ffmpegLocation || 'ffmpeg';
}

function getFfprobePath() {
  return config.ffprobeLocation || 'ffprobe';
}

function runProcess(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: config.rootDir,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      const wrapped = new Error(`${label} failed to start: ${error.message}`);
      wrapped.statusCode = 500;
      reject(wrapped);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(stderr || `${label} exited with code ${code}.`);
        error.statusCode = 500;
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}
