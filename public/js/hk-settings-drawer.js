/**
 * hk-settings-drawer.js · กล่องตั้งค่า slide-in
 * - ดึงชื่อบัญชีจาก /api/auth/me + ดึงดวงตัวเองจาก /api/profile
 * - แก้: account name, self profile name, birth_datetime (date+time), location, gender
 * - แสดง TST (true solar time) อัตโนมัติ
 * - บันทึก PUT /api/auth/me และ PUT /api/profile/[id]
 *
 * ใช้ผ่าน window.HK_openSettings()
 */
(function(){
  if (window.HK_settingsLoaded) return;
  window.HK_settingsLoaded = true;

  var SETTINGS_I18N = {
    th: {
      title:'ตั้งค่าบัญชีและดวง', close:'ปิด', loading:'กำลังโหลด…', accountRequired:'กรุณากรอกชื่อบัญชี', accountSaveFailed:'บันทึกชื่อบัญชีไม่สำเร็จ',
      accountLabel:'ชื่อบัญชี', accountPlaceholder:'ชื่อที่แสดงบน avatar/menu', accountNoteOnly:'ชื่อนี้ใช้แสดงในเมนูบัญชี ไม่ใช่ชื่อที่ AI ใช้อ่านดวง', accountNote:'ชื่อนี้ใช้แสดงในเมนูบัญชีและหัว avatar เท่านั้น', accountSave:'บันทึกชื่อบัญชี', accountSaved:'บันทึกชื่อบัญชีแล้ว',
      noProfile:'ยังไม่มีดวงของคุณในระบบ', addProfile:'เพิ่มดวงของคุณ', saving:'กำลังบันทึก…', genericError:'ผิดพลาด', selfLabel:'ชื่อดวงเจ้าของ', selfNote:'ชื่อนี้คือชื่อบนดวงของคุณ และเป็นชื่อที่ AI Sifu ใช้อ้างอิงตอนอ่านดวง',
      birthLabel:'วันเกิด · DD / MM / YYYY', day:'วัน', month:'เดือน', year:'ปี', timeLabel:'เวลา · HH : MM', unknownTime:'ไม่ทราบเวลาเกิด · 3 เสา (no Hour) · 不知時辰', cityLabel:'จังหวัด / เมือง', cityPlaceholder:'พิมพ์ชื่อเมือง · เช่น Bangkok, Tokyo, London', placesLoading:'กำลังโหลด Google Places…',
      genderLabel:'เพศ', unspecified:'— ไม่ระบุ —', male:'ชาย', female:'หญิง', tstLabel:'True Solar Time · เวลาสุริยคติจริง', calculating:'กำลังคำนวณ…', dayBoundaryLabel:'ขอบเขตวันเปลี่ยน · Day Boundary', classicBoundary:'ตำราคลาสสิก (早子時)', universalBoundary:'สากล (Voytek/晚子時)', boundaryNote:'มีผลกับคนที่เกิดช่วง 23:00-23:59 เท่านั้น',
      save:'บันทึก', selfOnlyBefore:'หน้านี้แก้เฉพาะ', selfOnlyStrong:'ดวงของคุณ', selfOnlyAfter:'แก้ดวงญาติที่', network:'เครือข่าย', minute:'นาที', totalAdjust:'รวมแก้', trueTime:'เวลาจริงคำนวณ', placesFailed:'โหลด Google Places ไม่สำเร็จ · เก็บที่อยู่เดิม', chooseCity:'กรุณาเลือกเมืองจากรายการที่ขึ้นมา', invalidYear:'ปีเกิดไม่ถูกต้อง', chartNameRequired:'กรุณากรอกชื่อดวงเจ้าของ', profileSaved:'บันทึกแล้ว · ระบบคำนวณดวงใหม่อัตโนมัติ', networkError:'เครือข่ายขัดข้อง'
    },
    en: {
      title:'Account and chart settings', close:'Close', loading:'Loading…', accountRequired:'Enter an account name', accountSaveFailed:'Could not save the account name',
      accountLabel:'Account name', accountPlaceholder:'Name shown in the avatar and menu', accountNoteOnly:'This name appears in the account menu. AI does not use it for chart readings.', accountNote:'This name appears only in the account menu and avatar.', accountSave:'Save account name', accountSaved:'Account name saved',
      noProfile:'You do not have a chart yet', addProfile:'Create your chart', saving:'Saving…', genericError:'Something went wrong', selfLabel:'Self chart name', selfNote:'This name appears on your chart and is how AI Sifu refers to you in readings.',
      birthLabel:'Birth date · DD / MM / YYYY', day:'Day', month:'Month', year:'Year', timeLabel:'Birth time · HH : MM', unknownTime:'Birth time unknown · 3 pillars (no Hour) · 不知時辰', cityLabel:'Province / city', cityPlaceholder:'Type a city, e.g. Bangkok, Tokyo, London', placesLoading:'Loading Google Places…',
      genderLabel:'Gender', unspecified:'— Not specified —', male:'Male', female:'Female', tstLabel:'True Solar Time', calculating:'Calculating…', dayBoundaryLabel:'Day boundary', classicBoundary:'Classical rule (早子時)', universalBoundary:'Universal rule (Voytek/晚子時)', boundaryNote:'Only affects births between 23:00 and 23:59.',
      save:'Save', selfOnlyBefore:'This page edits only', selfOnlyStrong:'your chart', selfOnlyAfter:'Edit relatives’ charts in', network:'Network', minute:'min', totalAdjust:'Total adjustment', trueTime:'Calculated true time', placesFailed:'Google Places could not load · keeping the existing location', chooseCity:'Choose a city from the suggestions', invalidYear:'Invalid birth year', chartNameRequired:'Enter the self chart name', profileSaved:'Saved · your chart will be recalculated automatically', networkError:'Network error'
    },
    zh: {
      title:'帳戶與命盤設定', close:'關閉', loading:'載入中…', accountRequired:'請輸入帳戶名稱', accountSaveFailed:'無法儲存帳戶名稱',
      accountLabel:'帳戶名稱', accountPlaceholder:'顯示於頭像與選單的名稱', accountNoteOnly:'此名稱只顯示於帳戶選單，不供 AI 解讀命盤使用。', accountNote:'此名稱只顯示於帳戶選單與頭像。', accountSave:'儲存帳戶名稱', accountSaved:'帳戶名稱已儲存',
      noProfile:'系統中尚無你的命盤', addProfile:'建立你的命盤', saving:'儲存中…', genericError:'發生錯誤', selfLabel:'本人命盤名稱', selfNote:'此名稱會顯示於你的命盤，AI 師父解讀時也會用它稱呼你。',
      birthLabel:'出生日期 · DD / MM / YYYY', day:'日', month:'月', year:'年', timeLabel:'出生時間 · HH : MM', unknownTime:'不知道出生時間 · 三柱（無時柱）· 不知時辰', cityLabel:'省／城市', cityPlaceholder:'輸入城市，例如 Bangkok、Tokyo、London', placesLoading:'正在載入 Google Places…',
      genderLabel:'性別', unspecified:'— 未指定 —', male:'男', female:'女', tstLabel:'真太陽時', calculating:'計算中…', dayBoundaryLabel:'換日界線', classicBoundary:'古典規則（早子時）', universalBoundary:'通用規則（Voytek／晚子時）', boundaryNote:'僅影響 23:00–23:59 出生者。',
      save:'儲存', selfOnlyBefore:'本頁只編輯', selfOnlyStrong:'你的命盤', selfOnlyAfter:'親友命盤請前往', network:'人脈網', minute:'分鐘', totalAdjust:'總校正', trueTime:'計算真時', placesFailed:'Google Places 載入失敗 · 保留原地點', chooseCity:'請從建議清單選擇城市', invalidYear:'出生年份無效', chartNameRequired:'請輸入本人命盤名稱', profileSaved:'已儲存 · 系統將自動重新計算命盤', networkError:'網路錯誤'
    },
    cn: {
      title:'账户与命盘设置', close:'关闭', loading:'加载中…', accountRequired:'请输入账户名称', accountSaveFailed:'无法保存账户名称',
      accountLabel:'账户名称', accountPlaceholder:'显示于头像与菜单的名称', accountNoteOnly:'此名称只显示于账户菜单，不供 AI 解读命盘使用。', accountNote:'此名称只显示于账户菜单与头像。', accountSave:'保存账户名称', accountSaved:'账户名称已保存',
      noProfile:'系统中尚无你的命盘', addProfile:'创建你的命盘', saving:'保存中…', genericError:'发生错误', selfLabel:'本人命盘名称', selfNote:'此名称会显示于你的命盘，AI 师父解读时也会用它称呼你。',
      birthLabel:'出生日期 · DD / MM / YYYY', day:'日', month:'月', year:'年', timeLabel:'出生时间 · HH : MM', unknownTime:'不知道出生时间 · 三柱（无时柱）· 不知时辰', cityLabel:'省／城市', cityPlaceholder:'输入城市，例如 Bangkok、Tokyo、London', placesLoading:'正在加载 Google Places…',
      genderLabel:'性别', unspecified:'— 未指定 —', male:'男', female:'女', tstLabel:'真太阳时', calculating:'计算中…', dayBoundaryLabel:'换日界线', classicBoundary:'古典规则（早子时）', universalBoundary:'通用规则（Voytek／晚子时）', boundaryNote:'仅影响 23:00–23:59 出生者。',
      save:'保存', selfOnlyBefore:'本页只编辑', selfOnlyStrong:'你的命盘', selfOnlyAfter:'亲友命盘请前往', network:'人脉网', minute:'分钟', totalAdjust:'总校正', trueTime:'计算真时', placesFailed:'Google Places 加载失败 · 保留原地点', chooseCity:'请从建议列表选择城市', invalidYear:'出生年份无效', chartNameRequired:'请输入本人命盘名称', profileSaved:'已保存 · 系统将自动重新计算命盘', networkError:'网络错误'
    },
    vi: {
      title:'Cài đặt tài khoản và lá số', close:'Đóng', loading:'Đang tải…', accountRequired:'Vui lòng nhập tên tài khoản', accountSaveFailed:'Không thể lưu tên tài khoản',
      accountLabel:'Tên tài khoản', accountPlaceholder:'Tên hiển thị trên ảnh đại diện và menu', accountNoteOnly:'Tên này chỉ hiển thị trong menu tài khoản; AI không dùng để luận lá số.', accountNote:'Tên này chỉ hiển thị trong menu tài khoản và ảnh đại diện.', accountSave:'Lưu tên tài khoản', accountSaved:'Đã lưu tên tài khoản',
      noProfile:'Bạn chưa có lá số trong hệ thống', addProfile:'Tạo lá số của bạn', saving:'Đang lưu…', genericError:'Đã xảy ra lỗi', selfLabel:'Tên lá số của bạn', selfNote:'Tên này xuất hiện trên lá số và được AI Sifu dùng để gọi bạn khi luận giải.',
      birthLabel:'Ngày sinh · DD / MM / YYYY', day:'Ngày', month:'Tháng', year:'Năm', timeLabel:'Giờ sinh · HH : MM', unknownTime:'Không biết giờ sinh · 3 trụ (không có Trụ Giờ) · 不知時辰', cityLabel:'Tỉnh / thành phố', cityPlaceholder:'Nhập thành phố, ví dụ Bangkok, Tokyo, London', placesLoading:'Đang tải Google Places…',
      genderLabel:'Giới tính', unspecified:'— Không nêu —', male:'Nam', female:'Nữ', tstLabel:'Giờ Mặt Trời thực', calculating:'Đang tính…', dayBoundaryLabel:'Mốc đổi ngày', classicBoundary:'Quy tắc cổ điển (早子時)', universalBoundary:'Quy tắc phổ quát (Voytek/晚子時)', boundaryNote:'Chỉ ảnh hưởng người sinh từ 23:00 đến 23:59.',
      save:'Lưu', selfOnlyBefore:'Trang này chỉ sửa', selfOnlyStrong:'lá số của bạn', selfOnlyAfter:'Sửa lá số người thân tại', network:'Mạng lưới', minute:'phút', totalAdjust:'Tổng hiệu chỉnh', trueTime:'Giờ thực đã tính', placesFailed:'Không tải được Google Places · giữ nguyên địa điểm hiện tại', chooseCity:'Vui lòng chọn thành phố từ danh sách gợi ý', invalidYear:'Năm sinh không hợp lệ', chartNameRequired:'Vui lòng nhập tên lá số của bạn', profileSaved:'Đã lưu · hệ thống sẽ tự động tính lại lá số', networkError:'Lỗi mạng'
    },
    ja: {
      title:'アカウントと命盤の設定', close:'閉じる', loading:'読み込み中…', accountRequired:'アカウント名を入力してください', accountSaveFailed:'アカウント名を保存できませんでした',
      accountLabel:'アカウント名', accountPlaceholder:'アバターとメニューに表示する名前', accountNoteOnly:'この名前はアカウントメニューにのみ表示され、AIの命盤鑑定には使われません。', accountNote:'この名前はアカウントメニューとアバターにのみ表示されます。', accountSave:'アカウント名を保存', accountSaved:'アカウント名を保存しました',
      noProfile:'まだ命盤がありません', addProfile:'命盤を作成', saving:'保存中…', genericError:'エラーが発生しました', selfLabel:'本人の命盤名', selfNote:'命盤に表示され、AI Sifuが鑑定であなたを呼ぶ際に使う名前です。',
      birthLabel:'生年月日 · DD / MM / YYYY', day:'日', month:'月', year:'年', timeLabel:'出生時刻 · HH : MM', unknownTime:'出生時刻不明 · 三柱（時柱なし）· 不知時辰', cityLabel:'都道府県／都市', cityPlaceholder:'都市名を入力（例：Bangkok, Tokyo, London）', placesLoading:'Google Placesを読み込み中…',
      genderLabel:'性別', unspecified:'— 未指定 —', male:'男性', female:'女性', tstLabel:'真太陽時', calculating:'計算中…', dayBoundaryLabel:'日付の境界', classicBoundary:'古典方式（早子時）', universalBoundary:'標準方式（Voytek／晚子時）', boundaryNote:'23:00〜23:59生まれの場合のみ影響します。',
      save:'保存', selfOnlyBefore:'このページで編集するのは', selfOnlyStrong:'あなたの命盤のみ', selfOnlyAfter:'親族の命盤は次で編集：', network:'ネットワーク', minute:'分', totalAdjust:'合計補正', trueTime:'算出した真時', placesFailed:'Google Placesを読み込めません · 現在の場所を保持します', chooseCity:'候補リストから都市を選択してください', invalidYear:'出生年が正しくありません', chartNameRequired:'本人の命盤名を入力してください', profileSaved:'保存しました · 命盤を自動で再計算します', networkError:'ネットワークエラー'
    },
    ko: {
      title:'계정 및 명식 설정', close:'닫기', loading:'불러오는 중…', accountRequired:'계정 이름을 입력하세요', accountSaveFailed:'계정 이름을 저장하지 못했습니다',
      accountLabel:'계정 이름', accountPlaceholder:'아바타와 메뉴에 표시할 이름', accountNoteOnly:'이 이름은 계정 메뉴에만 표시되며 AI 명식 해석에는 사용되지 않습니다.', accountNote:'이 이름은 계정 메뉴와 아바타에만 표시됩니다.', accountSave:'계정 이름 저장', accountSaved:'계정 이름을 저장했습니다',
      noProfile:'아직 등록된 명식이 없습니다', addProfile:'내 명식 만들기', saving:'저장 중…', genericError:'오류가 발생했습니다', selfLabel:'본인 명식 이름', selfNote:'명식에 표시되며 AI Sifu가 해석에서 당신을 부를 때 사용하는 이름입니다.',
      birthLabel:'생년월일 · DD / MM / YYYY', day:'일', month:'월', year:'년', timeLabel:'출생 시간 · HH : MM', unknownTime:'출생 시간 모름 · 3주(시주 없음) · 不知時辰', cityLabel:'시/도시', cityPlaceholder:'도시 입력 (예: Bangkok, Tokyo, London)', placesLoading:'Google Places 불러오는 중…',
      genderLabel:'성별', unspecified:'— 미지정 —', male:'남성', female:'여성', tstLabel:'진태양시', calculating:'계산 중…', dayBoundaryLabel:'날짜 경계', classicBoundary:'고전 방식 (早子時)', universalBoundary:'표준 방식 (Voytek/晚子時)', boundaryNote:'23:00~23:59 출생자에게만 적용됩니다.',
      save:'저장', selfOnlyBefore:'이 페이지에서는', selfOnlyStrong:'내 명식만', selfOnlyAfter:'가족 명식은 다음에서 수정:', network:'네트워크', minute:'분', totalAdjust:'총 보정', trueTime:'계산된 진태양시', placesFailed:'Google Places를 불러오지 못했습니다 · 기존 위치 유지', chooseCity:'추천 목록에서 도시를 선택하세요', invalidYear:'출생 연도가 올바르지 않습니다', chartNameRequired:'본인 명식 이름을 입력하세요', profileSaved:'저장했습니다 · 명식을 자동으로 다시 계산합니다', networkError:'네트워크 오류'
    },
    ru: {
      title:'Настройки аккаунта и карты', close:'Закрыть', loading:'Загрузка…', accountRequired:'Введите имя аккаунта', accountSaveFailed:'Не удалось сохранить имя аккаунта',
      accountLabel:'Имя аккаунта', accountPlaceholder:'Имя в аватаре и меню', accountNoteOnly:'Это имя показывается только в меню аккаунта и не используется ИИ для чтения карты.', accountNote:'Это имя показывается только в меню аккаунта и аватаре.', accountSave:'Сохранить имя аккаунта', accountSaved:'Имя аккаунта сохранено',
      noProfile:'У вас пока нет карты', addProfile:'Создать свою карту', saving:'Сохранение…', genericError:'Произошла ошибка', selfLabel:'Имя личной карты', selfNote:'Это имя отображается на карте и используется AI Sifu при обращении к вам.',
      birthLabel:'Дата рождения · DD / MM / YYYY', day:'День', month:'Месяц', year:'Год', timeLabel:'Время рождения · HH : MM', unknownTime:'Время рождения неизвестно · 3 столпа (без часа) · 不知時辰', cityLabel:'Регион / город', cityPlaceholder:'Введите город, например Bangkok, Tokyo, London', placesLoading:'Загрузка Google Places…',
      genderLabel:'Пол', unspecified:'— Не указан —', male:'Мужской', female:'Женский', tstLabel:'Истинное солнечное время', calculating:'Расчёт…', dayBoundaryLabel:'Граница суток', classicBoundary:'Классическое правило (早子時)', universalBoundary:'Универсальное правило (Voytek/晚子時)', boundaryNote:'Влияет только на рождённых с 23:00 до 23:59.',
      save:'Сохранить', selfOnlyBefore:'На этой странице меняется только', selfOnlyStrong:'ваша карта', selfOnlyAfter:'Карты родственников меняются в разделе', network:'Сеть', minute:'мин', totalAdjust:'Общая поправка', trueTime:'Расчётное истинное время', placesFailed:'Google Places не загрузился · сохраняем прежнее место', chooseCity:'Выберите город из списка подсказок', invalidYear:'Неверный год рождения', chartNameRequired:'Введите имя личной карты', profileSaved:'Сохранено · карта будет пересчитана автоматически', networkError:'Ошибка сети'
    },
    es: {
      title:'Ajustes de cuenta y carta', close:'Cerrar', loading:'Cargando…', accountRequired:'Introduce el nombre de la cuenta', accountSaveFailed:'No se pudo guardar el nombre de la cuenta',
      accountLabel:'Nombre de la cuenta', accountPlaceholder:'Nombre mostrado en el avatar y el menú', accountNoteOnly:'Este nombre solo aparece en el menú de cuenta; la IA no lo usa para leer la carta.', accountNote:'Este nombre solo aparece en el menú de cuenta y el avatar.', accountSave:'Guardar nombre de cuenta', accountSaved:'Nombre de cuenta guardado',
      noProfile:'Todavía no tienes una carta', addProfile:'Crear tu carta', saving:'Guardando…', genericError:'Se produjo un error', selfLabel:'Nombre de tu carta', selfNote:'Este nombre aparece en tu carta y AI Sifu lo usa para dirigirse a ti en las lecturas.',
      birthLabel:'Fecha de nacimiento · DD / MM / YYYY', day:'Día', month:'Mes', year:'Año', timeLabel:'Hora de nacimiento · HH : MM', unknownTime:'Hora de nacimiento desconocida · 3 pilares (sin Hora) · 不知時辰', cityLabel:'Provincia / ciudad', cityPlaceholder:'Escribe una ciudad, p. ej. Bangkok, Tokyo, London', placesLoading:'Cargando Google Places…',
      genderLabel:'Género', unspecified:'— Sin especificar —', male:'Masculino', female:'Femenino', tstLabel:'Hora solar verdadera', calculating:'Calculando…', dayBoundaryLabel:'Límite del día', classicBoundary:'Regla clásica (早子時)', universalBoundary:'Regla universal (Voytek/晚子時)', boundaryNote:'Solo afecta a nacimientos entre las 23:00 y las 23:59.',
      save:'Guardar', selfOnlyBefore:'Esta página solo edita', selfOnlyStrong:'tu carta', selfOnlyAfter:'Edita las cartas de familiares en', network:'Red', minute:'min', totalAdjust:'Ajuste total', trueTime:'Hora verdadera calculada', placesFailed:'No se pudo cargar Google Places · se conserva la ubicación actual', chooseCity:'Elige una ciudad de la lista de sugerencias', invalidYear:'Año de nacimiento no válido', chartNameRequired:'Introduce el nombre de tu carta', profileSaved:'Guardado · la carta se recalculará automáticamente', networkError:'Error de red'
    }
  };

  function settingsLocale() {
    try {
      var state = window.HK_LANG_STATE || (window.HK && window.HK.langState);
      if (state && typeof state.sifu === 'function') return state.sifu();
      if (state && typeof state.current === 'function') {
        var current = state.current();
        if (current && current.raw === 'zh' && current.variant === 'cn') return 'cn';
        if (current && current.raw) return current.raw;
      }
    } catch (_) {}
    var raw = 'th';
    try { raw = localStorage.getItem('hk_locale') || localStorage.getItem('hk_lang') || document.documentElement.getAttribute('data-hk-locale') || document.documentElement.lang || 'th'; } catch (_) {}
    raw = String(raw || 'th').toLowerCase().replace('_', '-');
    if (raw === 'cn' || raw === 'zh-cn' || raw === 'zh-hans') return 'cn';
    if (raw.indexOf('zh') === 0) {
      try { if (localStorage.getItem('hk_zh_variant') === 'cn') return 'cn'; } catch (_) {}
      return 'zh';
    }
    raw = raw.split('-')[0];
    return SETTINGS_I18N[raw] ? raw : 'th';
  }

  function settingsText(locale, key) {
    var pack = SETTINGS_I18N[locale] || SETTINGS_I18N.en;
    return pack[key] || SETTINGS_I18N.en[key] || SETTINGS_I18N.th[key] || key;
  }

  // styles
  var style = document.createElement('style');
  style.textContent = `
    .hk-set-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);opacity:0;transition:opacity .25s;}
    .hk-set-overlay.on{opacity:1;}
    .hk-set-drawer{position:fixed;top:0;right:-460px;width:440px;max-width:92vw;height:100vh;z-index:9999;background:var(--bg,#0d0f12);color:var(--fg,#f6f1e6);border-left:1px solid rgba(200,164,77,.3);box-shadow:-12px 0 30px rgba(0,0,0,.4);transition:right .3s;display:flex;flex-direction:column;font-family:var(--thai,'Noto Serif Thai',serif);}
    .hk-set-drawer.on{right:0;}
    .hk-set-head{display:flex;align-items:center;gap:10px;padding:18px 22px;border-bottom:1px solid rgba(200,164,77,.22);}
    .hk-set-head h3{font-family:var(--serif,'Cormorant Garamond',serif);font-size:22px;font-weight:600;letter-spacing:.02em;margin:0;flex:1;}
    .hk-set-close{background:transparent;border:0;color:inherit;font-size:24px;cursor:pointer;opacity:.7;}
    .hk-set-close:hover{opacity:1;}
    .hk-set-body{padding:20px 22px;overflow-y:auto;flex:1;}
    .hk-set-grp{margin-bottom:18px;}
    .hk-set-grp label{display:block;font-size:11px;letter-spacing:.06em;color:rgba(246,241,230,.55);margin-bottom:6px;text-transform:uppercase;}
    .hk-set-grp input, .hk-set-grp select{width:100%;padding:9px 11px;font-size:14px;background:rgba(38,42,50,.55);border:1px solid rgba(246,241,230,.10);color:inherit;outline:none;font-family:inherit;}
    .hk-set-grp input:focus{border-color:rgba(200,164,77,.55);}
    .hk-set-note{margin-top:5px;font-size:11px;line-height:1.55;color:rgba(246,241,230,.48);}
    body.light .hk-set-drawer{background:#f6f1e6;color:#1a1d24;}
    body.light .hk-set-grp input,body.light .hk-set-grp select{background:rgba(255,253,247,.7);border-color:rgba(26,29,36,.15);}
    body.light .hk-set-note{color:rgba(26,29,36,.58);}
    .hk-set-row3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
    .hk-set-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
    .hk-set-tst{margin-top:6px;padding:11px 13px;border:1px solid rgba(200,164,77,.28);background:rgba(200,164,77,.08);font-family:var(--mono,'JetBrains Mono',monospace);font-size:11px;line-height:1.7;}
    .hk-set-tst b{color:var(--gold,#c8a44d);}
    .hk-set-save{width:100%;padding:11px;background:var(--gold,#c8a44d);color:#0d0f12;border:0;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;letter-spacing:.04em;}
    .hk-set-save:hover{opacity:.92;}
    .hk-set-save:disabled{opacity:.4;cursor:wait;}
    .hk-set-toast{position:fixed;bottom:24px;right:24px;padding:12px 18px;border:1px solid;z-index:10000;font-size:13px;font-family:inherit;}
    .hk-set-toast.ok{background:rgba(125,211,123,.15);border-color:rgba(125,211,123,.5);color:rgba(125,211,123,1);}
    .hk-set-toast.err{background:rgba(226,107,93,.15);border-color:rgba(226,107,93,.5);color:rgba(226,107,93,1);}
    .hk-set-loading{padding:40px;text-align:center;color:rgba(246,241,230,.55);}
    /* iOS Safari: ≥16px กัน zoom-on-focus · เฉพาะ city input */
    #set-city-input{font-size:16px !important;}
    .hk-set-loading-hint{margin-top:6px;font-size:11px;color:rgba(246,241,230,.45);letter-spacing:.04em;}
    body.light .hk-set-loading-hint{color:rgba(26,29,36,.55);}
    /* Codex: Google Places dropdown ต้องอยู่หน้า overlay/drawer (9998/9999) */
    .pac-container{z-index:10001 !important;}
  `;
  document.head.appendChild(style);

  // Codex G1: lazy-load Google Places · script โหลดเฉพาะตอนเปิด drawer ครั้งแรก
  function ensurePlacesScript() {
    return new Promise(function(resolve, reject){
      if (window.google && window.google.maps && window.google.maps.places) return resolve();
      if (window.__hkPlacesLoading) {
        window.__hkPlacesLoading.then(resolve, reject);
        return;
      }
      window.__hkPlacesLoading = new Promise(function(res, rej){
        var done = false;
        function fail(msg){
          if (done) return; done = true;
          clearTimeout(to);
          try { delete window.__hkInitDrawerPlaces; } catch(_){}
          /* Codex: เคลียร์เพื่อให้ retry ครั้งต่อไปได้ · กัน promise rejected poison */
          try { delete window.__hkPlacesLoading; } catch(_){}
          rej(new Error(msg));
        }
        var to = setTimeout(function(){ fail('places script timeout'); }, 8000);
        window.__hkInitDrawerPlaces = function(){
          if (done) return; done = true;
          clearTimeout(to);
          try { delete window.__hkInitDrawerPlaces; } catch(_){}
          res();
        };
        var s = document.createElement('script');
        s.async = true;
        s.src = '/api/maps-script?callback=__hkInitDrawerPlaces';
        s.onerror = function(){ fail('places script load error'); };
        document.head.appendChild(s);
      });
      window.__hkPlacesLoading.then(resolve, reject);
    });
  }
  /* Expose สำหรับ /yongsennetwork · person modal ใช้ร่วมกัน */
  window.HK_ensurePlacesScript = ensurePlacesScript;

  // Compute TST shift (longitude + EOT approx)
  function computeTST(lng, date) {
    var LNG_REF = 105; // Asia/Bangkok standard meridian · UTC+7 × 15°
    var longitudeShiftMin = (lng - LNG_REF) * 4;
    // Equation of Time approximation (radians)
    var n = (function(d){
      var start = new Date(d.getFullYear(),0,0);
      var diff = (d - start) + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000);
      return Math.floor(diff / (1000*60*60*24));
    })(date);
    var B = (2 * Math.PI * (n - 81)) / 365;
    var eotMin = 9.87 * Math.sin(2*B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    var totalMin = longitudeShiftMin + eotMin;
    return {
      longitudeShift: Math.round(longitudeShiftMin * 10)/10,
      eot: Math.round(eotMin * 10)/10,
      total: Math.round(totalMin * 10)/10,
    };
  }

  // Open drawer · ป้องกันเปิดซ้อน
  window.HK_openSettings = async function() {
    /* 🛡 กันเปิด drawer ซ้อน · ถ้ามีอยู่แล้วให้ return ทันที */
    if (document.querySelector('.hk-set-drawer')) {
      console.warn('[hk-settings] drawer already open · skip duplicate');
      return;
    }
    var locale = settingsLocale();
    function tx(key) { return settingsText(locale, key); }
    // Build drawer
    var overlay = document.createElement('div');
    overlay.className = 'hk-set-overlay';
    var drawer = document.createElement('aside');
    drawer.className = 'hk-set-drawer';
    drawer.innerHTML = `
      <div class="hk-set-head">
        <h3>⚙ ${escapeHtml(tx('title'))}</h3>
        <button class="hk-set-close" id="hk-set-close" aria-label="${escapeHtml(tx('close'))}">✕</button>
      </div>
      <div class="hk-set-body" id="hk-set-body">
        <div class="hk-set-loading">${escapeHtml(tx('loading'))}</div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    setTimeout(function(){ overlay.classList.add('on'); drawer.classList.add('on'); }, 10);

    function close() {
      overlay.classList.remove('on');
      drawer.classList.remove('on');
      setTimeout(function(){ overlay.remove(); drawer.remove(); }, 280);
    }
    overlay.addEventListener('click', close);
    drawer.querySelector('#hk-set-close').addEventListener('click', close);

    // Fetch account + active self profile
    var authUser = null;
    try {
      var aj = window.__hkFetchAuthMe
        ? await window.__hkFetchAuthMe()
        : await fetch('/api/auth/me', { credentials:'same-origin', cache:'no-store' }).then(function(r){ return r.json(); });
      authUser = aj && aj.user ? aj.user : null;
    } catch(e) { console.warn('account settings load', e); }

    var profile = null;
    try {
      var pr = await fetch('/api/profile');
      var pj = await pr.json();
      var arr = (pj.profiles || []).filter(function(p){ return !p.is_archived; });
      /* B (1 มิ.ย.) · drawer "ตั้งค่าดวงของฉัน" = ดวง self เท่านั้น
       * เลิก fallback localStorage(hk_profile_id)/arr[0] ที่อาจค้างเป็นดวงญาติ → เขียนทับดวง self = "รวมดวง"
       * ยึดแหล่งจริง is_self อย่างเดียว · ไม่เจอ self = ไม่เปิดฟอร์ม (กันเขียนผิดดวง · ทริค #6/#27/#30) */
      profile = arr.find(function(p){ return !!p.is_self; }) || null;
    } catch(e) { console.warn('settings load', e); }

    var body = drawer.querySelector('#hk-set-body');
    async function saveAccountName(inputId) {
      var el = document.getElementById(inputId);
      if (!el) return null;
      var accountName = el.value.trim();
      if (!authUser && !accountName) return null;
      if (!accountName) throw new Error(tx('accountRequired'));
      if (authUser && accountName === String(authUser.name || '').trim()) return null;
      var r = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        credentials: 'same-origin',
        body: JSON.stringify({ name: accountName })
      });
      var j = await r.json().catch(function(){ return {}; });
      if (!r.ok || !j.ok) throw new Error(j.error || tx('accountSaveFailed'));
      authUser = j.user || authUser;
      try { if (window.__hkClearMeCache) window.__hkClearMeCache(); } catch(_){}
      return j.user;
    }

    if (!profile) {
      body.innerHTML = `
        <div class="hk-set-grp">
          <label>${escapeHtml(tx('accountLabel'))}</label>
          <input id="set-account-name-only" type="text" maxlength="80" value="${escapeHtml((authUser && authUser.name) || '')}" placeholder="${escapeHtml(tx('accountPlaceholder'))}">
          <div class="hk-set-note">${escapeHtml(tx('accountNoteOnly'))}</div>
        </div>
        <button class="hk-set-save" id="set-account-save-only">💾 ${escapeHtml(tx('accountSave'))}</button>
        <div class="hk-set-loading" style="padding:24px 0 0">${escapeHtml(tx('noProfile'))} · <a href="/input" style="color:var(--gold);text-decoration:underline">${escapeHtml(tx('addProfile'))}</a></div>
      `;
      document.getElementById('set-account-save-only').addEventListener('click', async function(){
        var btn = this;
        btn.disabled = true;
        btn.textContent = '⏳ ' + tx('saving');
        try {
          await saveAccountName('set-account-name-only');
          toast('✓ ' + tx('accountSaved'), 'ok');
          setTimeout(function(){ close(); setTimeout(function(){ location.reload(); }, 200); }, 700);
        } catch(e) {
          toast('✗ ' + (e.message || tx('genericError')), 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = '💾 ' + tx('accountSave');
        }
      });
      return;
    }
    /* โชว์ชื่อดวง self ที่หัว + ลิงก์แก้ดวงญาติ → /yongsennetwork (กันเข้าใจผิดว่ากำลังแก้ดวงที่ดูอยู่) */
    try {
      var hd = drawer.querySelector('.hk-set-head h3');
      if (hd) hd.textContent = '⚙ ' + tx('title') + ' · ' + (profile.name || '');
    } catch(_){}

    var dt = new Date(profile.birth_datetime);
    // Use original Asia/Bangkok components
    var year = dt.getUTCFullYear();
    var month = dt.getUTCMonth() + 1;
    var day = dt.getUTCDate();
    var hour = (dt.getUTCHours() + 7) % 24;
    var minute = dt.getUTCMinutes();
    var initialLat = profile.birth_lat != null ? Number(profile.birth_lat) : 13.7563;
    var initialLng = profile.birth_lng != null ? Number(profile.birth_lng) : 100.5018;
    var initialLoc = profile.birth_location_name || 'Bangkok';

    body.innerHTML = `
      <div class="hk-set-grp">
        <label>${escapeHtml(tx('accountLabel'))}</label>
        <input id="set-account-name" type="text" maxlength="80" value="${escapeHtml((authUser && authUser.name) || '')}" placeholder="${escapeHtml(tx('accountPlaceholder'))}">
        <div class="hk-set-note">${escapeHtml(tx('accountNote'))}</div>
      </div>
      <div class="hk-set-grp">
        <label>${escapeHtml(tx('selfLabel'))}</label>
        <input id="set-name" type="text" value="${escapeHtml(profile.name || '')}">
        <div class="hk-set-note">${escapeHtml(tx('selfNote'))}</div>
      </div>
      <div class="hk-set-grp">
        <label>${escapeHtml(tx('birthLabel'))}</label>
        <div class="hk-set-row3">
          <input id="set-d" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${day}" placeholder="${escapeHtml(tx('day'))}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="hk_d_${Date.now()}" data-lpignore="true" data-1p-ignore="true">
          <input id="set-m" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${month}" placeholder="${escapeHtml(tx('month'))}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="hk_m_${Date.now()}" data-lpignore="true" data-1p-ignore="true">
          <input id="set-y" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${year}" placeholder="${escapeHtml(tx('year'))}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="hk_y_${Date.now()}" data-lpignore="true" data-1p-ignore="true">
        </div>
      </div>
      <div class="hk-set-grp">
        <label>${escapeHtml(tx('timeLabel'))}</label>
        <div class="hk-set-row2">
          <input id="set-hh" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${hour}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="hk_hh_${Date.now()}" data-lpignore="true" data-1p-ignore="true">
          <input id="set-mn" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${minute}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="hk_mn_${Date.now()}" data-lpignore="true" data-1p-ignore="true">
        </div>
        <!-- 19 พ.ค. Option α · ไม่ทราบเวลาเกิด · 3-pillar mode -->
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;cursor:pointer;">
          <input type="checkbox" id="set-no-btime" ${profile.birth_time_known === false ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer;"/>
          <span>${escapeHtml(tx('unknownTime'))}</span>
        </label>
      </div>
      <div class="hk-set-grp">
        <label>${escapeHtml(tx('cityLabel'))}</label>
        <input id="set-city-input" type="text"
               value="${escapeHtml(initialLoc)}"
               placeholder="${escapeHtml(tx('cityPlaceholder'))}"
               autocomplete="off">
        <input type="hidden" id="set-lat"      value="${initialLat.toFixed(4)}">
        <input type="hidden" id="set-lng"      value="${initialLng.toFixed(4)}">
        <input type="hidden" id="set-loc-name" value="${escapeHtml(initialLoc)}">
        <div class="hk-set-loading-hint" id="set-city-hint" style="display:none">${escapeHtml(tx('placesLoading'))}</div>
      </div>
      <div class="hk-set-grp">
        <label>${escapeHtml(tx('genderLabel'))}</label>
        <select id="set-gender">
          <option value="">${escapeHtml(tx('unspecified'))}</option>
          <option value="male" ${profile.gender==='male'?'selected':''}>${escapeHtml(tx('male'))}</option>
          <option value="female" ${profile.gender==='female'?'selected':''}>${escapeHtml(tx('female'))}</option>
        </select>
      </div>
      <div class="hk-set-grp">
        <label>${escapeHtml(tx('tstLabel'))}</label>
        <div class="hk-set-tst" id="set-tst">${escapeHtml(tx('calculating'))}</div>
      </div>
      <div class="hk-set-grp">
        <label>${escapeHtml(tx('dayBoundaryLabel'))}</label>
        <select id="set-day-boundary">
          <option value="23:00">23:00 · ${escapeHtml(tx('classicBoundary'))}</option>
          <option value="00:00">00:00 · ${escapeHtml(tx('universalBoundary'))}</option>
        </select>
        <div class="hk-set-loading-hint" id="set-day-boundary-hint">${escapeHtml(tx('boundaryNote'))}</div>
      </div>
      <button class="hk-set-save" id="set-save">💾 ${escapeHtml(tx('save'))}</button>
      <div style="margin-top:12px;font-size:11px;text-align:center;opacity:.55;">${escapeHtml(tx('selfOnlyBefore'))} <b>${escapeHtml(tx('selfOnlyStrong'))}</b> · ${escapeHtml(tx('selfOnlyAfter'))} <a href="/yongsennetwork" style="color:var(--gold);text-decoration:underline;">${escapeHtml(tx('network'))}</a></div>
    `;
    /* restore from DB first · localStorage only legacy fallback */
    try {
      var dbBoundary = (profile.day_boundary === '00:00' || profile.dayBoundary === '00:00')
        ? '00:00'
        : (profile.day_boundary === '23:00' || profile.dayBoundary === '23:00') ? '23:00' : null;
      var savedBoundary = dbBoundary || localStorage.getItem('hk_day_boundary');
      if (savedBoundary === '00:00') document.getElementById('set-day-boundary').value = '00:00';
    } catch(_){}

    function normalizeYearCE(raw) {
      var y = parseInt(String(raw || '').trim(), 10);
      if (!isFinite(y)) return NaN;
      // รับปี พ.ศ. ที่ผู้ใช้กรอก แล้วแปลงเป็น ค.ศ. อัตโนมัติ
      if (y >= 2400 && y <= 2600) y -= 543;
      return y;
    }
    function recalcTST() {
      var y = normalizeYearCE(document.getElementById('set-y').value);
      var m = +document.getElementById('set-m').value;
      var d = +document.getElementById('set-d').value;
      var hh = +document.getElementById('set-hh').value;
      var mn = +document.getElementById('set-mn').value;
      var lng = +document.getElementById('set-lng').value;
      if (!isFinite(y)) return;
      var date = new Date(Date.UTC(y, m-1, d, hh-7, mn));
      var t = computeTST(lng, date);
      var trueMinutes = hh*60 + mn + t.total;
      var tH = Math.floor(((trueMinutes % 1440 + 1440) % 1440) / 60);
      var tM = Math.round(((trueMinutes % 1440 + 1440) % 1440) % 60);
      document.getElementById('set-tst').innerHTML =
        'Longitude shift: <b>'+t.longitudeShift+'</b> '+escapeHtml(tx('minute'))+'<br>'+
        'Equation of Time: <b>'+t.eot+'</b> '+escapeHtml(tx('minute'))+'<br>'+
        escapeHtml(tx('totalAdjust'))+': <b>'+t.total+'</b> '+escapeHtml(tx('minute'))+'<br>'+
        escapeHtml(tx('trueTime'))+': <b>'+pad(tH)+':'+pad(tM)+'</b>';
    }
    function pad(n){ return n<10?'0'+n:n; }
    ['set-y','set-m','set-d','set-hh','set-mn'].forEach(function(id){
      var el = document.getElementById(id);
      el.addEventListener('input', recalcTST);
      /* 🛡 focus → select all · ป้องกัน maxlength ตัดท้าย เมื่อพิมพ์ทับ */
      el.addEventListener('focus', function(){ this.select(); });
      el.addEventListener('click', function(){ this.select(); });
    });
    document.getElementById('set-y').addEventListener('blur', function(){
      var y = normalizeYearCE(this.value);
      if (isFinite(y)) this.value = String(y);
      recalcTST();
    });
    recalcTST();

    // Codex G1: lazy autocomplete · onerror/timeout safe · normalize input on pick
    var placesReady = false;
    var placesFailed = false;
    (async function wireCityAutocomplete(){
      var inp = document.getElementById('set-city-input');
      var hint = document.getElementById('set-city-hint');
      if (!inp) return;
      hint.style.display = 'block';
      try {
        await ensurePlacesScript();
        hint.style.display = 'none';
        placesReady = true;
        var ac = new google.maps.places.Autocomplete(inp, {
          types: ['(cities)'],
          fields: ['name','geometry','formatted_address','place_id'],
        });
        ac.addListener('place_changed', function(){
          var p = ac.getPlace();
          if (!p.geometry || !p.geometry.location) return;
          var chosen = p.name || p.formatted_address || inp.value;
          inp.value = chosen; // normalize for guard comparison
          document.getElementById('set-lat').value      = p.geometry.location.lat().toFixed(4);
          document.getElementById('set-lng').value      = p.geometry.location.lng().toFixed(4);
          document.getElementById('set-loc-name').value = chosen;
          recalcTST();
        });
      } catch(e) {
        placesFailed = true;
        hint.textContent = tx('placesFailed');
        hint.style.color = 'rgba(226,107,93,.85)';
      }
    })();

    document.getElementById('set-save').addEventListener('click', async function(){
      var btn = this;
      // Codex G1.6: typed-without-pick guard · block while loading too
      // ปลอดภัยเฉพาะกรณี placesFailed · ไม่งั้น mismatch = abort
      var inp = document.getElementById('set-city-input');
      var locHidden = document.getElementById('set-loc-name');
      if (!placesFailed && inp.value.trim() !== (locHidden.value || '').trim()) {
        toast(tx('chooseCity'), 'err');
        return;
      }
      btn.disabled = true;
      btn.textContent = '⏳ ' + tx('saving');
      /* Persist day boundary toggle · localStorage only (per browser) */
      try {
        var sb = document.getElementById('set-day-boundary').value;
        localStorage.setItem('hk_day_boundary', sb === '00:00' ? '00:00' : '23:00');
      } catch(_){}
      var y = normalizeYearCE(document.getElementById('set-y').value);
      if (isFinite(y)) document.getElementById('set-y').value = String(y);
      var m = pad(+document.getElementById('set-m').value);
      var d = pad(+document.getElementById('set-d').value);
      var hh = pad(+document.getElementById('set-hh').value);
      var mn = pad(+document.getElementById('set-mn').value);
      if (!isFinite(y) || y < 1900 || y > 2100) {
        toast(tx('invalidYear'), 'err');
        btn.disabled = false;
        btn.textContent = '💾 ' + tx('save');
        return;
      }
      var selfChartName = document.getElementById('set-name').value.trim();
      if (!selfChartName) {
        toast(tx('chartNameRequired'), 'err');
        btn.disabled = false;
        btn.textContent = '💾 ' + tx('save');
        return;
      }
      /* 19 พ.ค. Option α · ไม่ทราบเวลาเกิด → birthTimeKnown=false */
      var noBtimeEl = document.getElementById('set-no-btime');
      var birthTimeKnown = !(noBtimeEl && noBtimeEl.checked);
      var payload = {
        name: selfChartName,
        birthDate: String(y) + '-' + m + '-' + d,
        birthTime: hh + ':' + mn,
        birthLng: Number(document.getElementById('set-lng').value),
        birthLat: Number(document.getElementById('set-lat').value),
        locationName: document.getElementById('set-loc-name').value,
        gender: document.getElementById('set-gender').value || null,
        birthTimeKnown: birthTimeKnown,
        dayBoundary: (document.getElementById('set-day-boundary').value === '00:00' ? '00:00' : '23:00'),
      };
      try {
        await saveAccountName('set-account-name');
        var r = await fetch('/api/profile/' + profile.id, {
          method: 'PUT', headers: {'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        });
        var j = await r.json();
        if (j.ok) {
          toast('✓ ' + tx('profileSaved'), 'ok');
          setTimeout(function(){ close(); setTimeout(function(){ location.reload(); }, 200); }, 800);
        } else {
          toast('✗ ' + (j.error || tx('genericError')), 'err');
        }
      } catch(e) {
        toast('✗ ' + tx('networkError'), 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = '💾 ' + tx('save');
      }
    });
  };

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'hk-set-toast ' + (kind || 'ok');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3000);
  }
})();
