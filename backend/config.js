import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import ffmpegStatic from 'ffmpeg-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });

export const config = {
  rootDir,
  backendDir: __dirname,
  workerDir: path.join(rootDir, 'worker'),

  uploadDir: path.join(rootDir, 'uploads'),
  resultDir: path.join(rootDir, 'results'),
  separatedDir: path.join(rootDir, 'separated'),

  downloadDir: path.join(rootDir, 'downloads'),
  downloadAudioDir: path.join(rootDir, 'downloads', 'audio'),
  downloadVideoDir: path.join(rootDir, 'downloads', 'video'),
  downloadTempDir: path.join(rootDir, 'downloads', 'temp'),

  outputDir: path.join(rootDir, 'outputs'),
  logDir: path.join(rootDir, 'logs'),

  port: Number(process.env.PORT || 4000),

  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  pythonBin: process.env.PYTHON_BIN || 'python',
  ytDlpBin: process.env.YT_DLP_BIN || 'yt-dlp',

  ffmpegLocation: process.env.FFMPEG_LOCATION || ffmpegStatic,

  tempFileTtlMs: Number(process.env.TEMP_FILE_TTL_MINUTES || 30) * 60 * 1000,
  cleanupIntervalMs: Number(process.env.CLEANUP_INTERVAL_MINUTES || 10) * 60 * 1000,

  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',

  deletionLogPath: path.join(rootDir, 'logs', 'deleted-files.log')
};