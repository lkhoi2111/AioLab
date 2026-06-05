import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  contentTypeForOutput,
  extractAudioFromVideo,
  safeExtractOutputPath
} from '../services/ffmpegExtractAudio.js';

export async function extractAudioController(req, res) {
  if (!req.file) {
    res.status(400).json({
      success: false,
      message: 'No video file uploaded.'
    });
    return;
  }

  try {
    const result = await extractAudioFromVideo({
      inputPath: req.file.path,
      originalName: req.file.originalname,
      format: req.body.format
    });

    res.json({
      success: true,
      filename: result.filename,
      downloadUrl: result.downloadUrl,
      duration: result.duration,
      size: result.size,
      mimeType: result.mimeType
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: normalizeExtractError(error)
    });
  } finally {
    await fsp.rm(req.file.path, { force: true }).catch(() => {});
  }
}

export async function downloadExtractedAudioController(req, res) {
  try {
    const filename = path.basename(String(req.params.filename || ''));
    const outputPath = await safeExtractOutputPath(filename);

    if (!fs.existsSync(outputPath)) {
      res.status(404).json({
        success: false,
        message: 'Audio file was not found or has expired.'
      });
      return;
    }

    res.setHeader('Content-Type', contentTypeForOutput(filename));
    res.setHeader('Content-Disposition', makeContentDisposition(filename));
    res.sendFile(outputPath);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Download failed.'
    });
  }
}

export function handleExtractAudioUploadError(error, _req, res, next) {
  if (!error) {
    next();
    return;
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      success: false,
      message: 'Video size must be under 100MB.'
    });
    return;
  }

  res.status(400).json({
    success: false,
    message: error.message || 'Upload failed.'
  });
}

function normalizeExtractError(error) {
  const message = error.message || '';
  if (/does not contain an audio stream/i.test(message)) {
    return 'Video does not contain an audio stream.';
  }
  if (/unsupported audio format/i.test(message)) {
    return 'Unsupported audio format.';
  }
  if (/ffmpeg|invalid data|could not|error/i.test(message)) {
    return 'FFmpeg failed to extract audio.';
  }

  return message || 'Audio extraction failed.';
}

function makeContentDisposition(fileName) {
  const fallback =
    fileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7e]+/g, '')
      .replace(/[\\"]/g, '')
      .trim() || 'audio';

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987(fileName)}`;
}

function encodeRFC5987(value) {
  return encodeURIComponent(value).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
