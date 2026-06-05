import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export function ensureStorageDirs() {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.mkdirSync(config.resultDir, { recursive: true });
  fs.mkdirSync(config.separatedDir, { recursive: true });
  fs.mkdirSync(config.downloadAudioDir, { recursive: true });
  fs.mkdirSync(config.downloadVideoDir, { recursive: true });
  fs.mkdirSync(config.downloadTempDir, { recursive: true });
  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.mkdirSync(config.logDir, { recursive: true });
}

export function normalizeDisplayName(fileName) {
  const raw = path.basename(String(fileName || 'audio')).normalize('NFC');
  if (!hasMojibakeMarkers(raw)) {
    return raw;
  }

  const repaired = Buffer.from(raw, 'latin1').toString('utf8').normalize('NFC');
  return scoreMojibake(repaired) < scoreMojibake(raw) ? repaired : raw;
}

export function makeDownloadName(originalName, label, extension = '.wav') {
  const parsed = path.parse(normalizeDisplayName(originalName));
  const baseName = parsed.name || 'audio';
  return `${baseName} [${label}]${extension}`;
}

export function metadataPath(storedName) {
  return `${safeUploadPath(storedName)}.json`;
}

export function writeUploadMetadata(metadata) {
  fs.writeFileSync(metadataPath(metadata.storedName), JSON.stringify(metadata, null, 2), 'utf8');
}

export function updateUploadMetadata(storedName, patch) {
  const current = readUploadMetadata(storedName);
  const next = {
    ...current,
    ...patch,
    storedName: current.storedName || path.basename(storedName)
  };

  writeUploadMetadata(next);
  return next;
}

export function readUploadMetadata(storedName) {
  const storedPath = safeUploadPath(storedName);
  const metaPath = `${storedPath}.json`;
  if (!fs.existsSync(metaPath)) {
    return {
      originalName: 'Uploaded audio',
      displayName: 'Uploaded audio',
      storedName: path.basename(storedName)
    };
  }

  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8').replace(/^\uFEFF/, ''));
  const originalName = normalizeDisplayName(metadata.originalName || metadata.displayName);
  const displayName = normalizeDisplayName(metadata.displayName || originalName);

  return {
    ...metadata,
    originalName,
    displayName
  };
}

export function safeUploadPath(fileName) {
  const cleaned = path.basename(String(fileName || ''));
  if (!cleaned) {
    throw new Error('Missing uploaded file name.');
  }

  const fullPath = path.resolve(config.uploadDir, cleaned);
  const uploadRoot = path.resolve(config.uploadDir);

  if (!isInsidePath(uploadRoot, fullPath)) {
    throw new Error('Invalid uploaded file path.');
  }

  return fullPath;
}

export function safeResultPath(relativeFilePath) {
  const cleaned = String(relativeFilePath || '').replace(/^[/\\]+/, '');
  if (!cleaned) {
    throw new Error('Missing result file path.');
  }

  const fullPath = path.resolve(config.resultDir, cleaned);
  const resultRoot = path.resolve(config.resultDir);

  if (!isInsidePath(resultRoot, fullPath)) {
    throw new Error('Invalid result file path.');
  }

  return fullPath;
}

export function resultGroupPath(uploadFileName) {
  const safeFileName = path.basename(String(uploadFileName || ''));
  if (!safeFileName) {
    throw new Error('Missing uploaded file name.');
  }

  const groupName = path.parse(safeFileName).name;
  const fullPath = path.resolve(config.resultDir, groupName);
  const resultRoot = path.resolve(config.resultDir);

  if (!isInsidePath(resultRoot, fullPath)) {
    throw new Error('Invalid result folder path.');
  }

  return fullPath;
}

export function publicFileUrl(kind, filePath) {
  const root = kind === 'results' ? config.resultDir : config.uploadDir;
  const relativePath = path.relative(path.resolve(root), path.resolve(filePath));

  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return `/${kind}/${encodeURIComponent(path.basename(filePath))}`;
  }

  const webPath = relativePath
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `/${kind}/${webPath}`;
}

export function isInsidePath(root, target) {
  const relativePath = path.relative(path.resolve(root), path.resolve(target));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function hasMojibakeMarkers(value) {
  return /[\u00c2-\u00c3][\u0080-\u00bf]|[\u00e0-\u00ef][\u0080-\u00bf]{1,2}|[\u00ba-\u00bf]|\uFFFD/.test(
    value
  );
}

function scoreMojibake(value) {
  const matches = value.match(
    /[\u00c2-\u00c3][\u0080-\u00bf]|[\u00e0-\u00ef][\u0080-\u00bf]{1,2}|[\u00ba-\u00bf]|\uFFFD/g
  );
  return matches ? matches.length : 0;
}
