/* _stub-next-headers.mjs · ใช้เฉพาะเทส in-process (r378)
 * แทน next/headers: cookies()/headers() อ่าน-เขียนจาก globalThis
 * เพราะ route handler ที่เรียกตรงๆ นอก Next server ไม่มี request async storage
 * ตั้งค่า: globalThis.__testCookies = { decode_auth: "<jwt>" }
 * อ่านผล set-cookie: globalThis.__testCookieSets (array)
 */
export async function cookies() {
  return {
    get(name) {
      const v = (globalThis.__testCookies || {})[name];
      return v === undefined ? undefined : { name, value: v };
    },
    set(name, value, opts) {
      globalThis.__testCookieSets = globalThis.__testCookieSets || [];
      globalThis.__testCookieSets.push({ name, value, opts });
      globalThis.__testCookies = globalThis.__testCookies || {};
      globalThis.__testCookies[name] = value;
    },
  };
}
export async function headers() {
  return new Headers(globalThis.__testHeaders || {});
}
