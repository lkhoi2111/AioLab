import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { Router } from 'express';
import { config } from '../config.js';
import { normalizeDisplayName, publicFileUrl, writeUploadMetadata } from '../utils/files.js';
import { buildAudioFileInfo, warmAnalyzeUploadedAudio } from '../utils/audioAnalysis.js';

const router = Router();

const allowedExtensions = new Set(['.mp3', '.wav', '.flac']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    const originalName = normalizeDisplayName(file.originalname);
    const ext = path.extname(originalName).toLowerCase();
    const id = crypto.randomBytes(3).toString('hex');

    cb(null, `${Date.now()}-${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(normalizeDisplayName(file.originalname)).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      cb(new Error('Only mp3, wav, and flac files are supported.'));
      return;
    }

    cb(null, true);
  }
});

router.post('/', (req, res, next) => {
  upload.single('audio')(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'Audio file must be 100 MB or smaller.' });
        return;
      }

      res.status(400).json({ error: error.message });
      return;
    }

    next();
  });
}, (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file uploaded.' });
    return;
  }

  const originalName = normalizeDisplayName(req.file.originalname);
  const metadata = {
    originalName,
    displayName: originalName,
    storedName: req.file.filename,
    size: req.file.size,
    mimeType: req.file.mimetype,
    uploadedAt: new Date().toISOString()
  };

  writeUploadMetadata(metadata);
  warmAnalyzeUploadedAudio(metadata.storedName);

  const file = buildAudioFileInfo(metadata.storedName);

  res.json({
    ok: true,
    file,
    fileName: metadata.storedName,
    storedName: metadata.storedName,
    originalName: metadata.originalName,
    displayName: metadata.displayName,
    size: req.file.size,
    mimeType: req.file.mimetype,
    url: publicFileUrl('uploads', req.file.path)
  });
});

export default router;
