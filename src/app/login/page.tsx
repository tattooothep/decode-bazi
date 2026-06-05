import { redirect } from "next/navigation";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] || "") : (value || "");
}

function safeNext(value: string): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const target = new URLSearchParams({ tab: "login" });
  const next = safeNext(firstParam(sp.next));
  const err = firstParam(sp.err);
  if (next) target.set("next", next);
  if (err) target.set("err", err);
  redirect(`/signup?${target.toString()}`);
}
