/* hourkey · 羅盤 Compass dropdown injection · 17 พ.ค. 2026 (อาเจ๊กฮ้ง)
 * ฉีด dropdown 4 ลิงก์ใหม่เข้า #hk-topnav · ไม่แตะ HTML เดิม
 * Pages: /compass · /compass-studio · /fengshui-pro · /katakagae
 */
(function(){
  if (window.__hkLuopanInjected) return;
  window.__hkLuopanInjected = true;

  // CSS
  const css = `
  .hk-lp-wrap{position:relative;display:inline-flex;}
  .hk-lp-trigger{color:var(--fg-soft,rgba(246,241,230,.62));text-decoration:none;font-family:'Noto Serif Thai',serif;font-size:12px;letter-spacing:.04em;display:inline-flex;align-items:center;gap:6px;padding:6px 4px;transition:.2s;white-space:nowrap;cursor:pointer;background:none;border:none;}
  .hk-lp-trigger .glyph{font-family:'Noto Serif TC',serif;font-size:16px;color:var(--gold,#c8a44d);font-weight:700;line-height:1;}
  .hk-lp-trigger:hover,.hk-lp-trigger.on{color:var(--gold,#c8a44d);}
  .hk-lp-trigger .caret{font-size:9px;opacity:.6;transition:.2s;}
  .hk-lp-trigger.on .caret{transform:rotate(180deg);}
  .hk-lp-menu{position:absolute;top:30px;right:0;min-width:240px;background:rgba(15,17,21,.97);border:1px solid rgba(200,164,77,.3);border-radius:12px;padding:6px;box-shadow:0 12px 32px rgba(0,0,0,.5);opacity:0;pointer-events:none;transform:translateY(-4px);transition:.2s;z-index:1000;backdrop-filter:blur(14px);}
  [data-theme="light"] .hk-lp-menu{background:rgba(255,250,238,.97);border-color:rgba(138,109,42,.3);}
  .hk-lp-menu.on{opacity:1;pointer-events:auto;transform:translateY(0);}
  .hk-lp-menu a{display:flex;align-items:center;gap:10px;padding:9px 12px;color:var(--fg,#f3ebd9);text-decoration:none;border-radius:8px;font-size:12px;transition:background .15s;}
  .hk-lp-menu a:hover{background:rgba(200,164,77,.10);color:var(--gold,#c8a44d);}
  .hk-lp-menu a .ico{font-family:'Noto Serif TC',serif;font-size:18px;color:var(--gold,#c8a44d);min-width:24px;text-align:center;line-height:1;font-weight:600;}
  .hk-lp-menu a .info{flex:1;}
  .hk-lp-menu a .info .ttl{font-family:'Noto Serif Thai',serif;font-size:12px;font-weight:600;}
  .hk-lp-menu a .info .sub{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--fg-faint,rgba(246,241,230,.4));letter-spacing:.08em;margin-top:1px;}
  .hk-lp-menu .divider{height:1px;background:rgba(200,164,77,.15);margin:4px 8px;}
  .hk-lp-menu .label{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--gold,#c8a44d);letter-spacing:.18em;padding:6px 12px 2px;text-transform:uppercase;}
  @media(max-width:980px){
    .hk-lp-menu{right:auto;left:0;max-width:260px;}
  }
  `;
  const style = document.createElement('style');
  style.id = 'hk-lp-style'; style.textContent = css;
  document.head.appendChild(style);

  // 3-lang labels
  const I18N = {
    th: { trigger:'羅盤 ทิศ', label:'COMPASS · 羅盤',
      items: [
        { href:'/luopan',          ico:'環', ttl:'หล่อแก 14 วง',   sub:'ดาวเหินจร · 玄空飛星' },
        { href:'/compass',         ico:'家', ttl:'บันทึกบ้าน',     sub:'HOUSE + QR · ฮวงจุ้ย' },
        { href:'/compass-studio',  ico:'盤', ttl:'วัดทิศบนแผนที่', sub:'GOOGLE MAPS · 6 LAYER' },
        { href:'/fengshui-pro',    ico:'宮', ttl:'ฮวงจุ้ย Pro',    sub:'9 พาลา · ดาวเหิน' },
        { href:'/katakagae',       ico:'違', ttl:'方違 ก่อนเดินทาง', sub:'JAPANESE HEIAN' },
      ]
    },
    en: { trigger:'羅盤 Compass', label:'COMPASS · 羅盤',
      items: [
        { href:'/luopan',          ico:'環', ttl:'Luopan 14 Rings', sub:'FLYING STARS · 玄空' },
        { href:'/compass',         ico:'家', ttl:'Save House',     sub:'HOUSE + QR' },
        { href:'/compass-studio',  ico:'盤', ttl:'Studio',         sub:'MAPS · 6 LAYERS' },
        { href:'/fengshui-pro',    ico:'宮', ttl:'Feng Shui Pro',  sub:'9 PALACES' },
        { href:'/katakagae',       ico:'違', ttl:'方違 Travel',    sub:'JAPANESE HEIAN' },
      ]
    },
    zh: { trigger:'羅盤', label:'羅盤 COMPASS',
      items: [
        { href:'/luopan',          ico:'環', ttl:'羅盤 14環', sub:'玄空飛星 · 流星' },
        { href:'/compass',         ico:'家', ttl:'房屋',     sub:'HOUSE + QR' },
        { href:'/compass-studio',  ico:'盤', ttl:'量向',     sub:'GOOGLE MAPS' },
        { href:'/fengshui-pro',    ico:'宮', ttl:'風水 Pro', sub:'九宮 · 飛星' },
        { href:'/katakagae',       ico:'違', ttl:'方違',     sub:'平安時代' },
      ]
    },
  };

  function inject(){
    const nav = document.getElementById('hk-topnav');
    if (!nav) return;
    if (nav.querySelector('.hk-lp-wrap')) return; // already injected

    const lang = localStorage.getItem('hk_locale') || localStorage.getItem('lang') || 'th';
    const t = I18N[lang] || I18N.th;

    const wrap = document.createElement('span');
    wrap.className = 'hk-lp-wrap';
    wrap.innerHTML = `
      <button class="hk-lp-trigger" id="hk-lp-trigger">
        <span class="glyph">羅</span>
        <span class="lbl">${t.trigger}</span>
        <span class="caret">▾</span>
      </button>
      <div class="hk-lp-menu" id="hk-lp-menu" role="menu">
        <div class="label">${t.label}</div>
        ${t.items.map(it => `
          <a href="${it.href}" role="menuitem">
            <span class="ico">${it.ico}</span>
            <span class="info">
              <span class="ttl">${it.ttl}</span>
              <span class="sub">${it.sub}</span>
            </span>
          </a>
        `).join('')}
      </div>
    `;
    nav.appendChild(wrap);

    const trig = wrap.querySelector('#hk-lp-trigger');
    const menu = wrap.querySelector('#hk-lp-menu');
    trig.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = menu.classList.toggle('on');
      trig.classList.toggle('on', on);
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        menu.classList.remove('on');
        trig.classList.remove('on');
      }
    });
    // active highlight
    const path = window.location.pathname;
    if (t.items.some(it => path === it.href || path.startsWith(it.href + '/'))) {
      trig.classList.add('on');
      trig.style.color = 'var(--gold,#c8a44d)';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  } else {
    inject();
  }
})();
