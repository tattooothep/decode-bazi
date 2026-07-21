/* hourkey language state guard
 * Keeps hk_locale / hk_lang / DOM lang in sync before page-level scripts run.
 * Scope is intentionally narrow: only language keys are normalized.
 */
(function () {
  'use strict';

  if (window.HK_LANG_STATE && window.HK_LANG_STATE.version) return;

  var VERSION = '2026-07-06.1';
  var SUPPORTED = {
    th: 1, en: 1, zh: 1, 'zh-hant': 1, 'zh-tw': 1, 'zh-hk': 1, 'zh-cn': 1, 'zh-hans': 1,
    vi: 1, ja: 1, ko: 1, ru: 1, es: 1
  };
  var APP_BASE = { th: 'th', en: 'en', zh: 'zh' };
  var writing = false;
  var patchedStorage = false;

  function clean(raw) {
    return String(raw == null ? '' : raw).trim().toLowerCase().replace('_', '-');
  }

  function normalize(raw) {
    var x = clean(raw);
    if (!x) return null;
    if (x === 'cn') x = 'zh-cn';
    if (x === 'hans') x = 'zh-hans';
    if (x === 'hant') x = 'zh-hant';
    if (x.indexOf('zh') === 0) {
      var isCn = x === 'zh-cn' || x === 'zh-hans' || x.indexOf('zh-cn') === 0 || x.indexOf('zh-hans') === 0;
      return { raw: 'zh', storage: 'zh', app: 'zh', html: isCn ? 'zh-Hans' : 'zh-Hant', variant: isCn ? 'cn' : 'hant' };
    }
    if (!SUPPORTED[x]) {
      if (x.indexOf('en') === 0) x = 'en';
      else if (x.indexOf('th') === 0) x = 'th';
      else if (!SUPPORTED[x]) return null;
    }
    return { raw: x, storage: x, app: APP_BASE[x] || 'en', html: x, variant: null };
  }

  function readQuery() {
    try {
      var p = new URLSearchParams(location.search || '');
      return p.get('lang') || p.get('locale') || '';
    } catch (_) { return ''; }
  }

  function readStorageKey(key) {
    try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
  }

  function readDom() {
    try {
      return document.documentElement.getAttribute('data-lang') ||
        document.documentElement.getAttribute('lang') || '';
    } catch (_) { return ''; }
  }

  function bestStored() {
    var loc = readStorageKey('hk_locale');
    var lang = readStorageKey('hk_lang');
    var article = readStorageKey('hk_article_locale');
    var legacy = readStorageKey('lang');
    var ordered = [loc, lang, article, legacy];
    for (var i = 0; i < ordered.length; i++) {
      var n = normalize(ordered[i]);
      if (n && n.raw !== 'th') return ordered[i];
    }
    for (var j = 0; j < ordered.length; j++) {
      if (normalize(ordered[j])) return ordered[j];
    }
    return '';
  }

  function currentRaw() {
    return readQuery() || bestStored() || readDom() || 'th';
  }

  function current() {
    return normalize(currentRaw()) || normalize('th');
  }

  function applyDom(state) {
    state = state || current();
    try {
      document.documentElement.lang = state.html;
      document.documentElement.setAttribute('data-lang', state.app);
      document.documentElement.setAttribute('data-hk-locale', state.raw);
      if (state.variant) document.documentElement.setAttribute('data-zh-variant', state.variant);
      else document.documentElement.removeAttribute('data-zh-variant');
    } catch (_) {}
    return state;
  }

  function persist(raw, opts) {
    var state = normalize(raw) || normalize('th');
    opts = opts || {};
    if (state.raw === 'zh' && opts.keepZhVariant) {
      var existingVariant = readStorageKey('hk_zh_variant');
      if (existingVariant === 'cn') {
        state.variant = 'cn';
        state.html = 'zh-Hans';
      }
    }
    try {
      writing = true;
      localStorage.setItem('hk_locale', state.storage);
      localStorage.setItem('hk_lang', state.storage);
      localStorage.setItem('hk_article_locale', state.storage);
      localStorage.setItem('hk_locale_updated_at', String(Date.now()));
      if (state.raw === 'zh') localStorage.setItem('hk_zh_variant', state.variant || 'hant');
      else if (!opts.keepZhVariant) localStorage.removeItem('hk_zh_variant');
    } catch (_) {
    } finally {
      writing = false;
    }
    applyDom(state);
    return state;
  }

  function set(raw, opts) {
    var state = persist(raw, opts);
    try {
      document.dispatchEvent(new CustomEvent('hk:locale', { detail: { locale: state.raw, raw: state.raw, app: state.app, html: state.html } }));
    } catch (_) {}
    return state;
  }

  function patchStorage() {
    if (patchedStorage || !window.Storage || !Storage.prototype) return;
    patchedStorage = true;
    var nativeSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      nativeSet.apply(this, arguments);
      if (writing || this !== localStorage) return;
      if (key !== 'hk_locale' && key !== 'hk_lang' && key !== 'hk_article_locale') return;
      var state = normalize(value);
      if (!state) return;
      try {
        writing = true;
        nativeSet.call(localStorage, 'hk_locale', state.storage);
        nativeSet.call(localStorage, 'hk_lang', state.storage);
        nativeSet.call(localStorage, 'hk_article_locale', state.storage);
        nativeSet.call(localStorage, 'hk_locale_updated_at', String(Date.now()));
        if (state.raw === 'zh') nativeSet.call(localStorage, 'hk_zh_variant', state.variant || 'hant');
        else localStorage.removeItem('hk_zh_variant');
      } catch (_) {
      } finally {
        writing = false;
      }
      applyDom(state);
    };
  }

  var api = {
    version: VERSION,
    normalize: normalize,
    current: current,
    raw: function () { return current().raw; },
    app: function () { return current().app; },
    html: function () { return current().html; },
    sifu: function () {
      var st = current();
      return st.raw === 'zh' && st.variant === 'cn' ? 'cn' : st.raw;
    },
    applyDom: applyDom,
    persist: persist,
    set: set
  };

  window.HK = window.HK || {};
  window.HK.langState = api;
  window.HK_LANG_STATE = api;

  patchStorage();
  persist(currentRaw(), { keepZhVariant: true });
})();
