import { loadEnvConfig } from "@next/env";
loadEnvConfig("/home/jarvis/decode-app");
(async () => {
  const { signSession } = await import("/home/jarvis/decode-app/src/lib/auth");
  const tok = await signSession({ userId: "e29704a3-68fc-49d1-bd40-c205b2bd2043", email: "phone.0926154656@hourkey.local", orgId: "e2771c75-5ced-482d-8172-510d6bf989da" });
  console.log(tok);
})();
