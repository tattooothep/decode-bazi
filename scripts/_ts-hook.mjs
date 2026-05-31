import { pathToFileURL } from 'node:url';
const ROOT = process.cwd();
export async function resolve(spec, ctx, next) {
  // @/ alias → src/ (เลียน tsconfig paths · เฉพาะ test)
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
