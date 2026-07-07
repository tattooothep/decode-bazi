(function () {
  'use strict';

  const LANGS = ['th', 'en', 'zh', 'vi', 'ja', 'ko', 'ru', 'es'];
  const SUPPORTED_LANGS = ['th', 'en', 'zh', 'cn', 'vi', 'ja', 'ko', 'ru', 'es'];
  const HTML_LANG = { th: 'th', en: 'en', zh: 'zh-Hant', cn: 'zh-Hans', vi: 'vi', ja: 'ja', ko: 'ko', ru: 'ru', es: 'es' };
  const LIVE_GLOBAL_LANGS = ['th', 'en', 'zh'];
  const LANDING_STORAGE_KEY = 'hk_landing_locale';
  const GLOBAL_STORAGE_KEYS = ['hk_locale', 'hk_lang'];

  const META = {
    th: {
      title: 'Hourkey | ระบบวิเคราะห์ดวงจีนเพื่อการตัดสินใจ',
      description: 'Hourkey ผูกวันเวลาเกิด ฤกษ์ ทิศ พื้นที่ และบริบทคำถามเข้าด้วยกัน แล้วให้ AI Sifu สรุปเป็นคำตอบที่ตรวจสอบเหตุผลและนำไปใช้ต่อได้',
      og: 'จากวันเวลาเกิด ฤกษ์ ทิศ และบริบทจริง สู่คำตอบเดียวที่ใช้วางแผนได้',
      twitter: 'AI Sifu ที่อ่านจากดวง เวลา ทิศ และบริบทจริงของคุณ',
    },
    en: {
      title: 'Hourkey | Chinese metaphysics for real decisions',
      description: 'Hourkey connects birth time, timing, direction, space, and question context so AI Sifu can return traceable answers you can act on.',
      og: 'From birth data, timing, direction, and real context to one decision-ready answer.',
      twitter: 'AI Sifu reads your chart, timing, direction, and real context together.',
    },
    zh: {
      title: 'Hourkey | 用中式命理輔助真實決策',
      description: 'Hourkey 把出生時間、擇日、方位、空間與問題背景連在一起，讓 AI Sifu 給出可追溯、可執行的答案。',
      og: '從出生資料、時機、方位與真實背景，整合成一個可用於決策的答案。',
      twitter: 'AI Sifu 會一起讀取你的命盤、時間、方位與真實背景。',
    },
    vi: {
      title: 'Hourkey | Huyền học Trung Hoa cho quyết định thật',
      description: 'Hourkey kết nối giờ sinh, thời điểm, phương hướng, không gian và bối cảnh câu hỏi để AI Sifu đưa ra câu trả lời có thể kiểm chứng.',
      og: 'Từ dữ liệu sinh, thời điểm, phương hướng và bối cảnh thật thành một câu trả lời để ra quyết định.',
      twitter: 'AI Sifu đọc lá số, thời điểm, phương hướng và bối cảnh thật của bạn cùng lúc.',
    },
    ja: {
      title: 'Hourkey | 中国命理を実際の意思決定へ',
      description: 'Hourkey は出生時刻、日取り、方位、空間、質問の背景を結び、AI Sifu が根拠を追える実用的な答えにまとめます。',
      og: '出生情報、時機、方位、現実の背景を一つの意思決定用の答えへ。',
      twitter: 'AI Sifu が命盤、時機、方位、現実の背景を合わせて読みます。',
    },
    ko: {
      title: 'Hourkey | 실제 결정을 위한 중국 명리 분석',
      description: 'Hourkey는 출생 시간, 택일, 방향, 공간, 질문 맥락을 연결해 AI Sifu가 근거를 확인할 수 있는 답을 제공합니다.',
      og: '출생 데이터, 시기, 방향, 실제 맥락을 하나의 실행 가능한 답으로 연결합니다.',
      twitter: 'AI Sifu가 명식, 시간, 방향, 실제 맥락을 함께 읽습니다.',
    },
    ru: {
      title: 'Hourkey | Китайская метафизика для реальных решений',
      description: 'Hourkey связывает время рождения, выбор даты, направление, пространство и контекст вопроса, чтобы AI Sifu давал проверяемый ответ.',
      og: 'Данные рождения, время, направление и реальный контекст собираются в один ответ для решения.',
      twitter: 'AI Sifu читает карту, время, направление и реальный контекст вместе.',
    },
    es: {
      title: 'Hourkey | Metafísica china para decisiones reales',
      description: 'Hourkey conecta hora de nacimiento, fecha, dirección, espacio y contexto para que AI Sifu entregue respuestas verificables y accionables.',
      og: 'Datos de nacimiento, momento, dirección y contexto real convertidos en una respuesta para decidir.',
      twitter: 'AI Sifu lee tu carta, el momento, la dirección y el contexto real juntos.',
    },
  };

  const ROWS = [
    [`Today`, `วันนี้`, `Today`, `今日`, `Hôm nay`, `今日`, `오늘`, `Сегодня`, `Hoy`],
    [`Network`, `เครือข่าย`, `Network`, `人脈`, `Mạng lưới`, `人脈`, `네트워크`, `Сеть`, `Red`],
    [`Picker`, `เลือกวัน`, `Picker`, `擇日`, `Chọn ngày`, `日取り`, `택일`, `Выбор даты`, `Selector`],
    [`01 · PROFILE`, `01 · โปรไฟล์`, `01 · Profile`, `01 · 命盤資料`, `01 · Hồ sơ`, `01 · プロフィール`, `01 · 프로필`, `01 · Профиль`, `01 · Perfil`],
    [`03 · Decision`, `03 · ตัดสินใจ`, `03 · Decision`, `03 · 決策`, `03 · Quyết định`, `03 · 判断`, `03 · 결정`, `03 · Решение`, `03 · Decisión`],
    [`decision support`, `ช่วยตัดสินใจ`, `decision support`, `輔助決策`, `hỗ trợ quyết định`, `判断補助`, `결정 보조`, `поддержка решения`, `apoyo a decisiones`],
    [`ภาษา`, `ภาษา`, `Language`, `語言`, `Ngôn ngữ`, `言語`, `언어`, `Язык`, `Idioma`],
    [`ข้ามไปเนื้อหา`, `ข้ามไปเนื้อหา`, `Skip to content`, `跳到內容`, `Bỏ qua đến nội dung`, `本文へ移動`, `본문으로 건너뛰기`, `К содержимому`, `Saltar al contenido`],
    [`เปิดเมนู`, `เปิดเมนู`, `Open menu`, `開啟選單`, `Mở menu`, `メニューを開く`, `메뉴 열기`, `Открыть меню`, `Abrir menú`],
    [`เริ่มจากคำถาม`, `เริ่มจากคำถาม`, `Start with a question`, `從問題開始`, `Bắt đầu từ câu hỏi`, `質問から始める`, `질문에서 시작`, `Начать с вопроса`, `Empezar con una pregunta`],
    [`คำตอบ`, `คำตอบ`, `Answer`, `答案`, `Câu trả lời`, `回答`, `답변`, `Ответ`, `Respuesta`],
    [`วิธีทำงาน`, `วิธีทำงาน`, `How it works`, `運作方式`, `Cách hoạt động`, `仕組み`, `작동 방식`, `Как это работает`, `Cómo funciona`],
    [`ฟีเจอร์`, `ฟีเจอร์`, `Features`, `功能`, `Tính năng`, `機能`, `기능`, `Функции`, `Funciones`],
    [`แพ็กเกจ`, `แพ็กเกจ`, `Plans`, `方案`, `Gói dịch vụ`, `料金プラン`, `요금제`, `Тарифы`, `Planes`],
    [`เข้าสู่ระบบ`, `เข้าสู่ระบบ`, `Log in`, `登入`, `Đăng nhập`, `ログイン`, `로그인`, `Войти`, `Iniciar sesión`],
    [`ตัวอย่างคำตอบ`, `ตัวอย่างคำตอบ`, `Sample answer`, `答案範例`, `Câu trả lời mẫu`, `回答例`, `답변 예시`, `Пример ответа`, `Respuesta de ejemplo`],
    [`เริ่มจากคำถามของฉัน`, `เริ่มจากคำถามของฉัน`, `Start with my question`, `從我的問題開始`, `Bắt đầu từ câu hỏi của tôi`, `自分の質問から始める`, `내 질문으로 시작`, `Начать с моего вопроса`, `Empezar con mi pregunta`],
    [`ระบบวิเคราะห์ดวงจีนที่รวมเวลา ทิศ พื้นที่ และบริบทชีวิตเป็นคำตอบเดียว`, `ระบบวิเคราะห์ดวงจีนที่รวมเวลา ทิศ พื้นที่ และบริบทชีวิตเป็นคำตอบเดียว`, `A Chinese metaphysics system that turns time, direction, space, and life context into one answer`, `把時間、方位、空間與人生背景整合成一個答案的中式命理系統`, `Hệ thống huyền học Trung Hoa gom thời gian, phương hướng, không gian và bối cảnh đời sống thành một câu trả lời`, `時間、方位、空間、人生背景を一つの答えに統合する中国命理システム`, `시간, 방향, 공간, 삶의 맥락을 하나의 답으로 묶는 중국 명리 시스템`, `Система китайской метафизики, которая объединяет время, направление, пространство и жизненный контекст в один ответ`, `Un sistema de metafísica china que une tiempo, dirección, espacio y contexto vital en una sola respuesta`],
    [`ถามเรื่องงาน ความสัมพันธ์ ฤกษ์ บ้าน ทิศ หรือจังหวะสำคัญ แล้วให้ AI Sifu อ่านจากชั้นข้อมูลที่ระบบคำนวณไว้ ไม่ใช่คำทำนายกว้าง ๆ`, `ถามเรื่องงาน ความสัมพันธ์ ฤกษ์ บ้าน ทิศ หรือจังหวะสำคัญ แล้วให้ AI Sifu อ่านจากชั้นข้อมูลที่ระบบคำนวณไว้ ไม่ใช่คำทำนายกว้าง ๆ`, `Ask about work, relationships, timing, home, directions, or important moments. AI Sifu reads from calculated data layers, not generic fortune text.`, `詢問工作、關係、擇日、住宅、方位或關鍵時機。AI Sifu 讀取系統計算出的資料層，而不是泛泛的預言。`, `Hỏi về công việc, quan hệ, ngày giờ, nhà cửa, phương hướng hoặc thời điểm quan trọng. AI Sifu đọc từ các lớp dữ liệu đã tính, không phải lời đoán chung chung.`, `仕事、人間関係、日取り、家、方位、大切なタイミングを質問できます。AI Sifu は計算済みのデータ層から読み、一般的な占い文では終わりません。`, `일, 관계, 택일, 집, 방향, 중요한 시기를 질문하세요. AI Sifu는 막연한 예언이 아니라 계산된 데이터 층을 읽습니다.`, `Задавайте вопросы о работе, отношениях, датах, доме, направлениях или важных моментах. AI Sifu читает расчётные слои данных, а не общие предсказания.`, `Pregunta sobre trabajo, relaciones, fechas, casa, direcciones o momentos importantes. AI Sifu lee capas calculadas de datos, no predicciones genéricas.`],
    [`ดูตัวอย่างคำตอบ`, `ดูตัวอย่างคำตอบ`, `View sample answer`, `查看答案範例`, `Xem câu trả lời mẫu`, `回答例を見る`, `답변 예시 보기`, `Смотреть пример`, `Ver ejemplo`],
    [`True Solar Time · ปรับเวลาเกิดตามพื้นที่จริง`, `True Solar Time · ปรับเวลาเกิดตามพื้นที่จริง`, `True Solar Time · birth time adjusted by real location`, `真太陽時 · 依實際地點校正出生時間`, `True Solar Time · chỉnh giờ sinh theo địa điểm thật`, `真太陽時 · 実際の場所で出生時刻を補正`, `진태양시 · 실제 위치로 출생 시간을 보정`, `Истинное солнечное время · коррекция рождения по реальному месту`, `Hora solar verdadera · hora natal ajustada por ubicación real`],
    [`用神 / 喜忌 · รู้ธาตุหนุนและควรเลี่ยง`, `用神 / 喜忌 · รู้ธาตุหนุนและควรเลี่ยง`, `Useful God / likes-dislikes · know what supports and what to avoid`, `用神 / 喜忌 · 看清助力與忌避`, `Dụng thần / hỷ kỵ · biết yếu tố hỗ trợ và cần tránh`, `用神 / 喜忌 · 支える要素と避ける要素を把握`, `용신 / 희기 · 돕는 요소와 피할 요소 파악`, `用神 / 喜忌 · что поддерживает и чего избегать`, `Dios útil / favorable y desfavorable · qué apoya y qué evitar`],
    [`Qi Men · อ่านจังหวะและทิศเฉพาะหน้า`, `Qi Men · อ่านจังหวะและทิศเฉพาะหน้า`, `Qi Men · read the timing and direction of the current situation`, `奇門 · 讀當下時機與方位`, `Qi Men · đọc thời điểm và phương hướng của tình huống hiện tại`, `奇門 · 目の前の時機と方位を読む`, `기문 · 현재 상황의 시기와 방향 읽기`, `Ци Мэнь · время и направление конкретной ситуации`, `Qi Men · lee el momento y la dirección de la situación actual`],
    [`ตัวอย่างคำตอบจากบริบทจริง`, `ตัวอย่างคำตอบจากบริบทจริง`, `Sample answer from real context`, `來自真實背景的答案範例`, `Câu trả lời mẫu từ bối cảnh thật`, `現実の背景から出した回答例`, `실제 맥락 기반 답변 예시`, `Пример ответа из реального контекста`, `Respuesta de ejemplo con contexto real`],
    [`traceable`, `ตรวจสอบได้`, `traceable`, `可追溯`, `có thể kiểm chứng`, `根拠を追跡`, `근거 추적`, `проверяемо`, `verificable`],
    [`Year`, `ปี`, `Year`, `年`, `Năm`, `年`, `년`, `Год`, `Año`],
    [`Month`, `เดือน`, `Month`, `月`, `Tháng`, `月`, `월`, `Месяц`, `Mes`],
    [`Day`, `วัน`, `Day`, `日`, `Ngày`, `日`, `일`, `День`, `Día`],
    [`Hour`, `ยาม`, `Hour`, `時`, `Giờ`, `時`, `시`, `Час`, `Hora`],
    [`สรุป: ทำได้ แต่ต้องเลือกจังหวะและวัสดุให้ถูก`, `สรุป: ทำได้ แต่ต้องเลือกจังหวะและวัสดุให้ถูก`, `Summary: possible, but timing and materials must be chosen correctly`, `結論：可以做，但時機與材料要選對`, `Tóm tắt: có thể làm, nhưng phải chọn đúng thời điểm và vật liệu`, `結論：可能。ただし時期と素材の選び方が重要`, `요약: 가능하지만 시기와 재료 선택이 중요`, `Итог: можно, но нужно правильно выбрать время и материалы`, `Resumen: se puede, pero hay que elegir bien el momento y los materiales`],
    [`ทิศนี้มีตัวหนุนเรื่องการใช้งานและการคุยงาน แต่มีปัจจัยดินที่ควรระบายก่อนลงมือ จึงควรใช้โลหะ/น้ำเป็นตัวปรับ และเลี่ยงช่วงไฟแรง`, `ทิศนี้มีตัวหนุนเรื่องการใช้งานและการคุยงาน แต่มีปัจจัยดินที่ควรระบายก่อนลงมือ จึงควรใช้โลหะ/น้ำเป็นตัวปรับ และเลี่ยงช่วงไฟแรง`, `This direction supports daily use and work discussions, but an earth factor should be drained first. Use metal/water as balancing elements and avoid strong fire periods.`, `此方位有利於使用與工作溝通，但有土性因素需先洩化。宜用金/水調整，避開火旺時段。`, `Hướng này hỗ trợ sinh hoạt và trao đổi công việc, nhưng có yếu tố Thổ cần tiết trước. Nên dùng Kim/Thủy để điều chỉnh và tránh thời điểm Hỏa mạnh.`, `この方位は日常利用や仕事の話し合いを支えますが、土の要素を先に流す必要があります。金/水で整え、火が強い時期は避けます。`, `이 방향은 사용성과 업무 대화에 도움이 되지만 먼저 흙 기운을 덜어야 합니다. 금/수로 조정하고 화가 강한 시기는 피하세요.`, `Это направление поддерживает использование и рабочие разговоры, но фактор земли нужно сначала ослабить. Используйте металл/воду для баланса и избегайте сильного огня.`, `Esta dirección favorece el uso diario y las conversaciones de trabajo, pero primero conviene drenar el factor tierra. Usa metal/agua como ajuste y evita periodos de fuego fuerte.`],
    [`Useful God: Wood`, `ธาตุใช้: ไม้`, `Useful God: Wood`, `用神：木`, `Dụng thần: Mộc`, `用神：木`, `용신: 목`, `Полезная стихия: дерево`, `Dios útil: madera`],
    [`Luopan: NW`, `หล่อแก: ตะวันตกเฉียงเหนือ`, `Luopan: NW`, `羅盤：西北`, `La bàn: Tây Bắc`, `羅盤：北西`, `나경: 북서`, `Лопань: северо-запад`, `Luopan: noroeste`],
    [`Timing: avoid fire day`, `เวลา: เลี่ยงวันไฟแรง`, `Timing: avoid fire day`, `擇時：避開火旺日`, `Thời điểm: tránh ngày Hỏa mạnh`, `時期：火が強い日を避ける`, `택일: 화가 강한 날 피하기`, `Время: избегать дней огня`, `Momento: evitar día de fuego`],
    [`เห็นเหตุผลของคำตอบ`, `เห็นเหตุผลของคำตอบ`, `See the reasoning behind the answer`, `看得到答案依據`, `Thấy được lý do của câu trả lời`, `答えの根拠が見える`, `답변의 근거 확인`, `Видна логика ответа`, `Ver la razón de la respuesta`],
    [`บอกว่าคำแนะนำอ้างอิงข้อมูลชั้นใด ไม่ใช่ตอบลอย ๆ`, `บอกว่าคำแนะนำอ้างอิงข้อมูลชั้นใด ไม่ใช่ตอบลอย ๆ`, `Shows which data layers support the advice, not a loose answer.`, `指出建議引用哪些資料層，而不是空泛回答。`, `Cho biết lời khuyên dựa trên lớp dữ liệu nào, không trả lời mơ hồ.`, `どのデータ層に基づく助言かを示します。`, `조언이 어떤 데이터 층에 근거하는지 보여줍니다.`, `Показывает, на каких слоях данных основан совет.`, `Muestra qué capas de datos sostienen el consejo.`],
    [`เริ่มจากคำถามจริง`, `เริ่มจากคำถามจริง`, `Start from a real question`, `從真實問題開始`, `Bắt đầu từ câu hỏi thật`, `現実の質問から始める`, `실제 질문에서 시작`, `Начинайте с реального вопроса`, `Empieza con una pregunta real`],
    [`เลือกเรื่องก่อน แล้วระบบค่อยดึงดวง เวลา ทิศ และบริบทที่เกี่ยวข้อง`, `เลือกเรื่องก่อน แล้วระบบค่อยดึงดวง เวลา ทิศ และบริบทที่เกี่ยวข้อง`, `Pick the topic first, then the system pulls the relevant chart, timing, direction, and context.`, `先選主題，系統再帶入相關命盤、時間、方位與背景。`, `Chọn chủ đề trước, hệ thống sẽ lấy lá số, thời điểm, phương hướng và bối cảnh liên quan.`, `先にテーマを選ぶと、関連する命盤、時期、方位、背景を読み込みます。`, `주제를 먼저 고르면 관련 명식, 시간, 방향, 맥락을 불러옵니다.`, `Сначала выберите тему, затем система подтянет карту, время, направление и контекст.`, `Elige el tema primero; el sistema trae carta, tiempo, dirección y contexto relevantes.`],
    [`บอกข้อจำกัดเมื่อข้อมูลไม่ครบ`, `บอกข้อจำกัดเมื่อข้อมูลไม่ครบ`, `Flags limits when data is incomplete`, `資料不完整時會標出限制`, `Báo giới hạn khi dữ liệu chưa đủ`, `情報不足時は限界を明示`, `정보가 부족하면 한계를 표시`, `Указывает ограничения при неполных данных`, `Indica límites cuando faltan datos`],
    [`ถ้าไม่มีเวลาเกิดหรือข้อมูลพื้นที่ คำตอบจะระบุความไม่แน่นอนให้รู้`, `ถ้าไม่มีเวลาเกิดหรือข้อมูลพื้นที่ คำตอบจะระบุความไม่แน่นอนให้รู้`, `If birth time or space data is missing, the answer states the uncertainty.`, `若缺出生時間或空間資料，答案會說明不確定性。`, `Nếu thiếu giờ sinh hoặc dữ liệu không gian, câu trả lời sẽ nêu mức bất định.`, `出生時刻や空間情報がない場合、不確実性を明示します。`, `출생 시간이나 공간 데이터가 없으면 불확실성을 표시합니다.`, `Если нет времени рождения или данных пространства, ответ укажет неопределённость.`, `Si falta hora de nacimiento o datos del espacio, la respuesta indica la incertidumbre.`],
    [`ใช้โปรไฟล์เดียวกันข้ามหน้า`, `ใช้โปรไฟล์เดียวกันข้ามหน้า`, `Use one profile across pages`, `跨頁使用同一個檔案`, `Dùng một hồ sơ trên nhiều trang`, `同じプロフィールを各ページで使用`, `하나의 프로필을 여러 페이지에서 사용`, `Один профиль на всех страницах`, `Un perfil en todas las páginas`],
    [`Chart, Timing, Luopan และ AI Sifu ไม่แยกกันเป็นคนละเรื่อง`, `Chart, Timing, Luopan และ AI Sifu ไม่แยกกันเป็นคนละเรื่อง`, `Chart, Timing, Luopan, and AI Sifu stay connected.`, `命盤、擇時、羅盤與 AI Sifu 互相連動。`, `Lá số, thời điểm, la bàn và AI Sifu được kết nối với nhau.`, `命盤、時機、羅盤、AI Sifu がつながります。`, `명반, 시기, 나경, AI Sifu가 연결됩니다.`, `Карта, время, лопань и AI Sifu работают как единый контекст.`, `Carta, momento, luopan y AI Sifu quedan conectados.`],
    [`ทางเข้าการวิเคราะห์`, `ทางเข้าการวิเคราะห์`, `Analysis entry points`, `分析入口`, `Lối vào phân tích`, `分析の入口`, `분석 시작점`, `Точки входа анализа`, `Entradas de análisis`],
    [`เริ่มจากเรื่องที่ต้องตัดสินใจ`, `เริ่มจากเรื่องที่ต้องตัดสินใจ`, `Start from the decision you need to make`, `從你要決定的事情開始`, `Bắt đầu từ việc bạn cần quyết định`, `決めたいことから始める`, `결정해야 할 일에서 시작`, `Начните с решения, которое нужно принять`, `Empieza por la decisión que necesitas tomar`],
    [`เลือกทางเข้าให้ตรงกับคำถาม ระบบจะดึงข้อมูลดวง เวลา ทิศ และบริบทที่เกี่ยวข้องไปให้ AI Sifu เอง`, `เลือกทางเข้าให้ตรงกับคำถาม ระบบจะดึงข้อมูลดวง เวลา ทิศ และบริบทที่เกี่ยวข้องไปให้ AI Sifu เอง`, `Choose the entry that matches your question. The system pulls the relevant chart, timing, direction, and context into AI Sifu.`, `選擇符合問題的入口，系統會把相關命盤、時間、方位與背景帶給 AI Sifu。`, `Chọn lối vào đúng với câu hỏi. Hệ thống tự đưa lá số, thời điểm, phương hướng và bối cảnh liên quan vào AI Sifu.`, `質問に合う入口を選ぶと、関連する命盤、時期、方位、背景が AI Sifu に渡されます。`, `질문에 맞는入口를 고르면 관련 명식, 시간, 방향, 맥락이 AI Sifu로 전달됩니다.`, `Выберите подходящий вход, и система передаст AI Sifu карту, время, направление и контекст.`, `Elige la entrada que corresponda a tu pregunta; el sistema lleva carta, tiempo, dirección y contexto a AI Sifu.`],
    [`ถาม AI Sifu`, `ถาม AI Sifu`, `Ask AI Sifu`, `詢問 AI Sifu`, `Hỏi AI Sifu`, `AI Sifu に質問`, `AI Sifu에게 질문`, `Спросить AI Sifu`, `Preguntar a AI Sifu`],
    [`ถามคำถามเฉพาะเรื่อง แล้วรับคำตอบที่อ้างอิงดวง เวลา ทิศ และบริบทของคุณ`, `ถามคำถามเฉพาะเรื่อง แล้วรับคำตอบที่อ้างอิงดวง เวลา ทิศ และบริบทของคุณ`, `Ask a specific question and get an answer grounded in your chart, timing, direction, and context.`, `提出具體問題，得到依據命盤、時間、方位與背景的答案。`, `Đặt câu hỏi cụ thể và nhận câu trả lời dựa trên lá số, thời điểm, phương hướng và bối cảnh của bạn.`, `具体的な質問に対し、命盤・時期・方位・背景に基づく答えを受け取れます。`, `구체적인 질문을 하면 명식, 시간, 방향, 맥락에 근거한 답을 받습니다.`, `Задайте конкретный вопрос и получите ответ на основе карты, времени, направления и контекста.`, `Haz una pregunta concreta y recibe una respuesta basada en tu carta, momento, dirección y contexto.`],
    [`เข้าไปถาม →`, `เข้าไปถาม →`, `Ask now →`, `前往提問 →`, `Vào hỏi →`, `質問する →`, `질문하기 →`, `Задать вопрос →`, `Preguntar →`],
    [`ดูวันนี้`, `ดูวันนี้`, `Today`, `看今日`, `Xem hôm nay`, `今日を見る`, `오늘 보기`, `Сегодня`, `Ver hoy`],
    [`ดูว่าวันนี้เหมาะกับงานแบบไหน ควรใช้จังหวะไหน และควรเลี่ยงอะไร`, `ดูว่าวันนี้เหมาะกับงานแบบไหน ควรใช้จังหวะไหน และควรเลี่ยงอะไร`, `See what today suits, when to act, and what to avoid.`, `查看今日適合什麼、何時行動、該避開什麼。`, `Xem hôm nay hợp việc gì, nên dùng thời điểm nào và tránh gì.`, `今日向いていること、動くべき時、避けることを確認。`, `오늘 맞는 일, 움직일 타이밍, 피할 것을 확인합니다.`, `Узнайте, для чего подходит день, когда действовать и чего избегать.`, `Ve qué conviene hoy, cuándo actuar y qué evitar.`],
    [`เปิดวันนี้ →`, `เปิดวันนี้ →`, `Open today →`, `打開今日 →`, `Mở hôm nay →`, `今日を開く →`, `오늘 열기 →`, `Открыть сегодня →`, `Abrir hoy →`],
    [`วางฤกษ์`, `วางฤกษ์`, `Pick timing`, `擇日擇時`, `Chọn ngày giờ`, `日取りを選ぶ`, `택일하기`, `Выбрать дату`, `Elegir fecha`],
    [`เลือกวันและช่วงเวลาที่สัมพันธ์กับงานสำคัญและดวงเจ้าของเรื่อง`, `เลือกวันและช่วงเวลาที่สัมพันธ์กับงานสำคัญและดวงเจ้าของเรื่อง`, `Choose dates and time windows that match the task and the owner’s chart.`, `選擇與重要事項及當事人命盤相合的日期與時段。`, `Chọn ngày và khung giờ phù hợp với việc quan trọng và lá số người liên quan.`, `重要な用件と本人の命盤に合う日付と時間帯を選びます。`, `중요한 일과 당사자의 명식에 맞는 날짜와 시간대를 고릅니다.`, `Подберите дату и время под задачу и карту человека.`, `Elige fechas y franjas horarias acordes al asunto y a la carta de la persona.`],
    [`เลือกวัน →`, `เลือกวัน →`, `Pick date →`, `選日期 →`, `Chọn ngày →`, `日付を選ぶ →`, `날짜 선택 →`, `Выбрать дату →`, `Elegir fecha →`],
    [`Luopan บ้านและทิศ`, `Luopan บ้านและทิศ`, `Luopan for home and direction`, `住宅與方位羅盤`, `Luopan cho nhà và phương hướng`, `家と方位の Luopan`, `집과 방향 Luopan`, `Лопань для дома и направлений`, `Luopan para casa y dirección`],
    [`อ่านทิศ บ้าน ห้อง ประตู โต๊ะ เตียง และจุดพลังในพื้นที่จริง`, `อ่านทิศ บ้าน ห้อง ประตู โต๊ะ เตียง และจุดพลังในพื้นที่จริง`, `Read directions, home, rooms, doors, desks, beds, and energy points in real space.`, `讀取實際空間中的方位、住宅、房間、門、桌、床與氣點。`, `Đọc hướng, nhà, phòng, cửa, bàn, giường và điểm năng lượng trong không gian thật.`, `実空間の方位、家、部屋、ドア、机、ベッド、気のポイントを読みます。`, `실제 공간의 방향, 집, 방, 문, 책상, 침대, 기운 지점을 읽습니다.`, `Анализ направлений, дома, комнат, дверей, стола, кровати и точек энергии.`, `Lee direcciones, casa, habitaciones, puertas, escritorio, cama y puntos de energía reales.`],
    [`เปิดเข็ม →`, `เปิดเข็ม →`, `Open compass →`, `開羅盤 →`, `Mở la bàn →`, `羅盤を開く →`, `나침반 열기 →`, `Открыть компас →`, `Abrir brújula →`],
    [`คนรอบตัว`, `คนรอบตัว`, `People around you`, `身邊的人`, `Người xung quanh`, `周りの人`, `주변 사람`, `Люди вокруг`, `Personas alrededor`],
    [`อ่านแรงหนุน แรงปะทะ และความเหมาะสมในการร่วมงานจากดวงสัมพันธ์`, `อ่านแรงหนุน แรงปะทะ และความเหมาะสมในการร่วมงานจากดวงสัมพันธ์`, `Read support, clashes, and collaboration fit from relationship charts.`, `從關係命盤讀支持、衝突與合作適配度。`, `Đọc lực hỗ trợ, xung khắc và độ phù hợp hợp tác từ lá số quan hệ.`, `関係の命盤から支え、衝突、協働の相性を読みます。`, `관계 명식에서 지원, 충돌, 협업 적합도를 읽습니다.`, `Считывает поддержку, столкновения и совместимость по картам отношений.`, `Lee apoyo, choques y encaje de colaboración desde cartas relacionales.`],
    [`ดูเครือข่าย →`, `ดูเครือข่าย →`, `View network →`, `看人脈 →`, `Xem mạng lưới →`, `ネットワークを見る →`, `네트워크 보기 →`, `Смотреть сеть →`, `Ver red →`],
    [`คำตอบจากบริบทจริง`, `คำตอบจากบริบทจริง`, `Answer from real context`, `來自真實背景的答案`, `Câu trả lời từ bối cảnh thật`, `現実の背景からの回答`, `실제 맥락 기반 답변`, `Ответ из реального контекста`, `Respuesta con contexto real`],
    [`คำถามเดียว ต้องได้คำตอบที่เอาไปใช้ได้`, `คำถามเดียว ต้องได้คำตอบที่เอาไปใช้ได้`, `One question should produce an answer you can use`, `一個問題，應該得到可執行的答案`, `Một câu hỏi cần tạo ra câu trả lời dùng được`, `一つの質問から使える答えへ`, `하나의 질문은 실행 가능한 답으로 이어져야 합니다`, `Один вопрос должен давать применимый ответ`, `Una pregunta debe producir una respuesta útil`],
    [`คำถาม`, `คำถาม`, `Question`, `問題`, `Câu hỏi`, `質問`, `질문`, `Вопрос`, `Pregunta`],
    [`“จะกั้นห้องทางตะวันตกเฉียงเหนือเป็นห้องนั่งเล่นได้ไหม?”`, `“จะกั้นห้องทางตะวันตกเฉียงเหนือเป็นห้องนั่งเล่นได้ไหม?”`, `“Can I partition the northwest area into a living room?”`, `「可以把西北方隔成客廳嗎？」`, `“Có thể ngăn khu Tây Bắc thành phòng khách không?”`, `「北西側を仕切ってリビングにできますか？」`, `“북서쪽을 막아 거실로 써도 될까요?”`, `«Можно ли отделить северо-западную часть под гостиную?»`, `“¿Puedo cerrar la zona noroeste como sala de estar?”`],
    [`บริบทที่ระบบแนบ`, `บริบทที่ระบบแนบ`, `Context attached by the system`, `系統附上的背景`, `Bối cảnh hệ thống đính kèm`, `システムが添付する背景`, `시스템이 첨부한 맥락`, `Контекст от системы`, `Contexto adjunto por el sistema`],
    [`ดวงเจ้าของบ้าน · ผังบ้าน · องศาเข็ม · ดาวเหิน · ดาวปี · จุดปักในแปลน`, `ดวงเจ้าของบ้าน · ผังบ้าน · องศาเข็ม · ดาวเหิน · ดาวปี · จุดปักในแปลน`, `Owner chart · floor plan · compass degree · flying stars · annual star · pinned plan points`, `屋主命盤 · 平面圖 · 羅盤度數 · 飛星 · 年星 · 圖上標記點`, `Lá số chủ nhà · mặt bằng · độ la bàn · phi tinh · sao năm · điểm ghim trên bản vẽ`, `家主の命盤 · 間取り · 方位度数 · 飛星 · 年星 · 図面上のピン`, `집주인 명식 · 평면도 · 나침반 각도 · 비성 · 연성 · 도면 핀`, `Карта владельца · план · градус компаса · летящие звёзды · годовая звезда · точки на плане`, `Carta del dueño · plano · grados de brújula · estrellas volantes · estrella anual · puntos del plano`],
    [`ผลลัพธ์ที่ควรได้`, `ผลลัพธ์ที่ควรได้`, `Expected output`, `應得到的結果`, `Kết quả cần có`, `期待される出力`, `기대 결과`, `Ожидаемый результат`, `Resultado esperado`],
    [`สรุปทิศทาง · แยกปัจจัยหนุน/เสี่ยง · เงื่อนไขลงมือ · วิธีแก้ที่ไม่ทำให้จุดอื่นเสีย`, `สรุปทิศทาง · แยกปัจจัยหนุน/เสี่ยง · เงื่อนไขลงมือ · วิธีแก้ที่ไม่ทำให้จุดอื่นเสีย`, `Direction summary · support/risk factors · action conditions · fixes that do not harm other areas`, `方位結論 · 助力/風險拆解 · 動工條件 · 不傷其他位置的調整法`, `Tóm tắt hướng · yếu tố hỗ trợ/rủi ro · điều kiện thực hiện · cách chỉnh không ảnh hưởng điểm khác`, `方位の結論 · 支援/リスク要因 · 実行条件 · 他を傷めない調整`, `방향 요약 · 지원/위험 요인 · 실행 조건 · 다른 지점을 해치지 않는 조정`, `Итог по направлению · факторы поддержки/риска · условия действий · корректировка без ущерба другим зонам`, `Resumen de dirección · apoyos/riesgos · condiciones de acción · ajustes sin dañar otras zonas`],
    [`อ้างอิงข้อมูลคำนวณ`, `อ้างอิงข้อมูลคำนวณ`, `based on calculated data`, `引用計算資料`, `dựa trên dữ liệu tính toán`, `計算データに基づく`, `계산 데이터 기반`, `на основе расчётных данных`, `basado en datos calculados`],
    [`สรุปทิศทางให้ชัด`, `สรุปทิศทางให้ชัด`, `Make the direction clear`, `清楚判斷方位`, `Làm rõ hướng`, `方位を明確にする`, `방향을 명확히 정리`, `Прояснить направление`, `Aclarar la dirección`],
    [`อ่านว่าองศานั้นตกภูเขาใด วังใด ธาตุใด และสัมพันธ์กับดวงเจ้าของบ้านอย่างไร`, `อ่านว่าองศานั้นตกภูเขาใด วังใด ธาตุใด และสัมพันธ์กับดวงเจ้าของบ้านอย่างไร`, `Read which mountain, palace, and element the degree falls into, and how it relates to the owner’s chart.`, `判讀該度數落在哪一山、哪一宮、哪一行，以及與屋主命盤的關係。`, `Đọc độ đó thuộc sơn nào, cung nào, hành nào và liên hệ với lá số chủ nhà ra sao.`, `その度数がどの山・宮・五行に入り、家主の命盤とどう関係するかを読みます。`, `그 각도가 어떤 산, 궁, 오행에 속하고 집주인 명식과 어떻게 연결되는지 읽습니다.`, `Определяет гору, дворец, стихию градуса и связь с картой владельца.`, `Lee en qué montaña, palacio y elemento cae el grado, y cómo se relaciona con la carta del dueño.`],
    [`แยกปัจจัยหนุนและเสี่ยง`, `แยกปัจจัยหนุนและเสี่ยง`, `Separate support and risk factors`, `拆分助力與風險`, `Tách yếu tố hỗ trợ và rủi ro`, `支援要因とリスクを分ける`, `지원과 위험 요인을 구분`, `Разделить поддержку и риски`, `Separar apoyos y riesgos`],
    [`บอกว่าดาว/ธาตุไหนช่วย จุดไหนต้องระวัง และอะไรคือเงื่อนไขที่ทำให้ใช้ได้จริง`, `บอกว่าดาว/ธาตุไหนช่วย จุดไหนต้องระวัง และอะไรคือเงื่อนไขที่ทำให้ใช้ได้จริง`, `Show which stars/elements help, what to watch, and the conditions that make it usable.`, `說明哪些星/五行有助力、哪些點需注意，以及能實際使用的條件。`, `Cho biết sao/hành nào hỗ trợ, điểm nào cần cẩn trọng và điều kiện để dùng được thật.`, `どの星/五行が助けるか、注意点、実際に使える条件を示します。`, `어떤 별/오행이 돕고 무엇을 조심해야 하며 어떤 조건에서 쓸 수 있는지 보여줍니다.`, `Показывает, какие звёзды/стихии помогают, где риск и при каких условиях можно применять.`, `Muestra qué estrellas/elementos ayudan, qué cuidar y bajo qué condiciones funciona.`],
    [`สรุปเป็นขั้นตอนลงมือ`, `สรุปเป็นขั้นตอนลงมือ`, `Turn it into action steps`, `整理成行動步驟`, `Tóm thành các bước thực hiện`, `実行手順にまとめる`, `실행 단계로 정리`, `Сформировать шаги действий`, `Convertirlo en pasos de acción`],
    [`แนะนำเวลา สี วัสดุ ตำแหน่ง การใช้งาน และข้อควรเลี่ยงตามบริบทจริง`, `แนะนำเวลา สี วัสดุ ตำแหน่ง การใช้งาน และข้อควรเลี่ยงตามบริบทจริง`, `Recommend timing, colors, materials, placement, use, and avoidances based on real context.`, `依實際背景建議時間、顏色、材料、位置、用途與避忌。`, `Gợi ý thời điểm, màu, vật liệu, vị trí, cách dùng và điều cần tránh theo bối cảnh thật.`, `現実の背景に基づき、時期・色・素材・位置・使い方・避ける点を示します。`, `실제 맥락에 맞춰 시간, 색, 재료, 위치, 사용법, 피할 점을 제안합니다.`, `Рекомендует время, цвет, материалы, размещение, использование и ограничения по контексту.`, `Recomienda momento, colores, materiales, posición, uso y cautelas según el contexto real.`],
    [`ถามต่อได้ทันที`, `ถามต่อได้ทันที`, `Ask follow-ups immediately`, `可以立即追問`, `Có thể hỏi tiếp ngay`, `すぐ追加質問できる`, `바로 이어 질문 가능`, `Можно сразу уточнить`, `Puedes preguntar de nuevo al instante`],
    [`คุยต่อจากคำตอบเดิมโดยไม่ต้องเล่าดวงใหม่ เพราะบริบทถูกผูกไว้กับ profile และพื้นที่จริง`, `คุยต่อจากคำตอบเดิมโดยไม่ต้องเล่าดวงใหม่ เพราะบริบทถูกผูกไว้กับ profile และพื้นที่จริง`, `Continue from the previous answer without re-explaining your chart, because context is tied to your profile and real space.`, `可從原答案繼續追問，不必重講命盤，因背景已連到命盤資料與真實空間。`, `Tiếp tục từ câu trả lời trước mà không cần kể lại lá số, vì bối cảnh đã gắn với hồ sơ và không gian thật.`, `プロフィールと実空間に背景が紐づくため、命盤を説明し直さずに続けられます。`, `맥락이 프로필과 실제 공간에 연결되어 있어 명식을 다시 설명하지 않고 이어갈 수 있습니다.`, `Продолжайте от предыдущего ответа без повторного описания карты: контекст связан с профилем и пространством.`, `Continúa desde la respuesta anterior sin explicar de nuevo la carta, porque el contexto queda unido al perfil y al espacio real.`],
    [`6 ศาสตร์ Fusion · ฟ้าเดียวกัน คนละภาษา`, `6 ศาสตร์ Fusion · ฟ้าเดียวกัน คนละภาษา`, `Six Fusion sciences · one sky, different languages`, `六術 Fusion · 同一片天，不同語言`, `6 môn Fusion · cùng một bầu trời, khác ngôn ngữ`, `6つの Fusion 術 · 同じ空、異なる言語`, `6가지 Fusion 술법 · 같은 하늘, 다른 언어`, `Шесть наук Fusion · одно небо, разные языки`, `Seis ciencias Fusion · un cielo, distintos idiomas`],
    [`จีน อินเดีย กรีก และศาสตร์โบราณหลายสายไม่ได้เริ่มจากตำราเดียวกัน แต่เริ่มจากฟ้าเดียวกัน: เวลา ฤดูกาล ทิศ วงกลม 360° จังหวะดาว และความสัมพันธ์ของมุม`, `จีน อินเดีย กรีก และศาสตร์โบราณหลายสายไม่ได้เริ่มจากตำราเดียวกัน แต่เริ่มจากฟ้าเดียวกัน: เวลา ฤดูกาล ทิศ วงกลม 360° จังหวะดาว และความสัมพันธ์ของมุม`, `China, India, Greece, and other ancient systems did not start from the same book. They started from the same sky: time, seasons, direction, the 360° circle, planetary rhythm, and angular relationships.`, `中國、印度、希臘與多條古老術數並非始於同一本書，而是始於同一片天：時間、季節、方位、360° 圓周、星辰節奏與角度關係。`, `Trung Hoa, Ấn Độ, Hy Lạp và nhiều hệ cổ khác không bắt đầu từ cùng một cuốn sách. Chúng bắt đầu từ cùng một bầu trời: thời gian, mùa, phương hướng, vòng 360°, nhịp sao và quan hệ góc.`, `中国、インド、ギリシャ、その他の古代体系は同じ本から始まったのではありません。同じ空、つまり時間・季節・方位・360°の円・星のリズム・角度関係から始まりました。`, `중국, 인도, 그리스와 여러 고대 체계는 같은 책에서 출발한 것이 아니라 같은 하늘에서 출발했습니다: 시간, 계절, 방향, 360° 원, 행성 리듬, 각도의 관계.`, `Китай, Индия, Греция и другие древние системы начинались не с одной книги, а с одного неба: времени, сезонов, направлений, круга 360°, ритма планет и угловых связей.`, `China, India, Grecia y otros sistemas antiguos no nacieron del mismo libro. Nacieron del mismo cielo: tiempo, estaciones, dirección, círculo de 360°, ritmo planetario y relaciones angulares.`],
    [`Hourkey ให้แต่ละศาสตร์อ่านด้วยภาษาของตัวเอง แล้วให้ AI Sifu รวมหลักฐานเป็นคำตอบเดียว พร้อมบอกว่าชั้นไหนเห็นตรงกัน ชั้นไหนเตือนต่างกัน และควรตัดสินใจอย่างไร`, `Hourkey ให้แต่ละศาสตร์อ่านด้วยภาษาของตัวเอง แล้วให้ AI Sifu รวมหลักฐานเป็นคำตอบเดียว พร้อมบอกว่าชั้นไหนเห็นตรงกัน ชั้นไหนเตือนต่างกัน และควรตัดสินใจอย่างไร`, `Hourkey lets each science read in its own language, then AI Sifu merges the evidence into one answer: where the layers agree, where they warn differently, and how to decide.`, `Hourkey 讓每一術以自己的語言判讀，再由 AI Sifu 將證據合成一個答案：哪些層彼此相合，哪些層提出不同警訊，以及該如何決策。`, `Hourkey để mỗi môn đọc bằng ngôn ngữ riêng, rồi AI Sifu hợp nhất chứng cứ thành một câu trả lời: lớp nào đồng thuận, lớp nào cảnh báo khác nhau và nên quyết định thế nào.`, `Hourkey は各術にそれぞれの言語で読ませ、AI Sifu が根拠を一つの答えに統合します。どの層が一致し、どの層が別の警告を出し、どう判断すべきかを示します。`, `Hourkey는 각 술법이 자기 언어로 읽게 한 뒤 AI Sifu가 근거를 하나의 답으로 합칩니다. 어느 층이 일치하는지, 어디가 다르게 경고하는지, 어떻게 결정할지 보여줍니다.`, `Hourkey даёт каждой науке читать на своём языке, а AI Sifu объединяет доказательства в один ответ: где слои согласны, где предупреждают по-разному и как принять решение.`, `Hourkey deja que cada ciencia lea en su propio idioma; luego AI Sifu une la evidencia en una respuesta: qué capas coinciden, cuáles advierten distinto y cómo decidir.`],
    [`One sky. Six classical lenses. One decision.`, `ฟ้าเดียวกัน · 6 เลนส์คลาสสิก · คำตอบเดียว`, `One sky. Six classical lenses. One decision.`, `同一片天 · 六個古典鏡頭 · 一個決策`, `Một bầu trời · sáu lăng kính cổ điển · một quyết định`, `一つの空 · 六つの古典レンズ · 一つの判断`, `하나의 하늘 · 여섯 고전 렌즈 · 하나의 결정`, `Одно небо · шесть классических линз · одно решение`, `Un cielo · seis lentes clásicas · una decisión`],
    [`Fusion`, `Fusion`, `Fusion`, `合參`, `Fusion`, `Fusion`, `Fusion`, `Fusion`, `Fusion`],
    [`AI Sifu Fusion sciences`, `ชุดศาสตร์ AI Sifu Fusion`, `AI Sifu Fusion sciences`, `AI Sifu Fusion 六術`, `Các môn AI Sifu Fusion`, `AI Sifu Fusion の術`, `AI Sifu Fusion 술법`, `Науки AI Sifu Fusion`, `Ciencias de AI Sifu Fusion`],
    [`BaZi · 八字`, `ปาจื้อ · 八字`, `BaZi · 八字`, `八字`, `BaZi · 八字`, `BaZi · 八字`, `사주 · 八字`, `Ба-цзы · 八字`, `BaZi · 八字`],
    [`Zi Wei · 紫微斗數`, `จื่อเวย · 紫微斗數`, `Zi Wei · 紫微斗數`, `紫微斗數`, `Zi Wei · 紫微斗數`, `紫微斗數`, `자미두수 · 紫微斗數`, `Цзы Вэй · 紫微斗數`, `Zi Wei · 紫微斗數`],
    [`Real-Star · 七政四餘`, `ดาวจริง · 七政四餘`, `Real-Star · 七政四餘`, `七政四餘`, `Sao thật · 七政四餘`, `実星 · 七政四餘`, `실제 별 · 七政四餘`, `Реальные звёзды · 七政四餘`, `Estrella real · 七政四餘`],
    [`Western Astrology`, `โหราตะวันตก`, `Western Astrology`, `西洋占星`, `Chiêm tinh phương Tây`, `西洋占星術`, `서양 점성술`, `Западная астрология`, `Astrología occidental`],
    [`Vedic Astrology`, `โหราพระเวท`, `Vedic Astrology`, `吠陀占星`, `Chiêm tinh Vệ Đà`, `ヴェーダ占星術`, `베다 점성술`, `Ведическая астрология`, `Astrología védica`],
    [`Uranian Astrology`, `โหราศาสตร์ยูเรเนียน`, `Uranian Astrology`, `天王星占星`, `Chiêm tinh Uranian`, `ウラニアン占星術`, `우라니안 점성술`, `Ураническая астрология`, `Astrología uraniana`],
    [`โครงสร้างดวงและธาตุประจำตัว`, `โครงสร้างดวงและธาตุประจำตัว`, `Chart structure and personal elements`, `命局結構與個人五行`, `Cấu trúc lá số và hành cá nhân`, `命式構造と個人の五行`, `명식 구조와 개인 오행`, `Структура карты и личные стихии`, `Estructura de carta y elementos personales`],
    [`ดาวประจำวังและจังหวะชีวิต`, `ดาวประจำวังและจังหวะชีวิต`, `Palace stars and life timing`, `宮位主星與人生節奏`, `Sao theo cung và nhịp đời`, `宮の星と人生のタイミング`, `궁별 별과 삶의 리듬`, `Звёзды дворцов и ритм жизни`, `Estrellas por palacio y ritmo vital`],
    [`ตำแหน่งดาวจริงบนฟ้า`, `ตำแหน่งดาวจริงบนฟ้า`, `Real planetary positions in the sky`, `真實天象中的行星位置`, `Vị trí hành tinh thật trên bầu trời`, `空の実際の惑星位置`, `하늘의 실제 행성 위치`, `Реальные положения планет на небе`, `Posiciones planetarias reales en el cielo`],
    [`มุมดาว เรือน และ dignity`, `มุมดาว เรือน และ dignity`, `Aspects, houses, and dignity`, `相位、宮位與 dignity`, `Góc chiếu, nhà và dignity`, `アスペクト、ハウス、ディグニティ`, `행성 각, 하우스, 디그니티`, `Аспекты, дома и достоинства`, `Aspectos, casas y dignidad`],
    [`นักษัตร ราศี sidereal และ dasha`, `นักษัตร ราศี sidereal และ dasha`, `Nakshatra, sidereal signs, and dasha`, `宿、恆星黃道星座與 dasha`, `Nakshatra, cung sidereal và dasha`, `ナクシャトラ、恒星黄道サイン、ダシャー`, `나크샤트라, 항성 황도 별자리, 다샤`, `Накшатры, сидерические знаки и даша`, `Nakshatra, signos siderales y dasha`],
    [`midpoint และ planetary pictures`, `midpoint และ planetary pictures`, `Midpoints and planetary pictures`, `中點與行星圖像`, `Midpoint và planetary pictures`, `ミッドポイントと惑星像`, `미드포인트와 행성 그림`, `Мидпойнты и планетные картины`, `Midpoints e imágenes planetarias`],
    [`เปิด AI Sifu Fusion`, `เปิด AI Sifu Fusion`, `Open AI Sifu Fusion`, `開啟 AI Sifu Fusion`, `Mở AI Sifu Fusion`, `AI Sifu Fusion を開く`, `AI Sifu Fusion 열기`, `Открыть AI Sifu Fusion`, `Abrir AI Sifu Fusion`],
    [`อ่านคู่มือศาสตร์ Hourkey`, `อ่านคู่มือศาสตร์ Hourkey`, `Read the Hourkey science guide`, `閱讀 Hourkey 術數指南`, `Đọc hướng dẫn các môn của Hourkey`, `Hourkey の術数ガイドを読む`, `Hourkey 술수 가이드 읽기`, `Читать справочник школ Hourkey`, `Leer la guía de ciencias de Hourkey`],
    [`อ่านบทความดวงดาว`, `อ่านบทความดวงดาว`, `Read the star article`, `閱讀星空文章`, `Đọc bài viết về sao`, `星の記事を読む`, `별 글 읽기`, `Читать статью о звёздах`, `Leer el artículo de estrellas`],
    [`Luopan and six glass lenses under a shared starry sky`, `หล่อแกและเลนส์แก้วหกชิ้นใต้ท้องฟ้าดาวเดียวกัน`, `Luopan and six glass lenses under a shared starry sky`, `同一星空下的羅盤與六片玻璃鏡片`, `Luopan và sáu thấu kính thủy tinh dưới cùng một bầu trời sao`, `同じ星空の下の羅盤と六つのガラスレンズ`, `같은 별하늘 아래의 나경과 여섯 유리 렌즈`, `Лопань и шесть стеклянных линз под одним звёздным небом`, `Luopan y seis lentes de vidrio bajo un mismo cielo estrellado`],
    [`generated for Hourkey`, `ภาพเจนใหม่สำหรับ Hourkey`, `generated for Hourkey`, `為 Hourkey 生成`, `ảnh tạo riêng cho Hourkey`, `Hourkey 用に生成`, `Hourkey용 생성 이미지`, `сгенерировано для Hourkey`, `generado para Hourkey`],
    [`6 lenses · one sky`, `6 เลนส์ · ฟ้าเดียวกัน`, `6 lenses · one sky`, `六鏡 · 同一天`, `6 lăng kính · một bầu trời`, `6つのレンズ · 一つの空`, `6개 렌즈 · 하나의 하늘`, `6 линз · одно небо`, `6 lentes · un cielo`],
    [`ฟีเจอร์ที่อ่านจากบริบทเดียวกัน`, `ฟีเจอร์ที่อ่านจากบริบทเดียวกัน`, `Features that read the same context`, `讀取同一背景的功能`, `Tính năng đọc cùng một bối cảnh`, `同じ背景を読む機能`, `같은 맥락을 읽는 기능`, `Функции с единым контекстом`, `Funciones que leen el mismo contexto`],
    [`ทุกเครื่องมืออ่านจากบริบทชุดเดียวกัน`, `ทุกเครื่องมืออ่านจากบริบทชุดเดียวกัน`, `Every tool reads from one shared context`, `所有工具讀取同一組背景`, `Mọi công cụ đọc từ cùng một bối cảnh`, `すべてのツールが同じ背景を読む`, `모든 도구가 하나의 공유 맥락을 읽습니다`, `Все инструменты читают один общий контекст`, `Todas las herramientas leen el mismo contexto`],
    [`โปรไฟล์ดวง เวลา ทิศ และคำถามของคุณถูกใช้ร่วมกันในแต่ละหน้า ทำให้ Chart, Timing, Luopan และ AI Sifu ไม่แยกกันเป็นคนละเรื่อง`, `โปรไฟล์ดวง เวลา ทิศ และคำถามของคุณถูกใช้ร่วมกันในแต่ละหน้า ทำให้ Chart, Timing, Luopan และ AI Sifu ไม่แยกกันเป็นคนละเรื่อง`, `Your chart profile, timing, direction, and question are shared across pages, so Chart, Timing, Luopan, and AI Sifu do not drift apart.`, `你的命盤資料、時間、方位與問題會在各頁共用，讓命盤、擇時、羅盤與 AI Sifu 不會各說各話。`, `Hồ sơ lá số, thời điểm, phương hướng và câu hỏi được dùng chung giữa các trang, nên lá số, thời điểm, la bàn và AI Sifu không tách rời.`, `命盤プロフィール、時期、方位、質問が各ページで共有されるため、命盤、時機、羅盤、AI Sifu が分断されません。`, `명식 프로필, 시간, 방향, 질문이 페이지 간 공유되어 명반, 시기, 나경, AI Sifu가 따로 놀지 않습니다.`, `Профиль карты, время, направление и вопрос используются на всех страницах, поэтому карта, время, лопань и AI Sifu не расходятся.`, `Tu perfil, momento, dirección y pregunta se comparten entre páginas para que carta, momento, luopan y AI Sifu no se separen.`],
    [`needs profile`, `ต้องมีโปรไฟล์`, `needs profile`, `需要命盤資料`, `cần hồ sơ`, `プロフィール必要`, `프로필 필요`, `нужен профиль`, `requiere perfil`],
    [`ดวงปาจื้อ`, `ดวงปาจื้อ`, `BaZi chart`, `八字命盤`, `Lá số BaZi`, `BaZi 命盤`, `사주 명식`, `Карта Ба-цзы`, `Carta BaZi`],
    [`โครงสร้างดวง ธาตุที่เป็นยา ธาตุที่ควรเลี่ยง และวัยจร`, `โครงสร้างดวง ธาตุที่เป็นยา ธาตุที่ควรเลี่ยง และวัยจร`, `Chart structure, useful elements, avoid elements, and luck cycles`, `命局結構、用神、忌神與大運`, `Cấu trúc lá số, hành làm thuốc, hành nên tránh và vận hạn`, `命式構造、用神、避ける要素、大運`, `명식 구조, 도움이 되는 오행, 피할 오행, 대운`, `Структура карты, полезные стихии, избегаемые стихии и периоды удачи`, `Estructura de carta, elementos útiles, elementos a evitar y ciclos de suerte`],
    [`เปิดดวง →`, `เปิดดวง →`, `Open chart →`, `開命盤 →`, `Mở lá số →`, `命盤を開く →`, `명식 열기 →`, `Открыть карту →`, `Abrir carta →`],
    [`daily context`, `บริบทรายวัน`, `daily context`, `每日背景`, `bối cảnh ngày`, `日々の背景`, `일일 맥락`, `дневной контекст`, `contexto diario`],
    [`วันนี้`, `วันนี้`, `Today`, `今日`, `Hôm nay`, `今日`, `오늘`, `Сегодня`, `Hoy`],
    [`จังหวะรายวัน ชั่วโมงดี ทิศหนุน และกิจที่เหมาะกับดวงคุณ`, `จังหวะรายวัน ชั่วโมงดี ทิศหนุน และกิจที่เหมาะกับดวงคุณ`, `Daily timing, good hours, supportive directions, and activities suited to your chart`, `每日時機、吉時、助力方位與適合你命盤的活動`, `Nhịp ngày, giờ tốt, hướng hỗ trợ và việc hợp với lá số của bạn`, `日々のタイミング、良い時間、支える方位、命盤に合う行動`, `일일 타이밍, 좋은 시간, 돕는 방향, 내 명식에 맞는 활동`, `Дневные ритмы, удачные часы, поддерживающие направления и подходящие дела`, `Ritmo diario, buenas horas, direcciones de apoyo y actividades afines a tu carta`],
    [`ดูวันนี้ →`, `ดูวันนี้ →`, `View today →`, `看今日 →`, `Xem hôm nay →`, `今日を見る →`, `오늘 보기 →`, `Смотреть сегодня →`, `Ver hoy →`],
    [`month view`, `มุมมองรายเดือน`, `month view`, `月視圖`, `xem theo tháng`, `月表示`, `월간 보기`, `месячный вид`, `vista mensual`],
    [`ปฏิทินมงคล`, `ปฏิทินมงคล`, `Auspicious calendar`, `吉日曆`, `Lịch cát lành`, `吉日カレンダー`, `길일 달력`, `Благоприятный календарь`, `Calendario auspicioso`],
    [`ดูวันทั้งเดือน พร้อมคะแนนและเหตุผลที่อ่านออกง่าย`, `ดูวันทั้งเดือน พร้อมคะแนนและเหตุผลที่อ่านออกง่าย`, `See the whole month with scores and easy-to-read reasons`, `查看整月日期、分數與易讀理由`, `Xem cả tháng kèm điểm số và lý do dễ hiểu`, `月全体をスコアと読みやすい理由付きで確認`, `한 달 전체를 점수와 쉬운 이유로 확인`, `Смотрите весь месяц с оценками и понятными причинами`, `Ve todo el mes con puntuaciones y razones claras`],
    [`เปิดปฏิทิน →`, `เปิดปฏิทิน →`, `Open calendar →`, `開日曆 →`, `Mở lịch →`, `カレンダーを開く →`, `달력 열기 →`, `Открыть календарь →`, `Abrir calendario →`],
    [`situation`, `สถานการณ์`, `situation`, `情境`, `tình huống`, `状況`, `상황`, `ситуация`, `situación`],
    [`อ่านสถานการณ์เฉพาะหน้า ทิศ ประตู ดาว เทพ และวังที่ใช้ได้`, `อ่านสถานการณ์เฉพาะหน้า ทิศ ประตู ดาว เทพ และวังที่ใช้ได้`, `Read the current situation, direction, doors, stars, spirits, and usable palaces`, `讀當下情境、方位、門、星、神與可用之宮`, `Đọc tình huống hiện tại, hướng, môn, sao, thần và cung dùng được`, `現在の状況、方位、門、星、神、使える宮を読む`, `현재 상황, 방향, 문, 별, 신, 쓸 수 있는 궁을 읽습니다`, `Текущая ситуация, направление, двери, звёзды, духи и применимые дворцы`, `Lee situación actual, dirección, puertas, estrellas, espíritus y palacios utilizables`],
    [`เปิดฉีเหมิน →`, `เปิดฉีเหมิน →`, `Open Qi Men →`, `開奇門 →`, `Mở Qi Men →`, `奇門を開く →`, `기문 열기 →`, `Открыть Ци Мэнь →`, `Abrir Qi Men →`],
    [`report`, `รายงาน`, `report`, `報告`, `báo cáo`, `レポート`, `보고서`, `отчёт`, `informe`],
    [`รวมรายงานดวงเชิงลึกสำหรับอ่านเป็นเล่มและเก็บอ้างอิง`, `รวมรายงานดวงเชิงลึกสำหรับอ่านเป็นเล่มและเก็บอ้างอิง`, `A deep personal report you can read as a book and keep for reference`, `把深度命理報告整理成可閱讀與保存的書`, `Báo cáo lá số chuyên sâu để đọc như một cuốn sách và lưu tham khảo`, `本として読め、参照用に残せる深い命理レポート`, `책처럼 읽고 참고용으로 보관하는 심층 명리 보고서`, `Глубокий персональный отчёт в формате книги для чтения и справки`, `Informe profundo para leer como libro y conservar como referencia`],
    [`เปิดหนังสือ →`, `เปิดหนังสือ →`, `Open book →`, `開書 →`, `Mở sách →`, `本を開く →`, `책 열기 →`, `Открыть книгу →`, `Abrir libro →`],
    [`important date`, `วันสำคัญ`, `important date`, `重要日期`, `ngày quan trọng`, `重要日`, `중요한 날짜`, `важная дата`, `fecha importante`],
    [`เลือกฤกษ์ให้ตรงกับงานสำคัญและดวงเจ้าของงาน`, `เลือกฤกษ์ให้ตรงกับงานสำคัญและดวงเจ้าของงาน`, `Pick timing that matches the important task and the owner’s chart`, `為重要事項與當事人命盤選合適吉時`, `Chọn ngày giờ phù hợp với việc quan trọng và lá số người chủ sự`, `重要な用件と本人の命盤に合う日取りを選ぶ`, `중요한 일과 당사자의 명식에 맞는 택일`, `Подбор времени под важное дело и карту человека`, `Elige fecha acorde al asunto importante y a la carta de la persona`],
    [`วางฤกษ์ →`, `วางฤกษ์ →`, `Pick timing →`, `擇日 →`, `Chọn ngày giờ →`, `日取りを選ぶ →`, `택일하기 →`, `Выбрать дату →`, `Elegir fecha →`],
    [`space data`, `ข้อมูลพื้นที่`, `space data`, `空間資料`, `dữ liệu không gian`, `空間データ`, `공간 데이터`, `данные пространства`, `datos del espacio`],
    [`องศาทิศจริง วงแหวนหล่อแก ดาวเหิน และ pin ในแปลน`, `องศาทิศจริง วงแหวนหล่อแก ดาวเหิน และ pin ในแปลน`, `Real direction degrees, luopan rings, flying stars, and pins on the plan`, `實際方位度數、羅盤圈、飛星與圖上 pin`, `Độ hướng thật, vòng la bàn, phi tinh và pin trên bản vẽ`, `実方位度数、羅盤リング、飛星、図面ピン`, `실제 방향 각도, 나경 링, 비성, 도면 핀`, `Реальные градусы направления, кольца лопаня, летящие звёзды и точки плана`, `Grados reales, anillos luopan, estrellas volantes y pines en plano`],
    [`เปิดหล่อแก →`, `เปิดหล่อแก →`, `Open luopan →`, `開羅盤 →`, `Mở luopan →`, `羅盤を開く →`, `나경 열기 →`, `Открыть лопань →`, `Abrir luopan →`],
    [`ask anything`, `ถามได้ทุกเรื่อง`, `ask anything`, `什麼都能問`, `hỏi mọi chuyện`, `何でも質問`, `무엇이든 질문`, `спросить что угодно`, `pregunta lo que quieras`],
    [`ถามต่อจากข้อมูลจริง ไม่ใช่ chatbot ทั่วไปที่ตอบจาก prompt ลอย ๆ`, `ถามต่อจากข้อมูลจริง ไม่ใช่ chatbot ทั่วไปที่ตอบจาก prompt ลอย ๆ`, `Ask from real data, not a generic chatbot answering from a loose prompt.`, `依真實資料追問，不是只靠空泛 prompt 的一般聊天機器人。`, `Hỏi tiếp từ dữ liệu thật, không phải chatbot chung chung trả lời từ prompt rời rạc.`, `実データから質問でき、曖昧なプロンプトだけで答える一般チャットボットではありません。`, `실제 데이터에서 이어 묻는 방식이며 막연한 프롬프트 챗봇이 아닙니다.`, `Вопросы опираются на реальные данные, а не на общий prompt чатбота.`, `Pregunta desde datos reales, no desde un chatbot genérico con prompt suelto.`],
    [`ถามซินแส →`, `ถามซินแส →`, `Ask Sifu →`, `問師父 →`, `Hỏi Sifu →`, `Sifu に聞く →`, `Sifu에게 묻기 →`, `Спросить Sifu →`, `Preguntar a Sifu →`],
    [`หลังจากกดเริ่ม`, `หลังจากกดเริ่ม`, `After you start`, `開始之後`, `Sau khi bắt đầu`, `開始後`, `시작한 뒤`, `После старта`, `Después de empezar`],
    [`จากข้อมูลส่วนตัว ไปจนถึงคำแนะนำที่ลงมือได้`, `จากข้อมูลส่วนตัว ไปจนถึงคำแนะนำที่ลงมือได้`, `From personal data to advice you can act on`, `從個人資料到可執行建議`, `Từ dữ liệu cá nhân đến lời khuyên có thể làm ngay`, `個人データから実行できる助言へ`, `개인 데이터에서 실행 가능한 조언까지`, `От личных данных к практическому совету`, `De datos personales a consejos accionables`],
    [`ยิ่งบริบทครบ คำตอบยิ่งเฉพาะตัว: วันเกิด เวลาเกิด สถานที่เกิด ความสัมพันธ์ งานที่ถาม และพื้นที่จริง`, `ยิ่งบริบทครบ คำตอบยิ่งเฉพาะตัว: วันเกิด เวลาเกิด สถานที่เกิด ความสัมพันธ์ งานที่ถาม และพื้นที่จริง`, `The more complete the context, the more personal the answer: birth date, birth time, place, relationships, the task, and real space.`, `背景越完整，答案越個人化：生日、出生時間、出生地、關係、所問事項與真實空間。`, `Bối cảnh càng đầy đủ, câu trả lời càng cá nhân: ngày sinh, giờ sinh, nơi sinh, quan hệ, việc đang hỏi và không gian thật.`, `背景が揃うほど答えは個別化されます：生年月日、出生時刻、出生地、関係、質問内容、実空間。`, `맥락이 완전할수록 답은 더 개인화됩니다: 생일, 출생 시간, 장소, 관계, 질문한 일, 실제 공간.`, `Чем полнее контекст, тем персональнее ответ: дата и время рождения, место, отношения, задача и пространство.`, `Cuanto más completo el contexto, más personal la respuesta: fecha, hora, lugar, relaciones, asunto y espacio real.`],
    [`ใส่วัน เวลา และสถานที่เกิด`, `ใส่วัน เวลา และสถานที่เกิด`, `Enter birth date, time, and place`, `輸入出生日期、時間與地點`, `Nhập ngày, giờ và nơi sinh`, `生年月日・時刻・場所を入力`, `생년월일, 시간, 장소 입력`, `Введите дату, время и место рождения`, `Introduce fecha, hora y lugar de nacimiento`],
    [`ระบบคำนวณด้วยเวลาสุริยะจริง แล้วสร้างโครงสร้างดวง ยงเสิน ธาตุหนุน และธาตุที่ควรระวัง`, `ระบบคำนวณด้วยเวลาสุริยะจริง แล้วสร้างโครงสร้างดวง ยงเสิน ธาตุหนุน และธาตุที่ควรระวัง`, `The system calculates true solar time, then builds chart structure, useful god, supportive elements, and caution elements.`, `系統用真太陽時計算，再建立命局結構、用神、助力五行與需注意五行。`, `Hệ thống tính bằng giờ mặt trời thật, rồi dựng cấu trúc lá số, dụng thần, hành hỗ trợ và hành cần lưu ý.`, `真太陽時で計算し、命式構造、用神、支える五行、注意すべき五行を作ります。`, `진태양시로 계산한 뒤 명식 구조, 용신, 돕는 오행, 주의할 오행을 만듭니다.`, `Система считает истинное солнечное время и строит структуру карты, полезную стихию и зоны осторожности.`, `El sistema calcula hora solar verdadera y crea estructura de carta, dios útil, elementos de apoyo y cautela.`],
    [`เลือกเรื่องที่อยากถาม`, `เลือกเรื่องที่อยากถาม`, `Choose what you want to ask`, `選擇想問的事情`, `Chọn điều muốn hỏi`, `聞きたいテーマを選ぶ`, `묻고 싶은 주제 선택`, `Выберите тему вопроса`, `Elige qué quieres preguntar`],
    [`เมื่อถามเรื่องฤกษ์ ทิศ บ้าน หรือคนรอบตัว ระบบจะเพิ่มข้อมูลเฉพาะหน้าก่อนส่งเข้า AI Sifu`, `เมื่อถามเรื่องฤกษ์ ทิศ บ้าน หรือคนรอบตัว ระบบจะเพิ่มข้อมูลเฉพาะหน้าก่อนส่งเข้า AI Sifu`, `For timing, directions, home, or people questions, the system adds the right context before sending it to AI Sifu.`, `問擇日、方位、住宅或人際時，系統會先補上對應背景再送給 AI Sifu。`, `Khi hỏi về ngày giờ, hướng, nhà hoặc người xung quanh, hệ thống thêm bối cảnh phù hợp trước khi gửi vào AI Sifu.`, `日取り、方位、家、人間関係の質問では、AI Sifu に送る前に必要な背景を追加します。`, `택일, 방향, 집, 사람 질문에는 AI Sifu로 보내기 전 필요한 맥락을 더합니다.`, `Для дат, направлений, дома или людей система добавляет нужный контекст перед AI Sifu.`, `Para fechas, direcciones, casa o personas, el sistema agrega el contexto antes de enviarlo a AI Sifu.`],
    [`ได้คำตอบพร้อมเหตุผล`, `ได้คำตอบพร้อมเหตุผล`, `Get an answer with reasoning`, `得到有理由的答案`, `Nhận câu trả lời kèm lý do`, `理由付きの答えを受け取る`, `이유가 있는 답변 받기`, `Получите ответ с обоснованием`, `Recibe una respuesta con razón`],
    [`ถ้าข้อมูลบางชั้นยังไม่ครบ ระบบจะบอกข้อจำกัดของคำตอบ ไม่สรุปเกินกว่าข้อมูลที่มี`, `ถ้าข้อมูลบางชั้นยังไม่ครบ ระบบจะบอกข้อจำกัดของคำตอบ ไม่สรุปเกินกว่าข้อมูลที่มี`, `If some layers are incomplete, the system states the limits instead of over-concluding.`, `若部分資料層不完整，系統會說明限制，不會超出資料下結論。`, `Nếu một số lớp dữ liệu chưa đủ, hệ thống nêu giới hạn thay vì kết luận quá mức.`, `一部のデータが不足する場合、過剰に断定せず限界を示します。`, `일부 데이터가 부족하면 무리하게 결론 내리지 않고 한계를 표시합니다.`, `Если часть данных неполная, система укажет ограничения и не сделает лишних выводов.`, `Si faltan capas de datos, el sistema declara límites en lugar de concluir de más.`],
    [`ชั้นข้อมูลที่ใช้คำนวณ`, `ชั้นข้อมูลที่ใช้คำนวณ`, `Calculation layers`, `計算資料層`, `Các lớp dữ liệu tính toán`, `計算に使うデータ層`, `계산 데이터 층`, `Слои расчёта`, `Capas de cálculo`],
    [`หลายศาสตร์ แต่ต้องกลายเป็นคำตอบเดียว`, `หลายศาสตร์ แต่ต้องกลายเป็นคำตอบเดียว`, `Many sciences, one answer`, `多門術數，整合成一個答案`, `Nhiều môn nhưng thành một câu trả lời`, `複数の術を一つの答えへ`, `여러 술법을 하나의 답으로`, `Много дисциплин, один ответ`, `Muchas ciencias, una respuesta`],
    [`AI Sifu อ่านจากข้อมูลที่ระบบคำนวณไว้ ไม่ใช่แค่คำสวย ๆ จากโมเดลภาษา`, `AI Sifu อ่านจากข้อมูลที่ระบบคำนวณไว้ ไม่ใช่แค่คำสวย ๆ จากโมเดลภาษา`, `AI Sifu reads calculated system data, not just polished language-model text.`, `AI Sifu 讀的是系統計算資料，不只是語言模型的漂亮文字。`, `AI Sifu đọc dữ liệu hệ thống đã tính, không chỉ là lời văn đẹp từ mô hình ngôn ngữ.`, `AI Sifu は計算済みデータを読み、言語モデルの綺麗な文章だけではありません。`, `AI Sifu는 언어 모델의 문장만이 아니라 계산된 시스템 데이터를 읽습니다.`, `AI Sifu читает расчётные данные системы, а не только красивый текст модели.`, `AI Sifu lee datos calculados del sistema, no solo texto bonito de un modelo.`],
    [`อ่านโครงสร้างดวง ธาตุที่หนุน ธาตุที่ควรระวัง วัยจร และปีจร เพื่อเข้าใจพื้นฐานของเจ้าของดวง`, `อ่านโครงสร้างดวง ธาตุที่หนุน ธาตุที่ควรระวัง วัยจร และปีจร เพื่อเข้าใจพื้นฐานของเจ้าของดวง`, `Reads chart structure, supportive/caution elements, luck cycles, and annual cycles to understand the person’s foundation.`, `讀命局結構、助力/忌避五行、大運與流年，以理解命主基礎。`, `Đọc cấu trúc lá số, hành hỗ trợ/cần tránh, đại vận và lưu niên để hiểu nền tảng chủ lá số.`, `命式構造、支える/注意すべき五行、大運、年運を読み、本人の基礎を把握します。`, `명식 구조, 돕는/주의할 오행, 대운, 세운을 읽어 사람의 기반을 이해합니다.`, `Читает структуру карты, поддерживающие и рискованные стихии, периоды удачи и годы.`, `Lee estructura de carta, elementos de apoyo/cautela, ciclos de suerte y años para entender la base personal.`],
    [`ประตู ดาว เทพ วัง ทิศ และจังหวะเฉพาะคำถามที่ต้องตัดสินใจตอนนี้`, `ประตู ดาว เทพ วัง ทิศ และจังหวะเฉพาะคำถามที่ต้องตัดสินใจตอนนี้`, `Doors, stars, spirits, palaces, directions, and timing for the decision at hand`, `針對當下決策讀門、星、神、宮、方位與時機`, `Môn, sao, thần, cung, hướng và thời điểm cho quyết định hiện tại`, `いまの判断に必要な門、星、神、宮、方位、時機`, `현재 결정에 필요한 문, 별, 신, 궁, 방향, 타이밍`, `Двери, звёзды, духи, дворцы, направления и время для текущего решения`, `Puertas, estrellas, espíritus, palacios, direcciones y tiempo para la decisión actual`],
    [`อ่าน 24 ภูเขา ดาวเหิน ยุค องศาเข็ม ทิศบ้าน และตำแหน่งสำคัญในแปลนจริง`, `อ่าน 24 ภูเขา ดาวเหิน ยุค องศาเข็ม ทิศบ้าน และตำแหน่งสำคัญในแปลนจริง`, `Reads 24 mountains, flying stars, period, compass degree, house direction, and key points in the real plan`, `讀二十四山、飛星、元運、羅盤度數、宅向與實際平面重點`, `Đọc 24 sơn, phi tinh, vận, độ la bàn, hướng nhà và điểm quan trọng trên mặt bằng thật`, `二十四山、飛星、運、方位度数、家の向き、実際の図面上の重要点を読みます`, `24산, 비성, 운, 나침반 각도, 집 방향, 실제 도면의 핵심 지점`, `24 горы, летящие звёзды, период, градус компаса, направление дома и точки плана`, `24 montañas, estrellas volantes, periodo, grado de brújula, dirección de casa y puntos del plano`],
    [`วัน ชั่วโมง กิจที่เหมาะ ข้อควรเลี่ยง และการจับฤกษ์ตามบริบทผู้ใช้`, `วัน ชั่วโมง กิจที่เหมาะ ข้อควรเลี่ยง และการจับฤกษ์ตามบริบทผู้ใช้`, `Days, hours, suitable activities, avoidances, and timing matched to user context`, `日期、時辰、適合事項、避忌與依使用者背景擇時`, `Ngày, giờ, việc phù hợp, điều cần tránh và chọn thời theo bối cảnh người dùng`, `日、時間、適した行動、避けること、ユーザー背景に合う日取り`, `날, 시간, 적합한 일, 피할 점, 사용자 맥락에 맞춘 택일`, `Дни, часы, подходящие дела, избегания и выбор времени по контексту`, `Días, horas, actividades adecuadas, cautelas y elección de fecha según contexto`],
    [`ทำไมคำตอบตรวจสอบได้`, `ทำไมคำตอบตรวจสอบได้`, `Why the answer is traceable`, `為什麼答案可追溯`, `Vì sao câu trả lời kiểm chứng được`, `なぜ答えの根拠を追えるか`, `왜 답변 근거를 확인할 수 있나`, `Почему ответ проверяем`, `Por qué la respuesta es verificable`],
    [`สร้างมาเพื่อคำถามที่มีผลกับชีวิตจริง`, `สร้างมาเพื่อคำถามที่มีผลกับชีวิตจริง`, `Built for questions that affect real life`, `為影響真實生活的問題而設計`, `Dành cho câu hỏi ảnh hưởng đến đời sống thật`, `現実の人生に影響する質問のために設計`, `실제 삶에 영향을 주는 질문을 위해 설계`, `Создано для вопросов, влияющих на реальную жизнь`, `Hecho para preguntas que afectan la vida real`],
    [`แสดงว่าคำตอบอ้างอิงข้อมูลชั้นใด เช่น ดวง เวลา ฤกษ์ ทิศ หรือข้อมูลพื้นที่`, `แสดงว่าคำตอบอ้างอิงข้อมูลชั้นใด เช่น ดวง เวลา ฤกษ์ ทิศ หรือข้อมูลพื้นที่`, `Shows which layers the answer uses, such as chart, time, timing, direction, or space data`, `顯示答案引用哪些資料層，例如命盤、時間、擇日、方位或空間資料`, `Hiển thị câu trả lời dựa trên lớp nào: lá số, thời gian, ngày giờ, hướng hoặc dữ liệu không gian`, `命盤、時間、日取り、方位、空間データなど、答えがどの層を使ったかを示します`, `명식, 시간, 택일, 방향, 공간 데이터 등 어떤 층을 썼는지 보여줍니다`, `Показывает слои ответа: карта, время, выбор даты, направление или пространство`, `Muestra qué capas usa: carta, tiempo, fecha, dirección o datos del espacio`],
    [`แยกคำแนะนำออกจากคำทำนายทั่วไป พร้อมบอกเงื่อนไขและข้อควรเลี่ยงก่อนลงมือ`, `แยกคำแนะนำออกจากคำทำนายทั่วไป พร้อมบอกเงื่อนไขและข้อควรเลี่ยงก่อนลงมือ`, `Separates advice from generic prediction, with conditions and cautions before action`, `把建議與一般預言分開，並在行動前說明條件與避忌`, `Tách lời khuyên khỏi dự đoán chung, kèm điều kiện và điều cần tránh trước khi làm`, `一般的な予言と助言を分け、行動前の条件と注意点を示します`, `일반 예언과 조언을 구분하고 실행 전 조건과 주의점을 알려줍니다`, `Отделяет совет от общих предсказаний и даёт условия и предосторожности`, `Separa consejo de predicción genérica, con condiciones y cautelas antes de actuar`],
    [`ใช้โปรไฟล์เดียวกันข้ามหน้า เพื่อลดคำตอบที่ขัดกันเองระหว่าง Chart, Timing, Luopan และ AI Sifu`, `ใช้โปรไฟล์เดียวกันข้ามหน้า เพื่อลดคำตอบที่ขัดกันเองระหว่าง Chart, Timing, Luopan และ AI Sifu`, `Uses one profile across pages to reduce conflicting answers between Chart, Timing, Luopan, and AI Sifu`, `跨頁使用同一份資料，減少命盤、擇時、羅盤與 AI Sifu 之間互相矛盾`, `Dùng một hồ sơ trên nhiều trang để giảm câu trả lời mâu thuẫn giữa lá số, thời điểm, la bàn và AI Sifu`, `同じプロフィールを各ページで使い、命盤、時機、羅盤、AI Sifu の矛盾を減らします`, `하나의 프로필을 여러 페이지에서 사용해 명반, 시기, 나경, AI Sifu 간 모순을 줄입니다`, `Один профиль на всех страницах уменьшает противоречия между картой, временем, лопанем и AI Sifu`, `Usa un perfil en todas las páginas para reducir contradicciones entre carta, momento, luopan y AI Sifu`],
    [`แพ็กเกจและการเริ่มใช้งาน`, `แพ็กเกจและการเริ่มใช้งาน`, `Plans and getting started`, `方案與開始使用`, `Gói dịch vụ và bắt đầu`, `料金プランと始め方`, `요금제와 시작하기`, `Тарифы и начало работы`, `Planes y primeros pasos`],
    [`เริ่มจากคำถามก่อน แล้วค่อยเลือกเครื่องมือที่ต้องใช้`, `เริ่มจากคำถามก่อน แล้วค่อยเลือกเครื่องมือที่ต้องใช้`, `Start with the question, then choose the tool you need`, `先從問題開始，再選需要的工具`, `Bắt đầu từ câu hỏi rồi chọn công cụ cần dùng`, `まず質問から始め、必要なツールを選ぶ`, `질문에서 시작한 뒤 필요한 도구를 고릅니다`, `Начните с вопроса, затем выберите инструмент`, `Empieza con la pregunta y luego elige la herramienta`],
    [`Hourkey เหมาะกับทั้งคนที่อยากถาม AI Sifu เป็นครั้งคราว และคนที่ต้องใช้ฤกษ์ ทิศ หรือรายงานดวงหลายชั้นเป็นประจำ`, `Hourkey เหมาะกับทั้งคนที่อยากถาม AI Sifu เป็นครั้งคราว และคนที่ต้องใช้ฤกษ์ ทิศ หรือรายงานดวงหลายชั้นเป็นประจำ`, `Hourkey fits both people who ask AI Sifu occasionally and people who regularly need timing, direction, or multi-layer chart reports.`, `Hourkey 適合偶爾問 AI Sifu 的人，也適合經常需要擇日、方位或多層命理報告的人。`, `Hourkey phù hợp cho cả người thỉnh thoảng hỏi AI Sifu và người thường cần chọn ngày, phương hướng hoặc báo cáo nhiều lớp.`, `Hourkey は時々 AI Sifu に聞く人にも、日取り・方位・多層レポートを頻繁に使う人にも合います。`, `Hourkey는 가끔 AI Sifu에게 묻는 사람과 택일, 방향, 다층 보고서가 자주 필요한 사람 모두에게 맞습니다.`, `Hourkey подходит и для редких вопросов AI Sifu, и для регулярного выбора дат, направлений и многослойных отчётов.`, `Hourkey sirve tanto para consultas ocasionales a AI Sifu como para quienes usan fechas, direcciones o reportes multicapa con frecuencia.`],
    [`ดูแพ็กเกจ`, `ดูแพ็กเกจ`, `View plans`, `查看方案`, `Xem gói`, `プランを見る`, `요금제 보기`, `Смотреть тарифы`, `Ver planes`],
    [`สิ่งที่ควรรู้ก่อนเริ่ม`, `สิ่งที่ควรรู้ก่อนเริ่ม`, `What to know before starting`, `開始前應知道的事`, `Điều cần biết trước khi bắt đầu`, `始める前に知ること`, `시작 전 알아둘 점`, `Что знать перед началом`, `Lo que debes saber antes de empezar`],
    [`ต้องมีวันเกิดเป็นอย่างน้อย เวลาเกิดช่วยให้คำตอบละเอียดขึ้น`, `ต้องมีวันเกิดเป็นอย่างน้อย เวลาเกิดช่วยให้คำตอบละเอียดขึ้น`, `Birth date is the minimum. Birth time makes answers more precise.`, `至少需要生日；出生時間會讓答案更精細。`, `Tối thiểu cần ngày sinh. Giờ sinh giúp câu trả lời chi tiết hơn.`, `最低限、生年月日が必要です。出生時刻があると精度が上がります。`, `생년월일은 최소 필요합니다. 출생 시간이 있으면 더 정밀합니다.`, `Минимум нужна дата рождения. Время рождения повышает точность.`, `La fecha de nacimiento es el mínimo. La hora mejora la precisión.`],
    [`คำถามเรื่องบ้าน/ทิศจะชัดขึ้นเมื่อมีองศาเข็มหรือแปลน`, `คำถามเรื่องบ้าน/ทิศจะชัดขึ้นเมื่อมีองศาเข็มหรือแปลน`, `Home/direction questions become clearer with compass degrees or a floor plan.`, `有羅盤度數或平面圖時，住宅/方位問題會更清楚。`, `Câu hỏi về nhà/hướng sẽ rõ hơn khi có độ la bàn hoặc bản vẽ.`, `家/方位の質問は、方位度数や間取りがあると明確になります。`, `집/방향 질문은 나침반 각도나 평면도가 있으면 더 명확합니다.`, `Вопросы о доме/направлении яснее с градусом компаса или планом.`, `Las preguntas de casa/dirección mejoran con grados de brújula o plano.`],
    [`ระบบจะแจ้งเมื่อข้อมูลบางชั้นยังไม่พอสำหรับสรุปแบบละเอียด`, `ระบบจะแจ้งเมื่อข้อมูลบางชั้นยังไม่พอสำหรับสรุปแบบละเอียด`, `The system tells you when some layers are insufficient for a detailed conclusion.`, `若某些資料層不足以做詳細結論，系統會提示。`, `Hệ thống sẽ báo khi một số lớp dữ liệu chưa đủ để kết luận chi tiết.`, `詳細な結論に必要なデータが足りない場合は知らせます。`, `상세 결론에 필요한 데이터가 부족하면 시스템이 알려줍니다.`, `Система сообщит, если данных недостаточно для подробного вывода.`, `El sistema avisa cuando faltan capas para una conclusión detallada.`],
    [`คำตอบใช้เป็นเครื่องมือช่วยคิด ไม่ใช่คำแนะนำทางแพทย์ กฎหมาย หรือการเงิน`, `คำตอบใช้เป็นเครื่องมือช่วยคิด ไม่ใช่คำแนะนำทางแพทย์ กฎหมาย หรือการเงิน`, `Answers are decision support, not medical, legal, or financial advice.`, `答案是輔助思考工具，不是醫療、法律或財務建議。`, `Câu trả lời là công cụ hỗ trợ suy nghĩ, không phải tư vấn y tế, pháp lý hay tài chính.`, `回答は考えるための補助であり、医療・法律・金融助言ではありません。`, `답변은 사고를 돕는 도구이며 의료, 법률, 금융 조언이 아닙니다.`, `Ответы помогают думать, но не являются медицинским, юридическим или финансовым советом.`, `Las respuestas apoyan la decisión; no son consejo médico, legal ni financiero.`],
    [`คำถามที่เจอบ่อย`, `คำถามที่เจอบ่อย`, `Common questions`, `常見問題`, `Câu hỏi thường gặp`, `よくある質問`, `자주 묻는 질문`, `Частые вопросы`, `Preguntas frecuentes`],
    [`ต้องรู้ดวงจีนก่อนใช้ไหม?`, `ต้องรู้ดวงจีนก่อนใช้ไหม?`, `Do I need to know Chinese astrology first?`, `需要先懂中式命理嗎？`, `Có cần biết mệnh lý Trung Hoa trước không?`, `中国命理を知っている必要がありますか？`, `중국 명리를 먼저 알아야 하나요?`, `Нужно ли заранее знать китайскую астрологию?`, `¿Necesito saber astrología china antes?`],
    [`ไม่จำเป็น เลือกเรื่องที่อยากถามได้เลย ระบบจะแปลงข้อมูลเชิงเทคนิคเป็นภาษาที่ใช้ตัดสินใจได้`, `ไม่จำเป็น เลือกเรื่องที่อยากถามได้เลย ระบบจะแปลงข้อมูลเชิงเทคนิคเป็นภาษาที่ใช้ตัดสินใจได้`, `No. Choose what you want to ask; the system turns technical data into decision language.`, `不需要。直接選想問的事，系統會把技術資料轉成可決策的語言。`, `Không cần. Chọn điều muốn hỏi, hệ thống sẽ chuyển dữ liệu kỹ thuật thành ngôn ngữ ra quyết định.`, `不要です。聞きたいことを選ぶだけで、技術情報を判断しやすい言葉に変換します。`, `아니요. 묻고 싶은 일을 고르면 기술 데이터를 결정 언어로 바꿉니다.`, `Нет. Выберите вопрос, система переведёт технические данные в язык решения.`, `No. Elige qué quieres preguntar y el sistema traduce datos técnicos a lenguaje de decisión.`],
    [`AI Sifu ต่างจาก chatbot ทั่วไปยังไง?`, `AI Sifu ต่างจาก chatbot ทั่วไปยังไง?`, `How is AI Sifu different from a normal chatbot?`, `AI Sifu 和一般聊天機器人有何不同？`, `AI Sifu khác chatbot thường thế nào?`, `AI Sifu は普通のチャットボットと何が違いますか？`, `AI Sifu는 일반 챗봇과 무엇이 다른가요?`, `Чем AI Sifu отличается от обычного чатбота?`, `¿En qué se diferencia AI Sifu de un chatbot normal?`],
    [`คำตอบผูกกับข้อมูลดวง เวลา ทิศ และโปรไฟล์ของคุณ ไม่ใช่การถามแบบไม่มีบริบท`, `คำตอบผูกกับข้อมูลดวง เวลา ทิศ และโปรไฟล์ของคุณ ไม่ใช่การถามแบบไม่มีบริบท`, `Answers are tied to your chart, timing, direction, and profile, not context-free chat.`, `答案連到你的命盤、時間、方位與個人資料，不是無背景聊天。`, `Câu trả lời gắn với lá số, thời điểm, phương hướng và hồ sơ của bạn, không phải hỏi không bối cảnh.`, `回答は命盤、時期、方位、プロフィールに結びつき、背景なしの会話ではありません。`, `답변은 명식, 시간, 방향, 프로필에 연결되며 맥락 없는 대화가 아닙니다.`, `Ответы связаны с картой, временем, направлением и профилем, а не с пустым чатом.`, `Las respuestas se vinculan a tu carta, tiempo, dirección y perfil, no a una conversación sin contexto.`],
    [`ใช้กับเรื่องบ้านและทิศได้ไหม?`, `ใช้กับเรื่องบ้านและทิศได้ไหม?`, `Can it handle home and direction questions?`, `可以用於住宅與方位嗎？`, `Có dùng cho nhà và hướng được không?`, `家や方位にも使えますか？`, `집과 방향에도 쓸 수 있나요?`, `Подходит ли для дома и направлений?`, `¿Sirve para casa y direcciones?`],
    [`ได้ หน้า Luopan อ่านองศาจริงและส่งข้อมูลทิศเข้าบริบท AI Sifu เพื่อวิเคราะห์ต่อ`, `ได้ หน้า Luopan อ่านองศาจริงและส่งข้อมูลทิศเข้าบริบท AI Sifu เพื่อวิเคราะห์ต่อ`, `Yes. Luopan reads real degrees and sends direction data into AI Sifu context for analysis.`, `可以。Luopan 讀取實際度數，並把方位資料送入 AI Sifu 背景分析。`, `Có. Luopan đọc độ thật và gửi dữ liệu hướng vào bối cảnh AI Sifu để phân tích tiếp.`, `はい。Luopan が実度数を読み、方位データを AI Sifu の背景に渡して分析します。`, `네. Luopan이 실제 각도를 읽고 방향 데이터를 AI Sifu 맥락으로 보냅니다.`, `Да. Luopan считывает реальные градусы и передаёт направление в контекст AI Sifu.`, `Sí. Luopan lee grados reales y envía la dirección al contexto de AI Sifu.`],
    [`ถ้าไม่มีเวลาเกิดทำได้ไหม?`, `ถ้าไม่มีเวลาเกิดทำได้ไหม?`, `Can I use it without birth time?`, `沒有出生時間可以用嗎？`, `Không có giờ sinh dùng được không?`, `出生時刻がなくても使えますか？`, `출생 시간이 없어도 쓸 수 있나요?`, `Можно без времени рождения?`, `¿Puedo usarlo sin hora de nacimiento?`],
    [`เริ่มได้ แต่คำตอบบางส่วนจะกว้างขึ้น ระบบจะบอกเมื่อข้อมูลบางชั้นยังไม่ครบ`, `เริ่มได้ แต่คำตอบบางส่วนจะกว้างขึ้น ระบบจะบอกเมื่อข้อมูลบางชั้นยังไม่ครบ`, `You can start, but some answers will be broader. The system flags incomplete data layers.`, `可以開始，但部分答案會較寬泛；系統會標示缺少的資料層。`, `Có thể bắt đầu, nhưng một số câu trả lời sẽ rộng hơn. Hệ thống sẽ báo lớp dữ liệu còn thiếu.`, `始められますが、一部の答えは広めになります。不足データは明示されます。`, `시작할 수 있지만 일부 답변은 넓어집니다. 부족한 데이터 층을 표시합니다.`, `Можно начать, но часть ответов будет шире. Система отметит недостающие данные.`, `Puedes empezar, pero algunas respuestas serán más generales. El sistema marca datos faltantes.`],
    [`คำตอบเชื่อถือได้แค่ไหน?`, `คำตอบเชื่อถือได้แค่ไหน?`, `How reliable are the answers?`, `答案可信度如何？`, `Câu trả lời đáng tin đến đâu?`, `回答はどれくらい信頼できますか？`, `답변은 얼마나 신뢰할 수 있나요?`, `Насколько надёжны ответы?`, `¿Qué tan confiables son las respuestas?`],
    [`Hourkey แสดงเหตุผลและชั้นข้อมูลที่ใช้ประกอบคำตอบ แต่ผลลัพธ์ควรใช้เป็นเครื่องมือช่วยคิด ไม่ใช่การรับประกันเหตุการณ์ในอนาคต`, `Hourkey แสดงเหตุผลและชั้นข้อมูลที่ใช้ประกอบคำตอบ แต่ผลลัพธ์ควรใช้เป็นเครื่องมือช่วยคิด ไม่ใช่การรับประกันเหตุการณ์ในอนาคต`, `Hourkey shows reasons and data layers, but results should be used as decision support, not a guarantee of future events.`, `Hourkey 會顯示理由與資料層，但結果應作為思考工具，不是未來事件保證。`, `Hourkey hiển thị lý do và lớp dữ liệu, nhưng kết quả nên dùng như công cụ hỗ trợ suy nghĩ, không phải bảo đảm tương lai.`, `Hourkey は理由とデータ層を示しますが、結果は判断補助であり未来の保証ではありません。`, `Hourkey는 이유와 데이터 층을 보여주지만 결과는 사고 보조 도구이며 미래 보장이 아닙니다.`, `Hourkey показывает причины и слои данных, но результат — поддержка решения, не гарантия будущего.`, `Hourkey muestra razones y capas de datos, pero el resultado es apoyo para decidir, no garantía del futuro.`],
    [`ข้อมูลของฉันถูกใช้ยังไง?`, `ข้อมูลของฉันถูกใช้ยังไง?`, `How is my data used?`, `我的資料如何使用？`, `Dữ liệu của tôi được dùng thế nào?`, `自分のデータはどう使われますか？`, `내 데이터는 어떻게 쓰이나요?`, `Как используются мои данные?`, `¿Cómo se usan mis datos?`],
    [`ข้อมูลโปรไฟล์และบริบทคำถามถูกใช้เพื่อคำนวณและสร้างคำตอบเฉพาะตัวในระบบ Hourkey`, `ข้อมูลโปรไฟล์และบริบทคำถามถูกใช้เพื่อคำนวณและสร้างคำตอบเฉพาะตัวในระบบ Hourkey`, `Profile and question context are used to calculate and generate personalized answers inside Hourkey.`, `個人資料與問題背景會用於 Hourkey 內部計算並產生個人化答案。`, `Hồ sơ và bối cảnh câu hỏi được dùng để tính toán và tạo câu trả lời cá nhân trong Hourkey.`, `プロフィールと質問背景は Hourkey 内で計算し個別回答を作るために使われます。`, `프로필과 질문 맥락은 Hourkey 안에서 계산하고 개인화 답변을 만드는 데 쓰입니다.`, `Профиль и контекст вопроса используются внутри Hourkey для расчёта и персонального ответа.`, `El perfil y el contexto se usan dentro de Hourkey para calcular y generar respuestas personalizadas.`],
    [`เริ่มจากโปรไฟล์ดวงจีนของคุณ`, `เริ่มจากโปรไฟล์ดวงจีนของคุณ`, `Start from your Chinese chart profile`, `從你的中式命盤資料開始`, `Bắt đầu từ hồ sơ lá số Trung Hoa của bạn`, `あなたの中国命理プロフィールから始める`, `나의 중국 명리 프로필에서 시작`, `Начните с профиля китайской карты`, `Empieza desde tu perfil de carta china`],
    [`ให้ Hourkey อ่านบริบทก่อนตัดสินใจ`, `ให้ Hourkey อ่านบริบทก่อนตัดสินใจ`, `Let Hourkey read the context before you decide`, `讓 Hourkey 先讀背景，再做決定`, `Để Hourkey đọc bối cảnh trước khi quyết định`, `決める前に Hourkey に背景を読ませる`, `결정 전 Hourkey가 맥락을 읽게 하세요`, `Пусть Hourkey прочитает контекст до решения`, `Deja que Hourkey lea el contexto antes de decidir`],
    [`สร้างคำตอบจากวันเวลาเกิด ฤกษ์ ทิศ พื้นที่ และข้อมูลจริงของคำถามที่คุณกำลังตัดสินใจ`, `สร้างคำตอบจากวันเวลาเกิด ฤกษ์ ทิศ พื้นที่ และข้อมูลจริงของคำถามที่คุณกำลังตัดสินใจ`, `Create answers from birth data, timing, direction, space, and the real details of the decision in front of you.`, `從出生時間、擇日、方位、空間與你正在決策的真實資料建立答案。`, `Tạo câu trả lời từ ngày giờ sinh, thời điểm, hướng, không gian và dữ liệu thật của quyết định hiện tại.`, `出生データ、日取り、方位、空間、目の前の決定に関する実情報から答えを作ります。`, `출생 데이터, 택일, 방향, 공간, 현재 결정의 실제 정보로 답을 만듭니다.`, `Создаёт ответ из данных рождения, времени, направления, пространства и реальных деталей решения.`, `Crea respuestas desde datos natales, fecha, dirección, espacio y detalles reales de tu decisión.`],
    [`hourkey · ระบบวิเคราะห์ดวงจีนเพื่อช่วยตัดสินใจ`, `hourkey · ระบบวิเคราะห์ดวงจีนเพื่อช่วยตัดสินใจ`, `hourkey · Chinese metaphysics for decision support`, `hourkey · 輔助決策的中式命理系統`, `hourkey · huyền học Trung Hoa hỗ trợ quyết định`, `hourkey · 意思決定を支える中国命理`, `hourkey · 결정을 돕는 중국 명리 시스템`, `hourkey · китайская метафизика для решений`, `hourkey · metafísica china para apoyar decisiones`],
    [`คู่มือศาสตร์`, `คู่มือศาสตร์`, `Science guide`, `術數指南`, `Hướng dẫn các môn`, `術数ガイド`, `술수 가이드`, `Справочник школ`, `Guía de ciencias`],
    [`ดวงดาว`, `ดวงดาว`, `Stars`, `星空`, `Sao trời`, `星`, `별`, `Звёзды`, `Estrellas`],
    [`วิธีคำนวณ`, `วิธีคำนวณ`, `Methodology`, `計算方法`, `Phương pháp`, `計算方法`, `계산 방식`, `Методология`, `Metodología`],
    [`ความแม่นยำ`, `ความแม่นยำ`, `Accuracy`, `準確度`, `Độ chính xác`, `精度`, `정확도`, `Точность`, `Precisión`],
    [`ใช้เพื่อประกอบการตัดสินใจ ไม่ใช่คำแนะนำทางแพทย์ กฎหมาย หรือการเงิน`, `ใช้เพื่อประกอบการตัดสินใจ ไม่ใช่คำแนะนำทางแพทย์ กฎหมาย หรือการเงิน`, `For decision support only. Not medical, legal, or financial advice.`, `僅供輔助決策；不是醫療、法律或財務建議。`, `Chỉ dùng hỗ trợ quyết định, không phải tư vấn y tế, pháp lý hay tài chính.`, `意思決定の参考用です。医療・法律・金融助言ではありません。`, `결정 참고용이며 의료, 법률, 금융 조언이 아닙니다.`, `Только для поддержки решений, не медицинский, юридический или финансовый совет.`, `Solo apoyo para decisiones; no es consejo médico, legal ni financiero.`],
    [`Hourkey luopan and AI reading desk`, `โต๊ะอ่านดวง AI และหล่อแกของ Hourkey`, `Hourkey luopan and AI reading desk`, `Hourkey 羅盤與 AI 解讀桌面`, `Bàn đọc AI và luopan của Hourkey`, `Hourkey の羅盤と AI リーディングデスク`, `Hourkey 나경과 AI 리딩 데스크`, `Лопань Hourkey и стол AI-разбора`, `Luopan de Hourkey y mesa de lectura AI`],
    [`Core calculation signals`, `สัญญาณคำนวณหลัก`, `Core calculation signals`, `核心計算訊號`, `Tín hiệu tính toán cốt lõi`, `主要計算シグナル`, `핵심 계산 신호`, `Ключевые расчётные сигналы`, `Señales centrales de cálculo`],
    [`Hourkey reading context`, `บริบทคำอ่านของ Hourkey`, `Hourkey reading context`, `Hourkey 解讀背景`, `Bối cảnh đọc của Hourkey`, `Hourkey の読み取り背景`, `Hourkey 리딩 맥락`, `Контекст чтения Hourkey`, `Contexto de lectura de Hourkey`],
    [`sample bazi pillars`, `เสาปาจื้อตัวอย่าง`, `sample bazi pillars`, `八字四柱範例`, `trụ BaZi mẫu`, `BaZi 四柱サンプル`, `사주 기둥 예시`, `пример столпов Ба-цзы`, `pilares BaZi de ejemplo`],
    [`Hourkey trust signals`, `สัญญาณความน่าเชื่อถือของ Hourkey`, `Hourkey trust signals`, `Hourkey 信任訊號`, `Tín hiệu tin cậy của Hourkey`, `Hourkey の信頼シグナル`, `Hourkey 신뢰 신호`, `Сигналы доверия Hourkey`, `Señales de confianza de Hourkey`],
  ];

  const dictionaries = Object.fromEntries(SUPPORTED_LANGS.map((lang) => [lang, new Map()]));
  function rowValue(row, lang) {
    const base = lang === 'cn' ? 'zh' : lang;
    const index = LANGS.indexOf(base);
    return index >= 0 ? (row[index + 1] || row[1] || row[0]) : (row[1] || row[0]);
  }
  ROWS.forEach((row) => {
    SUPPORTED_LANGS.forEach((lang) => {
      const target = rowValue(row, lang);
      row.forEach((candidate) => {
        if (candidate != null && candidate !== '') dictionaries[lang].set(candidate, target);
      });
    });
  });

  const attrSources = new WeakMap();
  const textSources = new WeakMap();
  const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'SELECT', 'OPTION']);
  const translatableAttrs = ['aria-label', 'alt', 'content'];
  let activeLang = 'th';

  function normalizeLang(value) {
    const raw = String(value || '').trim().toLowerCase().replace('_', '-');
    if (raw === 'cn' || raw === 'zh-cn' || raw === 'zh-hans' || raw === 'hans') return 'cn';
    if (raw === 'zh-hant' || raw === 'zh-tw' || raw === 'zh-hk' || raw === 'hant') return 'zh';
    return SUPPORTED_LANGS.includes(raw) ? raw : null;
  }

  function readInitialLang() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = normalizeLang(params.get('lang'));
    if (fromUrl) return fromUrl;
    try {
      const landingStored = normalizeLang(window.localStorage.getItem(LANDING_STORAGE_KEY));
      if (landingStored) return landingStored;
      for (const key of GLOBAL_STORAGE_KEYS) {
        const stored = normalizeLang(window.localStorage.getItem(key));
        if (stored === 'zh' && window.localStorage.getItem('hk_zh_variant') === 'cn') return 'cn';
        if (stored) return stored;
      }
    } catch (_) {}
    return 'th';
  }

  function t(source, lang) {
    const dictLang = lang === 'cn' ? 'zh' : lang;
    const dict = dictionaries[dictLang] || dictionaries.th;
    return dict.get(source) || dictionaries.th.get(source) || source;
  }

  function replacePreservingTrim(raw, replacement) {
    const start = raw.match(/^\s*/)[0];
    const end = raw.match(/\s*$/)[0];
    return `${start}${replacement}${end}`;
  }

  function translateText(lang) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || skipTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (!textSources.has(node)) textSources.set(node, node.textContent);
      const source = textSources.get(node);
      const key = source.trim();
      if (!key) return;
      const translated = t(key, lang);
      const nextText = replacePreservingTrim(source, translated);
      if (node.textContent !== nextText) node.textContent = nextText;
    });
  }

  function attrSource(el, attr) {
    let saved = attrSources.get(el);
    if (!saved) {
      saved = {};
      attrSources.set(el, saved);
    }
    if (saved[attr] == null) saved[attr] = el.getAttribute(attr);
    return saved[attr];
  }

  function translateAttrs(lang) {
    document.querySelectorAll('*').forEach((el) => {
      translatableAttrs.forEach((attr) => {
        if (!el.hasAttribute(attr)) return;
        const source = attrSource(el, attr);
        if (!source) return;
        const translated = t(source, lang);
        if (el.getAttribute(attr) !== translated) el.setAttribute(attr, translated);
      });
    });
  }

  function applyMeta(lang) {
    const meta = META[lang === 'cn' ? 'zh' : lang] || META.th;
    document.title = meta.title;
    const setContent = (selector, value) => {
      const node = document.querySelector(selector);
      if (node) node.setAttribute('content', value);
    };
    setContent('meta[name="description"]', meta.description);
    setContent('meta[property="og:title"]', meta.title);
    setContent('meta[property="og:description"]', meta.og);
    setContent('meta[name="twitter:title"]', meta.title);
    setContent('meta[name="twitter:description"]', meta.twitter);
  }

  function syncControls(lang) {
    document.querySelectorAll('#landingLang').forEach((select) => {
      select.value = lang;
      select.setAttribute('aria-label', t('ภาษา', lang));
    });
  }

  function persistLang(lang) {
    try {
      window.localStorage.setItem(LANDING_STORAGE_KEY, lang);
      if (window.HK_LANG_STATE && typeof window.HK_LANG_STATE.set === 'function') {
        window.HK_LANG_STATE.set(lang === 'cn' ? 'zh-cn' : lang);
      } else if (LIVE_GLOBAL_LANGS.includes(lang) || SUPPORTED_LANGS.includes(lang)) {
        const stored = lang === 'cn' ? 'zh' : lang;
        GLOBAL_STORAGE_KEYS.forEach((key) => window.localStorage.setItem(key, stored));
        if (lang === 'cn') window.localStorage.setItem('hk_zh_variant', 'cn');
        else if (lang === 'zh') window.localStorage.setItem('hk_zh_variant', 'hant');
        else window.localStorage.removeItem('hk_zh_variant');
      }
      if (lang === 'cn') window.localStorage.setItem('hk_zh_variant', 'cn');
      else if (lang === 'zh') window.localStorage.setItem('hk_zh_variant', 'hant');
    } catch (_) {}
  }

  function updateUrl(lang) {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', lang);
    window.history.replaceState(null, '', url);
  }

  function syncArticleLinks(lang) {
    const selector = [
      'a[href="/article-hourkey-guide.html"]',
      'a[href^="/article-hourkey-guide.html?"]',
      'a[href="/article/geometry"]',
      'a[href^="/article/geometry?"]',
      'a[href^="/articles/sciences/"]',
      'a[href="/signup"]',
      'a[href^="/signup?"]',
      'a[href="/signup.html"]',
      'a[href^="/signup.html?"]',
      'a[href="/pricing"]',
      'a[href^="/pricing?"]',
      'a[href="/pricing.html"]',
      'a[href^="/pricing.html?"]',
    ].join(',');
    document.querySelectorAll(selector).forEach((link) => {
      const raw = link.getAttribute('href') || '';
      if (!raw.startsWith('/')) return;
      const url = new URL(raw, window.location.origin);
      url.searchParams.set('lang', lang);
      link.setAttribute('href', `${url.pathname}${url.search}${url.hash}`);
    });
  }

  function applyDomLang(next) {
    document.documentElement.lang = HTML_LANG[next] || next;
    document.documentElement.setAttribute('data-lang', next === 'cn' ? 'zh' : next);
    document.documentElement.setAttribute('data-hk-locale', next === 'cn' ? 'zh' : next);
    if (next === 'cn' || next === 'zh') document.documentElement.setAttribute('data-zh-variant', next === 'cn' ? 'cn' : 'hant');
    else document.documentElement.removeAttribute('data-zh-variant');
    document.body.setAttribute('data-lang', next);
  }

  function applyLang(lang, options) {
    const next = normalizeLang(lang) || 'th';
    activeLang = next;
    applyDomLang(next);
    translateText(next);
    translateAttrs(next);
    applyMeta(next);
    syncControls(next);
    syncArticleLinks(next);
    if (!options || options.persist !== false) persistLang(next);
    if (options && options.updateUrl) updateUrl(next);
    applyDomLang(next);
  }

  function boot() {
    const current = readInitialLang();
    const select = document.getElementById('landingLang');
    if (select) {
      select.addEventListener('change', () => applyLang(select.value, { updateUrl: true }));
    }
    applyLang(current, { persist: Boolean(normalizeLang(new URLSearchParams(window.location.search).get('lang'))) });
    setInterval(() => applyDomLang(activeLang), 500);
    document.addEventListener('hk:locale', (event) => {
      const detail = (event && event.detail) || {};
      let next = String(detail.html || '').toLowerCase() === 'zh-hans' ? 'cn' : normalizeLang(detail.locale || detail.raw);
      if (next === 'zh') {
        try { if (window.localStorage.getItem('hk_zh_variant') === 'cn') next = 'cn'; } catch (_) {}
      }
      if (next && next !== normalizeLang(document.body.getAttribute('data-lang'))) applyLang(next, { persist: false, updateUrl: false });
    });
    window.HK_LANDING_LANG = { set: applyLang, get: () => normalizeLang(document.body.getAttribute('data-lang')) || 'th', supported: SUPPORTED_LANGS.slice() };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
