import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  dbFile: string;
  uploadsDir: string;
}

/** Runtime settings from the environment; all data lives under DATA_DIR (default ./data). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = path.resolve(env.DATA_DIR ?? 'data');
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    dataDir,
    dbFile: path.join(dataDir, 'shop.db'),
    uploadsDir: path.join(dataDir, 'uploads'),
  };
}
