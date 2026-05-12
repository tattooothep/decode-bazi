/* hourkey · UserMenu (vanilla JS · inject ทุกหน้า private)
 * - ดึง /api/auth/me แสดง avatar
 * - drop-down: profile · ภาษา · ธีม · ตั้งค่า · ออกจากระบบ
 * - mobile: bottom sheet
 * - localStorage key: hk-theme · hk_locale
 */
(function () {
  if (window.__hkUserMenuLoaded) return;
  window.__hkUserMenuLoaded = true;

  /* ── i18n ── */
  var I18N = {
    today:    { th:'หน้าวันนี้',     en:'Today',           zh:'今日' },
    chart:    { th:'ดวงของฉัน',      en:'My Chart',        zh:'我的命盤' },
    network:  { th:'เครือข่ายดวง',    en:'Network',         zh:'人脈網' },
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

  /* ── CSS ── */
  var CSS = `
  .hk-um-wrap{position:fixed;top:20px;right:20px;z-index:9999;font-family:'JetBrains Mono','SF Mono',monospace;}
  .hk-um-wrap.inline{position:relative;top:auto;right:auto;display:inline-flex;z-index:9999;}
  .hk-um-trigger{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#c8a44d,#8a6d2a);border:1px solid rgba(200,164,77,.5);color:#0d0f12;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:transform .2s,box-shadow .2s;font-family:'JetBrains Mono',monospace;letter-spacing:.02em;}
  .hk-um-trigger:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(200,164,77,.4);}
  .hk-um-trigger img{width:100%;height:100%;border-radius:50%;object-fit:cover;}
  .hk-um-panel{position:absolute;top:48px;right:0;width:260px;max-height:80vh;overflow-y:auto;background:rgba(15,17,21,.96);border:1px solid rgba(200,164,77,.25);border-radius:14px;backdrop-filter:blur(20px);box-shadow:0 12px 40px rgba(0,0,0,.5);opacity:0;transform:translateY(-4px) scale(.98);pointer-events:none;transition:.2s cubic-bezier(.2,.8,.2,1);z-index:9999;}
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
    .hk-um-wrap{top:16px;right:16px;}
    .hk-um-trigger{width:36px;height:36px;font-size:12px;}
  }
  `;

  /* ── inject CSS ── */
  var style = document.createElement('style');
  style.id = 'hk-um-style';
  style.textContent = CSS;
  document.head.appendChild(style);

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

  /* ── build menu ── */
  function buildMenu(user) {
    var savedTheme = (localStorage.getItem('hk-theme') || 'dark');
    var savedLang  = (localStorage.getItem('hk_locale') || 'th');
    var displayName = user.name || (user.email || '').split('@')[0] || 'user';
    var avatar = user.avatar_url
      ? '<img src="'+escapeHtml(user.avatar_url)+'" alt=""/>'
      : escapeHtml(initial(displayName));
    // หา mount point — ถ้ามี navbar (.top-r) → mount inline · ไม่งั้น fixed
    var mountTarget = document.querySelector('#hk-user-menu-mount') || document.querySelector('.top-r');
    var inline = !!mountTarget;
    var wrap = document.createElement('div');
    wrap.className = 'hk-um-wrap' + (inline ? ' inline' : '');
    wrap.innerHTML = `
      <button class="hk-um-trigger" id="hk-um-trigger" aria-label="user menu">${avatar}</button>
      <div class="hk-um-panel" id="hk-um-panel" role="menu">
        <div class="hk-um-head">
          <div class="hk-um-name">${escapeHtml(displayName)}</div>
          <div class="hk-um-email">${escapeHtml(user.email || '')}</div>
        </div>
        <div class="hk-um-sec">
          <a class="hk-um-item" href="/today"><span class="hk-um-ico">📊</span><span class="hk-um-i-today">${t('today')}</span></a>
          <a class="hk-um-item" href="/chart"><span class="hk-um-ico">📜</span><span class="hk-um-i-chart">${t('chart')}</span></a>
          <a class="hk-um-item" href="/yongsennetwork"><span class="hk-um-ico">👥</span><span class="hk-um-i-network">${t('network')}</span></a>
        </div>
        <div class="hk-um-sec">
          <div class="hk-um-row">
            <span class="hk-um-rowlbl"><span>🌐</span><span class="hk-um-i-lang">${t('language')}</span></span>
            <span class="hk-um-segs lang">
              <button data-value="th" class="${savedLang==='th'?'on':''}">TH</button>
              <button data-value="en" class="${savedLang==='en'?'on':''}">EN</button>
              <button data-value="zh" class="${savedLang==='zh'?'on':''}">中</button>
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
          <a class="hk-um-item" href="/dashboard"><span class="hk-um-ico">⚙️</span><span class="hk-um-i-settings">${t('settings')}</span></a>
          <button class="hk-um-item danger" id="hk-um-logout"><span class="hk-um-ico">🚪</span><span class="hk-um-i-logout">${t('logout')}</span></button>
        </div>
      </div>
    `;
    if (inline && mountTarget) {
      mountTarget.appendChild(wrap);
    } else {
      document.body.appendChild(wrap);
    }

    /* events */
    var trigger = wrap.querySelector('#hk-um-trigger');
    var panel = wrap.querySelector('#hk-um-panel');
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
      b.addEventListener('click', function(){ applyLang(b.dataset.value); });
    });
    wrap.querySelector('#hk-um-logout').addEventListener('click', async function(){
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch(_) {}
      window.location.href = '/';
    });
  }

  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ── fetch user + mount ── */
  function init() {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function(r){ return r.json(); })
      .then(function(j){
        if (j && j.user && j.user.id) {
          buildMenu(j.user);
        }
        // ถ้าไม่ login → ไม่แสดงเมนู (หน้า private พวกนี้ ปกติ middleware เด้งไป login อยู่แล้ว)
      })
      .catch(function(){});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
