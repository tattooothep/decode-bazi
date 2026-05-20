/* hk-method-link.js · v=20260518a
 * อัพเดท text ของ .hk-method-link ตาม locale (อ่าน localStorage hk_locale)
 * รองรับ TH/EN/ZH · ดึงจาก data-th/data-en/data-zh attribute
 * Reactive: refresh ทุก 800ms (ถ้า user กดปุ่ม lang ของหน้า)
 */
(function(){
  function getLang(){
    var l = (localStorage.getItem('hk_locale') || document.documentElement.lang || 'th');
    l = l.toLowerCase();
    if (l.indexOf('zh') === 0) return 'zh';
    if (l.indexOf('en') === 0) return 'en';
    return 'th';
  }
  function apply(){
    var lang = getLang();
    document.querySelectorAll('.hk-method-link').forEach(function(a){
      var txt = a.dataset[lang] || a.dataset.th;
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
