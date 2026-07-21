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
    "ctx.title":{th:"ข้อมูลสำหรับซินแส",en:"Sifu context",zh:"師傅參考資料",cn:"师傅参考资料",vi:"Thông tin cho thầy",ja:"鑑定の参考情報",ko:"풀이 참고 정보",ru:"Данные для мастера",es:"Contexto para el maestro"},
    "ctx.dom":{th:"มือถนัด",en:"Dominant hand",zh:"慣用手",cn:"惯用手",vi:"Tay thuận",ja:"利き手",ko:"주로 쓰는 손",ru:"Ведущая рука",es:"Mano dominante"},
    "ctx.dom_unknown":{th:"ไม่ระบุ",en:"Not specified",zh:"未指定",cn:"未指定",vi:"Không nêu",ja:"未指定",ko:"미지정",ru:"Не указано",es:"No especificada"},
    "ctx.dom_right":{th:"มือขวา",en:"Right hand",zh:"右手",cn:"右手",vi:"Tay phải",ja:"右手",ko:"오른손",ru:"Правая",es:"Derecha"},
    "ctx.dom_left":{th:"มือซ้าย",en:"Left hand",zh:"左手",cn:"左手",vi:"Tay trái",ja:"左手",ko:"왼손",ru:"Левая",es:"Izquierda"},
    "ctx.age":{th:"ช่วงวัย/อายุโดยประมาณ",en:"Age range",zh:"年齡範圍",cn:"年龄范围",vi:"Khoảng tuổi",ja:"年齢の目安",ko:"연령대",ru:"Возрастной диапазон",es:"Rango de edad"},
    "ctx.age_ph":{th:"เช่น 30-40",en:"e.g. 30-40",zh:"例如 30-40",cn:"例如 30-40",vi:"ví dụ 30-40",ja:"例 30-40",ko:"예: 30-40",ru:"например 30-40",es:"p. ej. 30-40"},
    "ctx.fromProfile":{th:"ใช้วันเกิด/เพศจากโปรไฟล์",en:"Using birth date/gender from your profile",zh:"已套用個人檔案的生日/性別",cn:"已套用个人档案的生日/性别",vi:"Dùng ngày sinh/giới tính từ hồ sơ",ja:"プロフィールの生年月日・性別を使用",ko:"프로필의 생년월일·성별 사용",ru:"Дата рождения/пол из профиля",es:"Usando fecha de nacimiento/sexo del perfil"},
    "ctx.q":{th:"คำถามหลัก",en:"Main question",zh:"主要問題",cn:"主要问题",vi:"Câu hỏi chính",ja:"主な質問",ko:"주요 질문",ru:"Главный вопрос",es:"Pregunta principal"},
    "ctx.q_ph":{th:"งาน เงิน ความรัก หรือภาพรวมชีวิต",en:"career, money, love, or life overview",zh:"事業、財運、感情或人生總覽",cn:"事业、财运、感情或人生总览",vi:"sự nghiệp, tiền bạc, tình cảm hoặc tổng quan",ja:"仕事、金運、恋愛、人生全体",ko:"일, 돈, 사랑 또는 인생 전반",ru:"работа, деньги, любовь или обзор жизни",es:"trabajo, dinero, amor o panorama vital"},
    "up.btn":{th:"✋ วิเคราะห์ลายมือ",en:"✋ Read my palm",zh:"✋ 解讀掌紋",cn:"✋ 解读掌纹",vi:"✋ Xem chỉ tay",ja:"✋ 手相を読む",ko:"✋ 손금 보기",ru:"✋ Прочитать ладонь",es:"✋ Leer mi mano"},
    "up.cost":{th:"AI คิดยามตามความยาวคำอ่าน · แสดงยอดจริงและคืนยามอัตโนมัติหากอ่านไม่สำเร็จ",en:"AI uses credits based on reading length · actual use is shown and failures are refunded automatically",zh:"AI 依解讀長度扣時 · 顯示實際用量，失敗自動退還",cn:"AI 按解读长度扣时 · 显示实际用量，失败自动退还",vi:"AI trừ lượt theo độ dài bài đọc · hiển thị mức thực tế và tự hoàn nếu thất bại",ja:"AIは鑑定文の長さに応じて消費 · 実使用量を表示し、失敗時は自動返還",ko:"AI는 해석 길이에 따라 차감 · 실제 사용량 표시, 실패 시 자동 환불",ru:"ИИ списывает по длине чтения · показывается факт, при сбое возврат автоматический",es:"La IA cobra según la longitud · muestra el uso real y reembolsa automáticamente si falla"},
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
    "rt.saveAs":{th:"บันทึกเป็นลายมือของ",en:"Save this palm reading for",zh:"儲存這份手相給",cn:"储存这份手相给",vi:"Lưu chỉ tay này cho",ja:"この手相を保存する対象",ko:"이 손금을 저장할 대상",ru:"Сохранить это чтение ладони для",es:"Guardar esta lectura para"},
    "palm.hist.title":{th:"ลายมือที่บันทึกของดวงนี้",en:"Saved palm readings for this person",zh:"此人已存的手相",cn:"此人已存的手相",vi:"Chỉ tay đã lưu của người này",ja:"この人の保存済み手相",ko:"이 사람의 저장된 손금",ru:"Сохранённые чтения ладони",es:"Lecturas guardadas de esta persona"},
    "palm.hist.delete":{th:"ลบ",en:"Delete",zh:"刪除",cn:"删除",vi:"Xóa",ja:"削除",ko:"삭제",ru:"Удалить",es:"Eliminar"},
    "palm.del.confirm":{th:"ลบลายมือที่บันทึกนี้?",en:"Delete this saved reading?",zh:"刪除這份已存手相？",cn:"删除这份已存手相？",vi:"Xóa bản lưu này?",ja:"この保存を削除しますか？",ko:"이 저장을 삭제할까요?",ru:"Удалить это сохранение?",es:"¿Eliminar esta lectura guardada?"},
    "rt.saveNote":{th:"บันทึกแล้ว → ลายมือเข้าไปหลอมรวมกับปาจื้อ/ดาว/จื่อเหวย… ในหน้าดูดวงรวม",en:"Once saved → your palm fuses with BaZi/astrology/Ziwei… in the unified reading",zh:"保存後 → 掌紋與八字/星盤/紫微…在合盤中融合",cn:"保存后 → 掌纹与八字/星盘/紫微…在合盘中融合",vi:"Sau khi lưu → chỉ tay hợp nhất với Bát Tự/chiêm tinh/Tử Vi… trong lá số tổng hợp",ja:"保存後 → 手相が八字/占星/紫微…と統合鑑定で融合",ko:"저장 후 → 손금이 사주/점성/자미…와 통합 풀이에서 융합",ru:"После сохранения → ладонь объединится с Бацзы/астрологией/Цзывэй… в общем чтении",es:"Al guardar → tu mano se fusiona con BaZi/astrología/Ziwei… en la lectura unificada"},
    "rt.restart":{th:"↺ เริ่มใหม่",en:"↺ Start over",zh:"↺ 重新開始",cn:"↺ 重新开始",vi:"↺ Bắt đầu lại",ja:"↺ 最初から",ko:"↺ 다시 시작",ru:"↺ Заново",es:"↺ Empezar de nuevo"},
    "c.nav.chart":{th:"ดวง",en:"Chart",zh:"命盤",cn:"命盘",vi:"Lá số",ja:"命式",ko:"사주",ru:"Карта",es:"Carta"},
    "c.nav.today":{th:"วันนี้",en:"Today",zh:"今日",cn:"今日",vi:"Hôm nay",ja:"今日",ko:"오늘",ru:"Сегодня",es:"Hoy"},
    "c.nav.calendar":{th:"ปฏิทิน",en:"Calendar",zh:"吉曆",cn:"吉历",vi:"Lịch",ja:"暦",ko:"달력",ru:"Календарь",es:"Calendario"},
    "c.nav.network":{th:"เครือข่าย",en:"Network",zh:"人脈",cn:"人脉",vi:"Mạng lưới",ja:"人脈",ko:"네트워크",ru:"Сеть",es:"Red"},
    "c.nav.qimen":{th:"ฉีเหมิน",en:"Qi Men",zh:"奇門",cn:"奇门",vi:"Kỳ Môn",ja:"奇門",ko:"기문",ru:"Ци Мэнь",es:"Qi Men"},
    "hk.nav.forecast":{th:"พยากรณ์",en:"Forecast",zh:"占卜",cn:"占卜",vi:"Dự đoán",ja:"占い",ko:"운세",ru:"Прогноз",es:"Pronóstico"},
    "c.nav.master":{th:"ซินแส",en:"Sifu",zh:"老師",cn:"老师",vi:"Sư phụ",ja:"老師",ko:"스승",ru:"Мастер",es:"Sifu"},
    "c.nav.picker":{th:"วางฤกษ์",en:"Picker",zh:"擇日",cn:"择日",vi:"Trạch Nhật",ja:"択日",ko:"택일",ru:"Дата",es:"Fecha"},
    "c.nav.fengshui":{th:"ทิศมงคล",en:"Direction",zh:"方位",cn:"方位",vi:"Hướng tốt",ja:"方位",ko:"방위",ru:"Направление",es:"Dirección"},
    "c.nav.luopan":{th:"หล่อแก",en:"Luopan",zh:"羅盤",cn:"罗盘",vi:"La Bàn",ja:"羅盤",ko:"나경",ru:"Лопань",es:"Luopan"},
    "rt.pdf":{th:"⬇ ดาวน์โหลด PDF",en:"⬇ Download PDF",zh:"⬇ 下載 PDF",cn:"⬇ 下载 PDF",vi:"⬇ Tải PDF",ja:"⬇ PDF をダウンロード",ko:"⬇ PDF 다운로드",ru:"⬇ Скачать PDF",es:"⬇ Descargar PDF"},
    "rt.aiPdf":{th:"📄 รายงาน AI · 20 ยาม",en:"📄 AI report · 20 units",zh:"📄 AI 報告 · 20 時",cn:"📄 AI 报告 · 20 时",vi:"📄 Báo cáo AI · 20 đơn vị",ja:"📄 AIレポート · 20時",ko:"📄 AI 리포트 · 20단위",ru:"📄 AI-отчёт · 20 единиц",es:"📄 Informe IA · 20 unidades"},
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
    loginSave:{th:"เข้าสู่ระบบก่อนบันทึก",en:"Please log in to save",zh:"請先登入再保存",cn:"请先登录再保存",vi:"Đăng nhập để lưu",ja:"保存にはログインが必要",ko:"저장하려면 로그인",ru:"Войдите, чтобы сохранить",es:"Inicia sesión para guardar"},
    seen:{th:"สิ่งที่เห็นบนมือ",en:"Seen on the hand",zh:"手上所見",cn:"手上所见",vi:"Điều thấy trên tay",ja:"手に見える点",ko:"손에서 보이는 점",ru:"Что видно на руке",es:"Lo visto en la mano"},
    meaning:{th:"ความหมาย",en:"Meaning",zh:"含義",cn:"含义",vi:"Ý nghĩa",ja:"意味",ko:"의미",ru:"Смысл",es:"Significado"},
    advice:{th:"คำแนะนำ",en:"Advice",zh:"建議",cn:"建议",vi:"Lời khuyên",ja:"助言",ko:"조언",ru:"Совет",es:"Consejo"},
    final:{th:"สรุปท้ายคำอ่าน",en:"Final summary",zh:"總結",cn:"总结",vi:"Tổng kết",ja:"まとめ",ko:"최종 요약",ru:"Итог",es:"Resumen final"},
    best:{th:"จุดแข็งที่สุด",en:"Best strength",zh:"最強優勢",cn:"最强优势",vi:"Điểm mạnh nhất",ja:"最大の強み",ko:"가장 큰 강점",ru:"Главная сила",es:"Mayor fortaleza"},
    risk:{th:"จุดที่ต้องระวังที่สุด",en:"Main caution",zh:"最需留意",cn:"最需留意",vi:"Điểm cần lưu ý nhất",ja:"最大の注意点",ko:"가장 주의할 점",ru:"Главный риск",es:"Mayor cuidado"},
    work:{th:"งานที่เหมาะ",en:"Suitable work",zh:"適合工作",cn:"适合工作",vi:"Công việc hợp",ja:"向く仕事",ko:"맞는 일",ru:"Подходящая работа",es:"Trabajo adecuado"},
    money:{th:"วิธีหาเงินที่เหมาะ",en:"Money style",zh:"財路方式",cn:"财路方式",vi:"Cách kiếm tiền hợp",ja:"合う稼ぎ方",ko:"맞는 돈 버는 방식",ru:"Способ заработка",es:"Forma adecuada de ganar dinero"},
    love:{th:"ความรักควรปรับตรงไหน",en:"Love adjustment",zh:"感情調整",cn:"感情调整",vi:"Điều chỉnh tình cảm",ja:"恋愛で整える点",ko:"관계에서 조정할 점",ru:"Что настроить в отношениях",es:"Ajuste en el amor"},
    adv3:{th:"คำแนะนำ 3 ข้อ",en:"3 practical steps",zh:"三點建議",cn:"三点建议",vi:"3 lời khuyên",ja:"3つの助言",ko:"실천 조언 3가지",ru:"3 практических шага",es:"3 consejos prácticos"},
    sifuSum:{th:"สรุปซินแส",en:"Sifu summary",zh:"師傅總結",cn:"师傅总结",vi:"Tổng kết của thầy",ja:"師傅のまとめ",ko:"스승 요약",ru:"Итог мастера",es:"Resumen del maestro"}
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
      var key = el.getAttribute("data-i18n");
      var v = I18N[key] || (window.HK_I18N && window.HK_I18N[key]);
      if (v) el.textContent = pick(v, lang);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var v = I18N[el.getAttribute("data-i18n-placeholder")];
      if (v) el.setAttribute("placeholder", pick(v, lang));
    });
    if (curResult) renderResult(curResult); // re-render dynamic ถ้าเปลี่ยนภาษาหลังอ่าน
  }

  /* ── state ── */
  var $ = function (id) { return document.getElementById(id); };
  var imgs = { left: null, right: null, closeups: [] }; // File objects (ในเครื่อง ไม่อัปถาวร)
  var profileCtx = { gender: "", birthDate: "" }; // login แล้ว auto จาก /api/profile (วันเกิด/เพศ)
  var curResult = null, pendingReshoot = null, progTimer = null;
  // เผยแพร่ curResult ให้ script ภายนอก (Export สรุป PDF ด้วย AI · inputs.palm) อ่านได้ · read-only getter
  window.hkPalmGetResult = function () { return curResult; };

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
    fd.append("dominant_hand", ($("dominantHand") && $("dominantHand").value) || "unknown");
    fd.append("age_range", (($("ageRange") && $("ageRange").value) || "").slice(0, 40));
    fd.append("question", (($("mainQuestion") && $("mainQuestion").value) || "").slice(0, 180));
    if (profileCtx.gender) fd.append("gender", profileCtx.gender);
    if (profileCtx.birthDate) fd.append("birth_date", profileCtx.birthDate);
    if (imgs.left) { fd.append("images", imgs.left); fd.append("roles", "left"); fd.append("targets", "undefined"); fd.append("hands", "left"); }
    if (imgs.right) { fd.append("images", imgs.right); fd.append("roles", "right"); fd.append("targets", "undefined"); fd.append("hands", "right"); }
    imgs.closeups.forEach(function (c) { fd.append("images", c.file); fd.append("roles", "closeup"); fd.append("targets", c.target || "undefined"); fd.append("hands", c.hand || "unknown"); });
    return fd;
  }
  /* ── async job (r479): งานอ่านวิ่งต่อฝั่ง server แม้ user พับจอ/ปิดแอป ──
   * POST /api/palmistry/read → {job_id} → เก็บ localStorage → poll GET /api/palmistry/job ทุก 3 วิ
   * เปิดหน้าใหม่/พับจอกลับมา → resume poll ต่อจาก localStorage (ไม่เกิน ~25 นาที) */
  var PALM_JOB_LS = "hk_palm_job";
  var PALM_JOB_TTL = 25 * 60 * 1000; // ต้องตรงกับ recovery ฝั่ง server (25 นาที)
  var pollTimer = null;
  function saveJobLS(id) { try { localStorage.setItem(PALM_JOB_LS, JSON.stringify({ id: id, ts: Date.now() })); } catch (e) {} }
  function clearJobLS() { try { localStorage.removeItem(PALM_JOB_LS); } catch (e) {} }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function pollPalmJob(jobId) {
    stopPoll();
    var startTs = Date.now();
    function tick() {
      if (Date.now() - startTs > PALM_JOB_TTL) { stopPoll(); clearJobLS(); stopProgress(false); onError({ error: "timeout" }); return; }
      fetch("/api/palmistry/job?id=" + encodeURIComponent(jobId), { credentials: "include", cache: "no-store" })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
        .then(function (res) {
          var j = res.j || {};
          if (res.status === 404 || res.status === 403) { stopPoll(); clearJobLS(); stopProgress(false); onError(j); return; }
          if (j.status === "running") return; // ยังอ่านอยู่ · progress เดินต่อ
          if (j.status === "done") { stopPoll(); clearJobLS(); stopProgress(true); setTimeout(function () { onResult(j); }, 350); return; }
          if (j.status === "error") { stopPoll(); clearJobLS(); stopProgress(false); onError(j); return; }
          // สถานะไม่รู้จัก → poll ต่อเงียบ ๆ
        })
        .catch(function () { /* network แวบ · งานยังวิ่งบน server → poll ต่อ */ });
    }
    tick();
    pollTimer = setInterval(tick, 3000);
  }

  /* resume: เปิดหน้า/พับจอกลับมา แล้วมีงานค้างใน localStorage → poll ต่อทันที */
  function resumePalmJob() {
    var raw; try { raw = localStorage.getItem(PALM_JOB_LS); } catch (e) { return; }
    if (!raw) return;
    var o; try { o = JSON.parse(raw); } catch (e) { clearJobLS(); return; }
    if (!o || !o.id || !o.ts || (Date.now() - o.ts > PALM_JOB_TTL)) { clearJobLS(); return; }
    show("stAnalyzing"); startProgress(); pollPalmJob(o.id);
  }

  function analyze() {
    show("stAnalyzing");
    startProgress();
    fetch("/api/palmistry/read", { method: "POST", body: buildForm(), credentials: "include" })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.j.ok || !res.j.job_id) { stopProgress(false); return onError(res.j); }
        saveJobLS(res.j.job_id); // งานวิ่งบน server แล้ว · เก็บ id ไว้ resume ตอนพับจอ
        pollPalmJob(res.j.job_id);
      })
      .catch(function () { stopProgress(false); onError({ error: "network" }); });
  }
  function onError(j) {
    var lang = getLang();
    if (j && j.error === "auth_required") { location.href = "/signup?tab=login&next=/palmistry"; return; }
    var msg = (j && j.error === "parse_failed") ? pick(MSG.errBlur, lang)
      : (j && j.error === "insufficient_hours") ? pick({th:"ยามไม่พอสำหรับเริ่มอ่านลายมือ",en:"Not enough credits to start the palm reading",zh:"時額不足，無法開始手相解讀",cn:"时额不足，无法开始手相解读",vi:"Không đủ lượt để bắt đầu xem tay",ja:"手相鑑定を開始するクレジットが不足しています",ko:"손금 판독을 시작할 크레딧이 부족합니다",ru:"Недостаточно единиц для чтения руки",es:"No hay créditos suficientes para iniciar la lectura"}, lang)
      : (j && j.message) ? j.message : pick(MSG.errNet, lang);
    show("stUpload");
    var box = $("stUpload"); var old = box.querySelector(".err"); if (old) old.remove();
    var d = document.createElement("div"); d.className = "err"; d.textContent = "⚠ " + msg;
    box.insertBefore(d, box.firstChild.nextSibling);
  }
  function onResult(j) {
    curResult = j;
    var reshoot = (j.reshoot || []);
    var needsBetter = !!(j.needs_better_photo || (j.reading && j.reading.needs_better_photo));
    if (reshoot.length && !needsBetter && j.reading) { pendingReshoot = j; renderReshoot(j); show("stReshoot"); }
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
      var handTxt = (rs.hand === "left" || rs.hand === "right") ? ' · <i class="rs-hand">' + t("up." + rs.hand) + '</i>' : "";
      card.innerHTML = '<div class="rs-ic">🔍</div><div><b>' + (rs.region || pick(L.nm || {}, lang)) + handTxt + '</b><span>' + (rs.hint || "") + '</span></div><div class="rs-cam">📷</div>';
      card.addEventListener("click", function () { captureCloseup(rs.target, rs.hand, card); });
      card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); captureCloseup(rs.target, rs.hand, card); } });
      rb.appendChild(card);
    });
  }
  function captureCloseup(target, hand, card) {
    var f = $("fileClose");
    f.onchange = function () {
      if (!f.files || !f.files[0]) return;
      imgs.closeups.push({ file: f.files[0], target: target, hand: (hand === "left" || hand === "right") ? hand : "unknown" });
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

    renderSifu(rd.sifu_reading || j.sifu_reading);

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
  function renderSifu(sifu) {
    var lang = getLang();
    var box = $("sifuBox");
    if (!box) return;
    box.innerHTML = "";
    if (!sifu) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    if (sifu.opening) {
      var open = document.createElement("div");
      open.className = "sifu-card sifu-open";
      open.textContent = sifu.opening;
      box.appendChild(open);
    }
    var ov = (sifu.overview_3_lines && typeof sifu.overview_3_lines === "object") ? sifu.overview_3_lines : {};
    if (ov.identity || ov.strength || ov.caution) {
      var card = document.createElement("div");
      card.className = "sifu-card overview";
      card.innerHTML = [
        ov.identity ? '<div class="ovline"><b>1.</b> ' + esc(ov.identity) + '</div>' : "",
        ov.strength ? '<div class="ovline"><b>2.</b> ' + esc(ov.strength) + '</div>' : "",
        ov.caution ? '<div class="ovline"><b>3.</b> ' + esc(ov.caution) + '</div>' : "",
      ].join("");
      box.appendChild(card);
    }
    var sections = Array.isArray(sifu.sections) ? sifu.sections : [];
    sections.forEach(function (sec) {
      var card = document.createElement("div");
      var conf = ["high", "medium", "low"].indexOf(sec.confidence) !== -1 ? sec.confidence : "medium";
      card.className = "sifu-card ssec";
      card.innerHTML =
        '<h3>' + esc(sec.title || "") + '<span class="confidence ' + conf + '">' + esc(conf) + '</span></h3>' +
        rowHtml("seen", sec.seen) +
        rowHtml("meaning", sec.meaning) +
        rowHtml("advice", sec.advice);
      box.appendChild(card);
    });
    var fin = (sifu.final_summary && typeof sifu.final_summary === "object") ? sifu.final_summary : {};
    if (Object.keys(fin).length) {
      var f = document.createElement("div");
      f.className = "sifu-card sfinal";
      var advice = Array.isArray(fin.advice_3) ? fin.advice_3 : [];
      f.innerHTML =
        '<div class="ctx-title">' + esc(pick(MSG.final, lang)) + '</div>' +
        sumLine("best", fin.best_strength) +
        sumLine("risk", fin.main_risk) +
        sumLine("work", fin.suitable_work) +
        sumLine("money", fin.money_style) +
        sumLine("love", fin.love_adjustment) +
        (advice.length ? '<div class="sumline"><b>' + esc(pick(MSG.adv3, lang)) + '</b><ul>' + advice.slice(0, 3).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join("") + '</ul></div>' : "") +
        sumLine("sifuSum", fin.sifu_summary);
      box.appendChild(f);
    }
  }
  function rowHtml(k, v) {
    if (!v) return "";
    return '<div class="srow"><b>' + esc(pick(MSG[k], getLang())) + ":</b> " + esc(v) + '</div>';
  }
  function sumLine(k, v) {
    if (!v) return "";
    return '<div class="sumline"><b>' + esc(pick(MSG[k], getLang())) + ":</b> " + esc(v) + '</div>';
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

  /* ── ดาวน์โหลด PDF (ยกเลย์เอาต์ + รูป SVG ฝ่ามือจาก mockup /export-preview · ครบทุก section ไม่ตัด) ── */
  /* ภาพวาดฝ่ามือ 4 เส้น (ยกจาก mockup P2 · self-contained · ไม่ใช่รูปถ่ายจริง) */
  var PALM_SVG_MAIN =
    '<svg viewBox="0 0 220 250" width="200" role="img" aria-label="palm lines">' +
    '<path d="M40 250 C25 210 24 150 34 120 C22 118 16 96 26 92 C34 88 44 100 48 112 L48 60 C48 52 60 52 60 60 L62 108 L70 46 C70 38 82 38 82 46 L82 106 L92 40 C92 32 104 32 104 40 L102 108 L114 52 C114 44 126 44 126 52 L120 116 C140 120 150 150 148 190 C147 220 140 240 128 250 Z" fill="#fbf6ea" stroke="#d8caa4" stroke-width="2"/>' +
    '<path d="M52 108 C60 140 66 175 84 208" fill="none" stroke="#5a8a48" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path d="M52 128 C80 138 108 140 132 132" fill="none" stroke="#8a6d2a" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path d="M56 112 C84 100 112 100 138 110" fill="none" stroke="#b03a2e" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path d="M96 232 C94 190 96 150 98 122" fill="none" stroke="#4a6f8a" stroke-width="3.5" stroke-linecap="round"/>' +
    '<g font-size="9.5"><text x="150" y="112" fill="#b03a2e">❤ 感情</text><text x="150" y="134" fill="#8a6d2a">🧠 智慧</text><text x="150" y="200" fill="#5a8a48">🌿 生命</text><text x="150" y="230" fill="#4a6f8a">⭐ 事業</text></g>' +
    '</svg>';
  /* เส้นหลัก 4 เส้น + ความชัด (ยกจาก mockup P5) */
  var PALM_SVG_LINES =
    '<svg viewBox="0 0 300 170" width="300" role="img" aria-label="4 palm lines coverage">' +
    '<rect x="60" y="10" width="180" height="150" rx="30" fill="#fbf6ea" stroke="#d8caa4" stroke-width="2"/>' +
    '<path d="M80 40 C95 90 100 130 130 155" fill="none" stroke="#5a8a48" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M78 70 C120 82 165 84 215 74" fill="none" stroke="#8a6d2a" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M84 46 C130 30 180 30 220 44" fill="none" stroke="#b03a2e" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M150 155 C148 110 152 70 156 40" fill="none" stroke="#4a6f8a" stroke-width="4" stroke-linecap="round" stroke-dasharray="7 4"/>' +
    '<g font-size="10"><circle cx="20" cy="30" r="5" fill="#5a8a48"/><text x="30" y="34" fill="#3a3730">生命</text>' +
    '<circle cx="20" cy="52" r="5" fill="#8a6d2a"/><text x="30" y="56" fill="#3a3730">智慧</text>' +
    '<circle cx="20" cy="74" r="5" fill="#b03a2e"/><text x="30" y="78" fill="#3a3730">感情</text>' +
    '<circle cx="20" cy="96" r="5" fill="#4a6f8a"/><text x="30" y="100" fill="#3a3730">事業</text></g>' +
    '</svg>';
  var PDFTXT = {
    kick:{th:"ศาสตร์ที่ 7 · ลายมือหลอมรวม",en:"7th art · fused palmistry",zh:"第七術 · 融合手相"},
    title:{th:"คำอ่านลายมือ",en:"Palm reading",zh:"手相解讀"},
    docT:{th:"คำอ่านลายมือ",en:"Palm reading",zh:"手相解讀"},
    meta:{th:"อ่านตามคัมภีร์ต้นฉบับ 3 สาย<br>จีน 神相全編 · อินเดีย Samudrika · ตะวันตก Cheiro / Benham",en:"Read from 3 canonical schools<br>China 神相全編 · India Samudrika · West Cheiro / Benham",zh:"依三大原典解讀<br>中國 神相全編 · 印度 Samudrika · 西方 Cheiro / Benham"},
    badge:{th:"อ่านครบทั้ง 3 สาย",en:"read across all 3 schools",zh:"三派完整解讀"},
    clarity:{th:"ความชัดภาพรวม",en:"Image clarity",zh:"影像清晰度"},
    privacy:{th:"🔒 ไม่มีภาพฝ่ามือในเอกสาร (ความเป็นส่วนตัว) — เก็บเฉพาะคำอ่าน",en:"🔒 No palm photo in this document (privacy) — reading only",zh:"🔒 文件不含手掌照片（隱私）— 僅保留解讀"},
    capMain:{th:"ภาพวาดประกอบ · เส้นหลัก 4 เส้น: ชีวิต/สมอง/ใจ/วาสนา (ไม่ใช่รูปถ่ายจริง)",en:"Illustration · 4 main lines: life/head/heart/fate (not a real photo)",zh:"示意圖 · 四大主線：生命/智慧/感情/事業（非實照）"},
    capLines:{th:"เส้นหลัก 4 เส้นบนฝ่ามือ · เส้นประ = เห็นบางส่วน",en:"4 main palm lines · dashed = partially seen",zh:"手掌四大主線 · 虛線＝部分可見"},
    line:{th:"เส้น",en:"Line",zh:"線"},
    zh:{th:"อักษร",en:"字",zh:"字"},
    clear:{th:"ความชัด",en:"Clarity",zh:"清晰度"},
    obs:{th:"สิ่งที่เห็น",en:"Observation",zh:"所見"},
    identity:{th:"ตัวตนหลัก",en:"Identity",zh:"核心自我"},
    strength:{th:"จุดแข็ง",en:"Strength",zh:"優勢"},
    caution:{th:"จุดควรระวัง",en:"Caution",zh:"留意"}
  };
  var CONF = {
    high:{th:"มั่นใจสูง",en:"high confidence",zh:"高信心"},
    medium:{th:"มั่นใจปานกลาง",en:"medium confidence",zh:"中信心"},
    low:{th:"มั่นใจต่ำ",en:"low confidence",zh:"低信心"}
  };
  function whoLine(lang) {
    var parts = [];
    var sel = $("saveProfile");
    if (sel && sel.options.length && sel.selectedIndex >= 0) {
      var nm = String(sel.options[sel.selectedIndex].textContent || "").replace(/\s*⭐\s*$/, "").trim();
      if (nm && nm !== "—") parts.push(nm);
    }
    if (profileCtx.gender) parts.push(profileCtx.gender === "F" ? pick({ th: "หญิง", en: "female", zh: "女" }, lang) : pick({ th: "ชาย", en: "male", zh: "男" }, lang));
    return parts.join(" · ");
  }
  function exportPalmPdf() {
    if (!window.HKPrint || !curResult) return;
    var lang = getLang();
    var HP = window.HKPrint, E = HP.esc;
    var PL = function (k) { return pick(PDFTXT[k], lang); };
    var LB = function (k) { return pick(MSG[k], lang); };
    var rd = curResult.reading || {};
    var sifu = rd.sifu_reading || curResult.sifu_reading || {};
    var uni = (rd.reading && rd.reading.universal) || rd.universal || [];
    var per = (rd.reading && rd.reading.per_school) || rd.per_school || [];
    var lines = rd.lines || [];
    var secs = Array.isArray(sifu.sections) ? sifu.sections : [];
    var clar = curResult.clarity_overall != null ? curResult.clarity_overall : "";

    function fig(svg, cap) { return '<div class="fig">' + svg + (cap ? '<div class="cap">' + E(cap) + "</div>" : "") + "</div>"; }
    function sumGrid(items) {
      var body = items.filter(function (x) { return x[1]; }).map(function (x) {
        return '<div class="x"><span class="l">' + E(x[0]) + "</span>" + E(x[1]) + "</div>";
      }).join("");
      return body ? '<div class="hkp-sum">' + body + "</div>" : "";
    }
    function secCard(sec) {
      var conf = sec.confidence ? pick(CONF[sec.confidence] || {}, lang) : "";
      var body =
        (sec.seen ? "<p><b>" + LB("seen") + ":</b> " + E(sec.seen) + "</p>" : "") +
        (sec.meaning ? "<p><b>" + LB("meaning") + ":</b> " + E(sec.meaning) + "</p>" : "") +
        (sec.advice ? "<p><b>" + LB("advice") + ":</b> " + E(sec.advice) + "</p>" : "");
      return HP.card(sec.title || "", body, conf);
    }

    var pages = [];
    /* PAGE 1: แก่นสากล + ภาพฝ่ามือ + ภาพรวม 3 บรรทัด + section แรก ๆ */
    var p1 = [];
    p1.push(HP.section(LB("t1"), fig(PALM_SVG_MAIN, PL("capMain"))));
    var vtext = (uni[0] && (uni[0].text || uni[0].title)) || rd.summary || curResult.reading && curResult.reading.summary || "";
    if (vtext) p1.push(HP.verdict(LB("t1"), vtext));
    uni.slice(1).forEach(function (u) {
      if (u && (u.text || u.title)) p1.push(HP.card(u.title || "", "<p>" + E(u.text || "") + "</p>" + (u.canon ? "<p><b>" + E(u.canon) + "</b></p>" : "")));
    });
    var ov = (sifu.overview_3_lines && typeof sifu.overview_3_lines === "object") ? sifu.overview_3_lines : {};
    var ovGrid = sumGrid([[PL("identity"), ov.identity], [PL("strength"), ov.strength], [PL("caution"), ov.caution]]);
    if (ovGrid) p1.push(ovGrid);
    if (sifu.opening) p1.push(HP.card("", "<p>" + E(sifu.opening) + "</p>"));
    secs.slice(0, 2).forEach(function (s) { p1.push(secCard(s)); });
    pages.push({ sections: p1 });
    /* PAGES: section ที่เหลือ (A–H) กลุ่มละ 3 */
    var rest = secs.slice(2);
    for (var i = 0; i < rest.length; i += 3) {
      pages.push({ sections: rest.slice(i, i + 3).map(secCard) });
    }
    /* PAGE: 3 สาย + ตารางเส้น 4 เส้น */
    var p3 = [];
    if (per.length) {
      p3.push(HP.section(LB("t3")));
      per.forEach(function (ps) {
        var school = pick(MSG.school[ps.school] || {}, lang) || ps.school || "";
        var title = school + (ps.title ? " · " + ps.title : "");
        p3.push(HP.card(title, "<p>" + E(ps.text || "") + "</p>" + (ps.canon ? "<p><b>" + E(ps.canon) + "</b></p>" : "")));
      });
    }
    if (lines.length) {
      p3.push(HP.section(PL("line") + " 4", fig(PALM_SVG_LINES, PL("capLines"))));
      var rows = lines.map(function (ln) {
        var L = LINE[ln.key] || {};
        var nm = pick(L.nm || {}, lang) || ln.key;
        var st = pick(STCLAR[ln.clarity] || STCLAR.clear, lang);
        return "<tr><td>" + E(nm) + "</td><td>" + E(L.cn2 || "") + "</td><td>" + E(st) + "</td><td>" + E(ln.observation || "") + "</td></tr>";
      }).join("");
      p3.push('<table><thead><tr><th>' + PL("line") + "</th><th>" + PL("zh") + "</th><th>" + PL("clear") + "</th><th>" + PL("obs") + "</th></tr></thead><tbody>" + rows + "</tbody></table>");
    }
    if (p3.length) pages.push({ sections: p3 });
    /* PAGE: สรุปท้าย 7 ช่อง */
    var fin = (sifu.final_summary && typeof sifu.final_summary === "object") ? sifu.final_summary : {};
    if (Object.keys(fin).length) {
      var pf = [];
      pf.push(HP.section(LB("final")));
      pf.push(sumGrid([[LB("best"), fin.best_strength], [LB("risk"), fin.main_risk], [LB("work"), fin.suitable_work], [LB("money"), fin.money_style], [LB("love"), fin.love_adjustment]]));
      if (Array.isArray(fin.advice_3) && fin.advice_3.length) {
        pf.push(HP.card(LB("adv3"), "<ol>" + fin.advice_3.slice(0, 3).map(function (a) { return "<li>" + E(a) + "</li>"; }).join("") + "</ol>"));
      }
      if (fin.sifu_summary) pf.push(HP.verdict(LB("sifuSum"), fin.sifu_summary));
      pages.push({ sections: pf });
    }

    var who = whoLine(lang);
    HP.open({
      docTitle: "hourkey-" + PL("docT") + (who ? "-" + who : ""),
      headTitle: who || PL("title"),
      cover: {
        kick: PL("kick"),
        title: PL("title"),
        who: who,
        metaHtml: PL("meta"),
        badge: "✓ " + PL("clarity") + (clar !== "" ? " " + clar + "%" : "") + " · " + PL("badge"),
        sub: PL("privacy"),
        qrLabel: "hourkey.io"
      },
      pages: pages
    });
  }

  /* ── ประวัติลายมือของดวงที่เลือก (เพิ่ม/ลบได้ในหน้านี้) ── */
  function fmtDate(s) { try { return new Date(s).toLocaleDateString(getLang() === "th" ? "th-TH" : undefined); } catch (e) { return String(s).slice(0, 10); } }
  function loadPalmHistory(pid) {
    var box = $("palmHistory"); if (!box) return;
    fetch("/api/palmistry/list" + (pid ? "?profile_id=" + encodeURIComponent(pid) : ""), { credentials: "include", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var rs = (j && j.ok && j.readings) || [];
        if (!rs.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
        box.classList.remove("hidden");
        box.innerHTML = '<div class="ph-title">' + t("palm.hist.title") + " (" + rs.length + ")</div>";
        rs.forEach(function (it) {
          var row = document.createElement("div"); row.className = "ph-item";
          var info = document.createElement("span");
          info.textContent = fmtDate(it.created_at) + (it.clarity != null ? " · " + it.clarity + "%" : "") + (it.engine ? " · " + it.engine : "");
          var del = document.createElement("button"); del.className = "ph-del"; del.type = "button"; del.textContent = "🗑";
          del.setAttribute("aria-label", t("palm.hist.delete"));
          del.onclick = function () { if (window.confirm(t("palm.del.confirm"))) deletePalm(it.id, pid); };
          row.appendChild(info); row.appendChild(del); box.appendChild(row);
        });
      })
      .catch(function () {});
  }
  function deletePalm(id, pid) {
    fetch("/api/palmistry/" + encodeURIComponent(id), { method: "DELETE", credentials: "include" })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok) loadPalmHistory(pid); })
      .catch(function () {});
  }

  /* ── save (Phase 3) ── */
  function save() {
    var btn = $("btnSave"); btn.disabled = true;
    fetch("/api/palmistry/save", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang: getLang(), reading: curResult && curResult.reading, clarity: curResult && curResult.clarity_overall, engine: curResult && curResult.engine, profile_id: ($("saveProfile") && $("saveProfile").value) || undefined }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.ok) {
          btn.textContent = pick(MSG.saved, getLang());
          loadPalmHistory($("saveProfile") && $("saveProfile").value); // refresh หลังเพิ่ม
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
    stopPoll(); clearJobLS(); // ยกเลิก poll งานเก่า + ล้าง resume (เริ่มใหม่)
    imgs = { left: null, right: null, closeups: [] }; curResult = null; pendingReshoot = null;
    ["handL", "handR"].forEach(function (h) { var el = $(h); var p = el.querySelector("img.prev"); if (p) p.remove(); el.classList.remove("done"); var c = el.querySelector(".cam"); if (c) applyI18N(); });
    $("fileL").value = ""; $("fileR").value = "";
    $("btnAnalyze").disabled = true;
    var bs = $("btnSave"); if (bs) bs.disabled = false; // คืนปุ่มบันทึก (กันบันทึกครั้งที่ 2 ไม่ได้)
    var gf = document.getElementById("goFusion"); if (gf) gf.remove(); // ลบลิงก์ดูดวงรวมเก่า
    var ph = $("palmHistory"); if (ph) { ph.classList.add("hidden"); ph.innerHTML = ""; }
    var er = $("stUpload").querySelector(".err"); if (er) er.remove();
    show("stUpload"); applyI18N();
  }

  /* ── init ── */
  /* login แล้ว → ดึงวันเกิด/เพศ/อายุ จากโปรไฟล์ ให้ AI (ไม่ต้องกรอกอายุเอง) */
  function prefillFromProfile() {
    fetch("/api/profile", { credentials: "include", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var p = j && j.active_profile;
        if (!p) { var sf = $("saveProfile"); if (sf && sf.closest(".field")) sf.closest(".field").style.display = "none"; return; } // guest: ซ่อน dropdown ว่าง
        if (p.gender) { var g = String(p.gender).trim().toUpperCase().charAt(0); profileCtx.gender = (g === "F" ? "F" : "M"); }
        if (p.birth_datetime) {
          profileCtx.birthDate = String(p.birth_datetime).slice(0, 10);
          var by = parseInt(profileCtx.birthDate.slice(0, 4), 10);
          var ar = $("ageRange");
          if (by && ar && !ar.value) ar.value = String(new Date().getFullYear() - by); // อายุ auto
        }
        var badge = $("profBadge");
        if (badge && (profileCtx.gender || profileCtx.birthDate)) {
          badge.textContent = "✓ " + t("ctx.fromProfile") + (p.name ? " · " + p.name : "");
          badge.classList.remove("hidden");
        }
        // เติม dropdown เลือกดวงปลายทางตอนบันทึก (ดูให้คนอื่นได้) · default = ตัวเอง
        var sel = $("saveProfile");
        if (sel && Array.isArray(j.profiles)) {
          sel.innerHTML = "";
          j.profiles.forEach(function (pr) {
            var o = document.createElement("option");
            o.value = pr.id;
            o.textContent = (pr.name || pr.nickname || "—") + (pr.is_self ? " ⭐" : "");
            if (pr.id === p.id) o.selected = true;
            sel.appendChild(o);
          });
          sel.onchange = function () { loadPalmHistory(sel.value); };
          loadPalmHistory(sel.value); // แสดงลายมือเก่าของดวงที่เลือก (default = ตัวเอง)
        }
      })
      .catch(function () {});
  }
  function init() {
    prefillFromProfile();
    wireHand("handL", "fileL", "left");
    wireHand("handR", "fileR", "right");
    $("btnAnalyze").addEventListener("click", analyze);
    $("btnReanalyze").addEventListener("click", function () { analyze(); });
    $("btnSkip").addEventListener("click", function () { if (pendingReshoot) { renderResult(pendingReshoot); show("stResult"); } });
    $("btnSave").addEventListener("click", save);
    $("btnRestart").addEventListener("click", restart);
    var pdfBtn = $("btnPalmPdf"); if (pdfBtn) pdfBtn.addEventListener("click", exportPalmPdf);
    applyI18N();
    resumePalmJob(); // r479: มีงานอ่านค้าง (พับจอ/ปิดแอป) → poll ต่อทันที
    // sync ภาษาเมื่อเปลี่ยนจาก user-menu (same tab: poll · other tab: storage)
    var last = getLang();
    setInterval(function () { var c = getLang(); if (c !== last) { last = c; applyI18N(); } }, 700);
    window.addEventListener("storage", function (e) { if (e.key === "hk_locale" || e.key === "hk_lang") applyI18N(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
