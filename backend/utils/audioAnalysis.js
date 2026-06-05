import path from 'node:path';
import {
  readUploadMetadata,
  safeUploadPath,
  updateUploadMetadata
} from './files.js';
import { runPythonWorker } from './pythonWorker.js';

const pendingAnalyses = new Map();

export function buildAudioFileInfo(storedName, analysis = null) {
  const inputPath = safeUploadPath(storedName);
  const metadata = readUploadMetadata(storedName);
  const ext = path.extname(metadata.originalName || storedName).replace('.', '').toLowerCase();
  const size = Number(metadata.size || 0);

  return {
    originalName: metadata.originalName || metadata.displayName || storedName,
    storedName: path.basename(storedName),
    duration: analysis?.duration || metadata.analysis?.duration || null,
    sizeMB: Number((size / 1024 / 1024).toFixed(2)),
    format: ext || 'audio',
    url: `/uploads/${encodeURIComponent(path.basename(inputPath))}`,
    status: 'Đã upload'
  };
}

export async function analyzeUploadedAudio(storedName, options = {}) {
  const safeName = path.basename(String(storedName || ''));
  if (!safeName) {
    throw new Error('Missing uploaded file name.');
  }

  const metadata = readUploadMetadata(safeName);
  if (!options.force && metadata.analysis) {
    return buildAnalyzeResponse(safeName, metadata.analysis);
  }

  if (!options.force && pendingAnalyses.has(safeName)) {
    return pendingAnalyses.get(safeName);
  }

  const task = runAnalysisWorker(safeName).finally(() => {
    pendingAnalyses.delete(safeName);
  });
  pendingAnalyses.set(safeName, task);
  return task;
}

export function warmAnalyzeUploadedAudio(storedName) {
  analyzeUploadedAudio(storedName).catch(() => {});
}

async function runAnalysisWorker(storedName) {
  const inputPath = safeUploadPath(storedName);
  const analysis = await runPythonWorker('analyze.py', ['--input', inputPath]);
  const normalizedAnalysis = {
    bpm: analysis.bpm,
    key: analysis.key,
    mode: analysis.mode,
    chords: analysis.chords || [],
    confidence: analysis.confidence || 'low',
    duration: analysis.duration,
    durationSeconds: analysis.durationSeconds,
    confidenceScore: analysis.confidenceScore
  };

  updateUploadMetadata(storedName, { analysis: normalizedAnalysis });
  return buildAnalyzeResponse(storedName, normalizedAnalysis);
}

function buildAnalyzeResponse(storedName, analysis) {
  return {
    ok: true,
    file: buildAudioFileInfo(storedName, analysis),
    analysis: {
      bpm: analysis.bpm,
      key: analysis.key,
      mode: analysis.mode,
      chords: analysis.chords || [],
      confidence: analysis.confidence || 'low'
    }
  };
}
