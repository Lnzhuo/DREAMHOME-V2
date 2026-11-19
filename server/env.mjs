import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadServerEnv(root = process.cwd()) {
  try {
    const content = await fs.readFile(path.join(root, '.env'), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
