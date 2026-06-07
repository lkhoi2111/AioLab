import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Router } from 'express';
import { config } from '../config.js';
import {
  isInsidePath,
  normalizeDisplayName,
  publicFileUrl,
  writeUploadMetadata
} from '../utils/files.js';
import { warmAnalyzeUploadedAudio } from '../utils/audioAnalysis.js';

const router = Router();
const allowedHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'soundcloud.com',
  'www.soundcloud.com',
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com'
]);
const spotifyHosts = new Set(['spotify.com', 'www.spotify.com', 'open.spotify.com']);
const metadataByFile = new Map();

router.get('/info', async (req, res) => {
  if (req.query.url) {
    await checkDownloaderInfo(req, res);
    return;
  }

  res.json({
    ok: true,
    service: 'downloader',
    supportedPlatforms: ['youtube', 'soundcloud', 'x'],
    routes: {
      info: 'GET /api/downloader/info',
      check: 'POST /api/downloader/check',
      download: 'POST /api/downloader/download'
    }
  });
});

router.post('/info', checkDownloaderInfo);
router.post('/check', checkDownloaderInfo);

router.post('/download', async (req, res) => {
  const validation = validateSupportedUrl(req.body.url);
  if (!validation.ok) {
    res.status(validation.status).json({ ok: false, error: validation.message });
    return;
  }

  const format = String(req.body.format || '').toLowerCase();
  if (!['mp3', 'mp4'].includes(format)) {
    res.status(400).json({ ok: false, error: 'Định dạng tải xuống không hợp lệ.' });
    return;
  }

  try {
    const metadata = await runYtDlpJson(validation.url);
    const normalized = normalizeMetadata(metadata, validation.url);

    if (normalized.type === 'playlist') {
      res.status(400).json({
        ok: false,
        error: 'Playlist có nhiều file nên chưa hỗ trợ tải thành một file duy nhất.'
      });
      return;
    }

    if (normalized.platform === 'soundcloud' && format === 'mp4') {
      res.status(400).json({ ok: false, error: 'SoundCloud chỉ hỗ trợ tải MP3.' });
      return;
    }

    const fileName = makeInternalFileName(format);
    const outputDir = format === 'mp3' ? config.downloadAudioDir : config.downloadVideoDir;
    const outputBase = path.join(outputDir, path.parse(fileName).name);
    const outputPath = path.join(outputDir, fileName);
    const noPlaylistArgs = isYouTubeUrl(validation.url) ? ['--no-playlist'] : [];
    await fsp.mkdir(outputDir, { recursive: true });

    if (format === 'mp3') {
      await runYtDlp([
        ...noPlaylistArgs,
        '-f',
        'bestaudio',
        '--extract-audio',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '0',
        '--ffmpeg-location',
        config.ffmpegLocation,
        '-o',
        `${outputBase}.%(ext)s`,
        validation.url.href
      ]);
    } else {
      await runYtDlp([
        ...noPlaylistArgs,
        '-f',
        'bv*+ba/best',
        '--merge-output-format',
        'mp4',
        '--ffmpeg-location',
        config.ffmpegLocation,
        '-o',
        `${outputBase}.%(ext)s`,
        validation.url.href
      ]);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(`Expected output was not created: ${outputPath}`);
    }

    const stat = await fsp.stat(outputPath);
    metadataByFile.set(fileName, {
      title: normalized.title,
      format,
      createdAt: Date.now()
    });
    await writeDownloadMetadata(fileName, {
      title: normalized.title,
      format,
      originalUrl: validation.url.href,
      createdAt: new Date().toISOString()
    });

    res.json({
      ok: true,
      title: normalized.title,
      format,
      fileName,
      downloadUrl: `/api/downloader/file/${encodeURIComponent(fileName)}`,
      sizeMB: Number((stat.size / 1024 / 1024).toFixed(2)),
      expiresInMinutes: config.tempFileTtlMs / 60 / 1000
    });
  } catch (error) {
    logDownloaderError('download_failed', error);
    res.status(500).json({
      ok: false,
      error: downloaderErrorMessage(error, 'Không thể tải media này. Vui lòng kiểm tra link hoặc thử nguồn khác.')
    });
  }
});

router.get('/file/:fileName', async (req, res) => {
  try {
    const fileName = path.basename(String(req.params.fileName || ''));
    if (!/^download_\d+_[a-f0-9]+\.(mp3|mp4)$/i.test(fileName)) {
      res.status(400).json({ ok: false, error: 'Tên file không hợp lệ.' });
      return;
    }

    const ext = path.extname(fileName).toLowerCase();
    const rootDir = ext === '.mp3' ? config.downloadAudioDir : config.downloadVideoDir;
    const filePath = path.resolve(rootDir, fileName);

    if (!isInsidePath(rootDir, filePath) || !fs.existsSync(filePath)) {
      res.status(404).json({ ok: false, error: 'File không tồn tại hoặc đã hết hạn.' });
      return;
    }

    const metadata = await readDownloadMetadata(fileName);
    const title = metadata.title || metadataByFile.get(fileName)?.title || 'AioLab Download';
    const label = ext === '.mp3' ? 'Audio' : 'Video';
    const contentType = ext === '.mp3' ? 'audio/mpeg' : 'video/mp4';
    const downloadName = `${path.parse(normalizeDisplayName(title)).name || 'download'} [${label}]${ext}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', makeContentDisposition(downloadName));
    res.sendFile(filePath);
  } catch (error) {
    logDownloaderError('file_failed', error);
    res.status(500).json({ ok: false, error: 'Không thể tải file.' });
  }
});

router.post('/use-in-audio-tools', async (req, res) => {
  try {
    const fileName = path.basename(String(req.body.fileName || ''));
    if (!/^download_\d+_[a-f0-9]+\.mp3$/i.test(fileName)) {
      res.status(400).json({ ok: false, error: 'Chỉ file MP3 mới gửi được sang Audio Tools.' });
      return;
    }

    const sourcePath = path.resolve(config.downloadAudioDir, fileName);
    if (!isInsidePath(config.downloadAudioDir, sourcePath) || !fs.existsSync(sourcePath)) {
      res.status(404).json({ ok: false, error: 'File không tồn tại hoặc đã hết hạn.' });
      return;
    }

    const metadata = await readDownloadMetadata(fileName);
    const originalName = `${path.parse(normalizeDisplayName(metadata.title || 'Downloaded audio')).name}.mp3`;
    const storedName = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.mp3`;
    const targetPath = path.join(config.uploadDir, storedName);
    await fsp.copyFile(sourcePath, targetPath);
    const stat = await fsp.stat(targetPath);

    const uploadMetadata = {
      originalName,
      displayName: originalName,
      storedName,
      size: stat.size,
      mimeType: 'audio/mpeg',
      uploadedAt: new Date().toISOString(),
      source: 'downloader',
      sourceDownload: fileName
    };
    writeUploadMetadata(uploadMetadata);
    warmAnalyzeUploadedAudio(storedName);

    res.json({
      ok: true,
      fileName: storedName,
      storedName,
      originalName,
      displayName: originalName,
      size: stat.size,
      mimeType: 'audio/mpeg',
      url: publicFileUrl('uploads', targetPath)
    });
  } catch (error) {
    logDownloaderError('use_in_audio_tools_failed', error);
    res.status(500).json({ ok: false, error: 'Không thể gửi file sang Audio Tools.' });
  }
});

export default router;

async function checkDownloaderInfo(req, res) {
  const validation = validateSupportedUrl(req.body?.url || req.query?.url);
  if (!validation.ok) {
    res.status(validation.status).json({ ok: false, error: validation.message });
    return;
  }

  try {
    const metadata = await runYtDlpJson(validation.url);
    const normalized = normalizeMetadata(metadata, validation.url);
    res.json({
      ok: true,
      ...normalized
    });
  } catch (error) {
    logDownloaderError('info_failed', error);
    res.status(500).json({
      ok: false,
      error: downloaderErrorMessage(error, 'Unable to check this link. Please try again or use another source.')
    });
  }
}

function validateSupportedUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    return { ok: false, status: 400, message: 'URL không hợp lệ.' };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, status: 400, message: 'URL không hợp lệ.' };
  }

  const host = url.hostname.toLowerCase();
  if (spotifyHosts.has(host)) {
    return {
      ok: false,
      status: 400,
      message:
        'Spotify không hỗ trợ tải trực tiếp. Vui lòng upload file audio hoặc dùng nguồn bạn có quyền tải.'
    };
  }

  if (!allowedHosts.has(host)) {
    return { ok: false, status: 400, message: 'Nguồn này chưa được hỗ trợ.' };
  }

  if (isYouTubeUrl(url)) {
    url = sanitizeYouTubeUrl(url);
  }

  return { ok: true, url };
}

function isYouTubeUrl(url) {
  const host = url.hostname.toLowerCase();
  return host.includes('youtube.com') || host === 'youtu.be';
}

function sanitizeYouTubeUrl(url) {
  const cleaned = new URL(url.href);
  cleaned.searchParams.delete('list');
  cleaned.searchParams.delete('index');
  cleaned.searchParams.delete('start_radio');
  return cleaned;
}

function normalizeMetadata(metadata, url) {
  const title = normalizeDisplayName(
    metadata.title || metadata.fulltitle || metadata.playlist_title || 'Untitled media'
  );
  const entries = Array.isArray(metadata.entries) ? metadata.entries : null;
  const type = entries ? 'playlist' : metadata.vcodec === 'none' ? 'audio' : 'video';
  const platform = detectPlatform(url);

  return {
    platform,
    title,
    thumbnail: metadata.thumbnail || entries?.find((entry) => entry?.thumbnail)?.thumbnail || '',
    duration: formatDuration(metadata.duration || metadata.playlist_duration || 0),
    uploader: normalizeDisplayName(metadata.uploader || metadata.channel || metadata.creator || ''),
    type,
    itemCount: entries?.length || metadata.n_entries || null,
    availableFormats: platform === 'soundcloud' || type === 'audio' ? ['mp3'] : ['mp3', 'mp4']
  };
}

function detectPlatform(url) {
  const host = url.hostname.toLowerCase();
  if (host.includes('youtube') || host === 'youtu.be') return 'youtube';
  if (host.includes('soundcloud')) return 'soundcloud';
  if (host === 'x.com' || host.endsWith('.x.com') || host.includes('twitter')) return 'x';
  return 'unknown';
}

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return '--:--';
  const rounded = Math.round(total);
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

function makeInternalFileName(format) {
  return `download_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${format}`;
}

function runYtDlpJson(url) {
  const args = ['--dump-single-json', '--no-warnings', '--skip-download'];
  if (isYouTubeUrl(url)) args.push('--no-playlist');
  args.push(url.href);

  return runYtDlp(args).then((stdout) => JSON.parse(stdout.trim()));
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ytDlpBin, args, {
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
      if (error?.code === 'ENOENT') {
        reject(new Error('Downloader chưa khả dụng trên server production vì thiếu yt-dlp.'));
        return;
      }

      reject(error);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `yt-dlp exited with code ${code}.`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function writeDownloadMetadata(fileName, metadata) {
  const metaPath = safeDownloadMetadataPath(fileName);
  await fsp.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
}

async function readDownloadMetadata(fileName) {
  const metaPath = safeDownloadMetadataPath(fileName);
  try {
    const raw = await fsp.readFile(metaPath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return {};
  }
}

function safeDownloadMetadataPath(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const rootDir = ext === '.mp3' ? config.downloadAudioDir : config.downloadVideoDir;
  const metaPath = path.resolve(rootDir, `${path.basename(fileName)}.json`);
  if (!isInsidePath(rootDir, metaPath)) {
    throw new Error('Invalid download metadata path.');
  }
  return metaPath;
}

function makeContentDisposition(fileName) {
  const fallback =
    fileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7e]+/g, '')
      .replace(/[\\"]/g, '')
      .trim() || 'download';

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987(fileName)}`;
}

function encodeRFC5987(value) {
  return encodeURIComponent(value).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function logDownloaderError(scope, error) {
  const payload = {
    at: new Date().toISOString(),
    scope,
    message: error?.message || String(error)
  };
  console.error(`[downloader] ${JSON.stringify(payload)}`);
}

function downloaderErrorMessage(error, fallback) {
  const message = error?.message || '';
  if (/yt-dlp|ENOENT/i.test(message)) {
    return 'Downloader chưa khả dụng trên server production vì thiếu yt-dlp.';
  }

  return message || fallback;
}
