import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const frontendPkgPath = path.resolve(rootDir, 'frontend', 'package.json');
const backendPkgPath = path.resolve(rootDir, 'backend', 'package.json');
const versionJsonPath = path.resolve(rootDir, 'frontend', 'public', 'version.json');

const bumpType = process.argv[2] || 'patch'; // 'patch', 'minor', 'major' or explicit semver

function getNextVersion(currentVersion, type) {
  if (/^\d+\.\d+\.\d+$/.test(type)) {
    return type;
  }
  const parts = currentVersion.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid semver in package.json: ${currentVersion}`);
  }
  let [major, minor, patch] = parts;
  if (type === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

const frontendPkg = JSON.parse(fs.readFileSync(frontendPkgPath, 'utf-8'));
const currentVersion = frontendPkg.version || '1.0.2';
const nextVersion = getNextVersion(currentVersion, bumpType);

console.log(`Bumping LetUsChat version: ${currentVersion} -> ${nextVersion} (${bumpType})`);

// 1. Update frontend/package.json
frontendPkg.version = nextVersion;
fs.writeFileSync(frontendPkgPath, JSON.stringify(frontendPkg, null, 2) + '\n');

// 2. Update backend/package.json
if (fs.existsSync(backendPkgPath)) {
  const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf-8'));
  backendPkg.version = nextVersion;
  fs.writeFileSync(backendPkgPath, JSON.stringify(backendPkg, null, 2) + '\n');
}

// 3. Update frontend/public/version.json
let commitSha = '';
try {
  commitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  commitSha = 'local';
}

const versionData = {
  version: nextVersion,
  buildTimestamp: new Date().toISOString(),
  commitSha: commitSha
};

fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2) + '\n');

console.log(`Version successfully updated to ${nextVersion}!`);
