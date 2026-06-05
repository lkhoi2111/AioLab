import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import {
  makeDownloadName,
  publicFileUrl,
  readUploadMetadata,
  resultGroupPath,
  safeResultPath,
  safeUploadPath
} from '../utils/files.js';
import { runPythonWorker } from '../utils/pythonWorker.js';
import { analyzeUploadedAudio } from '../utils/audioAnalysis.js';

const router = Router();

const validStems = new Set(['vocals', 'instrumental', 'drums', 'bass']);
const stemLabels = {
  vocals: 'Vocal',
  instrumental: 'Instrumental',
  drums: 'Drums',
  bass: 'Bass',
  other: 'Other'
};
const stemFiles = {
  vocals: 'vocals.wav',
  instrumental: 'instrumental.wav',
  drums: 'drums.wav',
  bass: 'bass.wav',
  other: 'other.wav'
};

router.post('/separate', async (req, res) => {
  const stem = String(req.body.stem || '').toLowerCase();

  if (!validStems.has(stem)) {
    res.status(400).json({ error: 'stem must be vocals, instrumental, drums, or bass.' });
    return;
  }

  try {
    const inputPath = safeUploadPath(req.body.fileName);
    const outputDir = resultGroupPath(req.body.fileName);
    fs.mkdirSync(outputDir, { recursive: true });

    const result = await runPythonWorker('separate.py', [
      '--input',
      inputPath,
      '--output',
      outputDir,
      '--stem',
      stem
    ]);

    res.json({
      ...result,
      url: result.outputPath ? publicFileUrl('results', result.outputPath) : null
    });
  } catch (error) {
    res.status(500).json({
      error: 'Audio separation failed.',
      detail: error.message
    });
  }
});

router.post('/separate-all', async (req, res) => {
  try {
    const storedName = path.basename(String(req.body.fileName || req.body.storedName || ''));
    const inputPath = safeUploadPath(storedName);
    const metadata = readUploadMetadata(storedName);
    const outputDir = resultGroupPath(storedName);
    fs.mkdirSync(outputDir, { recursive: true });

    const result = await runPythonWorker('separate.py', [
      '--input',
      inputPath,
      '--output',
      outputDir,
      '--stem',
      'all'
    ]);

    const files = ['vocals', 'instrumental', 'drums', 'bass', 'other']
      .map((type) => {
        const filePath = result.files?.[type] || path.join(outputDir, stemFiles[type]);
        if (!filePath || !fs.existsSync(filePath)) return null;

        return {
          type,
          url: publicFileUrl('results', filePath),
          downloadUrl: `/api/audio/download/${encodeURIComponent(storedName)}/${type}`,
          downloadName: makeDownloadName(metadata.originalName, stemLabels[type])
        };
      })
      .filter(Boolean);

    res.json({
      ok: true,
      originalName: metadata.originalName,
      displayName: metadata.displayName || metadata.originalName,
      storedName,
      files
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Không thể tách nhạc.',
      detail: error.message
    });
  }
});

router.post('/analyze', async (req, res) => {
  try {
    const storedName = path.basename(String(req.body.fileName || req.body.storedName || ''));
    const result = await analyzeUploadedAudio(storedName, { force: Boolean(req.body.force) });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Audio analysis failed.',
      detail: error.message
    });
  }
});

router.post('/delete', async (req, res) => {
  try {
    const storedName = path.basename(String(req.body.fileName || req.body.storedName || ''));
    const uploadPath = safeUploadPath(storedName);
    const metadataPath = `${uploadPath}.json`;
    const outputDir = resultGroupPath(storedName);

    await fs.promises.rm(uploadPath, { force: true });
    await fs.promises.rm(metadataPath, { force: true });
    await fs.promises.rm(outputDir, { recursive: true, force: true });

    res.json({ ok: true, storedName });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Delete failed.',
      detail: error.message
    });
  }
});

router.get('/download/:storedName/:type', (req, res) => {
  try {
    const storedName = path.basename(String(req.params.storedName || ''));
    const type = String(req.params.type || '').toLowerCase();

    if (!stemLabels[type]) {
      res.status(400).json({ error: 'Invalid stem type.' });
      return;
    }

    const metadata = readUploadMetadata(storedName);
    const groupName = path.parse(storedName).name;
    const filePath = safeResultPath(path.join(groupName, stemFiles[type]));

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Result file was not found or has expired.' });
      return;
    }

    const downloadName = makeDownloadName(metadata.originalName, stemLabels[type]);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', makeContentDisposition(downloadName));
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({
      error: 'Download failed.',
      detail: error.message
    });
  }
});

export default router;

function makeContentDisposition(fileName) {
  const fallback = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]+/g, '')
    .replace(/[\\"]/g, '')
    .trim() || 'audio.wav';

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987(fileName)}`;
}

function encodeRFC5987(value) {
  return encodeURIComponent(value).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
