/* chart-print.js · ดาวน์โหลด PDF ดวงปาจื้อ (additive · ไม่แตะ engine/logic/api)
 * ประกอบจากข้อมูลที่ render อยู่แล้ว: window.HKChartPage.getData() (lastData+snapshot) + DOM sections §01-§13
 * เลย์เอาต์ + รูป SVG ยกจาก mockup /export-preview · ครบทุก section ที่แสดงอยู่ · ไม่ตัด
 * ต้องมี /js/hk-print.js (HKPrint) โหลดก่อน
 */
(function () {
  "use strict";

  var STEM_EL = { 甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water" };
  var BRANCH_EL = { 子: "water", 丑: "earth", 寅: "wood", 卯: "wood", 辰: "earth", 巳: "fire", 午: "fire", 未: "earth", 申: "metal", 酉: "metal", 戌: "earth", 亥: "water" };
  var EL_COLOR = { wood: "#5a8a48", fire: "#b03a2e", earth: "#9a7d3a", metal: "#c9a94d", water: "#4a6f8a" };
  var EL_ZH = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };
  var EL_NAME = { th: { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" }, en: { wood: "Wood", fire: "Fire", earth: "Earth", metal: "Metal", water: "Water" }, zh: EL_ZH };
  var HIDDEN = { 子: ["癸"], 丑: ["己", "癸", "辛"], 寅: ["甲", "丙", "戊"], 卯: ["乙"], 辰: ["戊", "乙", "癸"], 巳: ["丙", "戊", "庚"], 午: ["丁", "己"], 未: ["己", "丁", "乙"], 申: ["庚", "壬", "戊"], 酉: ["辛"], 戌: ["戊", "辛", "丁"], 亥: ["壬", "甲"] };

  function lang() {
    var l = "th";
    try { l = (localStorage.getItem("hk_locale") || localStorage.getItem("hk_lang") || document.documentElement.lang || "th"); } catch (e) {}
    l = String(l).toLowerCase();
    if (l.indexOf("zh") === 0) return "zh";
    if (l.indexOf("en") === 0) return "en";
    return "th";
  }
  function T(o) { var L = lang(); return (o && (o[L] || o.en || o.th)) || ""; }

  var TX = {
    kick: { th: "รายงานดวงจีน · 八字命盤", en: "BaZi chart report · 八字命盤", zh: "八字命盤報告" },
    title: { th: "ดวงชะตากำเนิด", en: "Natal BaZi chart", zh: "先天命盤" },
    doc: { th: "ดวงปาจื้อ", en: "BaZi chart", zh: "八字命盤" },
    fourPillars: { th: "四柱 · สี่เสาหลัก", en: "四柱 · Four Pillars", zh: "四柱" },
    dmLabel: { th: "ธาตุประจำวัน", en: "Day Master", zh: "日主" },
    structure: { th: "โครงสร้าง", en: "Structure", zh: "格局" },
    pillarFig: { th: "ภาพพื้นดวงสี่เสา · สีวงกลม = ธาตุ · เสาวันคือตัวเรา", en: "Four pillars · circle color = element · Day pillar is self", zh: "四柱盤 · 圓色＝五行 · 日柱為自身" },
    badge: { th: "✓ TST เวลาสุริยะแท้ · แม่นระดับนาที (tyme4ts + 紫金山天文臺)", en: "✓ TST true solar time · minute-accurate (tyme4ts + Purple Mountain Obs.)", zh: "✓ 真太陽時 · 精確至分 (tyme4ts + 紫金山天文臺)" },
    thPillar: { th: "เสา", en: "Pillar", zh: "柱" },
    thYear: { th: "ปี 年", en: "Year 年", zh: "年" },
    thMonth: { th: "เดือน 月", en: "Month 月", zh: "月" },
    thDay: { th: "วัน 日 (ตัวเรา)", en: "Day 日 (self)", zh: "日 (自身)" },
    thHour: { th: "ยาม 時", en: "Hour 時", zh: "時" },
    rGz: { th: "ก้าน+กิ่ง 干支", en: "Stem+Branch 干支", zh: "干支" },
    rStemEl: { th: "ธาตุก้าน", en: "Stem element", zh: "干五行" },
    rBranchEl: { th: "ธาตุกิ่ง", en: "Branch element", zh: "支五行" },
    rTenGod: { th: "สิบเทพ 十神", en: "Ten God 十神", zh: "十神" },
    rHidden: { th: "ก้านซ่อน 藏干", en: "Hidden stems 藏干", zh: "藏干" },
    rNayin: { th: "นาอิน 納音", en: "Na Yin 納音", zh: "納音" },
    self: { th: "ตัวเรา 日主", en: "Self 日主", zh: "日主" },
    notReady: { th: "ยังโหลดดวงไม่เสร็จ · กรุณารอสักครู่แล้วลองใหม่", en: "Chart not loaded yet · please wait and retry", zh: "命盤尚未載入 · 請稍候再試" }
  };

  function esc(s) { return window.HKPrint ? window.HKPrint.esc(s) : String(s == null ? "" : s); }

  /* SVG สี่เสา (สร้างจากข้อมูลจริง · ยกสไตล์จาก mockup) */
  function pillarSvg(p) {
    var cols = [
      { k: "year", bx: 20, cx: 76, hdr: T(TX.thYear), hl: false },
      { k: "month", bx: 152, cx: 208, hdr: T(TX.thMonth), hl: false },
      { k: "day", bx: 289, cx: 345, hdr: T(TX.thDay), hl: true },
      { k: "hour", bx: 426, cx: 482, hdr: T(TX.thHour), hl: false }
    ];
    var s = '<svg viewBox="0 0 560 176" width="560" role="img" aria-label="four pillars">';
    s += '<rect x="1" y="1" width="558" height="174" rx="10" fill="#fffdf7" stroke="#e5ddc9"/>';
    s += '<g font-size="11" text-anchor="middle" fill="#8a6d2a">';
    cols.forEach(function (c) { s += '<text x="' + c.cx + '" y="20">' + esc(c.hdr) + "</text>"; });
    s += "</g>";
    cols.forEach(function (c) {
      var pp = p[c.k] || {}; var st = pp.stem || "", br = pp.branch || "";
      var sc = EL_COLOR[STEM_EL[st]] || "#9a7d3a", bc = EL_COLOR[BRANCH_EL[br]] || "#4a6f8a";
      var by = c.hl ? 26 : 30, bh = c.hl ? 138 : 130;
      s += "<g>";
      s += '<rect x="' + (c.bx - 0) + '" y="' + by + '" width="112" height="' + bh + '" rx="8" fill="' + (c.hl ? "#fbf3dd" : "#fefcf5") + '" stroke="' + (c.hl ? "#c8a44d" : "#e5ddc9") + '"' + (c.hl ? ' stroke-width="2"' : "") + "/>";
      s += '<circle cx="' + c.cx + '" cy="66" r="24" fill="' + sc + '"/><text x="' + c.cx + '" y="73" text-anchor="middle" font-size="26" fill="#fff">' + esc(st) + "</text>";
      s += '<circle cx="' + c.cx + '" cy="122" r="24" fill="' + bc + '"/><text x="' + c.cx + '" y="129" text-anchor="middle" font-size="26" fill="#fff">' + esc(br) + "</text>";
      s += "</g>";
    });
    s += "</svg>";
    return s;
  }

  function pillarTable(p, a) {
    var order = ["year", "month", "day", "hour"];
    var tg = (a && a.ten_gods_map) || {};
    var ny = (a && a.nayin) || {};
    function row(label, fn) {
      return "<tr><td>" + esc(label) + "</td>" + order.map(function (k) { return "<td>" + fn(k) + "</td>"; }).join("") + "</tr>";
    }
    function elName(el) { if (!el) return ""; var m = EL_NAME[lang()] || EL_NAME.th; return m[el] || ""; }
    var html = "<table><thead><tr><th>" + esc(T(TX.thPillar)) + "</th><th>" + esc(T(TX.thYear)) + "</th><th>" + esc(T(TX.thMonth)) + "</th><th>" + esc(T(TX.thDay)) + "</th><th>" + esc(T(TX.thHour)) + "</th></tr></thead><tbody>";
    html += row(T(TX.rGz), function (k) { var pp = p[k] || {}; return '<span class="zh">' + esc((pp.stem || "") + (pp.branch || "")) + "</span>"; });
    html += row(T(TX.rStemEl), function (k) { var pp = p[k] || {}; var e = STEM_EL[pp.stem]; return esc((EL_ZH[e] || "") + (elName(e) ? " " + elName(e) : "")); });
    html += row(T(TX.rBranchEl), function (k) { var pp = p[k] || {}; var e = BRANCH_EL[pp.branch]; return esc((EL_ZH[e] || "") + (elName(e) ? " " + elName(e) : "")); });
    html += row(T(TX.rTenGod), function (k) { if (k === "day") return esc(T(TX.self)); var g = tg[k] && tg[k].ten_god; return esc(g || "—"); });
    html += row(T(TX.rHidden), function (k) { var pp = p[k] || {}; var h = HIDDEN[pp.branch] || []; return esc(h.join(" ") || "—"); });
    html += row(T(TX.rNayin), function (k) { var n = ny[k]; if (!n) return "—"; return esc((lang() === "th" ? (n.th || n.zh) : lang() === "zh" ? (n.zh || n.en) : (n.en || n.zh)) || (n.name_th || "") || "—"); });
    html += "</tbody></table>";
    return html;
  }

  /* ── DOM section → ข้อความ (ครบ · ไม่ตัด · ไม่พึ่งสีธีมมืด) ── */
  function secTitle(sec) {
    var h = sec.querySelector(".sec-head h2");
    if (!h) return "";
    var c = h.cloneNode(true);
    c.querySelectorAll(".hk-help, .hk-method-link, .fn-badge").forEach(function (n) { n.remove(); });
    return (c.textContent || "").replace(/\s+/g, " ").trim();
  }
  function secBodyLines(sec) {
    var clone = sec.cloneNode(true);
    clone.querySelectorAll(".sec-head, script, style, button, input, select, textarea, .hk-help, .hk-method-link, .noprint, svg, canvas, [hidden]").forEach(function (n) { n.remove(); });
    var tmp = document.createElement("div");
    tmp.style.cssText = "position:absolute;left:-99999px;top:0;width:720px;visibility:hidden";
    tmp.appendChild(clone);
    document.body.appendChild(tmp);
    var txt = clone.innerText || clone.textContent || "";
    document.body.removeChild(tmp);
    return txt.split(/\n+/).map(function (s) { return s.replace(/\s+/g, " ").trim(); })
      .filter(function (s) { return s && s.length > 1 && !/^[▼▲◀►◐✓·•\-–—\s]+$/.test(s); });
  }
  function linesToHtml(lines) {
    return lines.map(function (s) { return "<p>" + esc(s) + "</p>"; }).join("");
  }

  window.exportChartPdf = function exportChartPdf() {
    if (!window.HKPrint) return;
    var st = (window.HKChartPage && window.HKChartPage.getData) ? window.HKChartPage.getData() : {};
    var data = st.data, snap = st.snapshot;
    if (!data || !data.pillars) { try { alert(T(TX.notReady)); } catch (e) {} return; }
    var HP = window.HKPrint, p = data.pillars, a = data.analysis || {};
    var dm = (p.day && p.day.stem) || "";
    var dmEl = STEM_EL[dm] || "earth";
    var structure = (data.yongshen_v2 && data.yongshen_v2.structure_label) || (a.ge_ju && a.ge_ju.structure) || "";
    snap = snap || {};

    var pages = [];

    /* PAGE 1 · สี่เสา (รูป + ตารางข้อมูลจริง) */
    var p1 = [HP.section(T(TX.fourPillars), '<div class="fig">' + pillarSvg(p) + '<div class="cap">' + esc(T(TX.pillarFig)) + "</div></div>")];
    p1.push(pillarTable(p, a));
    pages.push({ sections: p1 });

    /* PAGES · ทุก section ที่แสดงอยู่ (§01-§13) · 1 section/หน้า · เนื้อหาครบ */
    var secs = document.querySelectorAll("section.sec");
    Array.prototype.forEach.call(secs, function (sec) {
      if (sec.offsetParent === null) return;            // ข้าม section ที่ซ่อน (ยังไม่มีข้อมูล)
      if (sec.querySelector("#hk-pillar-table")) return; // สี่เสา render จากข้อมูลแล้วในหน้า 1
      var title = secTitle(sec);
      var lines = secBodyLines(sec);
      if (!title && !lines.length) return;
      pages.push({ sections: [HP.section(title || "—"), HP.card("", linesToHtml(lines))] });
    });

    var who = (snap.name ? snap.name : "") + (snap.gender ? " · " + (String(snap.gender).charAt(0).toUpperCase() === "F" ? T({ th: "หญิง", en: "female", zh: "女" }) : T({ th: "ชาย", en: "male", zh: "男" })) : "");
    var pillarsStr = ["year", "month", "day", "hour"].map(function (k) { var pp = p[k] || {}; return (pp.stem || "") + (pp.branch || ""); }).join(" · ");
    var metaHtml = esc([snap.date, snap.birthTimeKnown === false ? "" : (snap.time || ""), snap.place || ""].filter(Boolean).join(" · ")) +
      (snap.longitude ? " (lng " + esc(Number(snap.longitude).toFixed(2)) + "°)" : "") + "<br>" + esc(pillarsStr);

    HP.open({
      docTitle: "hourkey-" + T(TX.doc) + (snap.name ? "-" + snap.name : ""),
      headTitle: who || T(TX.doc),
      cover: {
        kick: T(TX.kick),
        title: T(TX.title),
        who: who,
        metaHtml: metaHtml,
        big: (EL_ZH[dmEl] || "") + " " + dm,
        sub: (T(TX.dmLabel) + ": " + (EL_ZH[dmEl] || "") + dm) + (structure ? " · " + T(TX.structure) + ": " + structure : ""),
        badge: T(TX.badge),
        qrLabel: "hourkey.io"
      },
      pages: pages
    });
  };
})();
