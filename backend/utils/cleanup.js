import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { isInsidePath, resultGroupPath } from './files.js';

const ignoredNames = new Set(['.gitkeep']);

async function appendDeletionLog(entry) {
  const payload = {
    deletedAt: new Date().toISOString(),
    ...entry
  };

  await fs.appendFile(config.deletionLogPath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectDeletedEntries(targetPath) {
  const stat = await fs.stat(targetPath);

  if (!stat.isDirectory()) {
    return [{ path: targetPath, type: 'file', size: stat.size }];
  }

  const entries = [];
  const children = await fs.readdir(targetPath, { withFileTypes: true });

  for (const child of children) {
    const childPath = path.join(targetPath, child.name);
    entries.push(...(await collectDeletedEntries(childPath)));
  }

  entries.push({ path: targetPath, type: 'directory', size: 0 });
  return entries;
}

async function deleteTempPath(targetPath, reason) {
  const resolved = path.resolve(targetPath);
  const canDelete =
    isInsidePath(config.uploadDir, resolved) ||
    isInsidePath(config.resultDir, resolved) ||
    isInsidePath(config.separatedDir, resolved) ||
    isInsidePath(config.downloadAudioDir, resolved) ||
    isInsidePath(config.downloadVideoDir, resolved) ||
    isInsidePath(config.downloadTempDir, resolved) ||
    isInsidePath(config.outputDir, resolved);

  if (!canDelete || !(await pathExists(resolved))) {
    return;
  }

  const entries = await collectDeletedEntries(resolved);
  await fs.rm(resolved, { recursive: true, force: true });

  for (const entry of entries) {
    await appendDeletionLog({
      reason,
      type: entry.type,
      path: entry.path,
      size: entry.size
    });
  }
}

function isExpired(stat, nowMs) {
  const createdMs = stat.birthtimeMs || stat.ctimeMs || stat.mtimeMs;
  return nowMs - createdMs >= config.tempFileTtlMs;
}

async function cleanupExpiredUploads(nowMs) {
  const entries = await fs.readdir(config.uploadDir, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoredNames.has(entry.name)) continue;

    const uploadPath = path.join(config.uploadDir, entry.name);
    const stat = await fs.stat(uploadPath);

    if (!stat.isFile() || !isExpired(stat, nowMs)) continue;

    await deleteTempPath(uploadPath, 'upload_expired');
    await deleteTempPath(resultGroupPath(entry.name), 'upload_expired_result_group');
  }
}

async function cleanupExpiredResults(nowMs) {
  const entries = await fs.readdir(config.resultDir, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoredNames.has(entry.name)) continue;

    const resultPath = path.join(config.resultDir, entry.name);
    const stat = await fs.stat(resultPath);

    if (isExpired(stat, nowMs)) {
      await deleteTempPath(resultPath, 'result_expired');
    }
  }
}

async function cleanupExpiredSeparated(nowMs) {
  const entries = await fs.readdir(config.separatedDir, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoredNames.has(entry.name)) continue;

    const separatedPath = path.join(config.separatedDir, entry.name);
    const stat = await fs.stat(separatedPath);

    if (isExpired(stat, nowMs)) {
      await deleteTempPath(separatedPath, 'separated_expired');
    }
  }
}

async function cleanupExpiredDownloadDir(dirPath, nowMs, reason) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoredNames.has(entry.name)) continue;

    const entryPath = path.join(dirPath, entry.name);
    const stat = await fs.stat(entryPath);

    if (isExpired(stat, nowMs)) {
      await deleteTempPath(entryPath, reason);
    }
  }
}

export async function cleanupExpiredFiles() {
  const nowMs = Date.now();
  await cleanupExpiredUploads(nowMs);
  await cleanupExpiredResults(nowMs);
  await cleanupExpiredSeparated(nowMs);
  await cleanupExpiredDownloadDir(config.downloadAudioDir, nowMs, 'download_audio_expired');
  await cleanupExpiredDownloadDir(config.downloadVideoDir, nowMs, 'download_video_expired');
  await cleanupExpiredDownloadDir(config.downloadTempDir, nowMs, 'download_temp_expired');
  await cleanupExpiredDownloadDir(config.outputDir, nowMs, 'extract_audio_output_expired');
}

export function startCleanupJob() {
  cleanupExpiredFiles().catch((error) => {
    console.error(`Initial cleanup failed: ${error.message}`);
  });

  const timer = setInterval(() => {
    cleanupExpiredFiles().catch((error) => {
      console.error(`Scheduled cleanup failed: ${error.message}`);
    });
  }, config.cleanupIntervalMs);

  timer.unref?.();
  return timer;
}
