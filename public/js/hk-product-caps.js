/**
 * hk-product-caps.js · โหลด /api/account/me.caps + ล็อก UI ตาม plan (trial ~30%)
 * 9 ภาษา: th / en / zh / cn / vi / ja / ko / ru / es
 * ใช้ร่วม datepick / luopan / qimen · server ยัง enforce ซ้ำ
 */
(function () {
  "use strict";
  var DEFAULT_TRIAL_MODULES = ["ze_ri", "twelve_officers", "dong_gong", "tai_sui", "ba_zi", "twenty_eight"];
  var DEFAULT_FREE_MODULES = ["ze_ri", "twelve_officers", "ba_zi"];
  var LANGS = ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"];

  /** data-filter บน datepick → module id ฝั่ง server */
  var FILTER_TO_MODULE = {
    tongshu: "ze_ri",
    jianchu: "twelve_officers",
    donggong: "dong_gong",
    taisui: "tai_sui",
    bazi: "ba_zi",
    xiu28: "twenty_eight",
    shen12: "twelve_spirits",
    fly9: "nine_stars",
    qimen: "qi_men",
    heluo: "he_luo",
    hex: "hex64",
    yongshen: "yong_shen",
    tianxing: "tian_xing",
    moonvoid: "moon_void",
    moonsign: "moon_sign",
    retro: "retro_window",
    eclipse: "eclipse_zone",
    rahu: "rahu_kalam",
    panchanga: "panchanga",
    tarabala: "tara_bala",
  };

  /** pin หล่อแก · basic = ชุดหลัก · full = รวมน้ำ/ท่อ/ฯลฯ */
  var PIN_BASIC = { door: 1, bed: 1, stove: 1, desk: 1, office: 1, altar: 1 };
  var PIN_FULL_ONLY = {
    water: 1,
    incoming_water: 1,
    outgoing_water: 1,
    water_mouth: 1,
    drain: 1,
  };

  /**
   * i18n · ทุก key ครบ 9 ภาษา
   * หลัก: trial ~30% เครื่องมือหน้านี้ · free แคบกว่า · upgrade → /pricing
   */
  var I18N = {
    plan_trial: {
      th: "ทดลอง 14 วัน",
      en: "14-day trial",
      zh: "14 天試用",
      cn: "14 天试用",
      vi: "Dùng thử 14 ngày",
      ja: "14日トライアル",
      ko: "14일 체험",
      ru: "Пробный 14 дней",
      es: "Prueba 14 días",
    },
    plan_premium: {
      th: "Premium",
      en: "Premium",
      zh: "賢者",
      cn: "贤者",
      vi: "Premium",
      ja: "Premium",
      ko: "Premium",
      ru: "Premium",
      es: "Premium",
    },
    plan_master: {
      th: "Master",
      en: "Master",
      zh: "大師",
      cn: "大师",
      vi: "Master",
      ja: "Master",
      ko: "Master",
      ru: "Master",
      es: "Master",
    },
    plan_free: {
      th: "โหมดฟรี",
      en: "Free mode",
      zh: "免費模式",
      cn: "免费模式",
      vi: "Chế độ miễn phí",
      ja: "フリーモード",
      ko: "무료 모드",
      ru: "Бесплатный режим",
      es: "Modo gratuito",
    },
    plan_guest: {
      th: "ผู้เยี่ยมชม",
      en: "Guest",
      zh: "訪客",
      cn: "访客",
      vi: "Khách",
      ja: "ゲスト",
      ko: "게스트",
      ru: "Гость",
      es: "Invitado",
    },
    days_left: {
      th: " · เหลือ {N} วัน",
      en: " · {N} days left",
      zh: " · 剩 {N} 天",
      cn: " · 剩 {N} 天",
      vi: " · còn {N} ngày",
      ja: " · 残り {N} 日",
      ko: " · {N}일 남음",
      ru: " · осталось {N} дн.",
      es: " · quedan {N} días",
    },
    trial_default: {
      th: "ช่วงทดลอง 14 วัน · ฟีเจอร์ขั้นสูงจะแสดงพร้อมกุญแจและ Pass ที่ต้องใช้",
      en: "14-day trial · advanced features stay visible with their required-pass lock",
      zh: "14 天試用 · 進階功能保留顯示並標示所需通行證",
      cn: "14 天试用 · 进阶功能保留显示并标示所需通行证",
      vi: "Dùng thử 14 ngày · tính năng nâng cao vẫn hiện cùng khóa và pass cần dùng",
      ja: "14日トライアル · 上位機能は必要なPassの鍵付きで表示",
      ko: "14일 체험 · 심화 기능은 필요한 Pass 잠금과 함께 표시",
      ru: "Пробный период 14 дней · расширенные функции видны с указанием нужного Pass",
      es: "Prueba de 14 días · las funciones avanzadas siguen visibles con el Pass requerido",
    },
    free_default: {
      th: "โหมดฟรี · เครื่องมือจำกัด",
      en: "Free mode · limited tools",
      zh: "免費模式 · 工具受限",
      cn: "免费模式 · 工具受限",
      vi: "Miễn phí · công cụ giới hạn",
      ja: "フリー · 機能制限あり",
      ko: "무료 · 도구 제한",
      ru: "Бесплатно · ограниченные инструменты",
      es: "Gratis · herramientas limitadas",
    },
    unlock_suffix_trial: {
      th: " · ปลดเต็มที่",
      en: " · unlock full access",
      zh: " · 解鎖完整",
      cn: " · 解锁完整",
      vi: " · mở đầy đủ",
      ja: " · フル解禁",
      ko: " · 전체 해제",
      ru: " · открыть полностью",
      es: " · desbloquear todo",
    },
    unlock_suffix_free: {
      th: " · อัปเกรดเพื่อปลดชั้นมืออาชีพ",
      en: " · upgrade for pro layers",
      zh: " · 升級解鎖專業層",
      cn: " · 升级解锁专业层",
      vi: " · nâng cấp để mở lớp chuyên nghiệp",
      ja: " · アップグレードでプロ層を開放",
      ko: " · 업그레이드하여 프로 계층 해제",
      ru: " · апгрейд для pro-слоёв",
      es: " · sube de plan para capas pro",
    },
    cta_pricing: {
      th: "ดูแพ็กเกจ →",
      en: "See plans →",
      zh: "查看方案 →",
      cn: "查看套餐 →",
      vi: "Xem gói →",
      ja: "プランを見る →",
      ko: "플랜 보기 →",
      ru: "Смотреть планы →",
      es: "Ver planes →",
    },
    upgrade_title: {
      th: "สิทธิ์ของแพ็กเกจ", en: "Plan access", zh: "方案權限", cn: "套餐权限",
      vi: "Quyền của gói", ja: "プランの利用範囲", ko: "요금제 이용 범위",
      ru: "Доступ по плану", es: "Acceso del plan",
    },
    upgrade_close: {
      th: "ปิด", en: "Close", zh: "關閉", cn: "关闭", vi: "Đóng", ja: "閉じる",
      ko: "닫기", ru: "Закрыть", es: "Cerrar",
    },
    lock_generic: {
      th: "ต้องอัปเกรด · /pricing",
      en: "Upgrade required · /pricing",
      zh: "需升級 · /pricing",
      cn: "需升级 · /pricing",
      vi: "Cần nâng cấp · /pricing",
      ja: "アップグレードが必要 · /pricing",
      ko: "업그레이드 필요 · /pricing",
      ru: "Нужен апгрейд · /pricing",
      es: "Requiere upgrade · /pricing",
    },
    lock_confirm: {
      th: "ฟีเจอร์นี้ต้องอัปเกรด\n\nไปหน้า /pricing ไหม?",
      en: "This feature needs an upgrade.\n\nGo to /pricing?",
      zh: "此功能需升級。\n\n前往 /pricing？",
      cn: "此功能需升级。\n\n前往 /pricing？",
      vi: "Tính năng này cần nâng cấp.\n\nMở /pricing?",
      ja: "この機能にはアップグレードが必要です。\n\n/pricing へ進みますか？",
      ko: "이 기능은 업그레이드가 필요합니다.\n\n/pricing으로 이동할까요?",
      ru: "Эта функция требует апгрейда.\n\nПерейти на /pricing?",
      es: "Esta función requiere upgrade.\n\n¿Ir a /pricing?",
    },
    lock_layer: {
      th: "ชั้นนี้ยังไม่เปิดในแพ็กเกจปัจจุบัน · อัปเกรด /pricing",
      en: "This layer is locked on your plan · upgrade /pricing",
      zh: "此層在目前方案未開放 · 升級 /pricing",
      cn: "此层在当前套餐未开放 · 升级 /pricing",
      vi: "Lớp này chưa mở trong gói hiện tại · /pricing",
      ja: "この層は現在のプランで未開放 · /pricing",
      ko: "현재 플랜에서 이 계층은 잠김 · /pricing",
      ru: "Этот слой закрыт на вашем плане · /pricing",
      es: "Esta capa no está en tu plan · /pricing",
    },
    lock_luopan_pro: {
      th: "วงมืออาชีพ · ปลดด้วย Premium+",
      en: "Pro rings · unlock with Premium+",
      zh: "專業盤層 · Premium+ 解鎖",
      cn: "专业盘层 · Premium+ 解锁",
      vi: "Vòng pro · mở bằng Premium+",
      ja: "プロ層 · Premium+ で開放",
      ko: "프로 링 · Premium+로 해제",
      ru: "Pro-кольца · Premium+",
      es: "Anillos pro · Premium+",
    },
    lock_luopan_tier: {
      th: "ชั้นนี้สำหรับ Premium+",
      en: "This tier needs Premium+",
      zh: "此層需 Premium+",
      cn: "此层需 Premium+",
      vi: "Tầng này cần Premium+",
      ja: "この層は Premium+ 向け",
      ko: "이 계층은 Premium+ 필요",
      ru: "Этот уровень — Premium+",
      es: "Este nivel requiere Premium+",
    },
    lock_luopan_water: {
      th: "ปักจุดน้ำ/ท่อขั้นสูง · Premium+",
      en: "Advanced water/pipe pins · Premium+",
      zh: "進階水口／管線釘點 · Premium+",
      cn: "进阶水口／管线钉点 · Premium+",
      vi: "Ghim nước/ống nâng cao · Premium+",
      ja: "上級の水／管ピン · Premium+",
      ko: "고급 수구/배관 핀 · Premium+",
      ru: "Продвинутые водяные метки · Premium+",
      es: "Pines de agua/tubería avanzados · Premium+",
    },
    lock_qimen_pro: {
      th: "โหมดมืออาชีพ · Premium+",
      en: "Pro detail mode · Premium+",
      zh: "專業模式 · Premium+",
      cn: "专业模式 · Premium+",
      vi: "Chế độ pro · Premium+",
      ja: "プロ詳細モード · Premium+",
      ko: "프로 상세 모드 · Premium+",
      ru: "Pro-режим · Premium+",
      es: "Modo pro · Premium+",
    },
    lock_qimen_search: {
      th: "ค้นฉีเหมินลึก · Premium+",
      en: "Deep Qi Men search · Premium+",
      zh: "奇門深度搜尋 · Premium+",
      cn: "奇门深度搜索 · Premium+",
      vi: "Tìm Kỳ Môn sâu · Premium+",
      ja: "奇門ディープ検索 · Premium+",
      ko: "기문 심층 검색 · Premium+",
      ru: "Глубокий поиск Ци Мэнь · Premium+",
      es: "Búsqueda profunda Qi Men · Premium+",
    },
    lock_qimen_sifu: {
      th: "AI ซินแสฉีเหมิน · Premium+",
      en: "Qi Men AI Sifu · Premium+",
      zh: "奇門 AI 師傅 · Premium+",
      cn: "奇门 AI 师傅 · Premium+",
      vi: "AI Sifu Kỳ Môn · Premium+",
      ja: "奇門 AI Sifu · Premium+",
      ko: "기문 AI Sifu · Premium+",
      ru: "AI Sifu Ци Мэнь · Premium+",
      es: "AI Sifu Qi Men · Premium+",
    },
    lock_qimen_detail: {
      th: "รายละเอียดรายวัง · เปิดตั้งแต่ช่วงทดลอง",
      en: "Palace details · available from Trial",
      zh: "宮位詳情 · 試用方案起開放",
      cn: "宫位详情 · 试用方案起开放",
      vi: "Chi tiết cung · có từ gói dùng thử",
      ja: "宮の詳細 · トライアルから利用可能",
      ko: "궁 상세 · 체험판부터 사용 가능",
      ru: "Детали дворцов · доступны с пробного периода",
      es: "Detalles de palacios · disponibles desde la prueba",
    },
    lock_qimen_date: {
      th: "แพ็กเกจนี้เปิดผังได้เฉพาะวันนี้",
      en: "This plan can open today's chart only",
      zh: "此方案僅可開啟今日之盤",
      cn: "此方案仅可开启今日之盘",
      vi: "Gói này chỉ mở được bàn hôm nay",
      ja: "このプランは今日の盤のみ利用できます",
      ko: "이 요금제는 오늘의 판만 열 수 있습니다",
      ru: "На этом тарифе доступна только карта на сегодня",
      es: "Este plan solo permite abrir la carta de hoy",
    },
    lock_qimen_hour: {
      th: "Free เปิดเฉพาะผังยามปัจจุบัน · Trial เปิดครบ 12 ยาม",
      en: "Free opens the current hour only · Trial opens all 12 hours",
      zh: "免費版僅開放當前時辰 · 試用版開放十二時辰",
      cn: "免费版仅开放当前时辰 · 试用版开放十二时辰",
      vi: "Free chỉ mở giờ hiện tại · Trial mở đủ 12 giờ",
      ja: "Freeは現在時のみ · Trialは12時辰すべて",
      ko: "Free는 현재 시진만 · Trial은 12시진 전체",
      ru: "Free: только текущий час · Trial: все 12 часов",
      es: "Free: solo la hora actual · Trial: las 12 horas",
    },
    datepick_trial: {
      th: "ทดลองวางฤกษ์ · เกณฑ์หลัก 6 ชั้น + 1 ดวง + ช่วงสั้น",
      en: "Datepick trial · 6 core layers + 1 chart + short range",
      zh: "試用擇日 · 6 主層 + 1 盤 + 短區間",
      cn: "试用择日 · 6 主层 + 1 盘 + 短区间",
      vi: "Thử chọn ngày · 6 lớp chính + 1 lá + khoảng ngắn",
      ja: "日取り試用 · 主要6層 + 1盤 + 短期間",
      ko: "택일 체험 · 핵심 6계층 + 1차트 + 단기",
      ru: "Пробный выбор даты · 6 слоёв + 1 карта + короткий период",
      es: "Prueba de fechas · 6 capas + 1 carta + rango corto",
    },
    datepick_free: {
      th: "วางฤกษ์โหมดฟรี · เกณฑ์พื้นฐานเท่านั้น",
      en: "Free datepick · basic layers only",
      zh: "免費擇日 · 僅基礎層",
      cn: "免费择日 · 仅基础层",
      vi: "Chọn ngày miễn phí · chỉ lớp cơ bản",
      ja: "フリー日取り · 基礎層のみ",
      ko: "무료 택일 · 기본 계층만",
      ru: "Бесплатный выбор даты · только базовые слои",
      es: "Fechas gratis · solo capas básicas",
    },
    luopan_trial: {
      th: "ทดลองหล่อแก · วงหลัก + ปักจุดพื้นฐาน · Vision 1 ครั้ง",
      en: "Luopan trial · core rings + basic pins · Vision 1×",
      zh: "試用羅盤 · 主盤 + 基礎釘點 · Vision 1 次",
      cn: "试用罗盘 · 主盘 + 基础钉点 · Vision 1 次",
      vi: "Thử la bàn · vòng chính + ghim cơ bản · Vision 1 lần",
      ja: "羅盤試用 · 主層 + 基本ピン · Vision 1回",
      ko: "나경 체험 · 핵심 링 + 기본 핀 · Vision 1회",
      ru: "Пробный луопань · ядро + базовые метки · Vision 1×",
      es: "Prueba luopan · anillos base + pines básicos · Vision 1×",
    },
    luopan_free: {
      th: "หล่อแกโหมดฟรี · วงหลักเท่านั้น",
      en: "Free luopan · core rings only",
      zh: "免費羅盤 · 僅主盤",
      cn: "免费罗盘 · 仅主盘",
      vi: "La bàn miễn phí · chỉ vòng chính",
      ja: "フリー羅盤 · 主層のみ",
      ko: "무료 나경 · 핵심 링만",
      ru: "Бесплатный луопань · только ядро",
      es: "Luopan gratis · solo anillos base",
    },
    qimen_trial: {
      th: "ทดลองฉีเหมิน · ผังยาม + อ่านแบบมือใหม่",
      en: "Qi Men trial · chart + beginner reading",
      zh: "試用奇門 · 局盤 + 入門解讀",
      cn: "试用奇门 · 局盘 + 入门解读",
      vi: "Thử Kỳ Môn · bàn cục + đọc cơ bản",
      ja: "奇門試用 · 盤 + 初心者読み",
      ko: "기문 체험 · 국판 + 입문 해석",
      ru: "Пробный Ци Мэнь · карта + чтение для новичков",
      es: "Prueba Qi Men · carta + lectura principiante",
    },
    qimen_free: {
      th: "ฉีเหมินโหมดฟรี · ผังพื้นฐาน",
      en: "Free Qi Men · basic chart",
      zh: "免費奇門 · 基礎局盤",
      cn: "免费奇门 · 基础局盘",
      vi: "Kỳ Môn miễn phí · bàn cơ bản",
      ja: "フリー奇門 · 基礎盤",
      ko: "무료 기문 · 기본 국판",
      ru: "Бесплатный Ци Мэнь · базовая карта",
      es: "Qi Men gratis · carta básica",
    },
  };

  window.HK_PRODUCT = window.HK_PRODUCT || {
    plan: "guest",
    in_trial: false,
    trial_ends_at: null,
    caps: null,
    ready: false,
    locale: "th",
  };

  function readLs(k) {
    try {
      return localStorage.getItem(k) || "";
    } catch (_) {
      return "";
    }
  }

  /** raw locale → UI code (th/en/zh/cn/vi/ja/ko/ru/es) */
  function detectLocale() {
    var d = document.documentElement;
    var st = null;
    try {
      st = window.HK_LANG_STATE && window.HK_LANG_STATE.current ? window.HK_LANG_STATE.current() : null;
    } catch (_) {}
    var raw =
      (st && st.raw) ||
      d.getAttribute("data-hk-locale") ||
      readLs("hk_locale") ||
      readLs("hk_lang") ||
      d.getAttribute("data-lang") ||
      "th";
    raw = String(raw || "th")
      .toLowerCase()
      .replace("_", "-");
    var zhVar = d.getAttribute("data-zh-variant") || readLs("hk_zh_variant");
    if (raw === "cn" || raw === "zh-cn" || raw === "zh-hans") return "cn";
    if (raw.indexOf("zh") === 0) return zhVar === "cn" ? "cn" : "zh";
    if (LANGS.indexOf(raw) >= 0) return raw;
    if (raw.indexOf("en") === 0) return "en";
    if (raw.indexOf("th") === 0) return "th";
    if (raw.indexOf("vi") === 0) return "vi";
    if (raw.indexOf("ja") === 0) return "ja";
    if (raw.indexOf("ko") === 0) return "ko";
    if (raw.indexOf("ru") === 0) return "ru";
    if (raw.indexOf("es") === 0) return "es";
    return "en";
  }

  function t(key, vars) {
    var code = detectLocale();
    var bag = I18N[key];
    if (!bag) return key;
    var s = bag[code] || (code === "cn" ? bag.zh : "") || bag.en || bag.th || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return s;
  }

  function planLabel(p) {
    if (p === "trial") return t("plan_trial");
    if (p === "premium") return t("plan_premium");
    if (p === "master") return t("plan_master");
    if (p === "free") return t("plan_free");
    return t("plan_guest");
  }

  function daysLeftStr() {
    var p = window.HK_PRODUCT;
    if (!(p.in_trial && p.trial_ends_at)) return "";
    var left = Math.max(0, Math.ceil((new Date(p.trial_ends_at).getTime() - Date.now()) / 86400000));
    return t("days_left", { N: left });
  }

  function injectBanner(opts) {
    opts = opts || {};
    var p = window.HK_PRODUCT;
    var show = p.plan === "trial" || p.plan === "free" || p.plan === "guest";
    var existing = document.getElementById("hk-trial-feature-banner");
    if (!show) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return;
    }
    var days = daysLeftStr();
    var isTrial = p.plan === "trial";
    var core =
      isTrial
        ? opts.trialMsg || t(opts.trialKey || "trial_default")
        : opts.freeMsg || t(opts.freeKey || "free_default");
    var suffix = isTrial ? t("unlock_suffix_trial") : t("unlock_suffix_free");
    var msg = (isTrial ? "🧪 " : "🔒 ") + core + days + suffix;
    var el = existing;
    if (!el) {
      el = document.createElement("div");
      el.id = "hk-trial-feature-banner";
      el.setAttribute("role", "status");
      el.style.cssText =
        "position:sticky;top:0;z-index:9990;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;" +
        "padding:10px 16px;font-family:'Noto Serif Thai',serif;font-size:13px;line-height:1.45;" +
        "background:linear-gradient(90deg,rgba(200,164,77,.18),rgba(200,164,77,.08));" +
        "border-bottom:1px solid rgba(200,164,77,.35);color:var(--fg,#f3ebd9);";
      var anchor = document.querySelector(".hk-topbar") || document.body.firstChild;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
      else document.body.insertBefore(el, document.body.firstChild);
    }
    el.setAttribute("data-hk-locale", detectLocale());
    el.innerHTML =
      '<span style="text-align:center">' +
      msg +
      '</span><a href="/pricing" style="display:inline-flex;align-items:center;padding:6px 12px;border-radius:999px;border:1px solid rgba(200,164,77,.5);background:rgba(200,164,77,.15);color:var(--gold,#c8a44d);text-decoration:none;font-size:12px;font-weight:600;white-space:nowrap">' +
      t("cta_pricing") +
      "</a>";
  }

  function alreadyLocked(el) {
    return el && el.getAttribute("data-locked") === "1";
  }

  function ensureAccessStyles() {
    if (document.getElementById("hk-access-styles")) return;
    var style = document.createElement("style");
    style.id = "hk-access-styles";
    style.textContent =
      ".hk-feature-locked{opacity:.76;filter:saturate(.7)}" +
      ".hk-access-modal{position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(4,6,9,.7);backdrop-filter:blur(5px)}" +
      ".hk-access-dialog{width:min(100%,420px);border:1px solid var(--gold-line,rgba(200,164,77,.35));border-radius:8px;background:var(--bg-2,#12151b);color:var(--fg,#f3edde);box-shadow:0 24px 70px rgba(0,0,0,.45);padding:22px}" +
      ".hk-access-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}" +
      ".hk-access-title{font:700 18px/1.35 'Noto Serif Thai',serif;color:var(--fg,#f3edde)}" +
      ".hk-access-x{width:34px;height:34px;border:1px solid var(--line,rgba(200,164,77,.16));border-radius:6px;background:transparent;color:var(--fg-soft,#c3b99f);font-size:20px;line-height:1;cursor:pointer}" +
      ".hk-access-copy{font:400 14px/1.7 'Noto Serif Thai',serif;color:var(--fg-soft,#c3b99f);margin-bottom:18px}" +
      ".hk-access-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap}" +
      ".hk-access-actions a,.hk-access-actions button{min-height:40px;padding:9px 14px;border-radius:6px;font:700 13px/1.2 'Noto Serif Thai',serif;cursor:pointer}" +
      ".hk-access-actions button{border:1px solid var(--line,rgba(200,164,77,.16));background:transparent;color:var(--fg-soft,#c3b99f)}" +
      ".hk-access-actions a{display:inline-flex;align-items:center;border:1px solid var(--gold,#c8a44d);background:var(--gold,#c8a44d);color:var(--bg,#0b0d11);text-decoration:none}";
    document.head.appendChild(style);
  }

  function showUpgradeDialog(message) {
    ensureAccessStyles();
    var old = document.getElementById("hk-access-modal");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var modal = document.createElement("div");
    modal.id = "hk-access-modal";
    modal.className = "hk-access-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "hk-access-title");
    modal.innerHTML =
      '<div class="hk-access-dialog"><div class="hk-access-head"><div class="hk-access-title" id="hk-access-title"></div>' +
      '<button class="hk-access-x" type="button"></button></div><div class="hk-access-copy"></div>' +
      '<div class="hk-access-actions"><button type="button" data-hk-access-close></button><a href="/pricing"></a></div></div>';
    modal.querySelector(".hk-access-title").textContent = t("upgrade_title");
    modal.querySelector(".hk-access-copy").textContent = message || t("lock_generic");
    var closeIcon = modal.querySelector(".hk-access-x");
    closeIcon.textContent = "×";
    closeIcon.setAttribute("aria-label", t("upgrade_close"));
    closeIcon.setAttribute("title", t("upgrade_close"));
    modal.querySelector("[data-hk-access-close]").textContent = t("upgrade_close");
    modal.querySelector(".hk-access-actions a").textContent = t("cta_pricing").replace(/\s*→\s*$/, "");
    function close() { if (modal.parentNode) modal.parentNode.removeChild(modal); }
    closeIcon.addEventListener("click", close);
    modal.querySelector("[data-hk-access-close]").addEventListener("click", close);
    modal.addEventListener("click", function (event) { if (event.target === modal) close(); });
    modal.addEventListener("keydown", function (event) { if (event.key === "Escape") close(); });
    document.body.appendChild(modal);
    closeIcon.focus();
  }

  function lockEl(el, title) {
    if (!el) return;
    ensureAccessStyles();
    var msg = title || t("lock_generic");
    el.classList.add("hk-feature-locked");
    el.style.pointerEvents = "auto";
    el.setAttribute("title", msg);
    el.setAttribute("data-locked", "1");
    el.setAttribute("data-lock-title", msg);
    if (el.tagName === "INPUT") {
      try {
        el.disabled = true;
      } catch (_) {}
    }
    if (el.tagName === "BUTTON") el.setAttribute("aria-disabled", "true");
    var cb = el.querySelector && el.querySelector('input[type="checkbox"]');
    if (cb) {
      cb.checked = false;
      cb.disabled = true;
    }
    if (!el.__hkLockBound) {
      el.__hkLockBound = true;
      el.addEventListener(
        "click",
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          var m = el.getAttribute("data-lock-title") || t("lock_generic");
          showUpgradeDialog(m);
        },
        true
      );
    }
  }

  function refreshLockTitles() {
    document.querySelectorAll("[data-locked='1'][data-lock-key]").forEach(function (el) {
      var key = el.getAttribute("data-lock-key");
      var msg = t(key);
      el.setAttribute("title", msg);
      el.setAttribute("data-lock-title", msg);
    });
  }

  function lockElKey(el, key) {
    if (!el) return;
    el.setAttribute("data-lock-key", key);
    lockEl(el, t(key));
  }

  function ensurePreviewLockStyles() {
    if (document.getElementById("hk-preview-lock-styles")) return;
    var style = document.createElement("style");
    style.id = "hk-preview-lock-styles";
    style.textContent =
      ".hk-lock-preview{position:relative!important}" +
      ".hk-lock-preview-badge{position:absolute;top:10px;right:10px;z-index:12;display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid rgba(200,164,77,.5);border-radius:7px;background:rgba(12,14,18,.9);color:var(--gold,#c8a44d);font:700 11px/1.2 sans-serif;letter-spacing:0;pointer-events:none}" +
      "tr.hk-lock-preview .hk-lock-preview-badge{position:static;margin-left:6px;padding:3px 6px;font-size:10px}";
    document.head.appendChild(style);
  }

  function lockPreviewEl(el, requiredPlan) {
    if (!el) return;
    ensurePreviewLockStyles();
    lockElKey(el, "lock_generic");
    if (el.tagName === "BUTTON") {
      el.disabled = false;
      el.setAttribute("aria-disabled", "true");
    }
    el.classList.add("hk-lock-preview");
    var badge = el.querySelector(":scope > .hk-lock-preview-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "hk-lock-preview-badge";
      if (el.tagName === "TR") (el.querySelector("th,td") || el).appendChild(badge);
      else el.appendChild(badge);
    }
    badge.textContent = "🔒 " + requiredPlan;
    badge.setAttribute("aria-label", t("lock_generic"));
  }

  function applyChartLocks() {
    var caps = window.HK_PRODUCT.caps || {};
    var chart = (caps.pages && caps.pages.chart) || {
      detail: "summary",
      luck_cycles: "current",
      ai_summary_pdf: false,
    };
    var ranks = { summary: 0, guided: 1, full: 2, technical: 3 };
    var currentRank = ranks[chart.detail] == null ? 0 : ranks[chart.detail];
    var required = { guided: planLabel("trial"), full: "Premium", technical: "Master" };
    var previewSeen = {};
    document.querySelectorAll("[data-chart-tier]").forEach(function (el) {
      var tier = el.getAttribute("data-chart-tier") || "summary";
      if ((ranks[tier] || 0) > currentRank) {
        if (el.tagName === "SECTION" && !previewSeen[tier]) {
          previewSeen[tier] = true;
          lockPreviewEl(el, required[tier] || "Premium");
        }
        else lockElKey(el, "lock_generic");
      }
    });

    var luckVisible = chart.luck_cycles === "current" ? 1 : chart.luck_cycles === "current_next" ? 2 : 8;
    document.querySelectorAll(".hk-luck-row .hk-luck-card").forEach(function (card, index) {
      if (index >= luckVisible) {
        if (index === luckVisible) lockPreviewEl(card, chart.luck_cycles === "current" ? planLabel("trial") : "Premium");
        else lockElKey(card, "lock_generic");
      }
    });
    if (!chart.ai_summary_pdf) lockPreviewEl(document.getElementById("hk-chart-summary-pdf"), planLabel("trial"));
    injectBanner({});
  }

  function applyNetworkLocks() {
    var caps = window.HK_PRODUCT.caps || {};
    var network = (caps.pages && caps.pages.network) || {
      visualization_profiles: 1,
      groups: 0,
      pair_compare: "locked",
      team_analysis: false,
      pair_ai: "locked",
      team_ai: false,
      bulk_ai: false,
    };
    var visible = Math.max(1, Number(network.visualization_profiles) || 1);
    document.querySelectorAll("#people-grid .person-card").forEach(function (card, index) {
      if (index >= visible) {
        if (index === visible) lockPreviewEl(card, window.HK_PRODUCT.plan === "trial" ? "Premium" : planLabel("trial"));
        else lockElKey(card, "lock_generic");
      }
    });
    if (network.pair_compare === "locked") {
      document.querySelectorAll("[data-compare]").forEach(function (button, index) {
        if (index === 0) lockPreviewEl(button, planLabel("trial"));
        else lockElKey(button, "lock_generic");
      });
    }
    if (!network.team_analysis) {
      lockPreviewEl(document.querySelector('#view-tabs button[data-view="team"]'), "Master");
    }
    if (!network.bulk_ai) lockPreviewEl(document.getElementById("hk-add-bulk-btn"), "Master");
    if (network.pair_ai === "locked") {
      lockPreviewEl(document.getElementById("cm-sifu-section"), planLabel("trial"));
    }
    if (!network.team_ai) {
      lockPreviewEl(document.getElementById("hk-team-ai-btn"), "Master");
      lockPreviewEl(document.getElementById("tb-ai-plan-btn"), "Master");
      lockPreviewEl(document.querySelector("#hk-team-modal .sifu-chat"), "Master");
    }
    var customGroups = Array.prototype.slice.call(document.querySelectorAll(".group-chips button[data-g]")).filter(function (button) {
      return button.getAttribute("data-g") !== "all" && button.getAttribute("data-g") !== "general";
    });
    customGroups.forEach(function (button, index) {
      if (index >= Number(network.groups || 0)) {
        if (index === Number(network.groups || 0)) lockPreviewEl(button, window.HK_PRODUCT.plan === "trial" ? "Premium" : planLabel("trial"));
        else lockElKey(button, "lock_generic");
      }
    });
    var createGroup = document.querySelector(".group-chips button:not([data-g])");
    if (createGroup && Number(network.groups || 0) < 1) lockPreviewEl(createGroup, planLabel("trial"));
    injectBanner({});
  }

  function applyNetworkCompareLocks() {
    var caps = window.HK_PRODUCT.caps || {};
    var network = caps.pages && caps.pages.network;
    if (!network || network.pair_compare === "locked") {
      lockPreviewEl(document.getElementById("cmp-go"), planLabel("trial"));
      var form = document.querySelector(".cmp-input-row");
      if (form) lockPreviewEl(form, planLabel("trial"));
    }
    injectBanner({});
  }

  function applyFengshuiLocks() {
    var caps = window.HK_PRODUCT.caps || {};
    var fengshui = (caps.pages && caps.pages.fengshui) || { houses: 0, layers: "basic", multi_profile: false };
    var rank = { basic: 0, trial: 1, full: 2, professional: 3 };
    var current = rank[fengshui.layers] == null ? 0 : rank[fengshui.layers];
    var required = { trial: planLabel("trial"), full: "Premium", professional: "Master" };
    var controls = [
      [".layer-btn[data-layer='year'],[data-map-layer='year'],[data-map-layer='affliction'],[data-luopan-layer='year'],[data-luopan-layer='blocker']", "trial"],
      [".layer-btn[data-layer='month'],[data-map-layer='month'],[data-map-layer='hex64'],[data-luopan-layer='month'],[data-luopan-layer='hex64'],.school-btn[data-school='hex'],.school-btn[data-school='mansion']", "full"],
      [".layer-btn[data-layer='day'],[data-map-layer='day'],[data-map-layer='hour'],[data-luopan-layer='day'],[data-luopan-layer='hour'],[data-luopan-layer='qimen']", "professional"],
    ];
    controls.forEach(function (entry) {
      var needed = entry[1];
      if (current >= rank[needed]) return;
      document.querySelectorAll(entry[0]).forEach(function (button, index) {
        if (button.classList.contains("active")) {
          try { button.click(); } catch (_) { button.classList.remove("active"); }
        }
        if (index === 0) lockPreviewEl(button, required[needed]);
        else lockElKey(button, "lock_layer");
      });
    });
    if (!fengshui.multi_profile) {
      document.querySelectorAll("#peopleList .person-row").forEach(function (row, index) {
        if (index >= 1) {
          if (index === 1) lockPreviewEl(row, "Master");
          else lockElKey(row, "lock_generic");
        }
      });
      if (document.querySelectorAll("#peopleList .person-row").length >= 1) {
        lockPreviewEl(document.getElementById("btnAddPerson"), "Master");
      }
    }
    injectBanner({});
  }

  function applyDatepickLocks() {
    var caps = window.HK_PRODUCT.caps || {};
    var allow = new Set(caps.datepick_modules || DEFAULT_FREE_MODULES);
    if (window.HK_PRODUCT.plan === "trial" && !caps.datepick_modules) {
      allow = new Set(DEFAULT_TRIAL_MODULES);
    }
    document.querySelectorAll(".filter-item[data-filter]").forEach(function (item) {
      var f = item.getAttribute("data-filter");
      var mod = FILTER_TO_MODULE[f] || f;
      if (!allow.has(mod)) {
        lockElKey(item, "lock_layer");
      }
    });
    injectBanner({ trialKey: "datepick_trial", freeKey: "datepick_free" });
  }

  function applyLuopanLocks() {
    var caps = window.HK_PRODUCT.caps || {};
    var mode = caps.luopan_mode || "core";
    var pins = caps.luopan_pins || "basic";
    /* core: ล็อก pro+full · pro(premium): ล็อก full เท่านั้น · full(master): เปิดหมด */
    if (mode === "core") {
      document
        .querySelectorAll(
          "[data-lp-tier='pro'],[data-lp-tier='full'],.lp-tier-pro,.lp-tier-full,[data-cat='3'],[data-cat='4'],.layer-grid label[data-tier='pro']"
        )
        .forEach(function (el) {
          var key = el.getAttribute("data-lp-tier") === "full" ? "lock_luopan_pro" : "lock_luopan_tier";
          if (el.classList.contains("cat-section")) lockPreviewEl(el, el.getAttribute("data-lp-tier") === "full" ? "Master" : "Premium");
          else lockElKey(el, key);
        });
    } else if (mode === "pro") {
      document.querySelectorAll("[data-lp-tier='full'],.lp-tier-full").forEach(function (el, index) {
        if (index === 0) lockPreviewEl(el, "Master");
        else lockElKey(el, "lock_luopan_pro");
      });
    }
    if (pins === "basic") {
      document.querySelectorAll("[data-pin],[data-lp-pin-tier='full']").forEach(function (btn) {
        var pin = btn.getAttribute("data-pin");
        var pinTier = btn.getAttribute("data-lp-pin-tier");
        if (pinTier === "full" || PIN_FULL_ONLY[pin]) lockElKey(btn, "lock_luopan_water");
      });
    }
    injectBanner({ trialKey: "luopan_trial", freeKey: "luopan_free" });
  }

  function applyQimenLocks() {
    var caps = window.HK_PRODUCT.caps || {};
    var pageCaps = caps.pages && caps.pages.qimen ? caps.pages.qimen : null;
    var detail = (pageCaps && pageCaps.detail) || caps.qimen_detail_mode || "beginner";
    var searchOk = !!caps.qimen_search;
    var sifuOk = !!caps.qimen_sifu;
    window.HK_QIMEN_PAGE_CAPS = pageCaps || {
      time_window_days: 0,
      hours_per_day: detail === "basic" ? 1 : 12,
      detail: detail,
      compare_locations: false,
    };

    if (detail === "basic") {
      var detailPanel = document.getElementById("panel-detail");
      if (detailPanel) lockPreviewEl(detailPanel, "Trial");
    }
    if (detail === "basic" || detail === "beginner") {
      document.querySelectorAll('[data-qm-detail-mode="pro"]').forEach(function (btn) {
        lockElKey(btn, "lock_qimen_pro");
      });
      try { window._qimenDetailMode = "beginner"; } catch (_) {}
    }
    if (pageCaps && Number(pageCaps.time_window_days) === 0) {
      ["t-year", "t-month", "t-day"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) lockElKey(el, "lock_qimen_date");
      });
      var calendarBtn = document.querySelector('#qm-quick-times [data-qt="calendar"]');
      if (calendarBtn) lockElKey(calendarBtn, "lock_qimen_date");
    }
    if (pageCaps && Number(pageCaps.hours_per_day) <= 1) {
      var hourEl = document.getElementById("t-hour");
      if (hourEl) lockElKey(hourEl, "lock_qimen_hour");
    }
    if (!searchOk) {
      var searchPanel = document.getElementById("qm-search-panel");
      if (searchPanel) lockPreviewEl(searchPanel, "Premium");
    }
    if (!sifuOk) {
      var sifuPanel = document.getElementById("qm-sifu-panel");
      if (sifuPanel) lockPreviewEl(sifuPanel, "Premium");
    }
    injectBanner({ trialKey: "qimen_trial", freeKey: "qimen_free" });
  }

  function currentPage() {
    return (
      document.documentElement.getAttribute("data-hk-product-page") ||
      document.body.getAttribute("data-hk-product-page") ||
      ""
    ).toLowerCase();
  }

  function applyForPage() {
    var page = currentPage();
    window.HK_PRODUCT.locale = detectLocale();
    if (page === "datepick") applyDatepickLocks();
    else if (page === "luopan") applyLuopanLocks();
    else if (page === "qimen") {
      applyQimenLocks();
    } else if (page === "chart") {
      applyChartLocks();
    } else if (page === "network") {
      applyNetworkLocks();
    } else if (page === "network_compare") {
      applyNetworkCompareLocks();
    } else if (page === "fengshui") {
      applyFengshuiLocks();
    } else if (page === "today") {
      /* Today is the daily-retention surface: current-day content is open in every plan. */
    } else if (page !== "forecast" && page !== "palmistry") {
      /* generic banner if plan limited */
      injectBanner({});
    }
    refreshLockTitles();
  }

  function load() {
    return fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) {
        if (r.status === 401) {
          window.HK_PRODUCT.plan = "guest";
          window.HK_PRODUCT.caps = {
            datepick_modules: DEFAULT_FREE_MODULES,
            datepick_max_range_days: 30,
            datepick_max_results: 10,
            luopan_mode: "core",
            luopan_pins: "basic",
            qimen_detail_mode: "beginner",
            qimen_search: false,
            qimen_sifu: false,
          };
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then(function (me) {
        if (me && me.plan) {
          window.HK_PRODUCT.plan = me.plan;
          window.HK_PRODUCT.in_trial = !!me.in_trial;
          window.HK_PRODUCT.trial_ends_at = me.trial_ends_at || null;
          window.HK_PRODUCT.caps = me.caps || null;
        }
        window.HK_PRODUCT.ready = true;
        window.HK_PRODUCT.locale = detectLocale();
        try {
          document.dispatchEvent(new CustomEvent("hk-product-ready", { detail: window.HK_PRODUCT }));
        } catch (_) {}
        return window.HK_PRODUCT;
      })
      .catch(function () {
        window.HK_PRODUCT.ready = true;
        return window.HK_PRODUCT;
      });
  }

  window.HK_PRODUCT_LOAD = load;
  window.HK_PRODUCT_APPLY = {
    datepick: applyDatepickLocks,
    luopan: applyLuopanLocks,
    qimen: applyQimenLocks,
    chart: applyChartLocks,
    network: applyNetworkLocks,
    networkCompare: applyNetworkCompareLocks,
    fengshui: applyFengshuiLocks,
    banner: injectBanner,
    planLabel: planLabel,
    t: t,
    locale: detectLocale,
    reapply: applyForPage,
  };
  window.HK_PRODUCT_I18N = I18N;

  function boot() {
    load().then(function () {
      applyForPage();
      var page = currentPage();
      if (page === "qimen") {
        setTimeout(applyQimenLocks, 800);
        setTimeout(applyQimenLocks, 2000);
      } else if (page === "chart") {
        setTimeout(applyChartLocks, 800);
        setTimeout(applyChartLocks, 2000);
      } else if (page === "network") {
        setTimeout(applyNetworkLocks, 800);
        setTimeout(applyNetworkLocks, 2000);
        var peopleGrid = document.getElementById("people-grid");
        if (peopleGrid && window.MutationObserver) {
          var networkTimer = 0;
          new MutationObserver(function () {
            clearTimeout(networkTimer);
            networkTimer = setTimeout(applyNetworkLocks, 40);
          }).observe(peopleGrid, { childList: true });
        }
      } else if (page === "fengshui") {
        setTimeout(applyFengshuiLocks, 800);
        setTimeout(applyFengshuiLocks, 2000);
        var peopleList = document.getElementById("peopleList");
        if (peopleList && window.MutationObserver) {
          var fengshuiTimer = 0;
          new MutationObserver(function () {
            clearTimeout(fengshuiTimer);
            fengshuiTimer = setTimeout(applyFengshuiLocks, 40);
          }).observe(peopleList, { childList: true });
        }
      }
    });
  }

  /* re-render banner + lock titles when locale changes (same tab or storage) */
  var lastLoc = detectLocale();
  function onLocaleMaybe() {
    var now = detectLocale();
    if (now === lastLoc && window.HK_PRODUCT.locale === now) return;
    lastLoc = now;
    window.HK_PRODUCT.locale = now;
    if (window.HK_PRODUCT.ready) applyForPage();
  }
  document.addEventListener("hk:locale", function () {
    setTimeout(onLocaleMaybe, 0);
  });
  document.addEventListener("hk-lang-changed", function () {
    setTimeout(onLocaleMaybe, 0);
  });
  window.addEventListener("storage", function (e) {
    if (e && /^(hk_locale|hk_lang|hk_zh_variant)$/.test(e.key || "")) onLocaleMaybe();
  });
  try {
    var mo = new MutationObserver(function () {
      onLocaleMaybe();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-lang", "data-hk-locale", "data-zh-variant", "lang"],
    });
  } catch (_) {}

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
