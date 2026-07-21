/* hourkey legacy non-Thai guard
 * Scoped fallback for older static pages: keep lang state consistent, run page i18n,
 * then remove remaining Thai UI copy in EN/ZH modes.
 */
(function () {
  'use strict';

  function state() {
    try {
      var api = window.HK_LANG_STATE || (window.HK && window.HK.langState);
      if (api && typeof api.current === 'function') return api.current();
    } catch (_) {}
    var raw = 'th';
    try { raw = localStorage.getItem('hk_lang') || localStorage.getItem('hk_locale') || 'th'; } catch (_) {}
    raw = String(raw || 'th').toLowerCase();
    if (raw.indexOf('zh') === 0) {
      var variant = 'hant';
      try { if (localStorage.getItem('hk_zh_variant') === 'cn') variant = 'cn'; } catch (_) {}
      return { raw: 'zh', app: 'zh', storage: 'zh', html: variant === 'cn' ? 'zh-Hans' : 'zh-Hant', variant: variant };
    }
    if (raw.indexOf('en') === 0) return { raw: 'en', app: 'en', storage: 'en', html: 'en' };
    return { raw: 'th', app: 'th', storage: 'th', html: 'th' };
  }

  function applyState(st) {
    if (!st || st.app === 'th') return st;
    try {
      document.documentElement.lang = st.html;
      document.documentElement.setAttribute('data-lang', st.app);
      document.documentElement.setAttribute('data-hk-locale', st.raw);
      if (st.raw === 'zh') document.documentElement.setAttribute('data-zh-variant', st.variant === 'cn' ? 'cn' : 'hant');
      else document.documentElement.removeAttribute('data-zh-variant');
      localStorage.setItem('hk_locale', st.storage);
      localStorage.setItem('hk_lang', st.storage);
      if (st.raw === 'zh') localStorage.setItem('hk_zh_variant', st.variant === 'cn' ? 'cn' : 'hant');
      if (st.raw === 'zh' && st.variant === 'cn' && window.HK_ZHCN && typeof window.HK_ZHCN.apply === 'function') {
        window.HK_ZHCN.apply();
      }
    } catch (_) {}
    return st;
  }

  function pageLocale(st) {
    if (!st) return 'th';
    return st.raw;
  }

  function callPageI18n(st) {
    try {
      var locale = pageLocale(st);
      if (typeof window.__hkOverlayApply === 'function') window.__hkOverlayApply(locale);
      else if (typeof window.applyI18N === 'function') window.applyI18N(st.raw);
    } catch (_) {}
  }

  function replaceThai(value, lang) {
    if (lang === 'th') return value;
    var out = String(value == null ? '' : value);
    var dict = {
      'เช่น อยากเปิดร้านกาแฟ · เซ็นสัญญาบ้าน · ลงทุนหุ้น...': 'Example: open a coffee shop · sign a house contract · invest in stocks...',
      'เช่น · ดีลที่เจรจาอยู่ จะปิดได้ไหม': 'Example · Will the deal I am negotiating close?',
      'ค้นหาชื่อหรือความสัมพันธ์...': 'Search name or relationship...',
      'ถามต่อได้เลย เช่น ถ้าจะเซ็นเอกสารจริงควรเลือกอันดับไหน หรืออันดับ 1 กับ 2 ต่างกันยังไง': 'Ask a follow-up, e.g. which rank to choose for signing documents, or how rank 1 differs from rank 2.',
      'ดูคำอธิบาย': 'View explanation',
      'รีเฟรช': 'Refresh',
      'ชื่อเสียง · ความรัก': 'Fame · Love',
      'หายนะ · ภัยพิบัติ': 'Disaster · Calamity',
      'การเงิน(เก่า) · ขโมย(ใหม่)': 'Finance (old) · Theft (new)',
      'เป้าหมาย · 志': 'Goals · 志',
      'คุณ กำลังตามหา': 'What are you seeking',
      'อะไร志?': 'What goal 志?',
      'พลังเข้มแข็ง': 'Great Strength',
      'การลด': 'Decrease',
      'พิจารณา': 'Contemplation',
      'เป้าหมาย': 'Goals',
      'กำลังตามหา': 'seeking',
      'อะไร': 'what',
      'คุณ': 'you',
      'การเงิน': 'Finance',
      'ความมั่งคั่ง': 'Wealth',
      'การงาน': 'Career',
      'อิทธิพล': 'Influence',
      'คู่ครอง': 'Partner',
      'ความสัมพันธ์': 'Relationships',
      'ครอบครัว': 'Family',
      'สุขภาพ': 'Health',
      'พลังงาน': 'Energy',
      'การเรียน': 'Learning',
      'ฝีมือ': 'Craft',
      'เดินทาง': 'Travel',
      'ย้ายถิ่น': 'Move',
      'ชื่อเสียง': 'Fame',
      'บารมี': 'Authority',
      'วันนี้': 'Today',
      'เดือนนี้': 'This month',
      'ปีนี้': 'This year',
      'ทั้งชีวิต': 'Lifetime',
      'ย้อนกลับ': 'Back',
      'เปิดดวงของฉัน': 'Open my chart',
      'ตัดวันห้าม': 'Cut forbidden days',
      'ตัดฤกษ์': 'Cut bad timings',
      'เพดานคะแนน': 'Score cap',
      'ปรับคะแนน': 'Score adjustment',
      'ให้คะแนน': 'Score',
      'ทดลอง': 'Beta',
      'ดาวเหิน': 'Flying Stars',
      'เข็มทิศ': 'Compass',
      'ฮวงจุ้ย': 'Feng Shui',
      'วางฤกษ์': 'Date Picking',
      'ทั่วไป': 'General',
      'ธุรกิจ': 'Business',
      'ความรัก': 'Love',
      'คดี': 'Legal',
      'คำนวณ': 'Calculating',
      'กำลัง': 'Loading',
      'ตั้งคำถาม': 'Ask',
      'คำถามของ': 'Your question',
      'โยนเหรียญ': 'Coin toss',
      'ความคืบหน้า': 'Progress',
      'ทำนายใหม่': 'Forecast again',
      'รากของศาสตร์จีน': 'Root of Chinese metaphysics'
      ,'กรอกข้อมูลเกิด': 'Birth details'
      ,'บันทึกอัตโนมัติ': 'Auto saved'
      ,'เพราะ': 'because'
      ,'สลับธีม': 'Toggle theme'
    };
    Object.keys(dict).sort(function (a, b) { return b.length - a.length; }).forEach(function (k) {
      out = out.split(k).join(dict[k]);
    });
    out = out.replace(/[\u0E00-\u0E7F]+/g, '');
    out = out.replace(/\s{2,}/g, ' ').replace(/\s+([·:,.!?])/g, '$1').trim();
    return out || '—';
  }

  function shouldSkip(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return true;
    if (/^(SCRIPT|STYLE|TEXTAREA)$/i.test(el.tagName)) return true;
    return !!el.closest('.hk-um-name,.hk-um-email,[data-user-text],[data-user-name],.user-name,.profile-name,.person-name');
  }
  function shouldSkipAttr(el) {
    if (!el) return true;
    if (/^(SCRIPT|STYLE)$/i.test(el.tagName)) return true;
    return !!el.closest('.hk-um-name,.hk-um-email,[data-user-text],[data-user-name],.user-name,.profile-name,.person-name');
  }

  var observer = null;
  function scrub() {
    var st = applyState(state());
    if (!st || st.app === 'th') return;
    var thai = /[\u0E00-\u0E7F]/;
    try {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
          return thai.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        var next = replaceThai(node.nodeValue, st.app);
        if (next !== node.nodeValue) node.nodeValue = next;
      });
      document.querySelectorAll('[placeholder],[title],[aria-label],[alt],option').forEach(function (el) {
        if (shouldSkipAttr(el)) return;
        ['placeholder', 'title', 'aria-label', 'alt'].forEach(function (attr) {
          var v = el.getAttribute(attr);
          if (v && thai.test(v)) el.setAttribute(attr, replaceThai(v, st.app));
        });
        if (el.tagName === 'OPTION' && thai.test(el.textContent || '')) {
          el.textContent = replaceThai(el.textContent, st.app);
        }
      });
    } catch (_) {}
    if (!observer) {
      var timer = 0;
      observer = new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(scrub, 80);
      });
      try { observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label', 'alt'] }); } catch (_) {}
    }
  }

  var st = applyState(state());
  callPageI18n(st);
  scrub();
  setTimeout(function () { callPageI18n(state()); scrub(); }, 250);
  setTimeout(scrub, 1000);
})();
