/* hk-print.js · ตัวช่วยสร้าง PDF ร่วมทุกหน้า (server render + direct download)
 * ใช้: หน้าไหนจะ export → โหลด /css/hk-print.css + /js/hk-print.js
 *   HKPrint.open({ docTitle, cover:{...}, pages:[ {sections:[htmlString...]} ], land })
 * — PdfDocumentV2 ส่งไป server render แล้วบันทึก .pdf โดยไม่เปิด print dialog
 * หน้าจริงสร้าง sections จาก JSON เดียวกับที่ render อยู่ (chart/palm/fusion...) ไม่ดึงซ้ำ ไม่แตะ engine
 */
(function () {
  "use strict";
  var SEAL = "時";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // header/footer วิ่งทุกหน้า (โลโก้ 時 + ชื่อ + เลขหน้า)
  function head(title, reportId) {
    return '<div class="hkp-head"><span class="lg"><span class="seal">' + SEAL + '</span>hourkey · ' + esc(title) + '</span><span class="hkp-head-meta">' +
      (reportId ? '<span class="hkp-report-id">' + esc(reportId) + '</span>' : '') + esc(HKPrint._dateStr()) + '</span></div>';
  }
  function foot(pageNo, total, opts) {
    opts = opts || {};
    var left = 'hourkey.io';
    if (opts.verificationLabel) left += ' · ' + esc(opts.verificationLabel);
    if (opts.reportId) left += ' · ' + esc(opts.reportId);
    return '<div class="hkp-foot"><span>' + left + '</span><span>หน้า ' + pageNo + ' / ' + total + '</span></div>';
  }

  // หน้าปกมาตรฐาน (ตรา 時 + ชื่อรายงาน + เจ้าของดวง + meta + QR)
  function coverHtml(c) {
    // Never draw a fake QR placeholder. A QR is rendered only when a real SVG/HTML payload is supplied.
    var qr = c.qr === true && c.qrHtml ? '<div class="qr">' + c.qrHtml + "</div>" : "";
    var big = c.big ? '<div class="big">' + esc(c.big) + "</div>" : "";
    var badge = c.badge ? '<div class="badge">' + esc(c.badge) + "</div>" : "";
    return '<div class="hkp-cover"><div class="seal-lg">' + SEAL + "</div>" +
      '<div class="kick">' + esc(c.kick || "") + "</div>" +
      "<h1>" + esc(c.title || "") + "</h1>" +
      '<div class="who">' + esc(c.who || "") + "</div>" +
      '<div class="meta">' + (c.metaHtml || esc(c.meta || "")) + "</div>" +
      big +
      (c.sub ? '<div class="meta">' + esc(c.sub) + "</div>" : "") +
      badge + qr + "</div>";
  }

  var HKPrint = {
    _now: null,
    _dateStr: function () { try { return "ออกเอกสาร " + (this._now || new Date()).toLocaleDateString("th-TH"); } catch (e) { return "hourkey"; } },
    reportId: function (prefix) {
      var p = String(prefix || 'HK').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'HK';
      var d = new Date(), ymd = d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      var rnd = '';
      try { rnd = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(); }
      catch (e) { rnd = Math.random().toString(36).slice(2, 10).toUpperCase(); }
      return p + '-' + ymd + '-' + rnd;
    },

    _downloadPayload: function (payload, reportId) {
      return fetch('/api/export/pdf', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (response) {
        if (!response.ok) throw new Error('pdf_download_' + response.status);
        return response.blob();
      }).then(function (blob) {
        if (!blob || blob.size < 400) throw new Error('pdf_download_empty');
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        var id = String(reportId || 'report').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'report';
        link.href = url;
        link.download = 'hourkey-' + id + '.pdf';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        return true;
      });
    },

    /* opts: { docTitle, headTitle, cover, pages:[{sections:[html]}], land:bool } */
    open: function (opts) {
      opts = opts || {};
      var reportId = opts.reportId || HKPrint.reportId('HKPDF');
      var storedLang = '';
      try { storedLang = localStorage.getItem('hk_locale') || localStorage.getItem('hk_lang') || ''; } catch (e) {}
      var lang = String(opts.lang || storedLang || document.documentElement.lang || 'en').toLowerCase().slice(0, 10) || 'en';
      var cover = opts.cover ? {
        kick: String(opts.cover.kick || ''), title: String(opts.cover.title || opts.docTitle || 'HourKey report'),
        who: String(opts.cover.who || ''), metaHtml: String(opts.cover.metaHtml || opts.cover.meta || ''),
        big: String(opts.cover.big || ''), sub: String(opts.cover.sub || ''), badge: String(opts.cover.badge || '')
      } : undefined;
      var legacy = {
        version: 'hourkey.pdf.legacy.v1',
        report: {
          id: reportId, lang: lang, title: String(opts.docTitle || 'HourKey report'),
          headerTitle: String(opts.headTitle || opts.docTitle || 'HourKey report'),
          verificationLabel: String(opts.verificationLabel || '')
        },
        extraCss: String(opts.extraCss || ''),
        cover: cover,
        pages: (opts.pages || []).map(function (page) {
          return { sections: (page.sections || []).map(String), landscape: !!(opts.land || page.landscape) };
        })
      };
      return HKPrint._downloadPayload({ legacy: legacy }, reportId).catch(function (error) {
        console.error('[hk-print] legacy PDF download failed', error);
        try { window.alert(lang.indexOf('th') === 0 ? 'สร้างไฟล์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' : 'Could not create the PDF file. Please try again.'); } catch (e) {}
        return false;
      });
    },

    // helper สร้าง section html (หน้าจริงเรียกใช้ประกอบจาก data)
    section: function (title, innerHtml) { return '<h2 class="sec">' + esc(title) + "</h2>" + (innerHtml || ""); },
    card: function (title, bodyHtml, conf) {
      return '<div class="hkp-card">' + (conf ? '<span class="conf">' + esc(conf) + "</span>" : "") +
        (title ? "<h3>" + esc(title) + "</h3>" : "") + (bodyHtml || "") + "</div>";
    },
    verdict: function (lab, text) { return '<div class="hkp-verdict"><span class="lab">' + esc(lab) + "</span><p>" + esc(text) + "</p></div>"; },

    _downloadDocument: function (doc) {
      return HKPrint._downloadPayload({ document: doc }, doc.report.id);
    },

    /* Structured report renderer shared by deterministic quick PDFs and AI reports. */
    openDocument: function (doc) {
      if (!doc || doc.version !== 'hourkey.pdf.v2' || !doc.report || !doc.cover || !Array.isArray(doc.pages)) {
        throw new Error('invalid_pdf_document_v2');
      }
      return HKPrint._downloadDocument(doc).catch(function (error) {
        console.error('[hk-print] direct PDF download failed', error);
        var lang = String(doc.report.lang || document.documentElement.lang || 'en').toLowerCase();
        var message = lang.indexOf('th') === 0
          ? 'สร้างไฟล์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
          : 'Could not create the PDF file. Please try again.';
        try { window.alert(message); } catch (e) {}
        return false;
      });
    },

    /* markdown ปลอดภัย → html (escape ก่อนแปลง · หัวข้อ/ตาราง/ตัวหนา/ลิสต์/เส้นคั่น) · ยกจาก book.html mdSafe */
    mdSafe: function (md) {
      var lines = String(md == null ? "" : md).split(/\r?\n/), out = [], listBuf = [], i = 0;
      function inline(s) { s = esc(s); s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"); s = s.replace(/`([^`]+)`/g, "<code>$1</code>"); return s; }
      function flushList() { if (listBuf.length) { out.push('<ul class="md-ul">' + listBuf.join("") + "</ul>"); listBuf = []; } }
      while (i < lines.length) {
        var ln = lines[i];
        if (/^\s*\|.+\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|[\s:|\-]+\|\s*$/.test(lines[i + 1])) {
          flushList();
          var cells = function (row) { return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return inline(c.trim()); }); };
          var hd = cells(ln); i += 2; var rows = [];
          while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
          out.push('<div class="md-tw"><table class="md-t"><thead><tr>' + hd.map(function (h) { return "<th>" + h + "</th>"; }).join("") +
            "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>");
          continue;
        }
        if (/^\s*#{1,4}\s+/.test(ln)) { flushList(); var lvl = ln.match(/^\s*(#{1,4})/)[1].length; out.push('<div class="md-h md-h' + lvl + '">' + inline(ln.replace(/^\s*#{1,4}\s+/, "")) + "</div>"); i++; continue; }
        if (/^\s*[-*•]\s+/.test(ln)) { listBuf.push("<li>" + inline(ln.replace(/^\s*[-*•]\s+/, "")) + "</li>"); i++; continue; }
        var num = ln.match(/^\s*(\d{1,2}[.)])\s+(.*)$/);
        if (num) { flushList(); out.push('<div class="md-p"><strong>' + esc(num[1]) + "</strong> " + inline(num[2]) + "</div>"); i++; continue; }
        if (/^\s*(-{3,}|_{3,})\s*$/.test(ln)) { flushList(); out.push('<hr class="md-hr">'); i++; continue; }
        flushList();
        out.push(ln.trim() === "" ? '<div class="md-sp"></div>' : '<div class="md-p">' + inline(ln) + "</div>");
        i++;
      }
      flushList();
      return out.join("");
    },

    /* 📄 สรุปจาก markdown ของ AI → PDF · ปกบังคับ + ตัด section ตาม H2 (## ) + figs SVG แทรกหน้าแรก
     * opts: { cover(บังคับ), figs:[{svg,cap}], docTitle, headTitle } */
    summaryFromMarkdown: function (md, opts) {
      opts = opts || {};
      // ปกบังคับ (กฎเจ้านาย): ถ้าไม่ส่งมา สร้างปกขั้นต่ำกันหลุด
      var cover = opts.cover || { kick: "สรุปดวงชะตา", title: "รายงานสรุป", who: "", qrLabel: "hourkey.io" };
      var text = String(md == null ? "" : md);
      // ตัด section ตามหัวข้อระดับ 2 (## ...) เท่านั้น (### ไม่เข้าเงื่อนไข = อยู่ในเนื้อ)
      var lines = text.split(/\r?\n/), secs = [], cur = null;
      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/^\s*##\s+(.*)$/);
        if (m) { cur = { title: m[1].trim(), body: "" }; secs.push(cur); }
        else { if (!cur) { if (!lines[i].trim()) continue; cur = { title: "", body: "" }; secs.push(cur); } cur.body += lines[i] + "\n"; }
      }
      var figsHtml = "";
      (opts.figs || []).forEach(function (f) {
        if (!f || !f.svg) return;
        figsHtml += '<div class="fig">' + f.svg + (f.cap ? '<div class="cap">' + esc(f.cap) + "</div>" : "") + "</div>";
      });
      var pages = [];
      secs.forEach(function (s, idx) {
        var body = '<div class="hkp-summary">' + HKPrint.mdSafe(s.body) + "</div>";
        var sectionHtml = s.title ? (HKPrint.section(s.title, body)) : body;
        var sections = (idx === 0 && figsHtml) ? [figsHtml, sectionHtml] : [sectionHtml];
        pages.push({ sections: sections });
      });
      if (!pages.length) pages.push({ sections: [(figsHtml || "") + '<div class="hkp-summary">' + HKPrint.mdSafe(text) + "</div>"] });
      HKPrint.open({
        docTitle: opts.docTitle || ("hourkey-summary" + (cover.title ? "-" + cover.title : "")),
        headTitle: opts.headTitle || cover.who || cover.title || "รายงานสรุป",
        cover: cover,
        pages: pages,
      });
    },
    esc: esc,
  };
  window.HKPrint = HKPrint;
})();
