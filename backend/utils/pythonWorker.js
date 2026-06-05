import { spawn } from 'node:child_process';
import path from 'node:path';
import { config } from '../config.js';

export function runPythonWorker(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(config.workerDir, scriptName);
    const child = spawn(config.pythonBin, [scriptPath, ...args], {
      cwd: config.rootDir,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (error?.code === 'ENOENT') {
        reject(new Error(`Python worker is not available on this server. Missing Python binary: ${config.pythonBin}.`));
        return;
      }

      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python worker exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error(`Python worker returned invalid JSON. ${stderr || stdout}`));
      }
    });
  });
}
