/* _ts-hook-account.mjs · เหมือน _ts-hook.mjs แต่ redirect 'next/headers' → stub (เทส in-process r378)
 * ใช้ผ่าน scripts/_ts-resolver-account.mjs เท่านั้น · ไม่กระทบ suite อื่น */
import { pathToFileURL } from 'node:url';
const ROOT = process.cwd();
export async function resolve(spec, ctx, next) {
  if (spec === 'next/server') {
    return next('next/server.js', ctx);
  }
  if (spec === 'next/headers') {
    // เทสบัญชี: cookies()/headers() อ่านจาก globalThis.__testCookies (ไม่มี Next request scope)
    return { url: pathToFileURL(`${ROOT}/scripts/_stub-next-headers.mjs`).href, shortCircuit: true };
  }
  if (spec.startsWith('@/')) {
    const rel = pathToFileURL(`${ROOT}/src/${spec.slice(2)}`).href;
    try { return await next(rel, ctx); } catch {
      try { return await next(rel + '.ts', ctx); } catch {}
      try { return await next(rel + '/index.ts', ctx); } catch {}
    }
  }
  if (/\.json$/.test(spec)) {
    const r = await next(spec, ctx);
    return { ...r, importAttributes: { ...(r.importAttributes||{}), type: 'json' } };
  }
  if ((spec.startsWith('./') || spec.startsWith('../')) && !/\.(ts|js|mjs|json|cjs)$/.test(spec)) {
    try { return await next(spec, ctx); } catch {
      try { return await next(spec + '.ts', ctx); } catch {}
      try { return await next(spec + '/index.ts', ctx); } catch {}
    }
  }
  return next(spec, ctx);
}
