#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const NODE_MODULES = path.join(ROOT, 'node_modules');
const OUTPUT_PATH = path.join(ROOT, 'reports', '04-lifecycle-scripts.json');
const TARGET_SCRIPT_KEYS = ['preinstall', 'install', 'postinstall'];

/** @type {Array<{name: string, version: string, path: string, scriptType: string, script: string}>} */
const results = [];
const visited = new Set();

const queue = [NODE_MODULES];

async function statSafe(target) {
  try {
    return await fs.lstat(target);
  } catch {
    return null;
  }
}

async function readDirSafe(target) {
  try {
    return await fs.readdir(target, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function processPackageDir(dirPath) {
  const pkgJsonPath = path.join(dirPath, 'package.json');
  const pkg = await readJsonSafe(pkgJsonPath);
  if (!pkg) return;

  const scripts = pkg.scripts || {};
  TARGET_SCRIPT_KEYS.forEach((key) => {
    const value = scripts[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      results.push({
        name: typeof pkg.name === 'string' ? pkg.name : '(unknown)',
        version: typeof pkg.version === 'string' ? pkg.version : '(unknown)',
        path: path.relative(ROOT, pkgJsonPath) || pkgJsonPath,
        scriptType: key,
        script: value,
      });
    }
  });
}

async function walk() {
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const realPath = await fs.realpath(current).catch(() => current);
    if (visited.has(realPath)) continue;
    visited.add(realPath);

    const stats = await statSafe(realPath);
    if (!stats || !stats.isDirectory()) continue;

    await processPackageDir(realPath);

    const entries = await readDirSafe(realPath);
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules' && realPath !== NODE_MODULES) {
        queue.push(path.join(realPath, entry.name));
        continue;
      }
      if (entry.isDirectory()) {
        // Skip binary cache directories
        if (entry.name === '.bin' || entry.name === '_bin') continue;
        queue.push(path.join(realPath, entry.name));
      }
    }
  }
}

async function ensureOutputDir() {
  try {
    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  } catch {
    // ignore mkdir errors
  }
}

async function main() {
  const nodeModulesStat = await statSafe(NODE_MODULES);
  if (!nodeModulesStat || !nodeModulesStat.isDirectory()) {
    console.error('node_modules directory not found. Did you run npm ci?');
    await ensureOutputDir();
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));
    process.exit(1);
  }

  await walk();
  await ensureOutputDir();
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Error while listing lifecycle scripts:', err);
  process.exitCode = 1;
});




