/* hk-print.js · ตัวช่วยสร้าง PDF ร่วมทุกหน้า (client window.print · CSP-safe · ไม่มี lib นอก)
 * ใช้: หน้าไหนจะ export → โหลด /css/hk-print.css + /js/hk-print.js
 *   HKPrint.open({ docTitle, cover:{...}, pages:[ {sections:[htmlString...]} ], land })
 * — สร้าง DOM print-only (.hkp-root) ต่อท้าย body แล้ว window.print() แล้วลบทิ้ง
 * ⚠️ ยัง "ยังไม่ wire หน้า production" — รอเจ้านาย approve mockup ก่อน (goal ลำดับบังคับ)
 *   หน้าจริงจะสร้าง sections จาก JSON เดียวกับที่ render อยู่ (chart/palm/fusion...) ไม่ดึงซ้ำ ไม่แตะ engine
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

    /* opts: { docTitle, headTitle, cover, pages:[{sections:[html]}], land:bool } */
    open: function (opts) {
      opts = opts || {};
      var total = (opts.pages ? opts.pages.length : 0) + (opts.cover ? 1 : 0);
      var pn = 0;
      var html = "";
      var cls = "hkp-page" + (opts.land ? " land" : "");
      var reportId = opts.reportId || '';
      // ปก = หน้าแรก
      if (opts.cover) {
        pn++;
        var coverCls = cls + (opts.coverClass ? ' ' + String(opts.coverClass).replace(/[^a-z0-9_-]/gi, '') : '');
        html += '<div class="' + coverCls + '">' + head(opts.headTitle || opts.docTitle || "รายงาน", reportId) + coverHtml(opts.cover) + foot(pn, total, opts) + "</div>";
      }
      // เนื้อหาแต่ละหน้า
      (opts.pages || []).forEach(function (p) {
        pn++;
        var pageCls = cls + (p.landscape ? " land" : "");
        html += '<div class="' + pageCls + '">' + head(opts.headTitle || opts.docTitle || "รายงาน", reportId) +
          (p.sections || []).join("\n") + foot(pn, total, opts) + "</div>";
      });

      // ตั้งชื่อไฟล์ PDF = docTitle · สร้าง root print-only · พิมพ์ · ลบ
      var prevTitle = document.title;
      if (opts.docTitle) document.title = opts.docTitle;
      var root = document.createElement("div");
      root.className = "hkp-root";
      root.innerHTML = html;
      document.body.appendChild(root);
      // ซ่อนเนื้อหาปกติตอนพิมพ์: เติมคลาส hkp-active ให้ body → print.css ซ่อน body.hkp-active>*:not(.hkp-root)
      // (ผูกกับคลาสนี้เท่านั้น เพื่อไม่กระทบหน้าที่พิมพ์ตัวเอง เช่น book ที่ไม่มี .hkp-root)
      root.setAttribute("data-hkp-print", "1");
      document.body.classList.add("hkp-active");
      var cleanup = function () { try { document.body.removeChild(root); } catch (e) {} document.body.classList.remove("hkp-active"); document.title = prevTitle; window.removeEventListener("afterprint", cleanup); };
      window.addEventListener("afterprint", cleanup);
      setTimeout(function () { window.print(); }, 60);
    },

    // helper สร้าง section html (หน้าจริงเรียกใช้ประกอบจาก data)
    section: function (title, innerHtml) { return '<h2 class="sec">' + esc(title) + "</h2>" + (innerHtml || ""); },
    card: function (title, bodyHtml, conf) {
      return '<div class="hkp-card">' + (conf ? '<span class="conf">' + esc(conf) + "</span>" : "") +
        (title ? "<h3>" + esc(title) + "</h3>" : "") + (bodyHtml || "") + "</div>";
    },
    verdict: function (lab, text) { return '<div class="hkp-verdict"><span class="lab">' + esc(lab) + "</span><p>" + esc(text) + "</p></div>"; },

    /* Structured report renderer shared by deterministic quick PDFs and AI reports. */
    openDocument: function (doc) {
      if (!doc || doc.version !== 'hourkey.pdf.v2' || !doc.report || !doc.cover || !Array.isArray(doc.pages)) {
        throw new Error('invalid_pdf_document_v2');
      }
      function block(b) {
        if (!b || !b.type) return '';
        if (b.type === 'heading') {
          return b.level === 3 ? '<h3 class="hkp-subsec">' + esc(b.text) + '</h3>' : HKPrint.section(b.text, '');
        }
        if (b.type === 'callout') {
          return '<div class="hkp-callout ' + esc(b.tone || 'neutral') + '">' +
            (b.label ? '<span class="lab">' + esc(b.label) + '</span>' : '') + '<p>' + esc(b.text) + '</p></div>';
        }
        if (b.type === 'facts') {
          var cols = Math.max(1, Math.min(3, Number(b.columns) || 2));
          return '<div class="hkp-facts cols-' + cols + '">' + (b.items || []).map(function (x) {
            return '<div class="x"><span class="l">' + esc(x.label) + '</span><span class="v">' + esc(x.value) + '</span></div>';
          }).join('') + '</div>';
        }
        if (b.type === 'table') {
          var cols2 = (b.columns || []).slice(0, 6);
          var cg = cols2.some(function (c) { return c.width; }) ? '<colgroup>' + cols2.map(function (c) { return '<col' + (c.width ? ' style="width:' + esc(c.width) + '"' : '') + '>'; }).join('') + '</colgroup>' : '';
          return '<div class="hkp-table-wrap"><table class="hkp-table' + (b.compact ? ' compact' : '') + '">' + cg + '<thead><tr>' +
            cols2.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
            (b.rows || []).map(function (r) { return '<tr>' + cols2.map(function (c) { return '<td>' + esc(r[c.key] == null ? '' : r[c.key]) + '</td>'; }).join('') + '</tr>'; }).join('') +
            '</tbody></table></div>';
        }
        if (b.type === 'list') {
          var tag = b.ordered ? 'ol' : 'ul';
          return '<' + tag + ' class="hkp-list">' + (b.items || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</' + tag + '>';
        }
        if (b.type === 'prose') {
          return '<div class="hkp-prose">' + (b.paragraphs || []).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div>';
        }
        if (b.type === 'figure') {
          return '<figure class="hkp-figure">' + String(b.svg || '') + (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>';
        }
        return '';
      }
      var issued = doc.report.issuedAt ? new Date(doc.report.issuedAt) : new Date();
      if (!isNaN(issued.getTime())) HKPrint._now = issued;
      var cover = {
        kick: doc.cover.kick || '', title: doc.cover.title || doc.report.title,
        who: doc.cover.who || '', metaHtml: (doc.cover.meta || []).map(esc).join('<br>'),
        big: doc.cover.glyph || '', badge: doc.cover.badge || '', qr: false
      };
      var pages = doc.pages.map(function (p) {
        var sections = [];
        if (p.title) sections.push(HKPrint.section(p.title, ''));
        (p.blocks || []).forEach(function (b) { var h = block(b); if (h) sections.push(h); });
        return { sections: sections, landscape: !!p.landscape };
      });
      HKPrint.open({
        docTitle: doc.report.title,
        headTitle: doc.report.headerTitle || doc.report.title,
        reportId: doc.report.id,
        verificationLabel: doc.report.verificationLabel || '',
        coverClass: doc.report.kind === 'ai' ? 'premium-cover' : 'quick-cover',
        cover: cover,
        pages: pages
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
