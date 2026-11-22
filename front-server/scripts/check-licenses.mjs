import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('node_modules');
const packages = new Map();
const problems = [];

async function inspectPackage(packageDir) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
  } catch {
    return;
  }

  const name = manifest.name ?? packageDir;
  const license = typeof manifest.license === 'string' ? manifest.license : '';
  packages.set(name, license);
  if (!license) {
    problems.push(`${name}: missing license metadata`);
  } else if (/(?:^|[^A-Z])(AGPL|GPL|LGPL|MPL|EPL|CDDL)(?:-[0-9.]+)?(?:$|[^A-Z])/i.test(license)) {
    problems.push(`${name}: copyleft license ${license}`);
  }

  await inspectNodeModules(path.join(packageDir, 'node_modules'));
}

async function inspectNodeModules(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.name.startsWith('@')) {
      const scoped = await readdir(entryPath, { withFileTypes: true });
      for (const child of scoped) {
        if (child.isDirectory()) await inspectPackage(path.join(entryPath, child.name));
      }
    } else {
      await inspectPackage(entryPath);
    }
  }
}

await inspectNodeModules(root);

if (problems.length) {
  console.error('Dependency license check failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`License check passed for ${packages.size} installed packages.`);
}
