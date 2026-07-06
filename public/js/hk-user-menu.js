/* hourkey · UserMenu (vanilla JS · inject ทุกหน้า private)
 * - ดึง /api/auth/me แสดง avatar
 * - drop-down: profile · ภาษา · ธีม · ตั้งค่า · ออกจากระบบ
 * - mobile: bottom sheet
 * - localStorage key: hk-theme · hk_locale
 */
(function () {
  if (window.__hkUserMenuLoaded) return;
  window.__hkUserMenuLoaded = true;
  var ROOT_ID = 'hk-user-menu-root';
  var initPromise = null;

  /* 🚀 Global cache · /api/auth/me + /api/account/me · 30s TTL · ลด re-fetch ตอน navigate (16 พ.ค. 2026) */
  var ME_TTL = 30 * 1000;
  var inflight = { auth:null, account:null };
  function cachedMe(url, storageKey){
    /* in-flight dedupe */
    if (inflight[storageKey]) return inflight[storageKey];
    /* sessionStorage hit */
    try {
      var raw = sessionStorage.getItem('hk_me_'+storageKey);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.exp > Date.now()) return Promise.resolve(parsed.data);
      }
    } catch(_){}
    /* fresh fetch */
    var p = fetch(url, { credentials:'same-origin', cache:'no-store' })
      .then(function(r){ if (!r.ok) throw new Error('me '+r.status); return r.json(); })
      .then(function(j){
        try { sessionStorage.setItem('hk_me_'+storageKey, JSON.stringify({ exp: Date.now()+ME_TTL, data: j })); } catch(_){}
        return j;
      })
      .finally(function(){ inflight[storageKey] = null; });
    inflight[storageKey] = p;
    return p;
  }
  window.__hkFetchAuthMe    = function(){ return cachedMe('/api/auth/me',    'auth'); };
  window.__hkFetchAccountMe = function(){ return cachedMe('/api/account/me', 'account'); };
  /* clear on logout · เรียก __hkClearMeCache() ใน flow logout */
  window.__hkClearMeCache = function(){
    try { sessionStorage.removeItem('hk_me_auth'); sessionStorage.removeItem('hk_me_account'); } catch(_){}
    inflight.auth = null; inflight.account = null;
  };

  function researchSessionKey(){
    try {
      var k = sessionStorage.getItem('hk_research_session');
      if (!k) {
        k = 'rs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('hk_research_session', k);
      }
      return k;
    } catch(_) {
      return null;
    }
  }
  function researchTrack(eventName, payload){
    try {
      var body = {
        eventName: eventName || 'ui_action',
        pagePath: location.pathname + location.search,
        referrer: document.referrer || null,
        sessionKey: researchSessionKey(),
        profileId: localStorage.getItem('hk_profile_id') || null,
        payload: payload || null
      };
      var text = JSON.stringify(body);
      if (navigator.sendBeacon) {
        var blob = new Blob([text], { type: 'application/json' });
        if (navigator.sendBeacon('/api/research/event', blob)) return;
      }
      fetch('/api/research/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: text
      }).catch(function(){});
    } catch(_) {}
  }
  window.__hkResearchTrack = researchTrack;
  setTimeout(function(){
    researchTrack('page_view', {
      title: document.title || '',
      lang: document.documentElement.lang || localStorage.getItem('hk_locale') || 'th'
    });
  }, 1200);

  var SINSAE_INTRO_VERSION = 'sinsae_intro_20260517';
  function maybeOpenSinsaeGate(){
    return;
  }

  /* ── i18n ── */
  var I18N = {
    today:    { th:'หน้าวันนี้',     en:'Today',           zh:'今日' },
    chart:    { th:'ดวงของฉัน',      en:'My Chart',        zh:'我的命盤' },
    network:  { th:'เครือข่ายดวง',    en:'Network',         zh:'人脈網' },
    books:    { th:'หนังสือของฉัน',   en:'My Books',        zh:'我的命書' },
    topup:    { th:'เติมยาม · แพ็กเกจ', en:'Top Up · Plans',  zh:'充值 · 方案' },
    account:  { th:'บัญชีของฉัน',       en:'My Account',      zh:'我的帳戶' },
    language: { th:'ภาษา',           en:'Language',        zh:'語言' },
    theme:    { th:'ธีม',            en:'Theme',           zh:'主題' },
    settings: { th:'ตั้งค่า',         en:'Settings',        zh:'設定' },
    logout:   { th:'ออกจากระบบ',     en:'Sign out',        zh:'登出' },
    light:    { th:'สว่าง',           en:'Light',           zh:'明亮' },
    dark:     { th:'มืด',            en:'Dark',            zh:'暗色' },
    signin:   { th:'เข้าสู่ระบบ',     en:'Sign in',         zh:'登入' },
  };
  function t(key) {
    var loc = (localStorage.getItem('hk_locale') || 'th');
    var bag = I18N[key]; if (!bag) return key;
    return bag[loc] || bag.th || key;
  }

  /* ── 🌐 โครงรายชื่อภาษาในเมนู (6 ก.ค. 2569) ──
   * เปิดภาษาใหม่ (vi/ja/ko/ru/es) ทีละตัวโดยเซ็ต window.HK_LANGS_LIVE ก่อนโหลดไฟล์นี้ เช่น
   *   window.HK_LANGS_LIVE = [{value:'th',label:'TH'},{value:'en',label:'EN'},{value:'zh-hant',label:'繁'},{value:'zh-cn',label:'简'},{value:'ja',label:'JA'}];
   * ถ้าไม่เซ็ต = รายการเดิม th/en/繁/简 เป๊ะ — หน้าตาปัจจุบันไม่เปลี่ยน */
  var B = '<sup style="font-size:8px;opacity:.75;margin-left:1px;">β</sup>';
  var DEFAULT_LANGS = [
    { value:'th', label:'TH' },
    { value:'en', label:'EN' },
    { value:'zh-hant', label:'繁' },
    { value:'zh-cn', label:'简' + B, title:'简体中文 (β · อยู่ระหว่างตรวจสอบ)' },
    { value:'vi', label:'VI' + B, title:'Tiếng Việt (β · đang được thẩm định)' },
    { value:'ja', label:'JA' + B, title:'日本語 (β · 検証中)' },
    { value:'ru', label:'RU' + B, title:'Русский (β · на проверке)' },
    { value:'es', label:'ES' + B, title:'Español (β · en revisión)' },
  ];
  function langList() {
    var ls = window.HK_LANGS_LIVE;
    return (Object.prototype.toString.call(ls) === '[object Array]' && ls.length) ? ls : DEFAULT_LANGS;
  }
  function langBtnsHtml(savedLang, savedZhVariant) {
    return langList().map(function (L) {
      var on = (L.value === savedLang) ||
        (L.value === 'zh-hant' && savedLang === 'zh' && savedZhVariant !== 'cn') ||
        (L.value === 'zh-cn' && savedLang === 'zh' && savedZhVariant === 'cn');
      return '<button data-value="' + L.value + '" class="' + (on ? 'on' : '') + '"' +
        (L.title ? ' title="' + L.title + '"' : '') + '>' + L.label + '</button>';
    }).join('\n              ');
  }

  /* ── CSS ── */
  var CSS = `
	  .hk-um-wrap{position:fixed;top:20px;right:20px;z-index:9999;font-family:'JetBrains Mono','SF Mono',monospace;}
	  .hk-um-wrap.inline{position:relative;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;flex:0 0 40px;z-index:9999;line-height:0;}
  .hk-um-trigger{position:relative;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#c8a44d,#8a6d2a);border:1px solid rgba(200,164,77,.5);color:#0d0f12;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:transform .2s,box-shadow .2s;font-family:'JetBrains Mono',monospace;letter-spacing:.02em;padding:0;overflow:hidden;line-height:1;}
  .hk-um-trigger:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(200,164,77,.4);}
  .hk-um-trigger.has-avatar{background:transparent;color:transparent;border-color:rgba(200,164,77,.45);border-radius:50%;box-shadow:0 0 0 1px rgba(200,164,77,.22),0 4px 12px rgba(0,0,0,.3);}
  .hk-um-trigger.has-avatar img{display:block;width:100%;height:100%;border-radius:inherit;object-fit:cover;}
	  .hk-um-panel{position:absolute;top:48px;right:0;width:260px;max-width:calc(100vw - 24px);max-height:80vh;overflow-y:auto;background:rgba(15,17,21,.96);border:1px solid rgba(200,164,77,.25);border-radius:14px;backdrop-filter:blur(20px);box-shadow:0 12px 40px rgba(0,0,0,.5);opacity:0;transform:translateY(-4px) scale(.98);pointer-events:none;transition:.2s cubic-bezier(.2,.8,.2,1);z-index:9999;}
  .hk-um-panel.on{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}
  [data-theme="light"] .hk-um-panel{background:rgba(255,250,238,.97);border-color:rgba(138,109,42,.3);}
  .hk-um-head{padding:18px 18px 14px;border-bottom:1px solid rgba(200,164,77,.15);}
  .hk-um-name{font-family:'Cormorant Garamond','Noto Serif Thai',serif;font-size:17px;font-weight:500;color:#f6f1e6;letter-spacing:.01em;}
  .hk-um-email{font-size:10px;color:rgba(246,241,230,.55);letter-spacing:.05em;margin-top:3px;word-break:break-all;}
  [data-theme="light"] .hk-um-name{color:#1a1612;}
  [data-theme="light"] .hk-um-email{color:rgba(26,22,18,.55);}
  .hk-um-sec{padding:8px 0;border-bottom:1px solid rgba(200,164,77,.1);}
  .hk-um-sec:last-child{border-bottom:none;}
  .hk-um-item{display:flex;align-items:center;gap:12px;padding:10px 18px;color:rgba(246,241,230,.85);font-size:12px;letter-spacing:.05em;cursor:pointer;text-decoration:none;transition:background .15s;font-family:inherit;border:none;background:none;width:100%;text-align:left;}
  [data-theme="light"] .hk-um-item{color:rgba(26,22,18,.85);}
  .hk-um-item:hover{background:rgba(200,164,77,.08);color:#c8a44d;}
  .hk-um-ico{width:16px;text-align:center;font-size:13px;opacity:.8;}
  .hk-um-row{display:flex;align-items:center;justify-content:space-between;padding:8px 18px;}
  .hk-um-rowlbl{font-size:10px;color:rgba(246,241,230,.55);letter-spacing:.15em;text-transform:uppercase;display:flex;align-items:center;gap:8px;}
  [data-theme="light"] .hk-um-rowlbl{color:rgba(26,22,18,.55);}
  .hk-um-segs{display:inline-flex;background:rgba(38,42,50,.5);border:1px solid rgba(200,164,77,.25);border-radius:99px;padding:3px;gap:0;}
  [data-theme="light"] .hk-um-segs{background:rgba(255,250,238,.5);border-color:rgba(138,109,42,.3);}
  .hk-um-segs button{min-width:30px;height:24px;padding:0 8px;border:none;background:transparent;color:rgba(246,241,230,.55);font-family:inherit;font-size:10px;font-weight:600;letter-spacing:.05em;border-radius:99px;cursor:pointer;transition:.2s;}
  [data-theme="light"] .hk-um-segs button{color:rgba(26,22,18,.5);}
  .hk-um-segs button.on{background:#c8a44d;color:#0d0f12;}
  [data-theme="light"] .hk-um-segs button.on{background:#8a6d2a;color:#f5efe2;}
  .hk-um-item.danger{color:#e74c3c;}
  .hk-um-item.danger:hover{background:rgba(231,76,60,.08);color:#e74c3c;}
	  /* mobile + tablet portrait: drop-down เด้งใต้ avatar · ขนาดพอดีจอเล็ก */
	  @media (max-width: 768px){
	    .hk-um-panel{width:240px;max-height:75vh;right:0;border-radius:12px;}
	    .hk-um-wrap:not(.inline){top:16px;right:16px;}
	    .hk-um-wrap.inline{top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;width:36px;height:36px;flex-basis:36px;}
	    .hk-um-trigger{width:36px;height:36px;font-size:12px;}
	  }
  `;

  /* ── inject CSS ── */
  var style = document.getElementById('hk-um-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'hk-um-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ── helpers ── */
  function initial(name) {
    var s = (name || '').trim();
    if (!s) return '·';
    // 2 ตัวอักษรแรก เพื่อให้ identify user ได้ชัดเจนขึ้น
    var parts = s.split(/\s+/);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return s.slice(0, 2).toUpperCase();
  }
  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    document.body && document.body.classList.toggle('light', mode === 'light');
    try { localStorage.setItem('hk-theme', mode); } catch(_){}
    // update buttons
    document.querySelectorAll('.hk-um-segs.theme button').forEach(function(b){
      b.classList.toggle('on', b.dataset.value === mode);
    });
  }
  function applyLang(lang) {
    try { localStorage.setItem('hk_locale', lang); } catch(_){}
    // ถ้าหน้านี้มี HK_I18N → re-apply
    if (window.HK_I18N) {
      document.querySelectorAll('[data-i18n]').forEach(function(el){
        var k = el.getAttribute('data-i18n');
        var bag = window.HK_I18N[k];
        if (bag && bag[lang]) el.innerHTML = bag[lang];
      });
      document.documentElement.lang = (lang === 'zh') ? 'zh-Hant' : lang;
    }
    // update buttons
    document.querySelectorAll('.hk-um-segs.lang button').forEach(function(b){
      b.classList.toggle('on', b.dataset.value === lang);
    });
    // re-render menu labels
    renderLabels();
  }
  function renderLabels(){
    var map = {
      '.hk-um-i-today': t('today'),
      '.hk-um-i-chart': t('chart'),
      '.hk-um-i-books': t('books'),
      '.hk-um-i-network': t('network'),
      '.hk-um-i-lang': t('language'),
      '.hk-um-i-theme': t('theme'),
      '.hk-um-i-settings': t('settings'),
      '.hk-um-i-logout': t('logout'),
    };
    Object.keys(map).forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el){ el.textContent = map[sel]; });
    });
  }

  function getMountTarget() {
    return document.querySelector('#hk-user-menu-mount') ||
      document.querySelector('.top-r') ||
      document.querySelector('.hk-top-r') ||
      document.querySelector('.topbar .nav-actions');
  }

  function removeExistingMenu() {
    document.querySelectorAll('#' + ROOT_ID).forEach(function(existing){
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    });
  }

  /* ── build menu ── */
  function buildMenu(user) {
    var savedTheme = (localStorage.getItem('hk-theme') || 'dark');
    var savedLang  = (localStorage.getItem('hk_locale') || 'th');
    var savedZhVariant = (localStorage.getItem('hk_zh_variant') || 'hant'); // 'hant'=繁(เดิม) · 'cn'=简(β · เฟส ข 6 ก.ค. 2569)
    var displayName = user.name || (user.email || '').split('@')[0] || 'user';
    var hasAvatar = !!user.avatar_url;
    var avatar = user.avatar_url
      ? '<img src="'+escapeHtml(user.avatar_url)+'" alt="" referrerpolicy="no-referrer"/>'
      : escapeHtml(initial(displayName));
    var mountTarget = getMountTarget();
    var inline = !!mountTarget;
    var wrap = document.createElement('div');
    wrap.id = ROOT_ID;
    wrap.className = 'hk-um-wrap' + (inline ? ' inline' : '');
    wrap.innerHTML = `
      <button class="hk-um-trigger${hasAvatar ? ' has-avatar' : ''}" id="hk-um-trigger" aria-label="user menu">${avatar}</button>
      <div class="hk-um-panel" id="hk-um-panel" role="menu">
        <div class="hk-um-head">
          <div class="hk-um-name">${escapeHtml(displayName)}</div>
          <div class="hk-um-email">${escapeHtml(user.email || '')}</div>
          <div class="hk-um-account" id="hk-um-account" style="display:none;margin-top:10px;padding:10px 12px;background:linear-gradient(135deg,rgba(200,164,77,.15),rgba(200,164,77,.05));border:1px solid rgba(200,164,77,.3);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-family:'JetBrains Mono',monospace;">
            <span style="display:inline-flex;align-items:center;gap:6px;">
              <span style="font-family:'Noto Serif TC',serif;font-size:14px;color:#c8a44d;font-weight:700;" id="hk-um-tier-badge">新</span>
              <span style="font-size:9px;letter-spacing:.12em;color:rgba(246,241,230,.6);text-transform:uppercase;" id="hk-um-tier-name">FREE</span>
            </span>
            <a href="/account.html" style="display:inline-flex;align-items:center;gap:5px;text-decoration:none;color:#c8a44d;font-size:11px;letter-spacing:.05em;">
              <span style="font-family:'Noto Serif TC',serif;font-weight:700;" id="hk-um-balance">—</span>
              <span style="font-family:'Noto Serif TC',serif;">時</span>
              <span style="opacity:.6;">▸</span>
            </a>
          </div>
        </div>
        <div class="hk-um-sec">
          <a class="hk-um-item" href="/today"><span class="hk-um-ico">📊</span><span class="hk-um-i-today">${t('today')}</span></a>
          <a class="hk-um-item" href="/chart"><span class="hk-um-ico">📜</span><span class="hk-um-i-chart">${t('chart')}</span></a>
          <a class="hk-um-item" href="/book"><span class="hk-um-ico">📖</span><span class="hk-um-i-books">${t('books')}</span></a>
	          <a class="hk-um-item" href="/network"><span class="hk-um-ico">👥</span><span class="hk-um-i-network">${t('network')}</span></a>
          <a class="hk-um-item" href="/pricing"><span class="hk-um-ico">💎</span><span class="hk-um-i-topup">${t('topup')}</span></a>
          <a class="hk-um-item" href="/account.html"><span class="hk-um-ico">⚙️</span><span class="hk-um-i-account">${t('account')}</span></a>
        </div>
        <div class="hk-um-sec">
          <div class="hk-um-row">
            <span class="hk-um-rowlbl"><span>🌐</span><span class="hk-um-i-lang">${t('language')}</span></span>
            <span class="hk-um-segs lang">
              ${langBtnsHtml(savedLang, savedZhVariant)}
            </span>
          </div>
          <div class="hk-um-row">
            <span class="hk-um-rowlbl"><span>🌓</span><span class="hk-um-i-theme">${t('theme')}</span></span>
            <span class="hk-um-segs theme">
              <button data-value="dark" class="${savedTheme==='dark'?'on':''}">☾</button>
              <button data-value="light" class="${savedTheme==='light'?'on':''}">☀</button>
            </span>
          </div>
        </div>
        <div class="hk-um-sec">
          <button class="hk-um-item" id="hk-um-settings"><span class="hk-um-ico">⚙️</span><span class="hk-um-i-settings">${t('settings')}</span></button>
          <button class="hk-um-item danger" id="hk-um-logout"><span class="hk-um-ico">🚪</span><span class="hk-um-i-logout">${t('logout')}</span></button>
        </div>
      </div>
    `;
    removeExistingMenu();
    if (mountTarget && mountTarget.id === 'hk-user-menu-mount') {
      mountTarget.replaceChildren(wrap);
    } else if (inline && mountTarget) {
      mountTarget.appendChild(wrap);
    } else {
      document.body.appendChild(wrap);
    }

    /* events */
    var trigger = wrap.querySelector('#hk-um-trigger');
    var panel = wrap.querySelector('#hk-um-panel');

    /* 📜 fetch tier + 時 balance · cached 30s · 16 พ.ค. */
    window.__hkFetchAccountMe()
      .then(function(acc){
        var box = wrap.querySelector('#hk-um-account');
        if (!box) return;
        box.style.display = 'flex';
        var TIER_BADGE = {free:'新', premium:'賢', master:'大'};
        var TIER_NAME = {free:'FREE', premium:'PREMIUM', master:'MASTER'};
        var bEl = wrap.querySelector('#hk-um-tier-badge');
        var nEl = wrap.querySelector('#hk-um-tier-name');
        var balEl = wrap.querySelector('#hk-um-balance');
        if (bEl) bEl.textContent = TIER_BADGE[acc.tier] || '新';
        if (nEl) nEl.textContent = TIER_NAME[acc.tier] || 'FREE';
        if (balEl) balEl.textContent = (acc.hour_balance || 0).toLocaleString();
      })
      .catch(function(){ /* anon · silent */ });
    /* if avatar img fails to load, fall back to initials */
    var triggerImg = trigger.querySelector('img');
    if (triggerImg) {
      triggerImg.addEventListener('error', function(){
        console.warn('[HK] avatar load failed:', triggerImg.currentSrc || triggerImg.src);
        trigger.textContent = initial(displayName);
      });
    }
    trigger.addEventListener('click', function(e){
      e.stopPropagation();
      panel.classList.toggle('on');
    });
    document.addEventListener('click', function(e){
      if (!wrap.contains(e.target)) panel.classList.remove('on');
    });
    panel.querySelectorAll('.hk-um-segs.theme button').forEach(function(b){
      b.addEventListener('click', function(){ applyTheme(b.dataset.value); });
    });
    panel.querySelectorAll('.hk-um-segs.lang button').forEach(function(b){
      b.addEventListener('click', function(){
        var v = b.dataset.value;
        // 繁/简 = ตัวแปรของ zh เดียวกัน (hk_zh_variant) — ต้อง reload เพื่อให้ hk-zhcn.js
        // แปลง/ไม่แปลงตัวอักษรใหม่ทั้งหน้าอย่างสะอาด (แปลงกลับ 简→繁 แบบ live ทำไม่ได้)
        if (v === 'zh-hant' || v === 'zh-cn') {
          try {
            localStorage.setItem('hk_locale', 'zh');
            localStorage.setItem('hk_lang', 'zh');
            localStorage.setItem('hk_zh_variant', v === 'zh-cn' ? 'cn' : 'hant');
          } catch(_) {}
          location.reload();
          return;
        }
        /* 🌐 ภาษาใหม่ (vi/ja/ko/ru/es — เข้าถึงได้เฉพาะเมื่อเปิดใน HK_LANGS_LIVE): reload ให้
         * hk-overlay-boot ของหน้าโหลด /i18n/<locale>.json แล้ว re-apply ทั้งหน้าอย่างสะอาด */
        if (v !== 'th' && v !== 'en') {
          try { localStorage.setItem('hk_locale', v); localStorage.setItem('hk_lang', v); } catch(_) {}
          location.reload();
          return;
        }
        applyLang(v);
      });
    });
    wrap.querySelector('#hk-um-logout').addEventListener('click', async function(){
      try {
        if (window.__hkClearMeCache) window.__hkClearMeCache();
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch(_) {}
      window.location.href = '/signup?tab=login';
    });
    var settingsBtn = wrap.querySelector('#hk-um-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function(){
        panel.classList.remove('on');
        if (typeof window.HK_openSettings === 'function') {
          window.HK_openSettings();
        } else {
          var s = document.createElement('script');
          s.src = '/js/hk-settings-drawer.js?v=10';
          s.onload = function(){ if (typeof window.HK_openSettings === 'function') window.HK_openSettings(); };
          document.head.appendChild(s);
        }
      });
    }
  }

  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ── fetch user + mount ── */
  function init() {
    if (initPromise) return initPromise;
    initPromise = window.__hkFetchAuthMe()
      .then(function(j){
        if (j && j.user && j.user.id) {
          console.log('[HK] user menu · avatar_url =', j.user.avatar_url, '· name =', j.user.name);
          buildMenu(j.user);
          /* r378 · Account Phase 1: บันทึกอุปกรณ์ best-effort ครั้งเดียวต่อ browser-session */
          try {
            if (!sessionStorage.getItem('hk_dev_ping')) {
              sessionStorage.setItem('hk_dev_ping', '1');
              var did = localStorage.getItem('hk_device_id');
              if (!did) { did = 'dv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('hk_device_id', did); }
              fetch('/api/account/ping', { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', keepalive:true, body: JSON.stringify({ deviceId: did }) }).catch(function(){});
            }
          } catch(_) {}
        }
        // ถ้าไม่ login → ไม่แสดงเมนู (หน้า private พวกนี้ ปกติ middleware เด้งไป login อยู่แล้ว)
      })
      .catch(function(){})
      .finally(function(){ initPromise = null; });
    return initPromise;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  window.addEventListener('pageshow', function(e){
    if (e.persisted) init();
  });
})();
