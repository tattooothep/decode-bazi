/* hourkey language control upgrade
 * Adds the 9-language set to older TH/EN/ZH controls without changing page layout code.
 */
(function(){
  'use strict';
  if (window.__HK_LANG_UPGRADE__) return;
  window.__HK_LANG_UPGRADE__ = true;

  var LANGS = [
    { code:'th', state:'th', label:'TH', title:'ไทย' },
    { code:'en', state:'en', label:'EN', title:'English' },
    { code:'zh', state:'zh-hant', label:'繁', title:'繁體中文' },
    { code:'cn', state:'zh-cn', label:'简', title:'简体中文' },
    { code:'vi', state:'vi', label:'VI', title:'Tiếng Việt' },
    { code:'ja', state:'ja', label:'JA', title:'日本語' },
    { code:'ru', state:'ru', label:'RU', title:'Русский' },
    { code:'ko', state:'ko', label:'KO', title:'한국어' },
    { code:'es', state:'es', label:'ES', title:'Español' }
  ];
  var CODES = LANGS.map(function(x){ return x.code; });

  function norm(raw){
    raw = String(raw || '').trim().toLowerCase().replace('_','-');
    if (!raw) return '';
    if (raw === 'zh-cn' || raw === 'zh-hans' || raw === 'cn') return 'cn';
    if (raw === 'zh-hant' || raw === 'zh-tw' || raw === 'zh-hk') return 'zh';
    if (raw.indexOf('zh') === 0) return 'zh';
    return CODES.indexOf(raw) >= 0 ? raw : '';
  }
  function currentCode(){
    var st = null;
    try { st = window.HK_LANG_STATE && window.HK_LANG_STATE.current ? window.HK_LANG_STATE.current() : null; } catch(_) {}
    if (st && st.raw === 'zh') {
      var variant = st.variant;
      try { variant = localStorage.getItem('hk_zh_variant') || variant; } catch(_) {}
      return variant === 'cn' ? 'cn' : 'zh';
    }
    if (st && st.raw) return norm(st.raw) || 'th';
    try { return norm(localStorage.getItem('hk_locale') || localStorage.getItem('hk_lang')) || 'th'; } catch(_) { return 'th'; }
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }
  function isVisible(el){
    if (!el || !el.getBoundingClientRect) return false;
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }
  function buttonCode(btn){
    if (!btn) return '';
    var data = btn.getAttribute('data-lang');
    if (data) return norm(data);
    var id = btn.id || '';
    if (id.indexOf('lang-') === 0) return norm(id.slice(5));
    return '';
  }
  function collectCodes(box){
    var out = [];
    box.querySelectorAll('button[data-lang],button[id^="lang-"],a[data-lang],a[id^="lang-"]').forEach(function(btn){
      var c = buttonCode(btn);
      if (c && out.indexOf(c) < 0) out.push(c);
    });
    return out;
  }
  function activeClasses(box){
    var el = box.querySelector('button.on,button.act,button.active,a.on,a.act,a.active') ||
      box.querySelector('button[data-lang],button[id^="lang-"],a[data-lang],a[id^="lang-"]');
    var cls = [];
    if (el) {
      ['on','act','active'].forEach(function(c){ if (el.classList.contains(c)) cls.push(c); });
      if (!cls.length) cls.push('on');
    }
    return cls;
  }
  function makeButton(box, lang, mode, template){
    var btn = document.createElement(template && template.tagName === 'A' ? 'a' : 'button');
    if (template) {
      btn.className = template.className || '';
      if (template.getAttribute('type')) btn.setAttribute('type', template.getAttribute('type'));
    }
    if (btn.tagName === 'BUTTON' && !btn.getAttribute('type')) btn.type = 'button';
    if (mode === 'id') btn.id = 'lang-' + lang.code;
    else btn.setAttribute('data-lang', lang.code);
    btn.textContent = lang.label;
    btn.title = lang.title;
    btn.setAttribute('aria-label', lang.title);
    btn.setAttribute('data-hk-lang-upgraded', '1');
    return btn;
  }
  function upgradeButtonBox(box){
    if (!box || box.getAttribute('data-hk-lang-upgraded') === '1') return;
    var codes = collectCodes(box);
    if (!(codes.indexOf('th') >= 0 && codes.indexOf('en') >= 0 && codes.indexOf('zh') >= 0)) return;
    if (CODES.every(function(c){ return codes.indexOf(c) >= 0; })) {
      box.setAttribute('data-hk-lang-upgraded','1');
      return;
    }
    var first = box.querySelector('button[data-lang],button[id^="lang-"],a[data-lang],a[id^="lang-"]');
    var mode = first && first.id && first.id.indexOf('lang-') === 0 ? 'id' : 'data';
    LANGS.forEach(function(lang){
      if (codes.indexOf(lang.code) >= 0) return;
      box.appendChild(makeButton(box, lang, mode, first));
    });
    box.setAttribute('data-hk-lang-upgraded','1');
  }
  function upgradeSelect(sel){
    if (!sel || sel.getAttribute('data-hk-lang-upgraded') === '1') return;
    var options = Array.from(sel.options || []);
    var codes = options.map(function(o){ return norm(o.value); }).filter(Boolean);
    if (!(codes.indexOf('th') >= 0 && codes.indexOf('en') >= 0 && codes.indexOf('zh') >= 0)) return;
    LANGS.forEach(function(lang){
      if (codes.indexOf(lang.code) >= 0 || (lang.code === 'cn' && codes.indexOf('cn') >= 0)) return;
      var opt = document.createElement('option');
      opt.value = lang.code === 'cn' ? 'zh-cn' : lang.code;
      opt.textContent = lang.label;
      sel.appendChild(opt);
    });
    sel.setAttribute('data-hk-lang-upgraded','1');
  }
  function candidateBoxes(){
    var boxes = [];
    document.querySelectorAll('button[data-lang],button[id^="lang-"],a[data-lang],a[id^="lang-"]').forEach(function(btn){
      var p = btn.parentElement;
      while (p && p !== document.body) {
        var codes = collectCodes(p);
        if (codes.length >= 3 && codes.indexOf('th') >= 0 && codes.indexOf('en') >= 0 && codes.indexOf('zh') >= 0) {
          if (boxes.indexOf(p) < 0) boxes.push(p);
          break;
        }
        p = p.parentElement;
      }
    });
    return boxes.filter(isVisible);
  }
  function applyActive(){
    var cur = currentCode();
    candidateBoxes().forEach(function(box){
      var active = activeClasses(box);
      box.querySelectorAll('button[data-lang],button[id^="lang-"],a[data-lang],a[id^="lang-"]').forEach(function(btn){
        var on = buttonCode(btn) === cur;
        active.forEach(function(c){ btn.classList.toggle(c, on); });
      });
    });
    document.querySelectorAll('select').forEach(function(sel){
      if (!sel.getAttribute('data-hk-lang-upgraded')) return;
      var curOpt = cur === 'cn' ? 'zh-cn' : cur;
      if (Array.from(sel.options || []).some(function(o){ return o.value === curOpt; })) sel.value = curOpt;
    });
  }
  function loadOverlay(raw, done){
    if (raw === 'th' || raw === 'en' || raw === 'zh' || raw === 'cn') { done(); return; }
    if (window.HK && window.HK.i18n && typeof window.HK.i18n.loadOverlay === 'function') {
      window.HK.i18n.loadOverlay(raw).then(done).catch(done);
      return;
    }
    done();
  }
  function applyPageLanguage(code){
    var lang = LANGS.find(function(x){ return x.code === code; }) || LANGS[0];
    var state = null;
    try {
      if (window.HK_LANG_STATE && window.HK_LANG_STATE.set) state = window.HK_LANG_STATE.set(lang.state);
      else {
        localStorage.setItem('hk_locale', code === 'cn' ? 'zh' : code);
        localStorage.setItem('hk_lang', code === 'cn' ? 'zh' : code);
        if (code === 'cn') localStorage.setItem('hk_zh_variant','cn');
        if (code === 'zh') localStorage.setItem('hk_zh_variant','hant');
      }
    } catch(_) {}
    if (code === 'cn') {
      try { localStorage.setItem('hk_zh_variant','cn'); } catch(_) {}
    } else if (code === 'zh') {
      try { localStorage.setItem('hk_zh_variant','hant'); } catch(_) {}
    }
    var raw = code === 'cn' || code === 'zh' ? 'zh' : code;
    try {
      document.documentElement.lang = code === 'cn' ? 'zh-Hans' : (state && state.html) || raw;
      document.documentElement.setAttribute('data-lang', (state && state.app) || (raw === 'th' || raw === 'en' || raw === 'zh' ? raw : 'en'));
      document.documentElement.setAttribute('data-hk-locale', raw);
      if (code === 'cn') document.documentElement.setAttribute('data-zh-variant','cn');
      else if (code === 'zh') document.documentElement.setAttribute('data-zh-variant','hant');
      else document.documentElement.removeAttribute('data-zh-variant');
    } catch(_) {}
    applyActive();
    loadOverlay(raw, function(){
      try {
        if (typeof window.__hkOverlayApply === 'function') window.__hkOverlayApply(raw);
        else if (typeof window.applyI18N === 'function') window.applyI18N(raw);
        else if (typeof window.applyLang === 'function') window.applyLang(raw);
      } catch(_) {}
      try { if (code === 'cn' && window.HK_ZHCN && typeof window.HK_ZHCN.apply === 'function') window.HK_ZHCN.apply(); } catch(_) {}
      applyActive();
    });
  }
  function bind(){
    document.addEventListener('click', function(e){
      var btn = e.target && e.target.closest ? e.target.closest('[data-hk-lang-upgraded],button[data-lang],button[id^="lang-"],a[data-lang],a[id^="lang-"]') : null;
      if (!btn) return;
      var code = buttonCode(btn);
      if (!code || CODES.indexOf(code) < 0) return;
      var box = btn.closest('[data-hk-lang-upgraded="1"]');
      if (!box && btn.getAttribute('data-hk-lang-upgraded') !== '1') return;
      e.preventDefault();
      e.stopPropagation();
      applyPageLanguage(code);
    }, true);
    document.addEventListener('change', function(e){
      var sel = e.target;
      if (!sel || !sel.matches || !sel.matches('select[data-hk-lang-upgraded="1"]')) return;
      var code = norm(sel.value);
      if (!code) return;
      applyPageLanguage(code);
    }, true);
    document.addEventListener('hk:locale', function(){ setTimeout(applyActive, 0); });
  }
  function upgradeAll(){
    candidateBoxes().forEach(upgradeButtonBox);
    document.querySelectorAll('select').forEach(upgradeSelect);
    applyActive();
  }
  function init(){
    upgradeAll();
    bind();
    setTimeout(upgradeAll, 600);
    setTimeout(upgradeAll, 1600);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
