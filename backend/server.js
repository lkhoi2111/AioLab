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

ensureStorageDirs();
startCleanupJob();

const app = express();

app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true
  })
);

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

const PORT = process.env.PORT || config.port;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Music Studio API running on port ${PORT}`);
});