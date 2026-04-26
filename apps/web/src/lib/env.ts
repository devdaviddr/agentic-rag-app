import { loadEnv, type Env } from '@app/shared';

let _env: Env | null = null;

/**
 * Lazily validate process.env. Called at request time, not import time, so
 * Next's build-time page-data collection doesn't crash on missing vars.
 */
export function getEnv(): Env {
  if (!_env) _env = loadEnv();
  return _env;
}
