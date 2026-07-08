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
  function head(title) {
    return '<div class="hkp-head"><span class="lg"><span class="seal">' + SEAL + '</span>hourkey · ' + esc(title) + '</span><span>' + esc(HKPrint._dateStr()) + '</span></div>';
  }
  function foot(pageNo, total) {
    return '<div class="hkp-foot"><span>hourkey.io · TST verified</span><span>หน้า ' + pageNo + ' / ' + total + '</span></div>';
  }

  // หน้าปกมาตรฐาน (ตรา 時 + ชื่อรายงาน + เจ้าของดวง + meta + QR)
  function coverHtml(c) {
    var qr = c.qr !== false ? '<div class="qr">QR<br>' + esc(c.qrLabel || "hourkey.io") + "</div>" : "";
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

    /* opts: { docTitle, headTitle, cover, pages:[{sections:[html]}], land:bool } */
    open: function (opts) {
      opts = opts || {};
      var total = (opts.pages ? opts.pages.length : 0) + (opts.cover ? 1 : 0);
      var pn = 0;
      var html = "";
      var cls = "hkp-page" + (opts.land ? " land" : "");
      // ปก = หน้าแรก
      if (opts.cover) {
        pn++;
        html += '<div class="' + cls + '">' + head(opts.headTitle || opts.docTitle || "รายงาน") + coverHtml(opts.cover) + foot(pn, total) + "</div>";
      }
      // เนื้อหาแต่ละหน้า
      (opts.pages || []).forEach(function (p) {
        pn++;
        html += '<div class="' + cls + '">' + head(opts.headTitle || opts.docTitle || "รายงาน") +
          (p.sections || []).join("\n") + foot(pn, total) + "</div>";
      });

      // ตั้งชื่อไฟล์ PDF = docTitle · สร้าง root print-only · พิมพ์ · ลบ
      var prevTitle = document.title;
      if (opts.docTitle) document.title = opts.docTitle;
      var root = document.createElement("div");
      root.className = "hkp-root";
      root.innerHTML = html;
      document.body.appendChild(root);
      // ซ่อนเนื้อหาปกติตอนพิมพ์ (print.css: body>*:not(.hkp-root){display:none} — เพิ่มตอน wire หน้าจริง)
      root.setAttribute("data-hkp-print", "1");
      var cleanup = function () { try { document.body.removeChild(root); } catch (e) {} document.title = prevTitle; window.removeEventListener("afterprint", cleanup); };
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
    esc: esc,
  };
  window.HKPrint = HKPrint;
})();
