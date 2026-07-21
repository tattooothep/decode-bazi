import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PdfDocumentV2 } from "../src/lib/pdf-document-v2";
import { renderExportPdf } from "../src/lib/export-pdf";

const outDir = process.argv[2] || "/root/artifacts/hourkey-pdf-v2";
mkdirSync(outDir, { recursive: true });

const languages = ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"];
const samples: Record<string, { title: string; sample: string }> = {
  th: { title: "รายงานหล่อแก", sample: "ข้อมูลตัวอย่างจาก Engine ใช้ตรวจรูปแบบเอกสาร ตาราง สี และการแบ่งหน้า" },
  en: { title: "Luopan report", sample: "Engine preview data for document layout, table, color and pagination review" },
  zh: { title: "羅盤報告", sample: "引擎預覽資料，用於檢查版面、表格、顏色與分頁" },
  cn: { title: "罗盘报告", sample: "引擎预览资料，用于检查版面、表格、颜色与分页" },
  vi: { title: "Báo cáo La Bàn", sample: "Dữ liệu xem trước để kiểm tra bố cục, bảng, màu và phân trang" },
  ja: { title: "羅盤レポート", sample: "レイアウト・表・色・改ページ確認用のエンジンプレビューデータ" },
  ko: { title: "나경 리포트", sample: "레이아웃, 표, 색상, 페이지 나눔 확인용 엔진 미리보기 데이터" },
  ru: { title: "Отчёт Лопань", sample: "Данные движка для проверки макета, таблиц, цвета и разбивки страниц" },
  es: { title: "Informe Luopan", sample: "Datos del motor para revisar diseño, tablas, color y paginación" },
};

function figureSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 280"><rect width="600" height="280" fill="#fff"/><circle cx="150" cy="140" r="110" fill="#fffefa" stroke="#a47f2d" stroke-width="3"/><circle cx="150" cy="140" r="72" fill="none" stroke="#d8d1c1"/><line x1="150" y1="140" x2="150" y2="40" stroke="#a47f2d" stroke-width="5"/><circle cx="150" cy="140" r="7" fill="#725516"/><rect x="310" y="50" width="230" height="36" fill="#1f6b4f"/><rect x="310" y="105" width="170" height="36" fill="#a47f2d"/><rect x="310" y="160" width="110" height="36" fill="#9f3434"/><text x="310" y="230" font-size="16" fill="#171b24">ENGINE EVIDENCE</text></svg>`;
}

function baseDocument(lang: string, kind: "quick" | "ai"): PdfDocumentV2 {
  const t = samples[lang];
  const pageCount = kind === "quick" ? 4 : 7;
  const evidenceRows = Array.from({ length: 12 }, (_, i) => ({
    rank: String(i + 1),
    item: `${i * 15}° · ${["子", "午", "卯", "酉"][i % 4]}`,
    status: i % 3 === 0 ? "Recommended" : i % 3 === 1 ? "Review" : "Caution",
    evidence: `${t.sample} · evidence ${i + 1}`,
  }));
  const pages: PdfDocumentV2["pages"] = Array.from({ length: pageCount }, (_, index) => ({
    landscape: false,
    title: index === 0 ? (kind === "quick" ? "ENGINE SNAPSHOT" : "EXECUTIVE VERDICT") : `SECTION ${index + 1}`,
    blocks: index === 0 ? [
      { type: "figure", svg: figureSvg(), caption: t.sample },
      { type: "facts", columns: 2, items: [
        { label: "REPORT TYPE", value: kind === "quick" ? "Quick Engine Report" : "AI Sifu Report · 20 yam" },
        { label: "LANGUAGE", value: lang },
        { label: "FACING", value: "180° · 午" },
        { label: "PERIOD", value: "9" },
      ] },
      { type: "callout", label: kind === "quick" ? "ENGINE RESULT" : "AI VERDICT", text: t.sample, tone: "good" },
    ] : index === 1 ? [
      { type: "table", compact: true, columns: [
        { key: "rank", label: "#", width: "7%" },
        { key: "item", label: "POSITION", width: "18%" },
        { key: "status", label: "STATUS", width: "18%" },
        { key: "evidence", label: "ENGINE EVIDENCE", width: "57%" },
      ], rows: evidenceRows },
    ] : [
      { type: "heading", text: kind === "quick" ? "DETERMINISTIC DETAILS" : "AI INTERPRETATION", level: 3 },
      { type: "prose", paragraphs: [t.sample, t.sample, t.sample] },
      { type: "list", ordered: false, items: [t.sample, t.sample, t.sample, t.sample] },
      { type: "callout", label: index === pageCount - 1 ? "BOUNDARY" : "EVIDENCE", text: t.sample, tone: index === pageCount - 1 ? "warning" : "neutral" },
    ],
  }));
  return {
    version: "hourkey.pdf.v2",
    report: {
      id: `PREVIEW-${kind.toUpperCase()}-${lang.toUpperCase()}`,
      kind,
      lang,
      title: t.title,
      headerTitle: kind === "quick" ? "QUICK ENGINE REPORT" : "AI SIFU REPORT",
      issuedAt: new Date().toISOString(),
      verificationLabel: kind === "quick" ? "Deterministic engine preview" : "Engine evidence · AI interpretation preview",
    },
    cover: {
      kick: kind === "quick" ? "QUICK ENGINE REPORT · 羅盤" : "AI SIFU REPORT · 20 YAM · 羅盤",
      title: t.title,
      who: "PDF V2 DESIGN PREVIEW",
      meta: ["180° · 午", "Period 9", lang],
      glyph: "羅",
      badge: kind === "quick" ? "No AI · no credit charge" : "AI prose from validated EvidencePacket",
    },
    pages,
  };
}

for (const lang of languages) {
  for (const kind of ["quick", "ai"] as const) {
    const document = baseDocument(lang, kind);
    const buffer = await renderExportPdf({ page: "luopan", lang, document }, lang, `preview-${kind}-${lang}`);
    const path = join(outDir, `hourkey-pdf-v2-${kind}-${lang}.pdf`);
    writeFileSync(path, buffer);
    console.log(`${kind}\t${lang}\t${buffer.length}\t${path}`);
  }
}
