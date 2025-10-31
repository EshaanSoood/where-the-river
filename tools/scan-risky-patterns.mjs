#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const NODE_MODULES = path.join(ROOT, 'node_modules');
const OUTPUT_JSON = path.join(ROOT, 'reports', '05-risky-patterns.json');
const OUTPUT_MD = path.join(ROOT, 'reports', '05-risky-patterns.md');

const FILE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.sh', '.bash', '.zsh', '.ps1']);

const PATTERNS = [
  { id: 'child_process', test: (line) => line.includes('child_process') },
  { id: 'exec(', test: (line) => line.includes('exec(') },
  { id: 'spawn(', test: (line) => line.includes('spawn(') },
  { id: 'eval(', test: (line) => line.includes('eval(') },
  { id: 'new Function(', test: (line) => line.includes('new Function(') },
  { id: 'curl ', test: (line) => line.includes('curl ') },
  { id: 'wget ', test: (line) => line.includes('wget ') },
  { id: 'Invoke-WebRequest', test: (line) => line.toLowerCase().includes('invoke-webrequest') },
  { id: 'powershell', test: (line) => line.toLowerCase().includes('powershell') },
  { id: 'http.request(', test: (line) => line.includes('http.request(') },
  { id: 'https.request(', test: (line) => line.includes('https.request(') },
  { id: 'fetch(', test: (line) => line.includes('fetch(') },
  { id: 'net.', test: (line) => line.includes('net.') },
  { id: 'fs.readFile(', test: (line) => line.includes('fs.readFile(') },
  { id: 'fs.writeFile(', test: (line) => line.includes('fs.writeFile(') },
  { id: 'process.env', test: (line) => line.includes('process.env') },
  { id: 'SSH_', test: (line) => line.includes('SSH_') },
  { id: 'AWS_', test: (line) => line.includes('AWS_') },
];

const results = [];

function isRelevantFile(filePath) {
  const ext = path.extname(filePath);
  if (FILE_EXTENSIONS.has(ext)) return true;
  // handle shell files without extensions
  if (!ext && /\.(?:cmd|bat)$/i.test(filePath)) return true;
  return false;
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function ensureReportsDir() {
  try {
    await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  } catch {
    // ignore mkdir errors
  }
}

async function collectFiles(dirPath, accumulator) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue; // dependencies handled separately
      await collectFiles(full, accumulator);
    } else if (entry.isFile()) {
      if (isRelevantFile(entry.name) || isRelevantFile(full)) {
        accumulator.push(full);
      }
    }
  }
}

function gatherMatches(content, packageInfo, filePath) {
  const lines = content.split(/\r?\n/);
  const fileMatches = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const matchedPatterns = PATTERNS.filter((pattern) => {
      try {
        return pattern.test(line);
      } catch {
        return false;
      }
    });
    if (matchedPatterns.length === 0) continue;

    const contextStart = Math.max(0, idx - 1);
    const contextEnd = Math.min(lines.length, idx + 2);
    const context = lines.slice(contextStart, contextEnd);
    matchedPatterns.forEach((pattern) => {
      fileMatches.push({
        pattern: pattern.id,
        line: idx + 1,
        context,
      });
    });
  }

  if (fileMatches.length > 0) {
    results.push({
      package: packageInfo,
      file: path.relative(ROOT, filePath) || filePath,
      matches: fileMatches,
    });
  }
}

async function scanPackage(pkgDir, pkgInfo) {
  const filesToScan = [];
  await collectFiles(pkgDir, filesToScan);
  for (const filePath of filesToScan) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      gatherMatches(content, pkgInfo, filePath);
    } catch {
      // ignore unreadable files
    }
  }
}

async function walkNodeModules() {
  const queue = [NODE_MODULES];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const realPath = await fs.realpath(current).catch(() => current);
    if (visited.has(realPath)) continue;
    visited.add(realPath);

    const entries = await fs.readdir(realPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(realPath, entry.name);
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          queue.push(full);
          continue;
        }

        const pkgJsonPath = path.join(full, 'package.json');
        const pkg = await readJsonSafe(pkgJsonPath);
        if (pkg && typeof pkg.name === 'string') {
          const pkgInfo = {
            name: pkg.name,
            version: typeof pkg.version === 'string' ? pkg.version : '(unknown)',
            packageJsonPath: path.relative(ROOT, pkgJsonPath) || pkgJsonPath,
          };
          await scanPackage(full, pkgInfo);

          // enqueue nested node_modules for child dependencies
          const nestedNodeModules = path.join(full, 'node_modules');
          const nestedStat = await fs.stat(nestedNodeModules).catch(() => null);
          if (nestedStat && nestedStat.isDirectory()) {
            queue.push(nestedNodeModules);
          }
        } else {
          // possibly a scope directory like @scope
          queue.push(full);
        }
      }
    }
  }
}

function buildMarkdownSummary() {
  if (results.length === 0) return '# Risky Pattern Scan\n\nNo matches were found.\n';

  const sections = ['# Risky Pattern Scan', ''];
  const grouped = new Map();

  for (const entry of results) {
    const key = `${entry.package.name}@${entry.package.version}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(entry);
  }

  for (const [pkgKey, entries] of grouped.entries()) {
    sections.push(`## ${pkgKey}`);
    entries.sort((a, b) => a.file.localeCompare(b.file));
    for (const entry of entries) {
      sections.push(`- **${entry.file}**`);
      entry.matches.forEach((match) => {
        const context = match.context.map((line) => line.trim()).join(' | ');
        sections.push(`  - ${match.pattern} (line ${match.line}): ${context}`);
      });
    }
    sections.push('');
  }

  return sections.join('\n');
}

async function main() {
  const nodeModulesStat = await fs.stat(NODE_MODULES).catch(() => null);
  if (!nodeModulesStat || !nodeModulesStat.isDirectory()) {
    console.error('node_modules directory not found. Did you run npm ci?');
    await ensureReportsDir();
    await fs.writeFile(OUTPUT_JSON, JSON.stringify([], null, 2));
    await fs.writeFile(OUTPUT_MD, '# Risky Pattern Scan\n\nnode_modules directory not found.');
    process.exit(1);
  }

  await walkNodeModules();
  await ensureReportsDir();
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(results, null, 2));
  await fs.writeFile(OUTPUT_MD, buildMarkdownSummary());
}

main().catch((err) => {
  console.error('Error during risky pattern scan:', err);
  process.exitCode = 1;
});




