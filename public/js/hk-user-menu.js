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

  /* Global glossary tooltips · fallback loader for private pages that mount the user menu. */
  try {
    if (!window.__HK_TOOLTIPS_LOADER__) {
      window.__HK_TOOLTIPS_LOADER__ = true;
      var hkTipScript = document.createElement('script');
      hkTipScript.src = '/js/hk-tooltips.js?v=20260707';
      hkTipScript.defer = true;
      document.head.appendChild(hkTipScript);
    }
  } catch (_) {}

  var SINSAE_INTRO_VERSION = 'sinsae_intro_20260517';
  function maybeOpenSinsaeGate(){
    return;
  }

  /* ── i18n ── */
  var I18N = {
    today:    { th:'หน้าวันนี้', en:'Today', zh:'今日', cn:'今日', vi:'Hôm nay', ja:'今日', ru:'Сегодня', ko:'오늘', es:'Hoy' },
    chart:    { th:'ดวงของฉัน', en:'My Chart', zh:'我的命盤', cn:'我的命盘', vi:'Lá số của tôi', ja:'私の命盤', ru:'Моя карта', ko:'내 차트', es:'Mi carta' },
    network:  { th:'เครือข่ายดวง', en:'Network', zh:'人脈網', cn:'人脉网', vi:'Mạng lưới', ja:'ネットワーク', ru:'Сеть', ko:'네트워크', es:'Red' },
    books:    { th:'หนังสือของฉัน', en:'My Books', zh:'我的命書', cn:'我的命书', vi:'Sách của tôi', ja:'私の本', ru:'Мои книги', ko:'내 책', es:'Mis libros' },
    topup:    { th:'เติมยาม · แพ็กเกจ', en:'Top Up · Plans', zh:'充值 · 方案', cn:'充值 · 套餐', vi:'Nạp · Gói', ja:'チャージ · プラン', ru:'Пополнить · Планы', ko:'충전 · 플랜', es:'Recarga · Planes' },
    referral: { th:'ชวนเพื่อนรับยาม', en:'Invite friends', zh:'邀請好友', cn:'邀请好友', vi:'Mời bạn bè', ja:'友達を招待', ru:'Пригласить друзей', ko:'친구 초대', es:'Invitar amigos' },
    account:  { th:'บัญชีของฉัน', en:'My Account', zh:'我的帳戶', cn:'我的账户', vi:'Tài khoản', ja:'アカウント', ru:'Аккаунт', ko:'내 계정', es:'Mi cuenta' },
    news:     { th:'ข่าวสาร · โปรโมชั่น', en:'News · Offers', zh:'消息 · 優惠', cn:'新闻 · 优惠', vi:'Tin tức · Ưu đãi', ja:'ニュース · 特典', ru:'Новости · Акции', ko:'소식 · 혜택', es:'Noticias · Ofertas' },
    support:  { th:'แจ้งปัญหาการใช้งาน', en:'Report an issue', zh:'回報使用問題', cn:'反馈使用问题', vi:'Báo lỗi sử dụng', ja:'問題を報告', ru:'Сообщить о проблеме', ko:'문제 신고', es:'Reportar problema' },
    admin:    { th:'หลังบ้าน', en:'Admin', zh:'後台', cn:'后台', vi:'Quản trị', ja:'管理画面', ru:'Админ-панель', ko:'관리자', es:'Panel admin' },
    language: { th:'ภาษา', en:'Language', zh:'語言', cn:'语言', vi:'Ngôn ngữ', ja:'言語', ru:'Язык', ko:'언어', es:'Idioma' },
    theme:    { th:'ธีม', en:'Theme', zh:'主題', cn:'主题', vi:'Giao diện', ja:'テーマ', ru:'Тема', ko:'테마', es:'Tema' },
    settings: { th:'ตั้งค่า', en:'Settings', zh:'設定', cn:'设置', vi:'Cài đặt', ja:'設定', ru:'Настройки', ko:'설정', es:'Ajustes' },
    logout:   { th:'ออกจากระบบ', en:'Sign out', zh:'登出', cn:'退出登录', vi:'Đăng xuất', ja:'ログアウト', ru:'Выйти', ko:'로그아웃', es:'Salir' },
    light:    { th:'สว่าง', en:'Light', zh:'明亮', cn:'浅色', vi:'Sáng', ja:'ライト', ru:'Светлая', ko:'라이트', es:'Claro' },
    dark:     { th:'มืด', en:'Dark', zh:'暗色', cn:'深色', vi:'Tối', ja:'ダーク', ru:'Темная', ko:'다크', es:'Oscuro' },
    signin:   { th:'เข้าสู่ระบบ', en:'Sign in', zh:'登入', cn:'登录', vi:'Đăng nhập', ja:'ログイン', ru:'Войти', ko:'로그인', es:'Entrar' },
    trialLeft:{ th:'ทดลองเหลือ {N} วัน', en:'Trial · {N} days left', zh:'試用剩 {N} 天', cn:'试用剩 {N} 天', vi:'Dùng thử còn {N} ngày', ja:'トライアル残り {N} 日', ru:'Пробный · осталось {N} дн.', ko:'체험 {N}일 남음', es:'Prueba · quedan {N} días' },
    trialEnded:{ th:'หมดทดลอง · โหมดฟรี', en:'Trial ended · free mode', zh:'試用結束 · 免費模式', cn:'试用结束 · 免费模式', vi:'Hết dùng thử · miễn phí', ja:'トライアル終了 · フリー', ru:'Пробный закончен · бесплатно', ko:'체험 종료 · 무료', es:'Prueba terminada · gratis' },
  };
  function langState() {
    return window.HK_LANG_STATE || (window.HK && window.HK.langState) || null;
  }
  function normalizeLang(raw) {
    var st = langState();
    if (st && typeof st.normalize === 'function') return st.normalize(raw);
    var x = String(raw || '').toLowerCase();
    if (x.indexOf('zh') === 0) return { raw:'zh', storage:'zh', app:'zh', html:'zh-Hant', variant:'hant' };
    if (x === 'th' || x.indexOf('th-') === 0) return { raw:'th', storage:'th', app:'th', html:'th' };
    if (x === 'en' || x.indexOf('en-') === 0) return { raw:'en', storage:'en', app:'en', html:'en' };
    return x ? { raw:x, storage:x, app:'en', html:x } : { raw:'th', storage:'th', app:'th', html:'th' };
  }
  function currentState() {
    var st = langState();
    if (st && typeof st.current === 'function') return st.current();
    return normalizeLang(localStorage.getItem('hk_locale') || localStorage.getItem('hk_lang') || 'th');
  }
  function t(key) {
    var state = currentState();
    var loc = state.raw || 'th';
    var bag = I18N[key]; if (!bag) return key;
    if (loc === 'zh' && zhVariantFromStorage(state.variant) === 'cn' && bag.cn) return bag.cn;
    if (bag[loc]) return bag[loc];
    /* 🌐 locale ใหม่ (vi/ja/ko/ru/es) ที่ยังไม่มีคำแปลในเมนู → ตกอังกฤษ ไม่ตกไทย (6 ก.ค. 2569) */
    if (loc !== 'th' && bag.en) return bag.en;
    return bag.th || key;
  }

  /* ── 🌐 โครงรายชื่อภาษาในเมนู (6 ก.ค. 2569) ──
   * เปิดภาษาใหม่ (vi/ja/ko/ru/es) ทีละตัวโดยเซ็ต window.HK_LANGS_LIVE ก่อนโหลดไฟล์นี้ เช่น
   *   window.HK_LANGS_LIVE = [{value:'th',label:'TH'},{value:'en',label:'EN'},{value:'zh-hant',label:'繁'},{value:'zh-cn',label:'简'},{value:'ja',label:'JA'}];
   * ถ้าไม่เซ็ต = รายการเดิม th/en/繁/简 เป๊ะ — หน้าตาปัจจุบันไม่เปลี่ยน */
  var B = '<sup style="font-size:8px;opacity:.75;margin-left:1px;">β</sup>';
  var DEFAULT_LANGS = [
    { value:'th', label:'TH', name:'ไทย' },
    { value:'en', label:'EN', name:'English' },
    { value:'zh-hant', label:'繁', name:'繁體' },
    { value:'zh-cn', label:'简' + B, name:'简体', title:'简体中文 (beta · under review)' },
    { value:'vi', label:'VI' + B, name:'Tiếng Việt', title:'Tiếng Việt (β · đang được thẩm định)' },
    { value:'ja', label:'JA' + B, name:'日本語', title:'日本語 (β · 検証中)' },
    { value:'ru', label:'RU' + B, name:'Русский', title:'Русский (β · на проверке)' },
    { value:'ko', label:'KO' + B, name:'한국어', title:'한국어 (β · 검증 중)' },
    { value:'es', label:'ES' + B, name:'Español', title:'Español (β · en revisión)' },
  ];
  function langList() {
    var ls = window.HK_LANGS_LIVE;
    return (Object.prototype.toString.call(ls) === '[object Array]' && ls.length) ? ls : DEFAULT_LANGS;
  }
  function zhVariantFromStorage(fallback) {
    try {
      var saved = localStorage.getItem('hk_zh_variant');
      if (saved === 'cn' || saved === 'hant') return saved;
    } catch(_) {}
    return fallback || 'hant';
  }
  function stateLangValue(state) {
    state = state || currentState();
    if (state.raw === 'zh') return zhVariantFromStorage(state.variant) === 'cn' ? 'zh-cn' : 'zh-hant';
    return state.raw || 'th';
  }
  function langOptionName(L) {
    if (L && L.name) return L.name;
    var map = { th:'ไทย', en:'English', 'zh-hant':'繁體', 'zh-cn':'简体', vi:'Tiếng Việt', ja:'日本語', ko:'한국어', ru:'Русский', es:'Español' };
    return map[L && L.value] || (L && L.value ? String(L.value).toUpperCase() : '');
  }
  function findLangOption(value) {
    var list = langList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].value === value) return list[i];
    }
    return null;
  }
  function langCurrentHtml(savedLang, savedZhVariant) {
    var value = savedLang === 'zh' ? (savedZhVariant === 'cn' ? 'zh-cn' : 'zh-hant') : savedLang;
    var L = findLangOption(value);
    return L ? L.label : escapeHtml(String(value || 'th').toUpperCase());
  }
  function langBtnsHtml(savedLang, savedZhVariant) {
    return langList().map(function (L) {
      var on = (L.value === savedLang) ||
        (L.value === 'zh-hant' && savedLang === 'zh' && savedZhVariant !== 'cn') ||
        (L.value === 'zh-cn' && savedLang === 'zh' && savedZhVariant === 'cn');
      return '<button type="button" data-value="' + escapeHtml(L.value) + '" class="hk-um-lang-opt ' + (on ? 'on' : '') + '"' +
        (L.title ? ' title="' + escapeHtml(L.title) + '"' : '') +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="hk-um-lang-code">' + L.label + '</span>' +
        '<span class="hk-um-lang-name">' + escapeHtml(langOptionName(L)) + '</span>' +
        '</button>';
    }).join('\n              ');
  }

  /* ── CSS ── */
  var CSS = `
	  .hk-um-wrap{position:fixed;top:20px;right:20px;z-index:9999;font-family:'JetBrains Mono','SF Mono',monospace;}
	  .hk-um-wrap.inline{position:relative;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;flex:0 0 40px;z-index:9999;line-height:0;}
  .hk-um-trigger{position:relative;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#e5bd69,#9f7436);border:1px solid rgba(232,197,128,.5);color:#130d09;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:transform .2s,box-shadow .2s;font-family:'JetBrains Mono',monospace;letter-spacing:.02em;padding:0;overflow:hidden;line-height:1;}
  .hk-um-trigger:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(232,197,128,.32);}
  .hk-um-trigger.has-avatar{background:transparent;color:transparent;border-color:rgba(232,197,128,.45);border-radius:50%;box-shadow:0 0 0 1px rgba(232,197,128,.22),0 4px 12px rgba(0,0,0,.3);}
  .hk-um-trigger.has-avatar img{display:block;width:100%;height:100%;border-radius:inherit;object-fit:cover;}
	  .hk-um-panel{position:absolute;top:48px;right:0;width:300px;max-width:calc(100vw - 24px);max-height:80vh;overflow-y:auto;background:rgba(18,16,14,.96);border:1px solid rgba(232,197,128,.22);border-radius:8px;backdrop-filter:blur(20px);box-shadow:0 18px 54px rgba(0,0,0,.48);opacity:0;transform:translateY(-4px) scale(.98);pointer-events:none;transition:.2s cubic-bezier(.2,.8,.2,1);z-index:9999;}
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
  .hk-um-lang-block{padding:12px 14px 10px;}
  .hk-um-lang-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;padding:0 4px;}
  .hk-um-lang-current{display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:24px;padding:0 10px;border-radius:6px;background:rgba(232,197,128,.12);border:1px solid rgba(232,197,128,.3);color:#e5bd69;font-size:10px;font-weight:700;letter-spacing:.05em;line-height:1;white-space:nowrap;}
  [data-theme="light"] .hk-um-lang-current{background:rgba(138,109,42,.1);border-color:rgba(138,109,42,.28);color:#8a6d2a;}
  .hk-um-lang-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;}
  .hk-um-lang-opt{min-width:0;height:46px;padding:6px 5px;border:1px solid rgba(232,197,128,.18);border-radius:6px;background:rgba(247,239,227,.035);color:rgba(247,239,227,.74);font-family:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;transition:background .15s,border-color .15s,color .15s,box-shadow .15s;}
  .hk-um-lang-opt:hover{background:rgba(232,197,128,.09);border-color:rgba(232,197,128,.38);color:#f7efe3;}
  .hk-um-lang-opt.on{background:linear-gradient(135deg,#e5bd69,#9f7436);border-color:rgba(232,197,128,.8);color:#130d09;box-shadow:0 6px 16px rgba(232,197,128,.16);}
  .hk-um-lang-code{font-size:11px;font-weight:800;letter-spacing:.04em;line-height:1;}
  .hk-um-lang-name{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8.5px;font-weight:500;letter-spacing:0;color:inherit;opacity:.72;line-height:1.1;}
  [data-theme="light"] .hk-um-lang-opt{background:rgba(26,22,18,.03);border-color:rgba(138,109,42,.18);color:rgba(26,22,18,.7);}
  [data-theme="light"] .hk-um-lang-opt:hover{background:rgba(138,109,42,.08);border-color:rgba(138,109,42,.34);color:#1a1612;}
  [data-theme="light"] .hk-um-lang-opt.on{background:linear-gradient(135deg,#8a6d2a,#6e5420);border-color:rgba(138,109,42,.72);color:#f5efe2;box-shadow:0 6px 16px rgba(138,109,42,.16);}
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
	    .hk-um-panel{width:min(320px, calc(100vw - 24px));max-height:75vh;right:0;border-radius:8px;}
	    .hk-um-wrap:not(.inline){top:16px;right:16px;}
	    .hk-um-wrap.inline{top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;width:36px;height:36px;flex-basis:36px;}
	    .hk-um-trigger{width:36px;height:36px;font-size:12px;}
	  }
    @media (max-width: 360px){
      .hk-um-lang-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
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
    var state;
    var st = langState();
    if (st && typeof st.set === 'function') state = st.set(lang);
    else {
      state = normalizeLang(lang);
      try { localStorage.setItem('hk_locale', state.storage); localStorage.setItem('hk_lang', state.storage); } catch(_){}
      document.documentElement.lang = state.html;
      document.documentElement.setAttribute('data-lang', state.app);
    }
    var pageLang = state.raw === 'zh' ? stateLangValue(state) : state.raw;
    if (typeof window.__hkOverlayApply === 'function') {
      try { window.__hkOverlayApply(pageLang); } catch(_) {}
    } else if (typeof window.applyI18N === 'function') {
      try { window.applyI18N(state.raw); } catch(_) {}
    } else if (window.HK && window.HK.i18n && typeof window.HK.i18n.apply === 'function') {
      try { window.HK.i18n.apply(); } catch(_) {}
    }
    // update language buttons + compact badge
    var currentValue = stateLangValue(state);
    document.querySelectorAll('.hk-um-lang-opt,.hk-um-segs.lang button').forEach(function(b){
      var value = b.dataset.value;
      var on = value === currentValue || value === state.raw ||
        (value === 'zh-hant' && state.raw === 'zh' && currentValue === 'zh-hant') ||
        (value === 'zh-cn' && state.raw === 'zh' && currentValue === 'zh-cn');
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var current = document.getElementById('hk-um-lang-current');
    if (current) current.innerHTML = langCurrentHtml(state.raw, state.raw === 'zh' ? zhVariantFromStorage(state.variant) : state.variant);
    // re-render menu labels
    renderLabels();
  }
  function renderLabels(){
    var map = {
      '.hk-um-i-today': t('today'),
      '.hk-um-i-chart': t('chart'),
      '.hk-um-i-books': t('books'),
      '.hk-um-i-network': t('network'),
      '.hk-um-i-topup': t('topup'),
      '.hk-um-i-referral': t('referral'),
      '.hk-um-i-account': t('account'),
      '.hk-um-i-news': t('news'),
      '.hk-um-i-support': t('support'),
      '.hk-um-i-admin': t('admin'),
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
    var savedState = currentState();
    var savedLang  = savedState.raw || 'th';
    var savedZhVariant = savedLang === 'zh' ? zhVariantFromStorage(savedState.variant) : (savedState.variant || 'hant'); // 'hant'=繁(เดิม) · 'cn'=简(β · เฟส ข 6 ก.ค. 2569)
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
            <span style="display:inline-flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;">
              <span style="display:inline-flex;align-items:center;gap:6px;">
                <span style="font-family:'Noto Serif TC',serif;font-size:14px;color:#c8a44d;font-weight:700;" id="hk-um-tier-badge">新</span>
                <span style="font-size:9px;letter-spacing:.12em;color:rgba(246,241,230,.6);text-transform:uppercase;" id="hk-um-tier-name">FREE</span>
              </span>
              <span style="font-size:9px;letter-spacing:.04em;color:rgba(200,164,77,.85);line-height:1.3;" id="hk-um-trial-line"></span>
            </span>
            <a href="/account.html" style="display:inline-flex;align-items:center;gap:5px;text-decoration:none;color:#c8a44d;font-size:11px;letter-spacing:.05em;flex-shrink:0;">
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
          <a class="hk-um-item" href="/referral.html"><span class="hk-um-ico">時</span><span class="hk-um-i-referral">${t('referral')}</span></a>
          <a class="hk-um-item" href="/account.html"><span class="hk-um-ico">⚙️</span><span class="hk-um-i-account">${t('account')}</span></a>
          <a class="hk-um-item" href="/news"><span class="hk-um-ico">📰</span><span class="hk-um-i-news">${t('news')}</span></a>
          <a class="hk-um-item" href="/support" id="hk-um-support-link"><span class="hk-um-ico">🛟</span><span class="hk-um-i-support">${t('support')}</span></a>
          <a class="hk-um-item" href="/admin?src=menu" id="hk-um-admin-link" style="display:none"><span class="hk-um-ico">🔧</span><span class="hk-um-i-admin">${t('admin')}</span></a>
        </div>
        <div class="hk-um-sec">
          <div class="hk-um-lang-block">
            <div class="hk-um-lang-head">
              <span class="hk-um-rowlbl"><span>🌐</span><span class="hk-um-i-lang">${t('language')}</span></span>
              <span class="hk-um-lang-current" id="hk-um-lang-current">${langCurrentHtml(savedLang, savedZhVariant)}</span>
            </div>
            <div class="hk-um-lang-grid" role="group" aria-label="${escapeHtml(t('language'))}">
              ${langBtnsHtml(savedLang, savedZhVariant)}
            </div>
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
    var supportLink = wrap.querySelector('#hk-um-support-link');
    if (supportLink) {
      supportLink.href = '/support?from=' + encodeURIComponent(location.pathname + location.search);
    }
    /* r502 · รายการ "หลังบ้าน" ใต้แจ้งปัญหา — เฉพาะแอดมินจริง (เช็ค /api/admin/whoami · cache ต่อ session ร่วมคีย์เดิมของปุ่มลอยเก่า) */
    var adminLink = wrap.querySelector('#hk-um-admin-link');
    if (adminLink) {
      var showA = function(){ adminLink.style.display=''; };
      var ck = null; try { ck = sessionStorage.getItem('hk_admin_chip'); } catch(_){}
      if (ck === '1') showA();
      else if (ck !== '0') {
        fetch('/api/admin/whoami', { credentials:'include', cache:'no-store' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(d){ var ok = !!(d && d.ok); try { sessionStorage.setItem('hk_admin_chip', ok?'1':'0'); } catch(_){} if (ok) showA(); })
          .catch(function(){});
      }
    }
    if (supportLink) { /* คงโครงวงเล็บเดิม */
    }

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
        var trialEl = wrap.querySelector('#hk-um-trial-line');
        var plan = acc.plan || (acc.in_trial ? 'trial' : (acc.tier || 'free'));
        if (bEl) bEl.textContent = acc.in_trial ? '試' : (TIER_BADGE[acc.tier] || '新');
        if (nEl) {
          if (acc.in_trial) nEl.textContent = 'TRIAL';
          else if (acc.sub_active && acc.tier) nEl.textContent = TIER_NAME[acc.tier] || String(acc.tier).toUpperCase();
          else nEl.textContent = 'FREE';
        }
        if (balEl) balEl.textContent = (acc.hour_balance || 0).toLocaleString();
        if (trialEl) {
          if (acc.in_trial && acc.trial_ends_at) {
            var left = Math.max(0, Math.ceil((new Date(acc.trial_ends_at).getTime() - Date.now()) / 86400000));
            trialEl.textContent = t('trialLeft').replace('{N}', String(left));
            trialEl.style.display = '';
          } else if (acc.trial_ends_at && !acc.in_trial && !acc.sub_active) {
            trialEl.textContent = t('trialEnded');
            trialEl.style.display = '';
          } else {
            trialEl.textContent = '';
            trialEl.style.display = 'none';
          }
        }
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
    panel.querySelectorAll('.hk-um-lang-opt,.hk-um-segs.lang button').forEach(function(b){
      b.addEventListener('click', function(){
        var v = b.dataset.value;
        applyLang(v);
        location.reload();
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
