import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { Router } from 'express';
import { config } from '../config.js';
import {
  extractAudioController,
  handleExtractAudioUploadError
} from '../controllers/extractAudioController.js';
import { normalizeDisplayName } from '../utils/files.js';

const router = Router();
const allowedExtensions = new Set(['.mp4', '.mkv', '.mov', '.webm', '.avi']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    const originalName = normalizeDisplayName(file.originalname);
    const ext = path.extname(originalName).toLowerCase();
    cb(null, `video_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
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
      cb(new Error('Unsupported video format.'));
      return;
    }

    cb(null, true);
  }
});

router.post('/', (req, res, next) => {
  upload.single('video')(req, res, (error) => {
    if (error) {
      handleExtractAudioUploadError(error, req, res, next);
      return;
    }

    next();
  });
}, extractAudioController);

export default router;
