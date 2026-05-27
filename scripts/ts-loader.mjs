/* resolve-hook: ให้ node --experimental-strip-types import .ts แบบ extensionless + .json ได้
   ใช้กับ test ที่ import ไฟล์ TS จริง (เช่น chart-packet.ts) · รัน:
   node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/<test>.mjs */
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && !/\.\w+$/.test(spec)) {
    try {
      const base = new URL(spec, ctx.parentURL);
      for (const ext of ['.ts', '.mts', '.js', '.json']) {
        if (existsSync(fileURLToPath(base.href + ext))) return next(spec + ext, ctx);
      }
    } catch {}
  }
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.endsWith('.json')) ctx.importAttributes = { ...(ctx.importAttributes || {}), type: 'json' };
  return next(url, ctx);
}
