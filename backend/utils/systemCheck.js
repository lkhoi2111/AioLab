import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config } from '../config.js';

const requiredTools = [
  { key: 'python', command: config.pythonBin, args: ['--version'] },
  { key: 'ffmpeg', command: config.ffmpegLocation, args: ['-version'] },
  { key: 'ffprobe', command: config.ffprobeLocation, args: ['-version'] },
  { key: 'ytdlp', command: config.ytDlpBin, args: ['--version'] }
];

export function getSystemDiagnostics() {
  const diagnostics = {};

  for (const tool of requiredTools) {
    diagnostics[tool.key] = checkExecutable(tool.command, tool.args);
  }

  diagnostics.demucs = checkPythonModule('demucs');

  return diagnostics;
}

export function getSystemCheckBooleans() {
  const diagnostics = getSystemDiagnostics();

  return {
    python: diagnostics.python.ok,
    ffmpeg: diagnostics.ffmpeg.ok,
    ffprobe: diagnostics.ffprobe.ok,
    ytdlp: diagnostics.ytdlp.ok,
    demucs: diagnostics.demucs.ok
  };
}

export function logSystemDiagnostics(diagnostics = getSystemDiagnostics()) {
  console.log('[system] Runtime binary diagnostics:');

  for (const [key, result] of Object.entries(diagnostics)) {
    const status = result.ok ? 'OK' : 'MISSING';
    const location = result.location || 'not found';
    const detail = result.detail ? ` (${result.detail})` : '';
    console.log(`[system] ${key}: ${status} - ${location}${detail}`);
  }
}

export function assertRequiredRuntime(diagnostics = getSystemDiagnostics()) {
  const missing = Object.entries(diagnostics)
    .filter(([, result]) => !result.ok)
    .map(([key, result]) => `${key}: ${result.detail || 'not found'}`);

  if (missing.length > 0) {
    throw new Error(`Missing required production runtime tools: ${missing.join('; ')}`);
  }
}

function checkExecutable(command, args = []) {
  const location = resolveCommand(command);
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true
  });

  return {
    ok: Boolean(location) && !result.error && result.status === 0,
    location,
    detail: result.error?.message || firstLine(result.stdout) || firstLine(result.stderr)
  };
}

function checkPythonModule(moduleName) {
  const code = [
    `import ${moduleName}`,
    'from pathlib import Path',
    `print(Path(${moduleName}.__file__).resolve())`
  ].join('; ');
  const result = spawnSync(config.pythonBin, ['-c', code], {
    encoding: 'utf8',
    windowsHide: true
  });

  return {
    ok: !result.error && result.status === 0,
    location: firstLine(result.stdout),
    detail: result.error?.message || firstLine(result.stderr)
  };
}

function resolveCommand(command) {
  if (!command) return '';

  if (command.includes('/') || command.includes('\\')) {
    const absolute = path.resolve(command);
    return fs.existsSync(absolute) ? absolute : command;
  }

  const resolver = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(resolver, [command], {
    encoding: 'utf8',
    windowsHide: true
  });

  if (result.error || result.status !== 0) {
    return '';
  }

  return firstLine(result.stdout);
}

function firstLine(value = '') {
  return String(value).split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}
