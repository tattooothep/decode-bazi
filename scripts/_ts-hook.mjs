export async function resolve(spec, ctx, next) {
  // เติม type:json ให้ json import (Next ใส่ให้อัตโนมัติ · node ต้อง explicit)
  if (/\.json$/.test(spec)) {
    const r = await next(spec, ctx);
    return { ...r, importAttributes: { ...(r.importAttributes||{}), type: 'json' } };
  }
  if ((spec.startsWith('./') || spec.startsWith('../')) && !/\.(ts|js|mjs|json|cjs)$/.test(spec)) {
    try { return await next(spec, ctx); } catch {
      try { return await next(spec + '.ts', { ...ctx }); } catch {}
      try { return await next(spec + '/index.ts', { ...ctx }); } catch {}
    }
  }
  return next(spec, ctx);
}
