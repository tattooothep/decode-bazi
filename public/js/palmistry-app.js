/* palmistry-app.js · ศาสตร์ที่ 7 — logic หน้าทำนายลายมือ
 * upload 2 ฝ่ามือ → POST /api/palmistry/read → coverage-driven re-shoot → ผลลัพธ์
 * 9 ภาษา (inline · dynamic content แปลโดย AI ตาม lang) · theme via data-theme (hk-user-menu)
 */
(function () {
  "use strict";
  var LANGS = ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"];

  /* ── i18n static UI (9 ภาษา · จาวิสแปลเอง native-quality) ── */
  var I18N = {
    kick:{th:"ศาสตร์ที่ 7 · หัตถศาสตร์",en:"The 7th Art · Palmistry",zh:"第七術 · 手相",cn:"第七术 · 手相",vi:"Môn thứ 7 · Xem chỉ tay",ja:"第七の術 · 手相",ko:"제7의 술 · 손금",ru:"7-е искусство · Хиромантия",es:"El 7.º arte · Quiromancia"},
    h1a:{th:"ทำนายลายมือหลอมรวม",en:"Fused Palm Reading",zh:"融合手相占卜",cn:"融合手相占卜",vi:"Xem chỉ tay hợp nhất",ja:"融合手相占い",ko:"융합 손금 풀이",ru:"Единое чтение ладони",es:"Lectura de mano fusionada"},
    hsub:{th:"ถ่ายฝ่ามือสองข้าง → AI อ่านเส้นตามคัมภีร์ 3 อารยธรรม (จีน·อินเดีย·ตะวันตก)",en:"Photograph both palms → AI reads the lines per canons of 3 civilizations (China·India·West)",zh:"拍攝雙手掌 → AI 依三大文明典籍（中·印·西）解讀掌紋",cn:"拍摄双手掌 → AI 依三大文明典籍（中·印·西）解读掌纹",vi:"Chụp cả hai lòng bàn tay → AI đọc chỉ tay theo kinh điển 3 nền văn minh (Trung·Ấn·Tây)",ja:"両手のひらを撮影 → AIが三大文明（中·印·西）の典籍に基づき掌線を読み解く",ko:"양쪽 손바닥 촬영 → AI가 3대 문명(중·인·서) 경전에 따라 손금 해석",ru:"Сфотографируйте обе ладони → ИИ читает линии по канонам 3 цивилизаций (Китай·Индия·Запад)",es:"Fotografía ambas palmas → la IA lee las líneas según los cánones de 3 civilizaciones (China·India·Occidente)"},
    "up.title":{th:"ลายมือของคุณ",en:"Your palms",zh:"你的手掌",cn:"你的手掌",vi:"Lòng bàn tay của bạn",ja:"あなたの手のひら",ko:"당신의 손바닥",ru:"Ваши ладони",es:"Tus palmas"},
    "up.sub":{th:"แบมือ ถ่ายในที่แสงสว่าง ให้เห็นเส้นชัด · แตะการ์ดเพื่อถ่ายหรือเลือกรูป",en:"Open your hand, shoot in good light so the lines show · tap a card to shoot or pick a photo",zh:"攤開手掌，在光線充足處拍攝讓掌紋清晰 · 點卡片拍照或選圖",cn:"摊开手掌，在光线充足处拍摄让掌纹清晰 · 点卡片拍照或选图",vi:"Xòe tay, chụp nơi đủ sáng để thấy rõ chỉ tay · chạm thẻ để chụp hoặc chọn ảnh",ja:"手を開き、明るい場所で線がはっきり見えるよう撮影 · カードをタップして撮影または選択",ko:"손을 펴고 밝은 곳에서 선이 잘 보이게 촬영 · 카드를 눌러 촬영하거나 사진 선택",ru:"Раскройте ладонь, снимайте при хорошем свете, чтобы линии были видны · нажмите карточку",es:"Abre la mano, fotografía con buena luz para ver las líneas · toca una tarjeta para capturar o elegir"},
    "up.left":{th:"มือซ้าย",en:"Left hand",zh:"左手",cn:"左手",vi:"Tay trái",ja:"左手",ko:"왼손",ru:"Левая рука",es:"Mano izquierda"},
    "up.right":{th:"มือขวา",en:"Right hand",zh:"右手",cn:"右手",vi:"Tay phải",ja:"右手",ko:"오른손",ru:"Правая рука",es:"Mano derecha"},
    "up.tap":{th:"📷 ถ่าย / เลือกรูป",en:"📷 Shoot / pick",zh:"📷 拍照 / 選圖",cn:"📷 拍照 / 选图",vi:"📷 Chụp / chọn",ja:"📷 撮影 / 選択",ko:"📷 촬영 / 선택",ru:"📷 Снять / выбрать",es:"📷 Capturar / elegir"},
    "up.tap2":{th:"📷 ถ่าย / เลือกรูป",en:"📷 Shoot / pick",zh:"📷 拍照 / 選圖",cn:"📷 拍照 / 选图",vi:"📷 Chụp / chọn",ja:"📷 撮影 / 選択",ko:"📷 촬영 / 선택",ru:"📷 Снять / выбрать",es:"📷 Capturar / elegir"},
    "up.guide":{th:"💡 มือถนัด = ปัจจุบัน/อนาคต · อีกข้าง = พื้นดวงติดตัว · ถ่ายอย่างน้อย 1 ข้างก็เริ่มได้",en:"💡 Dominant hand = present/future · other = inborn nature · at least 1 hand to start",zh:"💡 慣用手＝現在/未來 · 另一手＝與生俱來 · 至少拍一隻手即可開始",cn:"💡 惯用手＝现在/未来 · 另一手＝与生俱来 · 至少拍一只手即可开始",vi:"💡 Tay thuận = hiện tại/tương lai · tay kia = bẩm sinh · chụp ít nhất 1 tay để bắt đầu",ja:"💡 利き手＝現在/未来 · もう一方＝生まれ持った性質 · 片手だけでも開始可",ko:"💡 주로 쓰는 손 = 현재/미래 · 다른 손 = 타고난 기질 · 한 손만으로도 시작 가능",ru:"💡 Ведущая рука = настоящее/будущее · другая = врождённое · достаточно 1 руки",es:"💡 Mano dominante = presente/futuro · la otra = naturaleza innata · basta 1 mano para empezar"},
    "up.btn":{th:"✋ วิเคราะห์ลายมือ",en:"✋ Read my palm",zh:"✋ 解讀掌紋",cn:"✋ 解读掌纹",vi:"✋ Xem chỉ tay",ja:"✋ 手相を読む",ko:"✋ 손금 보기",ru:"✋ Прочитать ладонь",es:"✋ Leer mi mano"},
    "up.privacy":{th:"🔒 รูปใช้อ่านแล้วลบทันที ไม่เก็บบนเซิร์ฟเวอร์ · จะบันทึกก็ต่อเมื่อคุณเลือก",en:"🔒 Photos are deleted right after reading, never stored · saved only if you choose",zh:"🔒 圖片解讀後立即刪除，不存伺服器 · 你選擇才會保存",cn:"🔒 图片解读后立即删除，不存服务器 · 你选择才会保存",vi:"🔒 Ảnh bị xóa ngay sau khi đọc, không lưu trên máy chủ · chỉ lưu nếu bạn chọn",ja:"🔒 画像は読み取り後すぐ削除、サーバー保存なし · 選択時のみ保存",ko:"🔒 사진은 판독 후 즉시 삭제, 서버 저장 안 함 · 선택 시에만 저장",ru:"🔒 Фото удаляются сразу после чтения, не хранятся · сохраняются только по вашему выбору",es:"🔒 Las fotos se borran tras la lectura, no se almacenan · se guardan solo si eliges"},
    "an.title":{th:"กำลังอ่านลายมือ",en:"Reading your palm",zh:"正在解讀掌紋",cn:"正在解读掌纹",vi:"Đang đọc chỉ tay",ja:"手相を読み取り中",ko:"손금 읽는 중",ru:"Читаем ладонь",es:"Leyendo tu mano"},
    "an.sub":{th:"เทียบเส้นกับคัมภีร์ 3 อารยธรรม",en:"Matching lines against 3 civilizations' canons",zh:"對照三大文明典籍",cn:"对照三大文明典籍",vi:"Đối chiếu với kinh điển 3 nền văn minh",ja:"三大文明の典籍と照合",ko:"3대 문명 경전과 대조",ru:"Сверяем с канонами 3 цивилизаций",es:"Cotejando con los cánones de 3 civilizaciones"},
    "an.analyzing":{th:"วิเคราะห์",en:"analyzing",zh:"分析中",cn:"分析中",vi:"phân tích",ja:"分析中",ko:"분석 중",ru:"анализ",es:"analizando"},
    "an.clarity":{th:"ความชัดของภาพ",en:"Image clarity",zh:"影像清晰度",cn:"影像清晰度",vi:"Độ rõ ảnh",ja:"画像の鮮明度",ko:"이미지 선명도",ru:"Чёткость снимка",es:"Nitidez de imagen"},
    "an.s1":{th:"อ่านเส้นหลัก 4 เส้น",en:"Reading the 4 major lines",zh:"解讀四大主紋",cn:"解读四大主纹",vi:"Đọc 4 đường chính",ja:"主要4線を読む",ko:"주요 4선 읽기",ru:"Читаем 4 главные линии",es:"Leyendo las 4 líneas principales"},
    "an.s2":{th:"จับเนินและสัญลักษณ์บนฝ่ามือ",en:"Detecting mounts and marks",zh:"辨識掌丘與紋記",cn:"辨识掌丘与纹记",vi:"Nhận diện gò và dấu hiệu",ja:"手丘と印を識別",ko:"손언덕과 표식 인식",ru:"Определяем холмы и знаки",es:"Detectando montes y marcas"},
    "an.s3":{th:"เทียบ 神相全編 · Samudrika · Cheiro",en:"Comparing Shénxiàng · Samudrika · Cheiro",zh:"對照 神相全編 · Samudrika · Cheiro",cn:"对照 神相全编 · Samudrika · Cheiro",vi:"Đối chiếu 神相全編 · Samudrika · Cheiro",ja:"神相全編 · Samudrika · Cheiro を照合",ko:"神相全編 · Samudrika · Cheiro 대조",ru:"Сверяем 神相全編 · Samudrika · Cheiro",es:"Comparando 神相全編 · Samudrika · Cheiro"},
    "an.s4":{th:"หาแก่นที่ 3 ศาสตร์เห็นตรงกัน",en:"Finding what all 3 arts agree on",zh:"尋找三術一致的核心",cn:"寻找三术一致的核心",vi:"Tìm điểm 3 môn cùng đồng thuận",ja:"3術が一致する核心を探す",ko:"3술이 일치하는 핵심 찾기",ru:"Ищем, в чём согласны все 3 учения",es:"Buscando en qué coinciden las 3 artes"},
    "an.s5":{th:"เรียบเรียงคำทำนาย",en:"Composing the reading",zh:"編寫解讀",cn:"编写解读",vi:"Soạn lời giải",ja:"占い結果をまとめる",ko:"풀이 정리",ru:"Составляем толкование",es:"Redactando la lectura"},
    "rs.title":{th:"อ่านได้บางส่วน",en:"Partially readable",zh:"部分可讀",cn:"部分可读",vi:"Đọc được một phần",ja:"一部読み取り可",ko:"일부만 판독됨",ru:"Прочитано частично",es:"Legible en parte"},
    "rs.sub":{th:"เก็บจุดที่ยังไม่ชัดเพิ่ม แล้วผลจะแม่นขึ้น",en:"Capture the unclear spots to make the reading sharper",zh:"補拍不清楚的部位，結果會更準",cn:"补拍不清楚的部位，结果会更准",vi:"Chụp thêm chỗ chưa rõ để kết quả chính xác hơn",ja:"不鮮明な部分を補足撮影すると精度が上がります",ko:"흐린 부분을 추가 촬영하면 더 정확해집니다",ru:"Доснимите нечёткие места — чтение станет точнее",es:"Captura los puntos poco claros para afinar la lectura"},
    "rs.btn":{th:"📸 อ่านใหม่พร้อมรูปที่เพิ่ม",en:"📸 Re-read with added photos",zh:"📸 加入新圖重新解讀",cn:"📸 加入新图重新解读",vi:"📸 Đọc lại với ảnh vừa thêm",ja:"📸 追加画像で再読み取り",ko:"📸 추가 사진으로 다시 읽기",ru:"📸 Перечитать с новыми фото",es:"📸 Releer con las fotos añadidas"},
    "rs.skip":{th:"ข้าม — อ่านเท่าที่เห็น",en:"Skip — read what's visible",zh:"略過 — 依現有解讀",cn:"跳过 — 依现有解读",vi:"Bỏ qua — đọc theo ảnh hiện có",ja:"スキップ — 見える範囲で読む",ko:"건너뛰기 — 보이는 만큼 읽기",ru:"Пропустить — читать как есть",es:"Omitir — leer lo visible"},
    "rs.privacy":{th:"รูปเสริมรวมกับชุดเดิม ส่งอ่านพร้อมกัน · ไม่เก็บบนเซิร์ฟเวอร์",en:"Extra photos join the set, read together · never stored",zh:"補充圖與原圖一起解讀 · 不存伺服器",cn:"补充图与原图一起解读 · 不存服务器",vi:"Ảnh bổ sung ghép cùng bộ, đọc chung · không lưu trữ",ja:"追加画像は元の組と一緒に読み取り · 保存なし",ko:"추가 사진은 기존 세트와 함께 판독 · 저장 안 함",ru:"Доп. фото добавляются к набору, читаются вместе · не хранятся",es:"Las fotos extra se unen al conjunto, se leen juntas · no se almacenan"},
    "rt.title":{th:"คำอ่านลายมือ",en:"Your palm reading",zh:"掌紋解讀",cn:"掌纹解读",vi:"Lời giải chỉ tay",ja:"手相の結果",ko:"손금 풀이",ru:"Чтение вашей ладони",es:"Tu lectura de mano"},
    "rt.save":{th:"💾 บันทึกเป็นศาสตร์ที่ 7",en:"💾 Save as the 7th art",zh:"💾 存為第七術",cn:"💾 存为第七术",vi:"💾 Lưu thành môn thứ 7",ja:"💾 第七の術として保存",ko:"💾 제7의 술로 저장",ru:"💾 Сохранить как 7-е искусство",es:"💾 Guardar como el 7.º arte"},
    "rt.saveNote":{th:"บันทึกแล้ว → ลายมือเข้าไปหลอมรวมกับปาจื้อ/ดาว/จื่อเหวย… ในหน้าดูดวงรวม",en:"Once saved → your palm fuses with BaZi/astrology/Ziwei… in the unified reading",zh:"保存後 → 掌紋與八字/星盤/紫微…在合盤中融合",cn:"保存后 → 掌纹与八字/星盘/紫微…在合盘中融合",vi:"Sau khi lưu → chỉ tay hợp nhất với Bát Tự/chiêm tinh/Tử Vi… trong lá số tổng hợp",ja:"保存後 → 手相が八字/占星/紫微…と統合鑑定で融合",ko:"저장 후 → 손금이 사주/점성/자미…와 통합 풀이에서 융합",ru:"После сохранения → ладонь объединится с Бацзы/астрологией/Цзывэй… в общем чтении",es:"Al guardar → tu mano se fusiona con BaZi/astrología/Ziwei… en la lectura unificada"},
    "rt.restart":{th:"↺ เริ่มใหม่",en:"↺ Start over",zh:"↺ 重新開始",cn:"↺ 重新开始",vi:"↺ Bắt đầu lại",ja:"↺ 最初から",ko:"↺ 다시 시작",ru:"↺ Заново",es:"↺ Empezar de nuevo"},
    home:{th:"← กลับหน้าหลัก",en:"← Back home",zh:"← 返回首頁",cn:"← 返回首页",vi:"← Về trang chủ",ja:"← ホームへ",ko:"← 홈으로",ru:"← На главную",es:"← Volver al inicio"}
  };

  /* dynamic labels (เส้น / สถานะ / tier / ข้อความ) — 9 ภาษา */
  var LINE = {
    life:{icon:"🌿",color:"var(--wood)",bg:"rgba(111,174,90,.14)",nm:{th:"เส้นชีวิต",en:"Life line",zh:"生命線",cn:"生命线",vi:"Đường sinh mệnh",ja:"生命線",ko:"생명선",ru:"Линия жизни",es:"Línea de la vida"},cn2:"地紋"},
    head:{icon:"🧠",color:"var(--water)",bg:"rgba(123,168,200,.14)",nm:{th:"เส้นสมอง",en:"Head line",zh:"智慧線",cn:"智慧线",vi:"Đường trí tuệ",ja:"頭脳線",ko:"두뇌선",ru:"Линия головы",es:"Línea de la cabeza"},cn2:"人紋"},
    heart:{icon:"❤",color:"var(--fire)",bg:"rgba(226,107,93,.14)",nm:{th:"เส้นหัวใจ",en:"Heart line",zh:"感情線",cn:"感情线",vi:"Đường tình cảm",ja:"感情線",ko:"감정선",ru:"Линия сердца",es:"Línea del corazón"},cn2:"天紋"},
    fate:{icon:"⭑",color:"var(--gold)",bg:"rgba(200,164,77,.14)",nm:{th:"เส้นโชคชะตา",en:"Fate line",zh:"命運線",cn:"命运线",vi:"Đường định mệnh",ja:"運命線",ko:"운명선",ru:"Линия судьбы",es:"Línea del destino"},cn2:"玉柱"}
  };
  var STCLAR = {clear:{th:"ชัด",en:"clear",zh:"清晰",cn:"清晰",vi:"rõ",ja:"明瞭",ko:"뚜렷",ru:"чётко",es:"clara"},
    partial:{th:"เห็นบางส่วน",en:"partial",zh:"部分",cn:"部分",vi:"một phần",ja:"一部",ko:"부분",ru:"частично",es:"parcial"},
    unclear:{th:"ไม่ชัด",en:"unclear",zh:"不清",cn:"不清",vi:"chưa rõ",ja:"不明瞭",ko:"흐림",ru:"нечётко",es:"poco clara"}};
  var MSG = {
    t1:{th:"แก่นสากล · 3 อารยธรรมเห็นตรงกัน",en:"Universal core · all 3 civilizations agree",zh:"普世核心 · 三大文明一致",cn:"普世核心 · 三大文明一致",vi:"Cốt lõi phổ quát · cả 3 nền văn minh đồng thuận",ja:"普遍の核心 · 三大文明が一致",ko:"보편 핵심 · 3대 문명 일치",ru:"Универсальная суть · согласны все 3 цивилизации",es:"Núcleo universal · las 3 civilizaciones coinciden"},
    t3:{th:"เอกลักษณ์เฉพาะสาย",en:"Distinct per school",zh:"各派獨有",cn:"各派独有",vi:"Nét riêng từng phái",ja:"各流派の独自性",ko:"각 유파 고유",ru:"Уникально для школы",es:"Propio de cada escuela"},
    school:{cn:{th:"จีน 手相",en:"Chinese 手相",zh:"中國 手相",cn:"中国 手相",vi:"Trung 手相",ja:"中国 手相",ko:"중국 手相",ru:"Китай 手相",es:"China 手相"},
      in:{th:"อินเดีย Samudrika",en:"Indian Samudrika",zh:"印度 Samudrika",cn:"印度 Samudrika",vi:"Ấn Độ Samudrika",ja:"インド Samudrika",ko:"인도 Samudrika",ru:"Индия Samudrika",es:"India Samudrika"},
      west:{th:"ตะวันตก Chiromancy",en:"Western Chiromancy",zh:"西方 手相學",cn:"西方 手相学",vi:"Tây phương Chiromancy",ja:"西洋 Chiromancy",ko:"서양 Chiromancy",ru:"Запад Chiromancy",es:"Occidente Quiromancia"}},
    complete:{th:"อ่านครบทั้ง 3 สาย",en:"read across all 3 schools",zh:"三派完整解讀",cn:"三派完整解读",vi:"đọc đủ 3 phái",ja:"3流派を完全解読",ko:"3유파 완전 판독",ru:"прочитано по всем 3 школам",es:"leído en las 3 escuelas"},
    errNet:{th:"เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง",en:"Connection failed, please try again",zh:"連線失敗，請重試",cn:"连接失败，请重试",vi:"Kết nối thất bại, thử lại",ja:"接続に失敗、再試行してください",ko:"연결 실패, 다시 시도하세요",ru:"Ошибка связи, попробуйте снова",es:"Fallo de conexión, inténtalo de nuevo"},
    errBlur:{th:"รูปเบลอเกินไป อ่านไม่ได้ กรุณาถ่ายใหม่ให้ชัด",en:"Photo too blurry to read — please retake it sharper",zh:"圖片太模糊無法解讀，請重拍清楚",cn:"图片太模糊无法解读，请重拍清楚",vi:"Ảnh quá mờ không đọc được — chụp lại rõ hơn",ja:"画像がぼやけて読めません — 鮮明に撮り直してください",ko:"사진이 너무 흐려 판독 불가 — 선명하게 다시 촬영하세요",ru:"Фото слишком размыто — переснимите чётче",es:"Foto demasiado borrosa — vuelve a tomarla más nítida"},
    saved:{th:"บันทึกแล้ว ✓",en:"Saved ✓",zh:"已保存 ✓",cn:"已保存 ✓",vi:"Đã lưu ✓",ja:"保存しました ✓",ko:"저장됨 ✓",ru:"Сохранено ✓",es:"Guardado ✓"},
    goFusion:{th:"🔮 เอาไปรวมกับดวง 7 ศาสตร์",en:"🔮 Fuse into your 7-art reading",zh:"🔮 融入七術合盤",cn:"🔮 融入七术合盘",vi:"🔮 Hợp nhất lá số 7 môn",ja:"🔮 7つの術で統合鑑定",ko:"🔮 7술 통합 풀이로",ru:"🔮 В чтение 7 искусств",es:"🔮 Fusionar con las 7 artes"},
    loginSave:{th:"เข้าสู่ระบบก่อนบันทึก",en:"Please log in to save",zh:"請先登入再保存",cn:"请先登录再保存",vi:"Đăng nhập để lưu",ja:"保存にはログインが必要",ko:"저장하려면 로그인",ru:"Войдите, чтобы сохранить",es:"Inicia sesión para guardar"}
  };

  function getLang() {
    var l = "th";
    try { l = (localStorage.getItem("hk_locale") || localStorage.getItem("hk_lang") || document.documentElement.lang || "th"); } catch (e) {}
    l = String(l).toLowerCase();
    if (l.indexOf("zh") === 0) return "zh";
    if (l.indexOf("en") === 0) return "en";
    l = l.split("-")[0];
    return LANGS.indexOf(l) !== -1 ? l : "th";
  }
  function pick(map, lang) { return (map && (map[lang] || map.en || map.th)) || ""; }
  function t(k) { return pick(I18N[k], getLang()); }

  function applyI18N() {
    var lang = getLang();
    document.documentElement.lang = lang === "cn" ? "zh" : lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var v = I18N[el.getAttribute("data-i18n")];
      if (v) el.textContent = pick(v, lang);
    });
    if (curResult) renderResult(curResult); // re-render dynamic ถ้าเปลี่ยนภาษาหลังอ่าน
  }

  /* ── state ── */
  var $ = function (id) { return document.getElementById(id); };
  var imgs = { left: null, right: null, closeups: [] }; // File objects (ในเครื่อง ไม่อัปถาวร)
  var curResult = null, pendingReshoot = null, progTimer = null;

  function show(id) {
    ["stUpload", "stAnalyzing", "stReshoot", "stResult"].forEach(function (s) {
      $(s).classList.toggle("hidden", s !== id);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ── upload wiring ── */
  function setPreview(handEl, file) {
    var url = URL.createObjectURL(file);
    var img = handEl.querySelector("img.prev") || document.createElement("img");
    img.className = "prev"; img.src = url; img.alt = "";
    if (!img.parentNode) handEl.appendChild(img);
    handEl.classList.add("done");
    var cam = handEl.querySelector(".cam"); if (cam) cam.textContent = "✓";
  }
  function wireHand(handId, fileId, side) {
    var hand = $(handId), file = $(fileId);
    hand.addEventListener("click", function () { file.click(); });
    hand.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
    file.addEventListener("change", function () {
      if (!file.files || !file.files[0]) return;
      imgs[side] = file.files[0];
      setPreview(hand, imgs[side]);
      $("btnAnalyze").disabled = !(imgs.left || imgs.right);
    });
  }

  /* ── progress animation (user ไม่รู้สึกค้าง) ── */
  var ARC = 421;
  function setPct(p) {
    p = Math.max(0, Math.min(100, p));
    $("ringArc").style.strokeDashoffset = String(ARC * (1 - p / 100));
    $("pctNum").textContent = Math.round(p) + "%";
  }
  var STEP_KEYS = ["lines", "mounts", "canon", "fuse", "write"];
  function startProgress() {
    var p = 0, si = 0;
    $("steps").querySelectorAll(".step").forEach(function (s) { s.classList.remove("done", "run"); });
    $("steps").querySelector('[data-k="lines"]').classList.add("run");
    setPct(0);
    progTimer = setInterval(function () {
      p += Math.max(0.4, (88 - p) * 0.035); // ค่อย ๆ เข้าใกล้ 88 ไม่ถึง 100 จนกว่าเสร็จจริง
      setPct(p);
      var target = Math.min(STEP_KEYS.length - 1, Math.floor(p / 20));
      while (si < target) {
        var el = $("steps").querySelector('[data-k="' + STEP_KEYS[si] + '"]');
        if (el) { el.classList.remove("run"); el.classList.add("done"); }
        si++;
        var nx = $("steps").querySelector('[data-k="' + STEP_KEYS[si] + '"]');
        if (nx) nx.classList.add("run");
      }
    }, 220);
  }
  function stopProgress(done) {
    if (progTimer) { clearInterval(progTimer); progTimer = null; }
    if (done) {
      setPct(100);
      $("steps").querySelectorAll(".step").forEach(function (s) { s.classList.remove("run"); s.classList.add("done"); });
    }
  }

  /* ── analyze ── */
  function buildForm() {
    var fd = new FormData();
    fd.append("lang", getLang());
    if (imgs.left) { fd.append("images", imgs.left); fd.append("roles", "left"); fd.append("targets", "undefined"); }
    if (imgs.right) { fd.append("images", imgs.right); fd.append("roles", "right"); fd.append("targets", "undefined"); }
    imgs.closeups.forEach(function (c) { fd.append("images", c.file); fd.append("roles", "closeup"); fd.append("targets", c.target || "undefined"); });
    return fd;
  }
  function analyze() {
    show("stAnalyzing");
    startProgress();
    fetch("/api/palmistry/read", { method: "POST", body: buildForm() })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        stopProgress(true);
        if (!res.ok || !res.j.ok) return onError(res.j);
        setTimeout(function () { onResult(res.j); }, 350);
      })
      .catch(function () { stopProgress(false); onError({ error: "network" }); });
  }
  function onError(j) {
    var lang = getLang();
    var msg = (j && j.error === "parse_failed") ? pick(MSG.errBlur, lang)
      : (j && j.message) ? j.message : pick(MSG.errNet, lang);
    show("stUpload");
    var box = $("stUpload"); var old = box.querySelector(".err"); if (old) old.remove();
    var d = document.createElement("div"); d.className = "err"; d.textContent = "⚠ " + msg;
    box.insertBefore(d, box.firstChild.nextSibling);
  }
  function onResult(j) {
    curResult = j;
    var reshoot = (j.reshoot || []);
    if (reshoot.length && !j.needs_better_photo && j.reading) { pendingReshoot = j; renderReshoot(j); show("stReshoot"); }
    else { renderResult(j); show("stResult"); }
  }

  /* ── render: clarity ── */
  function setClarity() {
    var hints = (curResult && curResult.clarity_hints) || [];
    var min = hints.length ? Math.min.apply(null, hints.map(function (h) { return h.clarity; })) : 0;
    var box = $("clarityBox"); box.classList.toggle("low", min < 45);
    $("clarityVal").textContent = min + "%";
  }

  /* ── render: reshoot ── */
  function renderReshoot(j) {
    var lang = getLang();
    var cov = j.reading && j.reading.coverage ? j.reading.coverage : (j.reading && j.reading.lines ? [] : []);
    // coverage list — จาก reading.coverage หรือ lines
    var coverage = (j.reading.coverage && j.reading.coverage.length) ? j.reading.coverage
      : ["life", "head", "heart", "fate"].map(function (k) {
          var ln = (j.reading.lines || []).find(function (l) { return l.key === k; });
          return { target: k, clarity: ln ? ln.clarity : "unclear", need_reshoot: !ln || ln.clarity === "unclear" };
        });
    var cb = $("coverBox"); cb.innerHTML = "";
    coverage.forEach(function (c) {
      var ok = c.clarity === "clear" || c.clarity === "partial" ? "ok" : "miss";
      var L = LINE[c.target]; if (!L) return;
      var el = document.createElement("div"); el.className = "cv " + ok;
      el.innerHTML = '<span class="cd"></span>' + pick(L.nm, lang) + '<span class="st">' + pick(STCLAR[c.clarity] || STCLAR.unclear, lang) + '</span>';
      cb.appendChild(el);
    });
    var rb = $("reshootBox"); rb.innerHTML = "";
    (j.reshoot || []).forEach(function (rs, idx) {
      var L = LINE[rs.target] || {};
      var card = document.createElement("div"); card.className = "rs-card"; card.setAttribute("tabindex", "0"); card.setAttribute("role", "button");
      card.innerHTML = '<div class="rs-ic">🔍</div><div><b>' + (rs.region || pick(L.nm || {}, lang)) + '</b><span>' + (rs.hint || "") + '</span></div><div class="rs-cam">📷</div>';
      card.addEventListener("click", function () { captureCloseup(rs.target, card); });
      card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); captureCloseup(rs.target, card); } });
      rb.appendChild(card);
    });
  }
  function captureCloseup(target, card) {
    var f = $("fileClose");
    f.onchange = function () {
      if (!f.files || !f.files[0]) return;
      imgs.closeups.push({ file: f.files[0], target: target });
      var url = URL.createObjectURL(f.files[0]);
      var img = document.createElement("img"); img.className = "prev"; img.src = url; img.alt = "";
      card.insertBefore(img, card.firstChild); card.classList.add("done");
      card.querySelector(".rs-cam").textContent = "✓";
      f.value = "";
    };
    f.click();
  }

  /* ── render: result ── */
  function renderResult(j) {
    curResult = j; var lang = getLang(); var rd = j.reading || {};
    var minClar = (j.clarity_hints || []).length ? Math.min.apply(null, j.clarity_hints.map(function (h) { return h.clarity; })) : (j.clarity_overall || 0);
    $("rtSub").textContent = pick(MSG.school, lang) ? "" : "";
    $("rtSub").textContent = pick(I18N["an.clarity"], lang) + " " + (j.clarity_overall != null ? j.clarity_overall : minClar) + "% · " + pick(MSG.complete, lang);

    // verdict = universal[0] (T1 นำ)
    var uni = (rd.reading && rd.reading.universal) || rd.universal || [];
    var vb = $("verdictBox");
    if (uni[0]) vb.innerHTML = '<span class="lab">' + pick(MSG.t1, lang) + '</span><p>' + esc(uni[0].text || uni[0].title || "") + '</p>';
    else vb.innerHTML = '<span class="lab">' + pick(MSG.t1, lang) + '</span><p>' + esc(rd.summary || j.reading.summary || "") + '</p>';

    // lines
    var lb = $("linesBox"); lb.innerHTML = "";
    (rd.lines || []).forEach(function (ln) {
      var L = LINE[ln.key]; if (!L) return;
      var stc = ln.clarity || "clear";
      var row = document.createElement("div"); row.className = "lrow";
      row.innerHTML =
        '<div class="ic" style="background:' + L.bg + ';color:' + L.color + '">' + L.icon + '</div>' +
        '<div class="nm"><b>' + pick(L.nm, lang) + '</b><span>' + L.cn2 + '</span></div>' +
        '<div class="st ' + (stc === "clear" ? "" : stc) + '">' + pick(STCLAR[stc] || STCLAR.clear, lang) + '</div>' +
        (ln.observation ? '<div class="obs">' + esc(ln.observation) + '</div>' : "");
      lb.appendChild(row);
    });

    // tiers
    var tb = $("tiersBox"); tb.innerHTML = "";
    if (uni.length) tb.appendChild(tierEl(pick(MSG.t1, lang), "t1", "3/3", uni.map(function (u) {
      return { title: u.title, text: u.text, src: (u.canon || "") + (u.evidence ? " · " + u.evidence : "") };
    }), true));
    var per = (rd.reading && rd.reading.per_school) || rd.per_school || [];
    if (per.length) tb.appendChild(tierEl(pick(MSG.t3, lang), "t3", "", per.map(function (p) {
      return { title: (pick(MSG.school[p.school] || {}, lang) || "") + (p.title ? " · " + p.title : ""), text: p.text, src: p.canon || "" };
    }), false));

    setClarity();
  }
  function tierEl(name, flag, badge, items, open) {
    var d = document.createElement("details"); d.className = "tier"; if (open) d.open = true;
    var inner = items.map(function (it) {
      return '<div class="item">' + (it.title ? '<b>' + esc(it.title) + '</b> — ' : "") + esc(it.text || "") + (it.src ? '<span class="src">' + esc(it.src) + '</span>' : "") + '</div>';
    }).join("");
    d.innerHTML = '<summary>' + esc(name) + '<span class="flag ' + flag + '">' + esc(badge || "") + '</span></summary><div class="body">' + inner + '</div>';
    return d;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  /* ── save (Phase 3) ── */
  function save() {
    var btn = $("btnSave"); btn.disabled = true;
    fetch("/api/palmistry/save", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang: getLang(), reading: curResult && curResult.reading, clarity: curResult && curResult.clarity_overall }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.ok) {
          btn.textContent = pick(MSG.saved, getLang());
          if (!document.getElementById("goFusion")) { // เด้งปุ่มไปดูดวงรวม (ติ๊กลายมือให้อัตโนมัติ)
            var go = document.createElement("a");
            go.id = "goFusion"; go.href = "/master-fusion?palm=1"; go.className = "cta";
            go.style.cssText = "display:block;text-align:center;text-decoration:none;margin-top:10px;line-height:1.4";
            go.textContent = pick(MSG.goFusion, getLang());
            btn.parentNode.insertBefore(go, btn.nextSibling);
          }
        }
        else if (res.j && res.j.error === "auth_required") { btn.disabled = false; alert(pick(MSG.loginSave, getLang())); location.href = "/signup"; }
        else { btn.disabled = false; alert(pick(MSG.errNet, getLang())); }
      })
      .catch(function () { btn.disabled = false; alert(pick(MSG.errNet, getLang())); });
  }
  function restart() {
    imgs = { left: null, right: null, closeups: [] }; curResult = null; pendingReshoot = null;
    ["handL", "handR"].forEach(function (h) { var el = $(h); var p = el.querySelector("img.prev"); if (p) p.remove(); el.classList.remove("done"); var c = el.querySelector(".cam"); if (c) applyI18N(); });
    $("fileL").value = ""; $("fileR").value = "";
    $("btnAnalyze").disabled = true;
    var er = $("stUpload").querySelector(".err"); if (er) er.remove();
    show("stUpload"); applyI18N();
  }

  /* ── init ── */
  function init() {
    wireHand("handL", "fileL", "left");
    wireHand("handR", "fileR", "right");
    $("btnAnalyze").addEventListener("click", analyze);
    $("btnReanalyze").addEventListener("click", function () { analyze(); });
    $("btnSkip").addEventListener("click", function () { if (pendingReshoot) { renderResult(pendingReshoot); show("stResult"); } });
    $("btnSave").addEventListener("click", save);
    $("btnRestart").addEventListener("click", restart);
    applyI18N();
    // sync ภาษาเมื่อเปลี่ยนจาก user-menu (same tab: poll · other tab: storage)
    var last = getLang();
    setInterval(function () { var c = getLang(); if (c !== last) { last = c; applyI18N(); } }, 700);
    window.addEventListener("storage", function (e) { if (e.key === "hk_locale" || e.key === "hk_lang") applyI18N(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
