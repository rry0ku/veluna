import fs from 'node:fs';
import path from 'node:path';

const tag = process.argv[2] || process.env.TAG || 'v0.1.7';
const distDir = path.resolve(process.argv[3] || 'dist');
const repo = process.env.GITHUB_REPOSITORY || 'rry0ku/veluna';

if (!fs.existsSync(distDir)) {
  console.error(`Dist directory ${distDir} does not exist.`);
  process.exit(1);
}

const files = fs.readdirSync(distDir);
console.log(`Scanning ${files.length} files in ${distDir} for updater signatures...`);

const manifest = {
  version: tag.replace(/^v/, ''),
  notes: `See release notes at https://github.com/${repo}/releases/tag/${tag}`,
  pub_date: new Date().toISOString(),
  platforms: {}
};

for (const file of files) {
  if (!file.endsWith('.sig')) continue;

  const targetAsset = file.slice(0, -4); // remove .sig
  if (!files.includes(targetAsset)) {
    console.warn(`Signature file ${file} found without matching asset ${targetAsset}`);
    continue;
  }

  const sigPath = path.join(distDir, file);
  const signature = fs.readFileSync(sigPath, 'utf8').trim();
  const url = `https://github.com/${repo}/releases/download/${tag}/${targetAsset}`;

  const lower = targetAsset.toLowerCase();
  if (lower.includes('appimage') || (lower.includes('linux') && lower.includes('tar.gz'))) {
    manifest.platforms['linux-x86_64'] = { signature, url };
    console.log(`Added linux-x86_64 -> ${targetAsset}`);
  } else if (lower.includes('nsis') || lower.includes('setup') || (lower.includes('windows') && lower.includes('.zip')) || lower.endsWith('.exe.zip')) {
    manifest.platforms['windows-x86_64'] = { signature, url };
    console.log(`Added windows-x86_64 -> ${targetAsset}`);
  } else if (lower.includes('app.tar.gz') || lower.includes('macos') || lower.includes('darwin')) {
    if (lower.includes('aarch64') || lower.includes('arm64')) {
      manifest.platforms['darwin-aarch64'] = { signature, url };
      console.log(`Added darwin-aarch64 -> ${targetAsset}`);
    } else if (lower.includes('x86_64') || lower.includes('x64')) {
      manifest.platforms['darwin-x86_64'] = { signature, url };
      console.log(`Added darwin-x86_64 -> ${targetAsset}`);
    } else {
      manifest.platforms['darwin-aarch64'] = { signature, url };
      console.log(`Added darwin-aarch64 (default) -> ${targetAsset}`);
    }
  }
}

const platformCount = Object.keys(manifest.platforms).length;
if (platformCount === 0) {
  console.warn('WARNING: No updater .sig files found. latest.json will have empty platforms.');
} else {
  console.log(`Successfully mapped ${platformCount} platform(s) for updater.`);
}

const outPath = path.join(distDir, 'latest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Wrote ${outPath}`);
