/* hk-method-link.js · v=20260518a
 * อัพเดท text ของ .hk-method-link ตาม locale (อ่าน localStorage hk_locale)
 * รองรับ TH/EN/ZH · ดึงจาก data-th/data-en/data-zh attribute
 * Reactive: refresh ทุก 800ms (ถ้า user กดปุ่ม lang ของหน้า)
 */
(function(){
  /* ภาษาใหม่ (vi/ja/ko/ru/es) รองรับด้วย — ปุ่มไม่มี data-<lang> ก็ fallback en (ไม่ใช่ th) กันไทยหลง */
  var KNOWN = ['th','en','zh','cn','vi','ja','ko','ru','es'];
  function getLang(){
    var l = (localStorage.getItem('hk_locale') || localStorage.getItem('hk_lang') || document.documentElement.lang || 'th');
    l = l.toLowerCase();
    if (l.indexOf('zh') === 0) return 'zh';
    if (l.indexOf('en') === 0) return 'en';
    l = l.split('-')[0];
    return KNOWN.indexOf(l) !== -1 ? l : 'th';
  }
  function apply(){
    var lang = getLang();
    document.querySelectorAll('.hk-method-link').forEach(function(a){
      /* th/en/zh: เดิม · ภาษาใหม่: data-<lang> → data-en (ห้าม data-th) */
      var txt = a.dataset[lang] || (lang === 'th' ? a.dataset.th : a.dataset.en) || a.dataset.th;
      if (txt) a.textContent = txt;
    });
  }
  function init(){
    apply();
    var last = getLang();
    setInterval(function(){
      var cur = getLang();
      if (cur !== last) { last = cur; apply(); }
    }, 800);
    window.addEventListener('storage', function(e){
      if (e.key === 'hk_locale') apply();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
