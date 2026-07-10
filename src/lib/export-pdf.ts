/**
 * export-pdf.ts · server-side render "สรุป PDF" → ไฟล์ .pdf ล้วน (ดาวน์โหลดตรง · ไม่เด้ง print dialog)
 * ─ เจ้านายสั่ง: "อย่าปริ้น เอาเซฟ file pdf ล้วน ๆ" → เจน PDF ฝั่ง server ด้วย chromium --print-to-pdf
 * ─ ไม่มี dependency ใหม่: ใช้ chromium ของ playwright (มี --headless --print-to-pdf ในตัว · ไม่ต้อง puppeteer)
 * ─ additive: อ่าน result ที่ worker เก็บไว้แล้ว (markdown/cover/figs) → ไม่เรียก AI ซ้ำ · ไม่หักยามซ้ำ
 * ─ พอร์ต mdSafe + coverHtml จาก public/js/hk-print.js · ใช้ CSS จาก public/css/hk-print.css (inline · cache)
 * ⚠️ ปกบังคับเสมอ (กฎเจ้านาย) · รองรับ 9 ภาษา (เนื้อมาจาก result อยู่แล้ว)
 */
import { spawn } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { parsePdfDocumentV2, type PdfBlockV2, type PdfDocumentV2 } from "@/lib/pdf-document-v2";

const SEAL = "時";
const CHROME_TIMEOUT_MS = Number(process.env.EXPORT_CHROME_TIMEOUT_MS || 30_000);

/* ── result shape (จาก worker · route.ts processExport) ── */
export type ExportFig = { svg?: string; cap?: string };
export type ExportCover = {
  kick?: string; title?: string; who?: string; metaHtml?: string; meta?: string;
  big?: string; sub?: string; badge?: string; qrLabel?: string; qr?: boolean;
};
export type ExportResult = { markdown?: string; cover?: ExportCover; figs?: ExportFig[]; page?: string; lang?: string; document?: unknown };

/* ── i18n เล็ก (หัว/ท้ายกระดาษ · เนื้อหลักมาจาก result แล้ว) ── */
const PAGE_WORD: Record<string, string> = { th: "หน้า", en: "Page", zh: "頁", cn: "页", vi: "Trang", ja: "ページ", ko: "페이지", ru: "Стр.", es: "Pág." };
const DATE_PREFIX: Record<string, string> = { th: "ออกเอกสาร ", en: "Issued ", zh: "出具 ", cn: "出具 ", vi: "Xuất ", ja: "発行 ", ko: "발행 ", ru: "Выдано ", es: "Emitido " };
const DATE_LOCALE: Record<string, string> = { th: "th-TH", en: "en-US", zh: "zh-TW", cn: "zh-CN", vi: "vi-VN", ja: "ja-JP", ko: "ko-KR", ru: "ru-RU", es: "es-ES" };

function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function dateStr(lang: string): string {
  const prefix = DATE_PREFIX[lang] || DATE_PREFIX.en;
  try { return prefix + new Date().toLocaleDateString(DATE_LOCALE[lang] || "en-US"); } catch { return "hourkey"; }
}

/* ── mdSafe: markdown → html (escape ก่อนแปลง) · พอร์ตตรงจาก hk-print.js (หัวข้อ/ตาราง/ตัวหนา/ลิสต์/เส้นคั่น) ── */
function mdSafe(md: string): string {
  const lines = String(md == null ? "" : md).split(/\r?\n/);
  const out: string[] = [];
  let listBuf: string[] = [];
  let i = 0;
  const inline = (s: string): string => {
    s = esc(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  };
  const flushList = () => { if (listBuf.length) { out.push('<ul class="md-ul">' + listBuf.join("") + "</ul>"); listBuf = []; } };
  const cells = (row: string): string[] => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => inline(c.trim()));
  while (i < lines.length) {
    const ln = lines[i];
    if (/^\s*\|.+\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|[\s:|\-]+\|\s*$/.test(lines[i + 1])) {
      flushList();
      const hd = cells(ln); i += 2; const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push('<div class="md-tw"><table class="md-t"><thead><tr>' + hd.map((h) => "<th>" + h + "</th>").join("") +
        "</tr></thead><tbody>" + rows.map((r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>");
      continue;
    }
    if (/^\s*#{1,4}\s+/.test(ln)) {
      flushList();
      const lvl = (ln.match(/^\s*(#{1,4})/) as RegExpMatchArray)[1].length;
      out.push('<div class="md-h md-h' + lvl + '">' + inline(ln.replace(/^\s*#{1,4}\s+/, "")) + "</div>"); i++; continue;
    }
    if (/^\s*[-*•]\s+/.test(ln)) { listBuf.push("<li>" + inline(ln.replace(/^\s*[-*•]\s+/, "")) + "</li>"); i++; continue; }
    const num = ln.match(/^\s*(\d{1,2}[.)])\s+(.*)$/);
    if (num) { flushList(); out.push('<div class="md-p"><strong>' + esc(num[1]) + "</strong> " + inline(num[2]) + "</div>"); i++; continue; }
    if (/^\s*(-{3,}|_{3,})\s*$/.test(ln)) { flushList(); out.push('<hr class="md-hr">'); i++; continue; }
    flushList();
    out.push(ln.trim() === "" ? '<div class="md-sp"></div>' : '<div class="md-p">' + inline(ln) + "</div>");
    i++;
  }
  flushList();
  return out.join("");
}

/* ── หน้าปก · พอร์ตตรงจาก hk-print.js coverHtml (ตรา 時 + ชื่อ + เจ้าของ + meta + QR) ── */
function coverHtml(c: ExportCover & { qrHtml?: string }): string {
  const qr = c.qr === true && c.qrHtml ? '<div class="qr">' + c.qrHtml + "</div>" : "";
  const big = c.big ? '<div class="big">' + esc(c.big) + "</div>" : "";
  const badge = c.badge ? '<div class="badge">' + esc(c.badge) + "</div>" : "";
  return '<div class="hkp-cover"><div class="seal-lg">' + SEAL + "</div>" +
    '<div class="kick">' + esc(c.kick || "") + "</div>" +
    "<h1>" + esc(c.title || "") + "</h1>" +
    '<div class="who">' + esc(c.who || "") + "</div>" +
    '<div class="meta">' + (c.metaHtml || esc(c.meta || "")) + "</div>" +
    big +
    (c.sub ? '<div class="meta">' + esc(c.sub) + "</div>" : "") +
    badge + qr + "</div>";
}
function head(title: string, lang: string, reportId = ""): string {
  return '<div class="hkp-head"><span class="lg"><span class="seal">' + SEAL + '</span>hourkey · ' + esc(title) + '</span><span class="hkp-head-meta">' +
    (reportId ? '<span class="hkp-report-id">' + esc(reportId) + '</span>' : '') + esc(dateStr(lang)) + "</span></div>";
}
function foot(pageNo: number, total: number, lang: string, reportId = "", verificationLabel = ""): string {
  const pw = PAGE_WORD[lang] || PAGE_WORD.en;
  const left = ["hourkey.io", verificationLabel, reportId].filter(Boolean).map(esc).join(" · ");
  return '<div class="hkp-foot"><span>' + left + '</span><span>' + esc(pw) + " " + pageNo + " / " + total + "</span></div>";
}

function structuredBlockHtml(block: PdfBlockV2): string {
  if (block.type === "heading") {
    return block.level === 3
      ? '<h3 class="hkp-subsec">' + esc(block.text) + "</h3>"
      : '<h2 class="sec">' + esc(block.text) + "</h2>";
  }
  if (block.type === "callout") {
    return '<div class="hkp-callout ' + esc(block.tone) + '">' +
      (block.label ? '<span class="lab">' + esc(block.label) + "</span>" : "") +
      "<p>" + esc(block.text) + "</p></div>";
  }
  if (block.type === "facts") {
    return '<div class="hkp-facts cols-' + block.columns + '">' + block.items.map((item) =>
      '<div class="x"><span class="l">' + esc(item.label) + '</span><span class="v">' + esc(item.value) + "</span></div>"
    ).join("") + "</div>";
  }
  if (block.type === "table") {
    const colgroup = block.columns.some((col) => col.width)
      ? "<colgroup>" + block.columns.map((col) => '<col' + (col.width ? ' style="width:' + esc(col.width) + '"' : "") + ">").join("") + "</colgroup>"
      : "";
    return '<div class="hkp-table-wrap"><table class="hkp-table' + (block.compact ? " compact" : "") + '">' + colgroup +
      "<thead><tr>" + block.columns.map((col) => "<th>" + esc(col.label) + "</th>").join("") + "</tr></thead><tbody>" +
      block.rows.map((row) => "<tr>" + block.columns.map((col) => "<td>" + esc(row[col.key] ?? "") + "</td>").join("") + "</tr>").join("") +
      "</tbody></table></div>";
  }
  if (block.type === "list") {
    const tag = block.ordered ? "ol" : "ul";
    return "<" + tag + ' class="hkp-list">' + block.items.map((item) => "<li>" + esc(item) + "</li>").join("") + "</" + tag + ">";
  }
  if (block.type === "prose") {
    return '<div class="hkp-prose">' + block.paragraphs.map((p) => "<p>" + esc(p) + "</p>").join("") + "</div>";
  }
  if (block.type === "figure") {
    return '<figure class="hkp-figure">' + block.svg + (block.caption ? "<figcaption>" + esc(block.caption) + "</figcaption>" : "") + "</figure>";
  }
  return "";
}

function structuredDocPages(doc: PdfDocumentV2, lang: string): string {
  const reportId = doc.report.id;
  const headTitle = doc.report.headerTitle || doc.report.title;
  const verification = doc.report.verificationLabel || "";
  const cover: ExportCover = {
    kick: doc.cover.kick,
    title: doc.cover.title,
    who: doc.cover.who,
    metaHtml: doc.cover.meta.map(esc).join("<br>"),
    big: doc.cover.glyph,
    badge: doc.cover.badge,
    qr: false,
  };
  const total = doc.pages.length + 1;
  const coverClass = doc.report.kind === "ai" ? " premium-cover" : " quick-cover";
  let pages = '<div class="hkp-page' + coverClass + '">' + head(headTitle, lang, reportId) + coverHtml(cover) + foot(1, total, lang, reportId, verification) + "</div>";
  doc.pages.forEach((page, index) => {
    const cls = "hkp-page" + (page.landscape ? " land" : "");
    const title = page.title ? '<h2 class="sec">' + esc(page.title) + "</h2>" : "";
    pages += '<div class="' + cls + '">' + head(headTitle, lang, reportId) + title + page.blocks.map(structuredBlockHtml).join("\n") +
      foot(index + 2, total, lang, reportId, verification) + "</div>";
  });
  return pages;
}

/* ── CSS จาก public/css/hk-print.css (อ่านครั้งเดียว · cache) ── */
let CSS_CACHE: string | null = null;
function loadCss(): string {
  if (CSS_CACHE != null) return CSS_CACHE;
  const candidates = [
    join(process.cwd(), "public/css/hk-print.css"),
    join(process.cwd(), "../public/css/hk-print.css"),
  ];
  for (const p of candidates) {
    try { const s = readFileSync(p, "utf8"); CSS_CACHE = s; return s; } catch { /* ลองตัวถัดไป */ }
  }
  CSS_CACHE = "";
  return "";
}

/* ── หา chromium: env EXPORT_CHROME ก่อน ไม่งั้น glob playwright เอาเวอร์ชันใหม่สุด (cache) ── */
let CHROME_CACHE: string | null = null;
function resolveChrome(): string {
  if (CHROME_CACHE) return CHROME_CACHE;
  const env = process.env.EXPORT_CHROME;
  if (env && existsSync(env)) { CHROME_CACHE = env; return env; }
  const base = "/root/.cache/ms-playwright";
  let best: { n: number; path: string } | null = null;
  try {
    for (const name of readdirSync(base)) {
      const m = /^chromium-(\d+)$/.exec(name); // เฉพาะ chromium-<num> (ตัด chromium_headless_shell)
      if (!m) continue;
      const n = Number(m[1]);
      for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
        const p = join(base, name, sub);
        if (existsSync(p)) { if (!best || n > best.n) best = { n, path: p }; break; }
      }
    }
  } catch { /* base ไม่มี → โยน error ด้านล่าง */ }
  if (!best) throw new Error("chromium_not_found");
  CHROME_CACHE = best.path;
  return best.path;
}

/* ── HTML เต็มหน้า (ปก + figs + สรุป) · โครงเดียวกับ hk-print.js summaryFromMarkdown ── */
function buildDocHtml(result: ExportResult, lang: string): string {
  const structured = result.document ? parsePdfDocumentV2(result.document) : null;
  if (structured) {
    const css = loadCss();
    const pages = structuredDocPages(structured, lang);
    return "<!doctype html><html lang=\"" + esc(lang) + "\"><head><meta charset=\"utf-8\">" +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      "<title>" + esc(structured.report.title) + "</title>" +
      "<style>" + css + "\n@page{size:A4;margin:12mm}\nhtml,body{background:#fff}\n.hkp-root{display:block}</style>" +
      '</head><body class="hkp-active"><div class="hkp-root">' + pages + "</div></body></html>";
  }
  const cover: ExportCover = result.cover || { kick: "สรุปดวงชะตา", title: "รายงานสรุป", who: "", qrLabel: "hourkey.io" };
  const md = String(result.markdown == null ? "" : result.markdown);

  // ตัด section ตามหัวข้อระดับ 2 (## ) · ### ไม่เข้าเงื่อนไข (อยู่ในเนื้อ)
  const lines = md.split(/\r?\n/);
  const secs: Array<{ title: string; body: string }> = [];
  let cur: { title: string; body: string } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*##\s+(.*)$/);
    if (m) { cur = { title: m[1].trim(), body: "" }; secs.push(cur); }
    else { if (!cur) { if (!lines[i].trim()) continue; cur = { title: "", body: "" }; secs.push(cur); } cur.body += lines[i] + "\n"; }
  }

  let figsHtml = "";
  (result.figs || []).forEach((f) => {
    if (!f || !f.svg) return;
    figsHtml += '<div class="fig">' + f.svg + (f.cap ? '<div class="cap">' + esc(f.cap) + "</div>" : "") + "</div>";
  });

  const contentPages: string[][] = [];
  secs.forEach((s, idx) => {
    const body = '<div class="hkp-summary">' + mdSafe(s.body) + "</div>";
    const sectionHtml = s.title ? ('<h2 class="sec">' + esc(s.title) + "</h2>" + body) : body;
    contentPages.push((idx === 0 && figsHtml) ? [figsHtml, sectionHtml] : [sectionHtml]);
  });
  if (!contentPages.length) contentPages.push([(figsHtml || "") + '<div class="hkp-summary">' + mdSafe(md) + "</div>"]);

  const headTitle = cover.who || cover.title || "รายงานสรุป";
  const total = contentPages.length + 1; // + ปก
  let pn = 0;
  let pages = "";
  pn++;
  pages += '<div class="hkp-page">' + head(headTitle, lang) + coverHtml(cover) + foot(pn, total, lang) + "</div>";
  contentPages.forEach((sections) => {
    pn++;
    pages += '<div class="hkp-page">' + head(headTitle, lang) + sections.join("\n") + foot(pn, total, lang) + "</div>";
  });

  const css = loadCss();
  const docTitle = "hourkey-summary" + (cover.title ? "-" + cover.title : "");
  // chromium --print-to-pdf render เป็น print media → @media print ใน hk-print.css ทำงาน (.hkp-root โผล่)
  return "<!doctype html><html lang=\"" + esc(lang) + "\"><head><meta charset=\"utf-8\">" +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + esc(docTitle) + "</title>" +
    "<style>" + css + "\n@page{size:A4;margin:12mm}\nhtml,body{background:#fff}\n.hkp-root{display:block}</style>" +
    '</head><body class="hkp-active"><div class="hkp-root">' + pages + "</div></body></html>";
}

/* ── spawn chromium --print-to-pdf · timeout kill กันค้าง ── */
function runChrome(chrome: string, inPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--no-pdf-header-footer", "--print-to-pdf=" + outPath, inPath,
    ];
    const child = spawn(chrome, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; clearTimeout(timer); fn(); };
    const timer = setTimeout(() => {
      if (done) return; done = true;
      try { child.kill("SIGKILL"); } catch { /* already dead */ }
      reject(new Error("chrome_timeout"));
    }, CHROME_TIMEOUT_MS);
    child.stderr?.on("data", (d) => { if (stderr.length < 4000) stderr += String(d); });
    child.on("error", (e) => finish(() => reject(e)));
    child.on("close", (code) => finish(() => {
      if (existsSync(outPath)) resolve();
      else reject(new Error("chrome_failed_" + code + ":" + stderr.slice(0, 200)));
    }));
  });
}

/**
 * renderExportPdf · result(จาก worker) → Buffer ของ PDF
 * @param jobId ใช้ตั้งชื่อ temp dir (กันชนกันหลาย request) · sanitize แล้ว
 */
export async function renderExportPdf(result: ExportResult, lang: string, jobId: string): Promise<Buffer> {
  const chrome = resolveChrome();
  const safeLang = (typeof lang === "string" && lang) ? lang : (result.lang || "th");
  const html = buildDocHtml(result, safeLang);

  const uniq = (String(jobId || "").replace(/[^0-9a-zA-Z-]/g, "") || "job") + "-" + randomBytes(4).toString("hex");
  const dir = join("/var/tmp/export-pdf", uniq);
  const inPath = join(dir, "doc.html");
  const outPath = join(dir, "out.pdf");

  mkdirSync(dir, { recursive: true, mode: 0o755 });
  try {
    writeFileSync(inPath, html, "utf8");
    await runChrome(chrome, inPath, outPath);
    const buf = readFileSync(outPath);
    if (!buf || buf.length < 400) throw new Error("pdf_empty");
    return buf;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
}
