/*
 * hourkey PWA bootstrap · r376 (Phase A · canary)
 * โหลดจาก hk-profile-sync.js — พังเงียบ ห้ามลามหน้าเว็บ (try/catch ครอบทุกทาง)
 *
 * หน้าที่:
 *   1. เช็ค /pwa-flag.json (no-store):
 *        on                         → เปิดให้ทุกคน
 *        canary + localStorage.hk_pwa_canary==='1' → ทีมภายในเท่านั้น
 *        off / อื่น ๆ               → ไม่ทำอะไร + unregister SW เดิมถ้ามี
 *   2. inject <link rel="manifest"> + apple-touch-icon PNG + <meta theme-color> (2 ธีม)
 *   3. register /sw.js + update banner "มีเวอร์ชันใหม่" 3 ภาษา
 *      (ห้ามโชว์ระหว่างซินแสกำลัง stream/มี job วิ่ง — รอ idle)
 *   4. install prompt UX: มือถือ + เข้าครั้งที่ ≥2 + cooloff 30 วัน + การ์ดสอน iOS
 */
(function () {
  'use strict';
  if (window.__hkPwaLoaded) return;
  window.__hkPwaLoaded = true;

  var THEME_COLORS = { dark: '#0f0e0c', light: '#f6f1e6' };
  var DISMISS_COOLOFF_MS = 30 * 24 * 60 * 60 * 1000; /* 30 วัน */

  function safe(fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (_) { return undefined; }
    };
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  function currentTheme() {
    var t = lsGet('hk-theme');
    return t === 'light' ? 'light' : 'dark';
  }

  function currentLang() {
    var l = (lsGet('hk_locale') || document.documentElement.lang || 'th').slice(0, 2);
    return (l === 'en' || l === 'zh') ? l : 'th';
  }

  var I18N = {
    th: {
      update: 'มีเวอร์ชันใหม่ · แตะเพื่อรีเฟรช',
      install: 'ติดตั้ง Hourkey ไว้หน้าจอ — เปิดดูดวงได้ในแตะเดียว',
      installBtn: 'ติดตั้ง',
      later: 'ไว้ก่อน',
      iosTitle: 'ติดตั้ง Hourkey ไว้หน้าจอ',
      iosStep1: '1. แตะปุ่มแชร์ ⎋ ด้านล่างของ Safari',
      iosStep2: '2. เลือก “เพิ่มลงไปยังหน้าจอโฮม”'
    },
    en: {
      update: 'New version available · Tap to refresh',
      install: 'Install Hourkey on your home screen — your stars in one tap',
      installBtn: 'Install',
      later: 'Later',
      iosTitle: 'Install Hourkey on your home screen',
      iosStep1: '1. Tap the Share button ⎋ at the bottom of Safari',
      iosStep2: '2. Choose “Add to Home Screen”'
    },
    zh: {
      update: '有新版本 · 点击刷新',
      install: '把 Hourkey 安装到主屏幕 — 一键开启命盘',
      installBtn: '安装',
      later: '稍后',
      iosTitle: '把 Hourkey 安装到主屏幕',
      iosStep1: '1. 点击 Safari 底部的分享按钮 ⎋',
      iosStep2: '2. 选择「添加到主屏幕」'
    }
  };

  function t(key) {
    var pack = I18N[currentLang()] || I18N.th;
    return pack[key] || I18N.th[key] || '';
  }

  /* ---------- head injection (manifest + apple icon + theme-color) ---------- */

  var injectHead = safe(function () {
    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;

    if (!document.querySelector('link[rel="manifest"]')) {
      var mf = document.createElement('link');
      mf.rel = 'manifest';
      mf.href = '/manifest.json';
      head.appendChild(mf);
    }

    /* ทับ apple-touch-icon เดิมที่ชี้ SVG (iOS ไม่รับ SVG → เคยได้ screenshot) */
    var appleLinks = document.querySelectorAll('link[rel="apple-touch-icon"]');
    for (var i = 0; i < appleLinks.length; i++) {
      if (/\.svg(\?|$)/.test(appleLinks[i].getAttribute('href') || '')) {
        appleLinks[i].parentNode.removeChild(appleLinks[i]);
      }
    }
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      var ai = document.createElement('link');
      ai.rel = 'apple-touch-icon';
      ai.sizes = '180x180';
      ai.href = '/icons/apple-touch-icon-180.png';
      head.appendChild(ai);
    }

    syncThemeColor();
    watchThemeChanges();
  });

  var syncThemeColor = safe(function () {
    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;
    var color = THEME_COLORS[currentTheme()];
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      head.appendChild(meta);
    }
    if (meta.getAttribute('content') !== color) meta.setAttribute('content', color);
  });

  var watchThemeChanges = safe(function () {
    if (!window.MutationObserver) return;
    var obs = new MutationObserver(function () { syncThemeColor(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    var watchBody = function () {
      if (document.body) obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    };
    if (document.body) watchBody();
    else document.addEventListener('DOMContentLoaded', safe(watchBody));
    window.addEventListener('storage', safe(function (e) {
      if (e && e.key === 'hk-theme') syncThemeColor();
    }));
  });

  /* ---------- busy check: ห้ามโชว์ banner กลางคำทำนาย ---------- */

  function isBusy() {
    try {
      if (window._sifuStreaming) return true; /* master.html ตั้ง global นี้ระหว่าง stream */
      if (typeof window.__hkPwaBusy === 'function' && window.__hkPwaBusy()) return true;
      var path = location.pathname || '';
      if (path.indexOf('/master') === 0) {
        /* master + master-fusion: ปุ่มส่งถูก disable ระหว่างมี stream/job วิ่ง */
        var send = document.getElementById('send');
        if (send && send.disabled) return true;
        var typing = document.getElementById('typing-row');
        if (typing && typing.style && typing.style.display !== 'none') return true;
      }
    } catch (_) {}
    return false;
  }

  /* ---------- UI helpers (inline style · 2 ธีม) ---------- */

  function themePalette() {
    var dark = currentTheme() === 'dark';
    return {
      bg: dark ? '#1a1712' : '#ede5d2',
      text: dark ? '#e8e2d4' : '#2a2418',
      gold: dark ? '#b49052' : '#8b6f3a',
      line: dark ? 'rgba(180,144,82,.35)' : 'rgba(139,111,58,.4)',
      btnText: dark ? '#0f0e0c' : '#f6f1e6'
    };
  }

  function baseCardStyle(el, pal) {
    el.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:2147483000;' +
      'max-width:min(440px,calc(100vw - 24px));width:auto;box-sizing:border-box;' +
      'background:' + pal.bg + ';color:' + pal.text + ';' +
      'border:1px solid ' + pal.line + ';border-radius:14px;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.35);' +
      'font-family:Georgia,\'Times New Roman\',serif;font-size:14px;line-height:1.55;' +
      'padding:12px 16px;display:flex;align-items:center;gap:12px;';
  }

  /* ---------- update banner ---------- */

  var updateBannerShown = false;

  function showUpdateBannerWhenIdle() {
    if (updateBannerShown) return;
    if (isBusy()) {
      setTimeout(showUpdateBannerWhenIdle, 5000); /* เลื่อนไปโชว์ตอน idle */
      return;
    }
    updateBannerShown = true;
    try {
      var pal = themePalette();
      var bar = document.createElement('div');
      bar.id = 'hk-pwa-update-banner';
      baseCardStyle(bar, pal);
      bar.style.cursor = 'pointer';

      var txt = document.createElement('span');
      txt.textContent = t('update');
      txt.style.cssText = 'flex:1;color:' + pal.gold + ';font-weight:700;';
      bar.appendChild(txt);

      var x = document.createElement('span');
      x.textContent = '✕';
      x.style.cssText = 'opacity:.6;padding:2px 6px;';
      x.addEventListener('click', safe(function (e) {
        e.stopPropagation();
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      }));
      bar.appendChild(x);

      bar.addEventListener('click', safe(function () {
        if (isBusy()) return; /* กันรีเฟรชกลางคำทำนายเผื่อ user เพิ่งกดถาม */
        location.reload();
      }));

      var mount = function () { if (document.body) document.body.appendChild(bar); };
      if (document.body) mount();
      else document.addEventListener('DOMContentLoaded', safe(mount));
    } catch (_) {}
  }

  /* ---------- install prompt UX ---------- */

  var deferredInstallPrompt = null;
  var installCardShown = false;

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.navigator.standalone === true) return true;
    } catch (_) {}
    return false;
  }

  /* r384: ตอนรันเป็นแอป (standalone) ล็อกจอไม่ให้เด้ง/ขยับ — ฉีด CSS เฉพาะโหมดแอป ไม่แตะไฟล์หน้า LOCKED
   * - overscroll-behavior-y: none → ตัดแรงเด้งขอบบน-ล่าง (rubber band)
   * - overflow-x hidden ที่ html/body → ตัดการขยับซ้าย-ขวาจาก element ที่ล้นจอไม่กี่ px */
  function lockStandaloneViewport() {
    if (!isStandalone()) return;
    try {
      /* r384d: ถอด viewport lock ทั้งหมด (revert เต็ม) — iOS standalone จอค้างเลื่อนไม่ได้แม้เหลือแค่ contain
       * ปัญหาจอขยับซ้ายขวา = แก้ที่ element ที่ล้นในหน้า fusion แทน (agent กำลังไล่หา) · ห้ามใส่ style ที่ html/body จากไฟล์นี้อีก */
      var st = document.getElementById('hk-pwa-viewport-lock');
      if (st && st.parentNode) st.parentNode.removeChild(st);
    } catch (_) {}
  }

  function isMobile() {
    try {
      var ua = navigator.userAgent || '';
      var uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); /* iPadOS ปลอมเป็น Mac */
      return uaMobile && Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 820;
    } catch (_) { return false; }
  }

  function isIOS() {
    try {
      var ua = navigator.userAgent || '';
      return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    } catch (_) { return false; }
  }

  var countVisit = safe(function () {
    var today = new Date().toISOString().slice(0, 10);
    if (lsGet('hk_pwa_visit_day') === today) return;
    lsSet('hk_pwa_visit_day', today);
    var n = parseInt(lsGet('hk_pwa_visits') || '0', 10);
    lsSet('hk_pwa_visits', String((isNaN(n) ? 0 : n) + 1));
  });

  function installEligible() {
    if (installCardShown || isStandalone() || !isMobile()) return false;
    var visits = parseInt(lsGet('hk_pwa_visits') || '0', 10);
    if (isNaN(visits) || visits < 2) return false;
    var dismissed = parseInt(lsGet('hk_pwa_dismissed_at') || '0', 10);
    if (!isNaN(dismissed) && dismissed > 0 && (Date.now() - dismissed) < DISMISS_COOLOFF_MS) return false;
    return true;
  }

  function dismissInstall(card) {
    lsSet('hk_pwa_dismissed_at', String(Date.now()));
    if (card && card.parentNode) card.parentNode.removeChild(card);
  }

  var showInstallCard = safe(function () {
    if (!installEligible()) return;
    var ios = isIOS();
    if (!ios && !deferredInstallPrompt) return; /* Android ต้องมี beforeinstallprompt ก่อน */
    installCardShown = true;

    var pal = themePalette();
    var card = document.createElement('div');
    card.id = 'hk-pwa-install-card';
    baseCardStyle(card, pal);
    card.style.flexDirection = 'column';
    card.style.alignItems = 'stretch';
    card.style.gap = '8px';

    var msg = document.createElement('div');
    msg.textContent = ios ? t('iosTitle') : t('install');
    msg.style.cssText = 'font-weight:700;color:' + pal.gold + ';';
    card.appendChild(msg);

    if (ios) {
      /* การ์ดสอน iOS 2 ขั้น (ไม่มี beforeinstallprompt) */
      var s1 = document.createElement('div');
      s1.textContent = t('iosStep1');
      card.appendChild(s1);
      var s2 = document.createElement('div');
      s2.textContent = t('iosStep2');
      card.appendChild(s2);
    }

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:2px;';

    var later = document.createElement('button');
    later.type = 'button';
    later.textContent = t('later');
    later.style.cssText = 'background:none;border:none;color:' + pal.text +
      ';opacity:.7;font-family:inherit;font-size:13px;cursor:pointer;padding:8px 10px;';
    later.addEventListener('click', safe(function () { dismissInstall(card); }));
    row.appendChild(later);

    if (!ios) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t('installBtn');
      btn.style.cssText = 'background:' + pal.gold + ';color:' + pal.btnText +
        ';border:none;border-radius:999px;font-family:inherit;font-size:13px;font-weight:700;' +
        'cursor:pointer;padding:8px 22px;';
      btn.addEventListener('click', safe(function () {
        var p = deferredInstallPrompt;
        deferredInstallPrompt = null;
        if (card.parentNode) card.parentNode.removeChild(card);
        if (p && p.prompt) p.prompt();
      }));
      row.appendChild(btn);
    }

    card.appendChild(row);
    var mount = function () { if (document.body) document.body.appendChild(card); };
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', safe(mount));
  });

  var wireInstallUX = safe(function () {
    countVisit();
    window.addEventListener('beforeinstallprompt', safe(function (e) {
      e.preventDefault();
      deferredInstallPrompt = e;
      setTimeout(showInstallCard, 3000);
    }));
    if (isIOS()) setTimeout(showInstallCard, 3000);
  });

  /* ---------- service worker register / unregister ---------- */

  var unregisterAll = safe(function () {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (reg) { try { reg.unregister(); } catch (_) {} });
    }).catch(function () {});
  });

  var registerSW = safe(function () {
    if (!('serviceWorker' in navigator)) return;

    /* banner "มีเวอร์ชันใหม่" — โชว์เมื่อ SW ใหม่เข้าคุมแทนตัวเก่า (skipWaiting+claim) */
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', safe(function () {
      if (!hadController) { hadController = true; return; } /* register ครั้งแรก ไม่ใช่ update */
      showUpdateBannerWhenIdle();
    }));

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (reg) {
      try { reg.update(); } catch (_) {}
    }).catch(function () {});
  });

  /* ---------- main ---------- */

  var main = safe(function () {
    lockStandaloneViewport(); /* r384: ล็อกจอโหมดแอป — ต้องรันก่อน SW check (เครื่องไม่มี SW ก็ยังล็อกจอ) */
    if (!('serviceWorker' in navigator)) return;
    /* r380b: ลิงก์ลับ canary — ?pwa=1 เปิด opt-in / ?pwa=0 ปิด (สำหรับมือถือที่เปิด console ไม่ได้) */
    try {
      var q = new URLSearchParams(location.search).get('pwa');
      if (q === '1') localStorage.setItem('hk_pwa_canary', '1');
      else if (q === '0') { localStorage.removeItem('hk_pwa_canary'); localStorage.removeItem('hk_pwa_beta'); }
    } catch (e) {}
    fetch('/pwa-flag.json', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(safe(function (data) {
        var flag = data && data.pwa;
        var allowed = flag === 'on' ||
          (flag === 'canary' && (lsGet('hk_pwa_canary') === '1' || lsGet('hk_pwa_beta') === '1'));
        if (!allowed) {
          /* off/ไม่เข้าเงื่อนไข canary → เก็บกวาด SW เดิมถ้าเคย register ไว้
           * r380: ยกเว้นคนที่เปิดแจ้งเตือน push ไว้ (hk_push_on) — ต้องคง SW ไว้รับ push
           * (kill-switch จริง flag='off' ยังเก็บกวาดเสมอ) */
          var pushOn = lsGet('hk_push_on') === '1';
          if (flag === 'off') { unregisterAll(); return; }
          if (!pushOn && (flag === 'canary' || !flag)) unregisterAll();
          else if (pushOn) registerSW(); /* คง SW เพื่อรับ push · ไม่ inject manifest/install UX */
          return;
        }
        injectHead();
        registerSW();
        wireInstallUX();
      }))
      .catch(function () {});
  });

  main();

  /* ═══════════ Web Push helper · Phase C (r380) · window.hkPush ═══════════
   * ใช้จากหน้า account (การ์ด "การแจ้งเตือน") — ขอ permission เฉพาะตอน user กดเท่านั้น
   * enable() → { ok, reason? }  reason: unsupported | ios_install | denied | vapid | subscribe | save */

  function pushSupported() {
    try {
      return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
    } catch (_) { return false; }
  }

  function pushNeedsInstall() {
    /* iOS: web push ใช้ได้เฉพาะ PWA ที่ติดตั้งบนหน้าจอโฮม (iOS >= 16.4) */
    return isIOS() && !isStandalone();
  }

  function urlB64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  async function pushGetRegistration() {
    var reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  }

  async function pushEnable() {
    try {
      if (!pushSupported()) return { ok: false, reason: 'unsupported' };
      if (pushNeedsInstall()) return { ok: false, reason: 'ios_install' };
      /* ขอ permission ตรงนี้เท่านั้น (ต้องมาจาก user gesture — ห้าม auto) */
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') return { ok: false, reason: 'denied' };
      var reg = await pushGetRegistration();
      var keyRes = await fetch('/api/push/vapid-key', { credentials: 'include', cache: 'no-store' });
      if (!keyRes.ok) return { ok: false, reason: 'vapid' };
      var keyData = await keyRes.json();
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlB64ToUint8Array(keyData.key)
          });
        } catch (_) { return { ok: false, reason: 'subscribe' }; }
      }
      var save = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() })
      });
      if (!save.ok) return { ok: false, reason: 'save' };
      lsSet('hk_push_on', '1');
      return { ok: true };
    } catch (_) { return { ok: false, reason: 'subscribe' }; }
  }

  async function pushDisable() {
    try {
      lsSet('hk_push_on', '0');
      if (!pushSupported()) return { ok: true };
      var reg = await navigator.serviceWorker.getRegistration('/');
      var endpoint = '';
      if (reg) {
        var sub = await reg.pushManager.getSubscription();
        if (sub) {
          endpoint = sub.endpoint || '';
          try { await sub.unsubscribe(); } catch (_) {}
        }
      }
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpoint })
      }).catch(function () {});
      return { ok: true };
    } catch (_) { return { ok: true }; }
  }

  async function pushState() {
    var st = {
      supported: pushSupported(),
      needsInstall: pushNeedsInstall(),
      permission: (typeof Notification !== 'undefined' && Notification.permission) || 'default',
      subscribed: false
    };
    try {
      if (st.supported) {
        var reg = await navigator.serviceWorker.getRegistration('/');
        if (reg) st.subscribed = !!(await reg.pushManager.getSubscription());
      }
    } catch (_) {}
    return st;
  }

  window.hkPush = {
    supported: pushSupported,
    needsInstall: pushNeedsInstall,
    enable: pushEnable,
    disable: pushDisable,
    state: pushState
  };

  /* เคยเปิดแจ้งเตือนไว้ + permission ยัง granted → sync subscription เงียบๆ
   * (กันเคส push service reset endpoint / pushsubscriptionchange ระหว่างปิดเครื่อง) */
  setTimeout(safe(function () {
    if (lsGet('hk_push_on') !== '1' || !pushSupported()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    navigator.serviceWorker.getRegistration('/').then(function (reg) {
      if (!reg) return;
      reg.pushManager.getSubscription().then(function (sub) {
        if (!sub) return;
        fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() })
        }).catch(function () {});
      }).catch(function () {});
    }).catch(function () {});
  }), 4000);
})();
