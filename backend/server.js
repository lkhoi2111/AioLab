import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { ensureStorageDirs } from './utils/files.js';
import { startCleanupJob } from './utils/cleanup.js';
import chatRouter from './routes/chat.js';
import uploadRouter from './routes/upload.js';
import audioRouter from './routes/audio.js';
import downloaderRouter from './routes/downloader.js';
import extractAudioRouter from './routes/extractAudio.js';
import { downloadExtractedAudioController } from './controllers/extractAudioController.js';
import {
  assertRequiredRuntime,
  getSystemCheckBooleans,
  getSystemDiagnostics,
  logSystemDiagnostics
} from './utils/systemCheck.js';

ensureStorageDirs();
startCleanupJob();

const startupDiagnostics = getSystemDiagnostics();
logSystemDiagnostics(startupDiagnostics);
assertRequiredRuntime(startupDiagnostics);

const app = express();
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (isAllowedCorsOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(config.uploadDir));
app.use('/results', express.static(config.resultDir));
app.use('/separated', express.static(config.separatedDir));
app.get('/downloads/:filename', downloadExtractedAudioController);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uploadDir: config.uploadDir,
    resultDir: config.resultDir,
    separatedDir: config.separatedDir,
    downloadDir: config.downloadDir,
    outputDir: config.outputDir,
    tempFileTtlMinutes: config.tempFileTtlMs / 60 / 1000,
    cleanupIntervalMinutes: config.cleanupIntervalMs / 60 / 1000
  });
});

app.get('/api/system/check', (_req, res) => {
  res.json(getSystemCheckBooleans());
});

app.use('/api/chat', chatRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/audio', audioRouter);
app.use('/api/downloader', downloaderRouter);
app.use('/api/extract-audio', extractAudioRouter);

app.use((error, _req, res, _next) => {
  res.status(500).json({
    error: error.message || 'Internal server error.'
  });
});

app.get("/", (_req, res) => {
  res.send("AioLab API running");
});

const PORT = process.env.PORT || config.port || 4000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AioLab API running on port ${PORT}`);
});

function isAllowedCorsOrigin(origin) {
  if (config.clientOrigin.includes(origin)) return true;

  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}
