#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BINARIES_DIR = path.resolve(ROOT_DIR, 'src-tauri', 'binaries');

const FALLBACK_VERSION = 'b6.1.1';

// Map platform and arch to eugeneware/ffmpeg-static asset and Tauri target triple
const TARGETS = {
  'linux-x64': {
    asset: 'ffmpeg-linux-x64.gz',
    dest: 'ffmpeg-x86_64-unknown-linux-gnu',
  },
  'win32-x64': {
    asset: 'ffmpeg-win32-x64.gz',
    dest: 'ffmpeg-x86_64-pc-windows-msvc.exe',
  },
  'darwin-arm64': {
    asset: 'ffmpeg-darwin-arm64.gz',
    dest: 'ffmpeg-aarch64-apple-darwin',
  },
  'darwin-x64': {
    asset: 'ffmpeg-darwin-x64.gz',
    dest: 'ffmpeg-x86_64-apple-darwin',
  },
};

let cachedVersion = null;

async function resolveLatestVersion() {
  if (cachedVersion) return cachedVersion;

  const envToken = process.env.GITHUB_TOKEN;
  const headers = { 'User-Agent': 'veluna-ffmpeg-updater' };
  if (envToken) {
    headers['Authorization'] = `Bearer ${envToken}`;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch('https://api.github.com/repos/eugeneware/ffmpeg-static/releases/latest', {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      if (data.tag_name) {
        console.log(`[ffmpeg] Resolved latest release tag from GitHub: ${data.tag_name}`);
        cachedVersion = data.tag_name;
        return cachedVersion;
      }
    } else {
      console.warn(`[ffmpeg] GitHub API status ${resp.status}, using fallback version ${FALLBACK_VERSION}`);
    }
  } catch (err) {
    console.warn(`[ffmpeg] Could not query latest version (${err.message}), using fallback version ${FALLBACK_VERSION}`);
  }

  cachedVersion = FALLBACK_VERSION;
  return cachedVersion;
}

async function downloadAndExtract(targetKey, forcedVersion = null) {
  const target = TARGETS[targetKey];
  if (!target) {
    throw new Error(`Unknown target key: ${targetKey}. Supported: ${Object.keys(TARGETS).join(', ')}`);
  }

  if (!fs.existsSync(BINARIES_DIR)) {
    fs.mkdirSync(BINARIES_DIR, { recursive: true });
  }

  const version = forcedVersion || await resolveLatestVersion();
  const versionFile = path.join(BINARIES_DIR, `${target.dest}.version`);
  const destPath = path.join(BINARIES_DIR, target.dest);

  if (
    fs.existsSync(destPath) &&
    fs.statSync(destPath).size > 1000000 &&
    fs.existsSync(versionFile) &&
    fs.readFileSync(versionFile, 'utf8').trim() === version
  ) {
    console.log(`[ffmpeg] ${target.dest} is up-to-date (${version}, ${(fs.statSync(destPath).size / 1024 / 1024).toFixed(1)} MB). Skipping.`);
    return;
  }

  const baseUrl = `https://github.com/eugeneware/ffmpeg-static/releases/download/${version}`;
  const url = `${baseUrl}/${target.asset}`;
  console.log(`[ffmpeg] Downloading ${target.asset} (${version}) for ${targetKey}...`);
  console.log(`[ffmpeg] URL: ${url}`);

  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) {
    throw new Error(`Failed to download ${url}: ${resp.status} ${resp.statusText}`);
  }

  const tempDest = path.join(BINARIES_DIR, `${target.dest}.tmp`);

  // Stream decompression
  const nodeStream = Readable.fromWeb(resp.body);
  const gunzip = createGunzip();
  const fileOut = fs.createWriteStream(tempDest);

  await pipeline(nodeStream, gunzip, fileOut);

  // Set executable permissions on non-windows
  if (!target.dest.endsWith('.exe')) {
    fs.chmodSync(tempDest, 0o755);
  }

  fs.renameSync(tempDest, destPath);
  fs.writeFileSync(versionFile, version, 'utf8');
  console.log(`[ffmpeg] Successfully installed ${target.dest} (${version}, ${(fs.statSync(destPath).size / 1024 / 1024).toFixed(1)} MB).`);
}

async function main() {
  const arg = process.argv[2];
  if (arg === 'all') {
    for (const key of Object.keys(TARGETS)) {
      await downloadAndExtract(key);
    }
    return;
  }

  if (arg) {
    await downloadAndExtract(arg);
    return;
  }

  // Detect current platform and arch
  const currentKey = `${process.platform}-${process.arch}`;
  console.log(`[ffmpeg] Detected host environment: ${currentKey}`);

  if (TARGETS[currentKey]) {
    await downloadAndExtract(currentKey);
  } else {
    console.warn(`[ffmpeg] Host ${currentKey} not found in predefined targets.`);
  }
}

main().catch((err) => {
  console.error('[ffmpeg] Setup failed:', err);
  process.exit(1);
});
