/* hourkey · global glossary tooltips
 * 9-language click/tap help for technical headings and compact labels.
 */
(function () {
  'use strict';

  if (window.__HK_TOOLTIPS_LOADED__) return;
  window.__HK_TOOLTIPS_LOADED__ = true;

  var VERSION = '2026-07-07.1';
  var ROOT_ID = 'hk-tip-popover';
  var STYLE_ID = 'hk-tip-style';
  var activeButton = null;
  var applyTimer = null;
  var observer = null;

  var UI = {
    more: {
      th:'อธิบายคำนี้', en:'Explain this term', zh:'說明此詞', cn:'说明此词',
      vi:'Giải thích thuật ngữ', ja:'この用語を説明', ru:'Объяснить термин', ko:'용어 설명', es:'Explicar término'
    },
    close: {
      th:'ปิด', en:'Close', zh:'關閉', cn:'关闭',
      vi:'Đóng', ja:'閉じる', ru:'Закрыть', ko:'닫기', es:'Cerrar'
    }
  };

  var GLOSSARY = {
    day_master: {
      title: { th:'วันเกิดหลัก · 日主', en:'Day Master · 日主', zh:'日主', cn:'日主', vi:'Nhật chủ · 日主', ja:'日主', ru:'Господин дня · 日主', ko:'일간 · 日主', es:'Maestro del día · 日主' },
      body: { th:'ก้านฟ้าของวันเกิด คือแกนตัวตนที่ใช้เทียบธาตุ ความสัมพันธ์ สิบเทพ และจังหวะเวลาในปาจื้อ', en:'The heavenly stem of the birth day. It is the self-axis used to read elements, Ten Gods, relationships, and timing.', zh:'出生之日的天干，是命局中的自身軸，用來判斷五行、十神、人事與行運。', cn:'出生日的天干，是命局中的自身轴，用来判断五行、十神、人事与行运。', vi:'Thiên can của ngày sinh, là trục bản thân để đọc ngũ hành, Thập Thần, quan hệ và vận hạn.', ja:'生まれた日の天干です。五行、十神、人間関係、運の流れを読む中心軸です。', ru:'Небесный ствол дня рождения. Это ось личности для чтения стихий, Десяти богов, отношений и периодов.', ko:'태어난 날의 천간입니다. 오행, 십신, 관계, 운의 흐름을 읽는 기준축입니다.', es:'El tallo celestial del día de nacimiento. Es el eje personal para leer elementos, Diez Dioses, relaciones y tiempo.' }
    },
    four_pillars: {
      title: { th:'สี่เสา · 四柱', en:'Four Pillars · 四柱', zh:'四柱', cn:'四柱', vi:'Tứ trụ · 四柱', ja:'四柱', ru:'Четыре столпа · 四柱', ko:'사주 · 四柱', es:'Cuatro pilares · 四柱' },
      body: { th:'ปี เดือน วัน และยามเกิด แต่ละเสามีก้านฟ้าและกิ่งดิน รวมเป็นโครงหลักของดวงปาจื้อ', en:'Year, month, day, and hour of birth. Each pillar has a stem and branch, forming the BaZi chart frame.', zh:'年、月、日、時四柱，各有天干地支，組成本命八字的基本架構。', cn:'年、月、日、时四柱，各有天干地支，组成本命八字的基本架构。', vi:'Năm, tháng, ngày và giờ sinh. Mỗi trụ có thiên can và địa chi, tạo thành khung Bát tự.', ja:'年・月・日・時の四本柱です。それぞれ天干と地支を持ち、八字の骨格になります。', ru:'Год, месяц, день и час рождения. Каждый столп имеет ствол и ветвь, образуя каркас Ба-цзы.', ko:'년, 월, 일, 시 네 기둥입니다. 각 기둥은 천간과 지지를 가지며 사주의 기본 구조가 됩니다.', es:'Año, mes, día y hora de nacimiento. Cada pilar tiene tallo y rama, formando la base de BaZi.' }
    },
    three_pillars: {
      title: { th:'สามเสา · 三柱', en:'Three Pillars · 三柱', zh:'三柱', cn:'三柱', vi:'Tam trụ · 三柱', ja:'三柱', ru:'Три столпа · 三柱', ko:'삼주 · 三柱', es:'Tres pilares · 三柱' },
      body: { th:'ใช้ปี เดือน และวัน เมื่อไม่ทราบเวลาเกิด ระบบไม่เดาเสายาม จึงอ่านเฉพาะชั้นที่มีข้อมูลจริง', en:'Used when birth time is unknown: year, month, and day only. The hour pillar is not guessed.', zh:'不知出生時辰時，只排年、月、日三柱，不臆測時柱。', cn:'不知出生时辰时，只排年、月、日三柱，不臆测时柱。', vi:'Dùng khi không biết giờ sinh: chỉ năm, tháng, ngày. Hệ thống không đoán trụ giờ.', ja:'出生時刻が不明な場合、年・月・日の三柱だけを使い、時柱は推測しません。', ru:'Если время рождения неизвестно, используются только год, месяц и день. Часовой столп не угадывается.', ko:'출생 시간을 모를 때 년, 월, 일만 사용합니다. 시주는 추측하지 않습니다.', es:'Se usa si no se conoce la hora: solo año, mes y día. No se inventa el pilar de hora.' }
    },
    year_pillar: {
      title: { th:'เสาปี · 年柱', en:'Year Pillar · 年柱', zh:'年柱', cn:'年柱', vi:'Trụ năm · 年柱', ja:'年柱', ru:'Столп года · 年柱', ko:'년주 · 年柱', es:'Pilar del año · 年柱' },
      body: { th:'ชั้นราก ครอบครัว รุ่นวงศ์ เครือข่ายกว้าง และภาพที่โลกเห็นก่อนรู้จักตัวจริง', en:'The outer layer: ancestry, early environment, broad network, and first social impression.', zh:'代表根源、祖上、早年環境、外部圈層與他人初見的印象。', cn:'代表根源、祖上、早年环境、外部圈层与他人初见的印象。', vi:'Lớp bên ngoài: gốc gia đình, môi trường đầu đời, mạng lưới rộng và ấn tượng xã hội đầu tiên.', ja:'家系、幼少環境、広い人脈、外から見える第一印象を示す層です。', ru:'Внешний слой: род, ранняя среда, широкий круг связей и первое социальное впечатление.', ko:'가문, 초기 환경, 넓은 네트워크, 사회적 첫인상을 보는 바깥층입니다.', es:'Capa externa: raíces familiares, entorno inicial, red amplia y primera impresión social.' }
    },
    month_pillar: {
      title: { th:'เสาเดือน · 月柱', en:'Month Pillar · 月柱', zh:'月柱', cn:'月柱', vi:'Trụ tháng · 月柱', ja:'月柱', ru:'Столп месяца · 月柱', ko:'월주 · 月柱', es:'Pilar del mes · 月柱' },
      body: { th:'เสาฤดูกาลและแรงหลักของดวง ใช้อ่านงาน ระบบชีวิต แรงสนับสนุน และสภาพแวดล้อมที่กดดันตัวเรา', en:'The season and command of the chart. It weighs work, life system, support, and pressure around the self.', zh:'月令為命局提綱，主季節之氣、事業環境、支援與壓力來源。', cn:'月令为命局提纲，主季节之气、事业环境、支持与压力来源。', vi:'Lệnh tháng là khí mùa chủ đạo, dùng đọc công việc, hệ thống đời sống, hỗ trợ và áp lực.', ja:'月令は命式の主気です。仕事環境、生活の型、支援、圧力を読む要点です。', ru:'Месячная команда и сезон карты. Показывает работу, систему жизни, поддержку и давление.', ko:'월령은 명식의 주된 계절 기운입니다. 일, 생활 구조, 지원과 압력을 봅니다.', es:'El mes manda la estación de la carta. Pesa trabajo, sistema de vida, apoyo y presión.' }
    },
    day_pillar: {
      title: { th:'เสาวัน · 日柱', en:'Day Pillar · 日柱', zh:'日柱', cn:'日柱', vi:'Trụ ngày · 日柱', ja:'日柱', ru:'Столп дня · 日柱', ko:'일주 · 日柱', es:'Pilar del día · 日柱' },
      body: { th:'แกนตัวเราและวังคู่ครอง ก้านบนคือ日主 กิ่งล่างสะท้อนพื้นที่ความสัมพันธ์ใกล้ตัว', en:'The self and spouse palace. The top stem is the Day Master; the branch shows close relationship space.', zh:'日柱為自身與夫妻宮，上為日主，下支看親密關係與日常承載。', cn:'日柱为自身与夫妻宫，上为日主，下支看亲密关系与日常承载。', vi:'Trụ của bản thân và cung phối ngẫu. Can trên là Nhật chủ, chi dưới là không gian quan hệ gần.', ja:'自分自身と配偶宮を示します。上の干が日主、下の支が親密な関係の場です。', ru:'Столп себя и дворца партнера. Верхний ствол это Господин дня, ветвь показывает близкие отношения.', ko:'자신과 배우자궁을 봅니다. 위 천간은 일간, 아래 지지는 가까운 관계의 공간입니다.', es:'Pilar del yo y del palacio de pareja. El tallo superior es el Day Master; la rama muestra vínculos cercanos.' }
    },
    hour_pillar: {
      title: { th:'เสายาม · 時柱', en:'Hour Pillar · 時柱', zh:'時柱', cn:'时柱', vi:'Trụ giờ · 時柱', ja:'時柱', ru:'Столп часа · 時柱', ko:'시주 · 時柱', es:'Pilar de hora · 時柱' },
      body: { th:'ชั้นแผนระยะยาว ลูกน้อง ลูกหลาน โปรเจกต์ และผลช่วงปลายชีวิต ต้องใช้เวลาเกิดที่แม่นพอ', en:'Long-range plans, projects, children, teams, and later-life output. It needs reliable birth time.', zh:'主晚年、子女、部屬、長線計畫與成果，須有可靠出生時辰。', cn:'主晚年、子女、部属、长期计划与成果，须有可靠出生时辰。', vi:'Dùng đọc kế hoạch dài hạn, dự án, con cái, đội ngũ và hậu vận; cần giờ sinh đủ tin cậy.', ja:'長期計画、子供、部下、プロジェクト、晩年の成果を読みます。正確な出生時刻が必要です。', ru:'Долгие планы, проекты, дети, команды и поздние результаты. Нужна надежная точность времени рождения.', ko:'장기 계획, 프로젝트, 자녀, 팀, 말년 성과를 봅니다. 신뢰할 수 있는 출생 시간이 필요합니다.', es:'Lee planes largos, proyectos, hijos, equipos y resultados tardíos. Requiere hora de nacimiento fiable.' }
    },
    birth_hour: {
      title: { th:'ยามเกิด · 出生時辰', en:'Birth Hour · 出生時辰', zh:'出生時辰', cn:'出生时辰', vi:'Giờ sinh · 出生時辰', ja:'出生時辰', ru:'Час рождения · 出生時辰', ko:'출생 시진 · 出生時辰', es:'Hora natal · 出生時辰' },
      body: { th:'ระบบจีนแบ่งเป็นช่วงละ 2 ชั่วโมง เช่น 丑時 คือ 01:00-03:00 ถ้าไม่แน่ใจควรเลือกไม่ทราบเวลา', en:'Chinese time uses two-hour branches. For example 丑時 is 01:00-03:00. If unsure, choose unknown time.', zh:'中國時辰以兩小時為一段，如丑時為 01:00-03:00。不確定時宜選不知時辰。', cn:'中国时辰以两小时为一段，如丑时为 01:00-03:00。不确定时宜选不知时辰。', vi:'Giờ Trung Hoa chia mỗi 2 giờ. Ví dụ 丑時 là 01:00-03:00. Nếu không chắc, chọn không biết giờ.', ja:'中国式の時辰は2時間単位です。丑時は01:00-03:00。不明なら不明を選びます。', ru:'Китайские часы идут блоками по два часа. 丑時 это 01:00-03:00. Если не уверены, выберите неизвестно.', ko:'중국 시진은 2시간 단위입니다. 丑時는 01:00-03:00입니다. 불확실하면 시간 모름을 선택합니다.', es:'La hora china usa bloques de dos horas. 丑時 es 01:00-03:00. Si duda, elija hora desconocida.' }
    },
    five_elements: {
      title: { th:'ห้าธาตุ · 五行', en:'Five Elements · 五行', zh:'五行', cn:'五行', vi:'Ngũ hành · 五行', ja:'五行', ru:'Пять стихий · 五行', ko:'오행 · 五行', es:'Cinco elementos · 五行' },
      body: { th:'ไม้ ไฟ ดิน ทอง น้ำ ใช้อ่านสมดุลพลัง การหนุน การควบคุม และสิ่งที่ควรเสริมในชีวิตจริง', en:'Wood, Fire, Earth, Metal, and Water. They show balance, support, control, and what to strengthen in real life.', zh:'木、火、土、金、水，用來看氣的平衡、生剋與現實中宜補之處。', cn:'木、火、土、金、水，用来看气的平衡、生克与现实中宜补之处。', vi:'Mộc, Hỏa, Thổ, Kim, Thủy. Dùng đọc cân bằng, sinh khắc và điều nên bổ sung trong đời sống.', ja:'木・火・土・金・水です。気のバランス、生剋、現実で補う点を読みます。', ru:'Дерево, Огонь, Земля, Металл и Вода. Показывают баланс, поддержку, контроль и что стоит усилить.', ko:'목, 화, 토, 금, 수입니다. 균형, 생극, 현실에서 보강할 점을 봅니다.', es:'Madera, Fuego, Tierra, Metal y Agua. Muestran equilibrio, apoyo, control y qué fortalecer.' }
    },
    functional_strength: {
      title: { th:'พลังใช้ได้จริง · 根氣折算', en:'Functional Strength · 根氣折算', zh:'根氣折算', cn:'根气折算', vi:'Sức dùng thực tế · 根氣折算', ja:'実効強度 · 根氣折算', ru:'Рабочая сила · 根氣折算', ko:'실사용 강도 · 根氣折算', es:'Fuerza funcional · 根氣折算' },
      body: { th:'ไม่ได้นับแค่จำนวนธาตุ แต่ลดน้ำหนักตามราก ฤดูกาล และแรงที่ใช้ได้จริงในผัง', en:'Not just element count. It adjusts weight by roots, season, and usable force inside the chart.', zh:'不只計算五行數量，還依根氣、月令與實際可用之力折算權重。', cn:'不只计算五行数量，还依根气、月令与实际可用之力折算权重。', vi:'Không chỉ đếm số lượng ngũ hành; còn quy đổi theo gốc khí, mùa và lực dùng được.', ja:'単なる五行の数ではなく、根、季節、実際に使える力で重みを補正します。', ru:'Это не просто подсчет стихий. Вес корректируется по корням, сезону и реально доступной силе.', ko:'오행 개수만 세지 않고 뿌리, 계절, 실제 사용 가능한 힘으로 가중치를 조정합니다.', es:'No es solo contar elementos. Ajusta peso por raíces, estación y fuerza utilizable en la carta.' }
    },
    rootedness: {
      title: { th:'รากธาตุ · 根氣', en:'Rootedness · 根氣', zh:'根氣', cn:'根气', vi:'Gốc khí · 根氣', ja:'根氣', ru:'Укорененность · 根氣', ko:'뿌리 기운 · 根氣', es:'Raíz de qi · 根氣' },
      body: { th:'ดูว่าธาตุนั้นมีที่ยืนในกิ่งดิน ฤดูกาล หรือ藏干หรือไม่ ธาตุมีรากจะทำงานจริงกว่า', en:'Checks whether an element has roots in branches, season, or hidden stems. Rooted elements act more reliably.', zh:'看五行是否得地支、月令或藏干之根；有根者較能在現實中發力。', cn:'看五行是否得地支、月令或藏干之根；有根者较能在现实中发力。', vi:'Xem hành đó có gốc trong địa chi, mùa hoặc tàng can không. Có gốc thì dễ phát lực thật.', ja:'その五行が地支、季節、蔵干に根を持つかを見ます。根があるほど現実で働きます。', ru:'Проверяет, есть ли у стихии корни в ветвях, сезоне или скрытых стволах. С корнем она действует надежнее.', ko:'오행이 지지, 계절, 지장간에 뿌리가 있는지 봅니다. 뿌리가 있으면 현실 작동력이 높습니다.', es:'Mira si el elemento tiene raíz en ramas, estación o tallos ocultos. Con raíz actúa mejor.' }
    },
    ten_gods: {
      title: { th:'สิบเทพ · 十神', en:'Ten Gods · 十神', zh:'十神', cn:'十神', vi:'Thập Thần · 十神', ja:'十神', ru:'Десять богов · 十神', ko:'십신 · 十神', es:'Diez Dioses · 十神' },
      body: { th:'บทบาทที่เกิดจากความสัมพันธ์ของธาตุอื่นกับ日主 เช่น งาน เงิน อำนาจ ความคิด คนช่วย และคู่แข่ง', en:'Roles created by each element relationship to the Day Master, such as work, money, authority, ideas, helpers, and rivals.', zh:'各五行相對日主形成的人事角色，如事業、財、官、思想、助力與競爭。', cn:'各五行相对日主形成的人事角色，如事业、财、官、思想、助力与竞争。', vi:'Vai trò sinh từ quan hệ ngũ hành với Nhật chủ: việc, tiền, quyền, ý tưởng, người giúp và cạnh tranh.', ja:'日主に対する五行関係から生まれる役割です。仕事、財、官、思考、支援、競争を示します。', ru:'Роли, возникающие из отношений стихий к Господину дня: работа, деньги, власть, идеи, помощники и соперники.', ko:'일간과 오행의 관계에서 생기는 역할입니다. 일, 돈, 권위, 생각, 도움, 경쟁을 봅니다.', es:'Roles por la relación de cada elemento con el Day Master: trabajo, dinero, autoridad, ideas, ayuda y rivales.' }
    },
    useful_god: {
      title: { th:'ย่งเสิน · 用神', en:'Useful God · 用神', zh:'用神', cn:'用神', vi:'Dụng thần · 用神', ja:'用神', ru:'Полезный элемент · 用神', ko:'용신 · 用神', es:'Dios útil · 用神' },
      body: { th:'ธาตุหรือแรงที่ช่วยให้ดวงไหลถูกทาง ใช้เป็นเข็มทิศในการเลือกเวลา งาน คน สถานที่ และการตัดสินใจ', en:'The force that helps the chart flow correctly. It guides timing, work, people, places, and decisions.', zh:'使命局氣機順行的關鍵用力，可作選時、用人、行事與取向之指南。', cn:'使命局气机顺行的关键用力，可作择时、用人、行事与取向之指南。', vi:'Lực giúp lá số vận hành đúng dòng, dùng làm kim chỉ nam chọn thời điểm, công việc, người và nơi.', ja:'命式の気を正しく流す鍵です。時期、仕事、人、場所、判断の指針になります。', ru:'Сила, которая помогает карте течь правильно. Направляет выбор времени, работы, людей, мест и решений.', ko:'명식의 기운을 바르게 흐르게 하는 핵심 힘입니다. 시간, 일, 사람, 장소, 결정을 고르는 기준입니다.', es:'La fuerza que hace fluir la carta correctamente. Guía tiempo, trabajo, personas, lugares y decisiones.' }
    },
    joy_god: {
      title: { th:'喜神 · ธาตุเสริม', en:'Support Element · 喜神', zh:'喜神', cn:'喜神', vi:'Hỷ thần · 喜神', ja:'喜神', ru:'Поддерживающий элемент · 喜神', ko:'희신 · 喜神', es:'Elemento de apoyo · 喜神' },
      body: { th:'ตัวช่วยรองจาก用神 ใช้ได้ดีเมื่อไม่ขัดกับโครงดวงและจังหวะเวลาปัจจุบัน', en:'A secondary helper after the Useful God. It works well when it does not conflict with the chart and current timing.', zh:'用神之外的輔助力量；不逆命局與當前行運時，可作助力。', cn:'用神之外的辅助力量；不逆命局与当前行运时，可作助力。', vi:'Lực hỗ trợ sau Dụng thần; dùng tốt khi không trái cấu trúc lá số và vận hiện tại.', ja:'用神を補助する二次的な力です。命式と現在の運に逆らわない時に働きます。', ru:'Второй помощник после 用神. Работает, если не спорит со структурой карты и текущим временем.', ko:'용신을 보조하는 두 번째 힘입니다. 명식과 현재 운을 거스르지 않을 때 유용합니다.', es:'Ayuda secundaria después del 用神. Funciona si no contradice la carta ni el momento actual.' }
    },
    avoid_god: {
      title: { th:'กีเสิน · 忌神', en:'Avoid Element · 忌神', zh:'忌神', cn:'忌神', vi:'Kỵ thần · 忌神', ja:'忌神', ru:'Нежелательный элемент · 忌神', ko:'기신 · 忌神', es:'Elemento a evitar · 忌神' },
      body: { th:'แรงที่ทำให้ดวงเสียสมดุล ไม่ได้แปลว่าเลวเสมอ แต่ควรจัดการ ไม่เร่ง ไม่เพิ่มโดยไม่จำเป็น', en:'A force that destabilizes the chart. It is not always bad, but should be managed rather than amplified.', zh:'使命局失衡之力；不必然為壞，但宜節制、化解，不宜無故加重。', cn:'使命局失衡之力；不必然为坏，但宜节制、化解，不宜无故加重。', vi:'Lực làm lá số mất cân bằng. Không phải luôn xấu, nhưng nên quản lý thay vì khuếch đại.', ja:'命式のバランスを崩す力です。必ず悪いわけではありませんが、増やさず調整します。', ru:'Сила, нарушающая баланс карты. Не всегда зло, но ее лучше управлять, а не усиливать.', ko:'명식의 균형을 흔드는 힘입니다. 항상 나쁘다는 뜻은 아니지만 키우기보다 조절해야 합니다.', es:'Fuerza que desbalancea la carta. No siempre es mala, pero conviene gestionarla, no ampliarla.' }
    },
    regulating_god: {
      title: { th:'調候 · ปรับฤดูกาล', en:'Regulating God · 調候', zh:'調候', cn:'调候', vi:'Điều hậu · 調候', ja:'調候', ru:'Регулятор сезона · 調候', ko:'조후 · 調候', es:'Regulador estacional · 調候' },
      body: { th:'ยาปรับอุณหภูมิและฤดูกาลของดวง เช่น หนาวไปต้องอุ่น ร้อนไปต้องเย็น อ่านร่วมกับ用神หลัก', en:'The seasonal medicine of the chart, such as warming cold charts or cooling hot charts. Read with the main Useful God.', zh:'調整寒暖燥濕之用，如寒則取暖、熱則取涼；須與主用神合參。', cn:'调整寒暖燥湿之用，如寒则取暖、热则取凉；须与主用神合参。', vi:'Thuốc điều mùa của lá số: lạnh cần ấm, nóng cần mát. Cần đọc cùng Dụng thần chính.', ja:'寒暖燥湿を整える薬です。寒ければ温め、熱ければ冷ます。主用神と合わせて読みます。', ru:'Сезонное лекарство карты: согреть холодное, охладить горячее. Читается вместе с главным 用神.', ko:'명식의 한난조습을 조절하는 약입니다. 추우면 덥히고 뜨거우면 식히며 주 용신과 함께 봅니다.', es:'Medicina estacional de la carta: calentar lo frío o enfriar lo caliente. Se lee con el 用神 principal.' }
    },
    luck_pillar: {
      title: { th:'วัยจร 10 ปี · 大運', en:'10-year Luck Pillar · 大運', zh:'大運', cn:'大运', vi:'Đại vận 10 năm · 大運', ja:'大運', ru:'10-летний столп удачи · 大運', ko:'대운 · 大運', es:'Pilar decenal · 大運' },
      body: { th:'รอบเวลาใหญ่ประมาณ 10 ปี ใช้ดูธีมชีวิต งาน เงิน ความสัมพันธ์ และโอกาสที่กำลังเปิดหรือปิด', en:'A major ten-year cycle showing life themes, work, money, relationships, and windows that open or close.', zh:'約十年一柱的大週期，用來看人生主題、事業財務、人際與機會窗口。', cn:'约十年一柱的大周期，用来看人生主题、事业财务、人际与机会窗口。', vi:'Chu kỳ lớn khoảng 10 năm, đọc chủ đề đời sống, công việc, tiền bạc, quan hệ và cửa cơ hội.', ja:'約10年ごとの大きな運期です。人生テーマ、仕事、財、関係、開閉する機会を見ます。', ru:'Крупный цикл примерно на 10 лет: темы жизни, работа, деньги, отношения и окна возможностей.', ko:'약 10년 단위의 큰 운입니다. 삶의 주제, 일, 돈, 관계, 열리고 닫히는 기회를 봅니다.', es:'Ciclo mayor de unos 10 años: temas de vida, trabajo, dinero, relaciones y ventanas de oportunidad.' }
    },
    flow_year: {
      title: { th:'ปีจร · 流年', en:'Annual Transit · 流年', zh:'流年', cn:'流年', vi:'Lưu niên · 流年', ja:'流年', ru:'Годовой транзит · 流年', ko:'유년 · 流年', es:'Tránsito anual · 流年' },
      body: { th:'พลังของปีปัจจุบันที่มากระทบดวงเกิดและ大運 ใช้ดูธีมเด่น เหตุเปิด และจุดต้องระวังของปี', en:'The current year energy interacting with the natal chart and Luck Pillar. It shows yearly themes and cautions.', zh:'當年之氣與本命、大運互動，用來看年度主題、引動點與需防之處。', cn:'当年之气与本命、大运互动，用来看年度主题、引动点与需防之处。', vi:'Khí của năm hiện tại tác động với lá số gốc và Đại vận, cho biết chủ đề và điểm cần lưu ý trong năm.', ja:'今年の気が命式と大運に作用するものです。年のテーマ、起点、注意点を見ます。', ru:'Энергия текущего года во взаимодействии с натальной картой и 大運. Показывает темы и осторожность года.', ko:'현재 해의 기운이 원국과 대운에 작용합니다. 올해 주제, 작동점, 주의점을 봅니다.', es:'Energía del año actual al interactuar con carta natal y 大運. Muestra temas y cautelas anuales.' }
    },
    flow_month: {
      title: { th:'เดือนจร · 流月', en:'Monthly Transit · 流月', zh:'流月', cn:'流月', vi:'Lưu nguyệt · 流月', ja:'流月', ru:'Месячный транзит · 流月', ko:'유월 · 流月', es:'Tránsito mensual · 流月' },
      body: { th:'จังหวะรายเดือนของปาจื้อ ใช้เลือกเดือนลงมือ วางแผนงาน และดูแรงเสริม/แรงชนระยะกลาง', en:'The monthly BaZi timing layer for choosing action months, planning work, and reading medium-term support or clash.', zh:'月度行運層，用於擇月、規劃事項，並看中期助力或衝突。', cn:'月度行运层，用于择月、规划事项，并看中期助力或冲突。', vi:'Tầng thời gian theo tháng để chọn tháng hành động, lập kế hoạch và đọc hỗ trợ hoặc xung đột trung hạn.', ja:'月ごとの運の層です。実行月、計画、中期の助力や衝突を見ます。', ru:'Месячный слой времени для выбора месяца действий, планирования и среднесрочной поддержки или конфликта.', ko:'월 단위 운의 층입니다. 실행할 달, 업무 계획, 중기적 도움과 충돌을 봅니다.', es:'Capa mensual para elegir meses de acción, planificar y leer apoyo o choque de medio plazo.' }
    },
    flow_day: {
      title: { th:'วันจร · 流日', en:'Daily Transit · 流日', zh:'流日', cn:'流日', vi:'Lưu nhật · 流日', ja:'流日', ru:'Дневной транзит · 流日', ko:'유일 · 流日', es:'Tránsito diario · 流日' },
      body: { th:'พลังของวัน ใช้ดูว่าวันนี้เหมาะกับงานแบบใด ควรเร่ง รอ หรือหลีกเลี่ยงเรื่องใด', en:'The day energy. It helps decide what today supports, what to push, pause, or avoid.', zh:'當日之氣，用來判斷今日宜做何事、可推進或宜暫避之處。', cn:'当日之气，用来判断今日宜做何事、可推进或宜暂避之处。', vi:'Khí của ngày, giúp biết hôm nay hợp việc gì, nên đẩy, nên chờ hay nên tránh.', ja:'その日の気です。今日は何に向くか、進めるか、待つか、避けるかを見ます。', ru:'Энергия дня. Помогает понять, что сегодня поддержано, что продвигать, отложить или избегать.', ko:'그날의 기운입니다. 오늘 무엇이 맞는지, 밀어붙일지, 기다릴지, 피할지를 봅니다.', es:'Energía del día. Ayuda a decidir qué favorece hoy, qué empujar, pausar o evitar.' }
    },
    flow_hour: {
      title: { th:'ชั่วยามจร · 流時', en:'Hourly Transit · 流時', zh:'流時', cn:'流时', vi:'Lưu thời · 流時', ja:'流時', ru:'Часовой транзит · 流時', ko:'유시 · 流時', es:'Tránsito horario · 流時' },
      body: { th:'ช่วงเวลารายยามประมาณ 2 ชั่วโมง ใช้จับจังหวะเริ่มงาน โทรคุย เซ็น กดส่ง หรือเลี่ยงชั่วโมงแรง', en:'A roughly two-hour timing window for starting tasks, calls, signing, sending, or avoiding heavy hours.', zh:'約兩小時一段的時運，用來抓啟動、洽談、簽送或避開強烈時段。', cn:'约两小时一段的时运，用来抓启动、洽谈、签送或避开强烈时段。', vi:'Khung khoảng 2 giờ để bắt đầu việc, gọi, ký, gửi hoặc tránh giờ nặng.', ja:'約2時間ごとの時運です。開始、連絡、署名、送信、避ける時間を選びます。', ru:'Окно примерно на два часа для старта задач, звонков, подписей, отправки или избегания тяжелого часа.', ko:'약 2시간 단위의 시간 운입니다. 시작, 통화, 서명, 전송, 피해야 할 시간을 고릅니다.', es:'Ventana de unas dos horas para iniciar, llamar, firmar, enviar o evitar una hora pesada.' }
    },
    interactions: {
      title: { th:'ปฏิกิริยาในดวง · 關係', en:'Chart Interactions · 關係', zh:'關係', cn:'关系', vi:'Tương tác lá số · 關係', ja:'命式の相互作用 · 關係', ru:'Взаимодействия карты · 關係', ko:'명식 상호작용 · 關係', es:'Interacciones de carta · 關係' },
      body: { th:'การชน ผสาน ทำร้าย ลงโทษ หรือทำลายระหว่างกิ่ง/ก้าน บอกจุดเปิด จุดติด และแรงเปลี่ยนแปลง', en:'Clashes, combinations, harms, punishments, and breaks between stems or branches show openings, friction, and change.', zh:'干支之間的沖、合、害、刑、破，可見引動、阻滯與變化之力。', cn:'干支之间的冲、合、害、刑、破，可见引动、阻滞与变化之力。', vi:'Xung, hợp, hại, hình, phá giữa can chi cho biết điểm mở, ma sát và lực thay đổi.', ja:'干支の沖・合・害・刑・破です。動き出す点、摩擦、変化の力を示します。', ru:'Столкновения, сочетания, вред, наказания и разрушения между стволами и ветвями показывают запуск, трение и перемены.', ko:'간지 사이의 충, 합, 해, 형, 파입니다. 작동점, 마찰, 변화의 힘을 봅니다.', es:'Choques, combinaciones, daños, castigos y rupturas entre tallos o ramas muestran aperturas, fricción y cambio.' }
    },
    clash: {
      title: { th:'ชง · 沖', en:'Clash · 沖', zh:'沖', cn:'冲', vi:'Xung · 沖', ja:'沖', ru:'Столкновение · 沖', ko:'충 · 沖', es:'Choque · 沖' },
      body: { th:'แรงปะทะตรง ทำให้เรื่องขยับ แตก เปลี่ยน หรือสะดุด ต้องดูว่าชนสิ่งดีหรือชนสิ่งที่ควรถูกเปิดออก', en:'A direct collision that moves, breaks, changes, or blocks something. Read what it hits before judging good or bad.', zh:'直接相衝之力，可動、破、變、阻；須先看所沖者為喜或為忌。', cn:'直接相冲之力，可动、破、变、阻；须先看所冲者为喜或为忌。', vi:'Lực va chạm trực tiếp làm việc chuyển, vỡ, đổi hoặc nghẽn; cần xem nó xung vào gì.', ja:'直接ぶつかる力です。動く、壊れる、変わる、止まる。何に当たるかで判断します。', ru:'Прямое столкновение: двигает, ломает, меняет или блокирует. Важно, что именно оно задевает.', ko:'직접 부딪히는 힘입니다. 움직이고 깨고 바꾸고 막습니다. 무엇을 치는지가 중요합니다.', es:'Colisión directa que mueve, rompe, cambia o bloquea. Importa qué toca antes de juzgar.' }
    },
    combine: {
      title: { th:'ผสาน · 合', en:'Combination · 合', zh:'合', cn:'合', vi:'Hợp · 合', ja:'合', ru:'Сочетание · 合', ko:'합 · 合', es:'Combinación · 合' },
      body: { th:'แรงดึงดูดหรือผูกเรื่องเข้าหากัน บางครั้งช่วยรวมพลัง บางครั้งทำให้ติด ลืมตัดสิน หรือเปลี่ยนธาตุ', en:'A binding or attraction force. It can unite power, create attachment, delay decisions, or transform element quality.', zh:'相吸相合之力，可聚氣、牽絆、延宕，亦可能合化成另一五行。', cn:'相吸相合之力，可聚气、牵绊、延宕，也可能合化成另一五行。', vi:'Lực hút và gắn kết; có thể gom khí, tạo ràng buộc, trì hoãn hoặc hóa thành hành khác.', ja:'引き合い結びつく力です。力を集める、執着する、判断を遅らせる、五行を変える場合があります。', ru:'Сила притяжения и связывания. Может объединять, привязывать, задерживать решение или менять стихию.', ko:'끌어당기고 묶는 힘입니다. 힘을 모으거나 집착, 지연, 오행 변화가 생길 수 있습니다.', es:'Fuerza de atracción y unión. Puede unir, apegar, demorar decisiones o transformar el elemento.' }
    },
    harm: {
      title: { th:'害 · ทำร้ายแฝง', en:'Harm · 害', zh:'害', cn:'害', vi:'Hại · 害', ja:'害', ru:'Скрытый вред · 害', ko:'해 · 害', es:'Daño · 害' },
      body: { th:'แรงบั่นทอนแบบไม่ชัดทันที มักออกเป็นความเข้าใจผิด เงื่อนไขซ่อน หรือเรื่องที่ค่อย ๆ กินพลัง', en:'A subtle drain that may appear as misunderstanding, hidden conditions, or slow loss of energy.', zh:'較隱微的耗損，常見為誤解、暗條件或逐步消耗。', cn:'较隐微的耗损，常见为误解、暗条件或逐步消耗。', vi:'Lực hao tổn ngầm, thường hiện thành hiểu lầm, điều kiện ẩn hoặc mất năng lượng chậm.', ja:'目立ちにくい消耗です。誤解、隠れた条件、少しずつ力を奪う形で出ます。', ru:'Тонкая утечка: недопонимание, скрытые условия или медленная потеря энергии.', ko:'겉으로 잘 안 보이는 소모입니다. 오해, 숨은 조건, 서서히 힘 빠짐으로 나타납니다.', es:'Desgaste sutil: malentendidos, condiciones ocultas o pérdida lenta de energía.' }
    },
    punishment: {
      title: { th:'刑 · ลงโทษ/กดดัน', en:'Punishment · 刑', zh:'刑', cn:'刑', vi:'Hình · 刑', ja:'刑', ru:'Наказание · 刑', ko:'형 · 刑', es:'Castigo · 刑' },
      body: { th:'แรงกดที่ทำให้เกิดข้อจำกัด ความเจ็บใจ กฎ ระเบียบ หรือปัญหาซ้ำ ต้องอ่านบริบทก่อนฟันธง', en:'A pressure pattern linked to limits, hurt, rules, friction, or repeated problems. Context decides severity.', zh:'壓迫與約束之象，可見傷痛、規則、摩擦或反覆問題，須依全局判斷。', cn:'压迫与约束之象，可见伤痛、规则、摩擦或反复问题，须依全局判断。', vi:'Mẫu áp lực liên quan giới hạn, tổn thương, quy tắc, ma sát hoặc vấn đề lặp lại.', ja:'制限、傷つき、規則、摩擦、反復問題を示す圧力です。全体で重さを判断します。', ru:'Схема давления: ограничения, боль, правила, трение или повторяющиеся проблемы. Важен контекст.', ko:'제한, 상처, 규칙, 마찰, 반복 문제와 관련된 압력입니다. 전체 맥락이 중요합니다.', es:'Patrón de presión ligado a límites, heridas, reglas, fricción o problemas repetidos.' }
    },
    break: {
      title: { th:'破 · แตก/บั่นทอน', en:'Break · 破', zh:'破', cn:'破', vi:'Phá · 破', ja:'破', ru:'Разрыв · 破', ko:'파 · 破', es:'Ruptura · 破' },
      body: { th:'แรงทำให้แผนหรือความต่อเนื่องร้าว อาจดีถ้าทำลายสิ่งที่ควรเลิก แต่อาจเสียถ้าทำลายฐานดี', en:'A breaking force. It can help end what should end, or harm a good foundation if unmanaged.', zh:'破壞連續性之力；破忌可為好，破喜則需防。', cn:'破坏连续性之力；破忌可为好，破喜则需防。', vi:'Lực làm nứt kế hoạch hoặc dòng liên tục; tốt nếu phá điều nên bỏ, xấu nếu phá nền tốt.', ja:'継続を割る力です。不要なものを壊せば良く、良い基盤を壊すなら注意です。', ru:'Сила разрыва. Может завершить ненужное или повредить хорошую основу.', ko:'연속성을 깨는 힘입니다. 버릴 것을 깨면 좋고 좋은 기반을 깨면 주의해야 합니다.', es:'Fuerza que rompe continuidad. Puede cerrar lo que debe terminar o dañar una buena base.' }
    },
    tai_sui: {
      title: { th:'ไท้ส่วย · 太歲', en:'Tai Sui · 太歲', zh:'太歲', cn:'太岁', vi:'Thái Tuế · 太歲', ja:'太歳', ru:'Тай Суй · 太歲', ko:'태세 · 太歲', es:'Tai Sui · 太歲' },
      body: { th:'กิ่งประจำปี เป็นแรงประธานของปีนั้น ใช้ดูทิศ/วัน/ดวงที่รับแรงปีโดยตรง', en:'The annual ruling branch. It marks the year authority and direct annual pressure on directions, days, or charts.', zh:'當年主氣之支，代表歲君權柄，判斷方位、日課與命局受歲氣之處。', cn:'当年主气之支，代表岁君权柄，判断方位、日课与命局受岁气之处。', vi:'Địa chi chủ của năm, biểu thị quyền lực năm và nơi nhận áp lực năm trực tiếp.', ja:'その年を司る地支です。方位、日、命式が年の力を受ける場所を見ます。', ru:'Правящая ветвь года. Показывает годовую власть и прямое давление на направления, дни или карту.', ko:'그 해를 주관하는 지지입니다. 방향, 날짜, 명식이 해의 힘을 직접 받는 곳을 봅니다.', es:'Rama regente del año. Marca autoridad anual y presión directa sobre direcciones, días o cartas.' }
    },
    sui_po: {
      title: { th:'ส่วยผั่ว · 歲破', en:'Year Breaker · 歲破', zh:'歲破', cn:'岁破', vi:'Tuế phá · 歲破', ja:'歳破', ru:'Разрушитель года · 歲破', ko:'세파 · 歲破', es:'Ruptura del año · 歲破' },
      body: { th:'ทิศหรือกิ่งที่ปะทะกับ太歲 มักใช้เป็นจุดควรเลี่ยงในงานใหญ่ การเริ่มงาน หรือการเจาะทิศ', en:'The branch or direction opposite Tai Sui. Often avoided for major starts, construction, or directional activation.', zh:'與太歲相沖之支或方位，大事啟動、動土、催動方位時多避之。', cn:'与太岁相冲之支或方位，大事启动、动土、催动方位时多避之。', vi:'Chi hoặc hướng xung với Thái Tuế; thường tránh khi khởi việc lớn, động thổ hoặc kích hoạt hướng.', ja:'太歳と冲する支または方位です。大きな開始、工事、方位活性では避けます。', ru:'Ветвь или направление напротив Тай Суй. Обычно избегают для крупных стартов, ремонта и активации направления.', ko:'태세와 충하는 지지나 방향입니다. 큰 시작, 공사, 방향 활성화에서 보통 피합니다.', es:'Rama o dirección opuesta a Tai Sui. Se evita para grandes inicios, obra o activación direccional.' }
    },
    void: {
      title: { th:'空亡 · ช่องว่าง', en:'Void · 空亡', zh:'空亡', cn:'空亡', vi:'Không vong · 空亡', ja:'空亡', ru:'Пустота · 空亡', ko:'공망 · 空亡', es:'Vacío · 空亡' },
      body: { th:'พลังที่เหมือนมีแต่จับไม่เต็ม ใช้อ่านเรื่องช้า หลุดมือ ต้องรอจังหวะเติม หรือใช้ทางอ้อม', en:'A quality of missing grip: present but not fully reachable. It can mean delay, looseness, or indirect use.', zh:'有象而不實、抓取不滿之氣，常見延宕、落空或須借道而行。', cn:'有象而不实、抓取不满之气，常见延宕、落空或须借道而行。', vi:'Khí có hình mà khó nắm đủ; thường là chậm, hụt hoặc cần dùng đường gián tiếp.', ja:'形はあるがつかみきれない気です。遅れ、抜け、間接利用を示します。', ru:'Качество неполной хватки: вроде есть, но недоступно полностью. Может давать задержку или обходной путь.', ko:'있는 듯하지만 온전히 잡히지 않는 기운입니다. 지연, 허탈, 우회 사용을 뜻할 수 있습니다.', es:'Cualidad de poco agarre: existe pero no se alcanza del todo. Puede indicar demora o vía indirecta.' }
    },
    good_hour: {
      title: { th:'ชั่วโมงดี · 吉時', en:'Auspicious Hour · 吉時', zh:'吉時', cn:'吉时', vi:'Giờ tốt · 吉時', ja:'吉時', ru:'Благоприятный час · 吉時', ko:'길시 · 吉時', es:'Hora auspiciosa · 吉時' },
      body: { th:'ช่วงเวลาที่ดวงคุณได้รับแรงหนุนเด่น เหมาะใช้เริ่มงาน ส่งเรื่อง สำคัญ หรือทำกิจกรรมที่ต้องการผลลัพธ์', en:'A time window with strong personal support, suitable for starting, sending, signing, or doing result-focused actions.', zh:'對您命局助力較明顯的時段，宜啟動、提交、簽署或處理求成果之事。', cn:'对您命局助力较明显的时段，宜启动、提交、签署或处理求成果之事。', vi:'Khung giờ có lực hỗ trợ cá nhân mạnh, hợp để khởi việc, gửi, ký hoặc làm việc cần kết quả.', ja:'あなたの命式を強く助ける時間帯です。開始、提出、署名、成果を求める行動に向きます。', ru:'Окно сильной личной поддержки, подходящее для старта, отправки, подписи или действий на результат.', ko:'개인 명식을 강하게 돕는 시간대입니다. 시작, 제출, 서명, 결과가 필요한 행동에 좋습니다.', es:'Ventana con apoyo personal fuerte, útil para iniciar, enviar, firmar o actuar buscando resultado.' }
    },
    bad_hour: {
      title: { th:'ชั่วโมงต้องเลี่ยง · 凶時', en:'Avoid Hour · 凶時', zh:'凶時', cn:'凶时', vi:'Giờ nên tránh · 凶時', ja:'凶時', ru:'Час для избегания · 凶時', ko:'흉시 · 凶時', es:'Hora a evitar · 凶時' },
      body: { th:'ช่วงที่แรงปะทะหรือแรง忌เด่น ควรเลี่ยงการเริ่มเรื่องสำคัญ ถ้าจำเป็นให้ลดความเสี่ยงและเตรียมแผนสำรอง', en:'A window with stronger clash or avoid-force. Avoid major starts when possible; if necessary, reduce risk and prepare backup.', zh:'沖剋或忌力較強之時段，大事啟動宜避；必要時須降風險、備後手。', cn:'冲克或忌力较强之时段，大事启动宜避；必要时须降风险、备后手。', vi:'Khung giờ có xung hoặc kỵ lực mạnh; nên tránh khởi việc lớn, nếu cần thì giảm rủi ro và có phương án dự phòng.', ja:'冲や忌の力が強い時間帯です。大きな開始は避け、必要ならリスクを下げて予備策を用意します。', ru:'Окно с сильным столкновением или нежелательной силой. Лучше избегать крупных стартов и иметь запасной план.', ko:'충이나 기신의 힘이 강한 시간대입니다. 큰 시작은 피하고 필요하면 위험을 낮추고 대안을 준비합니다.', es:'Ventana con choque o fuerza adversa. Evite grandes inicios; si es necesario, reduzca riesgo y tenga plan alterno.' }
    },
    good_day: {
      title: { th:'วันเด่น · 吉日', en:'Auspicious Day · 吉日', zh:'吉日', cn:'吉日', vi:'Ngày tốt · 吉日', ja:'吉日', ru:'Благоприятный день · 吉日', ko:'길일 · 吉日', es:'Día auspicioso · 吉日' },
      body: { th:'วันที่ดวงและปฏิทินให้แรงหนุน เหมาะวางงานใหญ่ เริ่มโปรเจกต์ เซ็นสัญญา หรือทำสิ่งที่อยากให้โต', en:'A day with supportive chart and calendar conditions, suitable for major tasks, launches, contracts, or growth actions.', zh:'命局與曆法條件較扶助之日，宜辦大事、啟專案、簽約或求增長。', cn:'命局与历法条件较扶助之日，宜办大事、启项目、签约或求增长。', vi:'Ngày có điều kiện lá số và lịch hỗ trợ, hợp việc lớn, mở dự án, ký kết hoặc làm việc cần tăng trưởng.', ja:'命式と暦が支える日です。大きな仕事、開始、契約、成長させたい行動に向きます。', ru:'День с поддержкой карты и календаря: крупные дела, запуск, договоры и действия на рост.', ko:'명식과 달력이 돕는 날입니다. 큰일, 프로젝트 시작, 계약, 성장시키는 행동에 좋습니다.', es:'Día con apoyo de carta y calendario, adecuado para tareas grandes, lanzamientos, contratos o crecimiento.' }
    },
    avoid_day: {
      title: { th:'วันต้องระวัง · 忌日', en:'Caution Day · 忌日', zh:'忌日', cn:'忌日', vi:'Ngày cần tránh · 忌日', ja:'忌日', ru:'День осторожности · 忌日', ko:'기일 · 忌日', es:'Día de cautela · 忌日' },
      body: { th:'วันที่มี沖/破/害/刑 หรือแรง忌กับดวงคุณเด่น ไม่จำเป็นต้องหยุดชีวิต แต่ไม่ควรเสี่ยงเกินจำเป็น', en:'A day with stronger clash, break, harm, punishment, or avoid-force against your chart. Live normally, but avoid needless risk.', zh:'與您命局有較強沖、破、害、刑或忌力之日；不必停事，但不宜冒不必要之險。', cn:'与您命局有较强冲、破、害、刑或忌力之日；不必停事，但不宜冒不必要之险。', vi:'Ngày có xung, phá, hại, hình hoặc kỵ lực mạnh với lá số; vẫn sống bình thường nhưng tránh rủi ro không cần thiết.', ja:'命式に対して冲・破・害・刑・忌が強い日です。普通に過ごせますが、不要なリスクは避けます。', ru:'День с сильным 沖, 破, 害, 刑 или нежелательной силой к вашей карте. Живите обычно, но без лишнего риска.', ko:'내 명식에 충, 파, 해, 형, 기운이 강한 날입니다. 일상은 가능하지만 불필요한 위험은 피합니다.', es:'Día con choque, ruptura, daño, castigo o fuerza adversa fuerte. Vida normal, pero sin riesgos innecesarios.' }
    },
    notification: {
      title: { th:'การแจ้งเตือนมงคล', en:'Timing Notifications', zh:'吉凶提醒', cn:'吉凶提醒', vi:'Thông báo thời điểm', ja:'時機通知', ru:'Уведомления времени', ko:'시기 알림', es:'Alertas de tiempo' },
      body: { th:'ระบบแจ้งก่อนช่วงสำคัญ เพื่อให้เตรียมตัวทัน เช่น ก่อน吉時 30 นาที หรือก่อน吉日 1 วัน', en:'Alerts arrive before important windows, such as 30 minutes before an auspicious hour or one day before an auspicious day.', zh:'在重要時段前提醒您準備，如吉時前30分鐘、吉日前1日。', cn:'在重要时段前提醒您准备，如吉时前30分钟、吉日前1日。', vi:'Thông báo trước các khung quan trọng, ví dụ 30 phút trước giờ tốt hoặc 1 ngày trước ngày tốt.', ja:'重要な時間の前に通知します。例: 吉時の30分前、吉日の1日前。', ru:'Напоминания приходят до важных окон, например за 30 минут до 吉時 или за день до 吉日.', ko:'중요한 시간 전에 알려줍니다. 예: 길시 30분 전, 길일 1일 전.', es:'Avisa antes de ventanas importantes, como 30 minutos antes de 吉時 o un día antes de 吉日.' }
    },
    tianxing: {
      title: { th:'เทียนซิง · 天星擇日', en:'Tianxing Date Selection · 天星擇日', zh:'天星擇日', cn:'天星择日', vi:'Thiên tinh chọn ngày · 天星擇日', ja:'天星擇日', ru:'Тяньсин выбор даты · 天星擇日', ko:'천성 택일 · 天星擇日', es:'Selección Tianxing · 天星擇日' },
      body: { th:'ศาสตร์เลือกฤกษ์ด้วยตำแหน่งดาวจริงบนฟ้า ใช้ดาราศาสตร์ร่วมกับตำรา七政四餘/果老星宗', en:'Date selection from real sky positions, combining astronomy with Qizheng Suyu and Guolao Xingzong rules.', zh:'依真實天象擇日，結合天文計算與七政四餘、果老星宗之法。', cn:'依真实天象择日，结合天文计算与七政四余、果老星宗之法。', vi:'Chọn ngày theo vị trí sao thật trên trời, kết hợp thiên văn với 七政四餘 và 果老星宗.', ja:'実際の天体位置で日時を選ぶ術です。天文計算と七政四餘・果老星宗を合わせます。', ru:'Выбор даты по реальным положениям небесных тел, с астрономией и правилами 七政四餘/果老星宗.', ko:'실제 하늘의 별 위치로 택일합니다. 천문 계산과 七政四餘, 果老星宗 법을 결합합니다.', es:'Selección de fecha por posiciones reales del cielo, combinando astronomía con 七政四餘 y 果老星宗.' }
    },
    ming_gong: {
      title: { th:'ลัคนา/命宮', en:'Ascendant · 命宮', zh:'命宮', cn:'命宫', vi:'Mệnh cung · 命宮', ja:'命宮', ru:'Асцендент · 命宮', ko:'명궁 · 命宮', es:'Ascendente · 命宮' },
      body: { th:'จุดตั้งต้นของผังดาวในเทียนซิง ใช้โยงดาว用神 เรือน และทิศทางพลังของฤกษ์นั้น', en:'The starting house of the Tianxing chart, used to link the ruler, houses, and directional quality of the chosen time.', zh:'天星盤之起點，用以連結用神、宮位與該時刻氣勢方向。', cn:'天星盘之起点，用以连接用神、宫位与该时刻气势方向。', vi:'Cung khởi của lá số Thiên tinh, dùng nối Dụng thần, cung vị và hướng khí của thời điểm.', ja:'天星盤の起点です。用神、ハウス、その時刻の気の方向を結びます。', ru:'Начальная точка карты Tianxing, связывает управителя, дома и направленность энергии времени.', ko:'천성판의 시작점입니다. 용신, 궁위, 그 시간의 기운 방향을 연결합니다.', es:'Casa inicial de la carta Tianxing; vincula regente, casas y cualidad direccional del momento.' }
    },
    qimen: {
      title: { th:'ฉีเหมิน · 奇門', en:'Qi Men · 奇門', zh:'奇門', cn:'奇门', vi:'Kỳ Môn · 奇門', ja:'奇門', ru:'Ци Мэнь · 奇門', ko:'기문 · 奇門', es:'Qi Men · 奇門' },
      body: { th:'ผังเวลา 9 ช่อง ใช้อ่านทิศ คน โอกาส อุปสรรค และทางเลือกที่เหมาะกับคำถาม ณ เวลานั้น', en:'A nine-palace timing chart for reading direction, people, opportunity, obstacles, and choices at a specific moment.', zh:'九宮時盤，用來判斷方位、人物、機會、阻礙與當下可行之策。', cn:'九宫时盘，用来判断方位、人物、机会、阻碍与当下可行之策。', vi:'Bàn thời gian 9 cung để đọc hướng, người, cơ hội, trở ngại và lựa chọn tại thời điểm cụ thể.', ja:'九宮の時盤です。方位、人、機会、障害、その時の選択肢を読みます。', ru:'Девятидворцовая карта момента для направления, людей, возможностей, препятствий и выбора.', ko:'구궁 시간판입니다. 방향, 사람, 기회, 장애, 그 순간의 선택을 읽습니다.', es:'Carta de nueve palacios para leer dirección, personas, oportunidad, obstáculos y opciones del momento.' }
    },
    luopan: {
      title: { th:'หล่อแก · 羅盤', en:'Luopan · 羅盤', zh:'羅盤', cn:'罗盘', vi:'La bàn phong thủy · 羅盤', ja:'羅盤', ru:'Лопань · 羅盤', ko:'나경 · 羅盤', es:'Luopan · 羅盤' },
      body: { th:'เข็มทิศฮวงจุ้ยหลายชั้น ใช้อ่านทิศบ้าน ประตู เตียง โต๊ะ เตา และดาวเหินตามเวลา', en:'A layered feng shui compass for house direction, doors, beds, desks, stove, and flying stars over time.', zh:'多層風水羅盤，用於看宅向、門、床、桌、灶與飛星流轉。', cn:'多层风水罗盘，用于看宅向、门、床、桌、灶与飞星流转。', vi:'La bàn phong thủy nhiều tầng để đọc hướng nhà, cửa, giường, bàn, bếp và phi tinh theo thời gian.', ja:'多層の風水羅盤です。家の向き、門、寝床、机、炉、飛星を読みます。', ru:'Многослойный фэншуй-компас для направления дома, двери, кровати, стола, плиты и летящих звезд.', ko:'여러 층의 풍수 나경입니다. 집 방향, 문, 침대, 책상, 화로, 비성을 봅니다.', es:'Brújula feng shui por capas para dirección de casa, puerta, cama, escritorio, cocina y estrellas volantes.' }
    },
    fusion: {
      title: { th:'Fusion · 融', en:'Fusion · 融', zh:'融合法', cn:'融合法', vi:'Fusion · 融', ja:'Fusion · 融', ru:'Fusion · 融', ko:'Fusion · 融', es:'Fusion · 融' },
      body: { th:'การรวมหลายศาสตร์ เช่น ปาจื้อ ฉีเหมิน ดาวจริง ตะวันตก เวท และยูเรเนียน เพื่อให้คำตอบเดียวที่เทียบกันแล้ว', en:'A multi-system reading that compares BaZi, Qi Men, real sky, Western, Vedic, and Uranian layers into one answer.', zh:'融合八字、奇門、真天象、西洋、吠陀與漢堡/天王星派等多層後，歸納成一個答案。', cn:'融合八字、奇门、真天象、西洋、吠陀与汉堡/天王星派等多层后，归纳成一个答案。', vi:'Cách đọc đa hệ: so Bát tự, Kỳ Môn, sao thật, Tây phương, Vedic và Uranian để ra một câu trả lời.', ja:'八字、奇門、実天体、西洋、ヴェーダ、ウラニアンを照合し、一つの答えにまとめます。', ru:'Многоуровневое чтение: Ба-цзы, Ци Мэнь, реальное небо, западная, ведическая и уранианская школы в одном выводе.', ko:'사주, 기문, 실제 천체, 서양, 베다, 우라니안을 비교해 하나의 답으로 정리하는 방식입니다.', es:'Lectura multisistema que compara BaZi, Qi Men, cielo real, occidental, védica y uraniana en una respuesta.' }
    },
    ask_sifu: {
      title: { th:'ถามซินแส · 問師', en:'Ask Sifu · 問師', zh:'問師', cn:'问师', vi:'Hỏi Sư phụ · 問師', ja:'師に問う · 問師', ru:'Спросить мастера · 問師', ko:'스승에게 묻기 · 問師', es:'Preguntar al Sifu · 問師' },
      body: { th:'โหมดถาม AI ซินแส ใช้ข้อมูลดวงและบริบทที่มี เพื่อตอบเป็นภาษาคน ไม่ใช่แค่ตารางคำนวณ', en:'AI Sifu mode uses your chart and context to answer in plain language, not only as calculation tables.', zh:'AI命理師模式，結合命盤與上下文，以人話回答，而非只給計算表。', cn:'AI命理师模式，结合命盘与上下文，以人话回答，而非只给计算表。', vi:'Chế độ AI Sư phụ dùng lá số và ngữ cảnh để trả lời dễ hiểu, không chỉ bảng tính.', ja:'AI師モードです。命式と文脈を使い、計算表だけでなく人が読める言葉で答えます。', ru:'Режим AI Sifu использует карту и контекст, отвечая человеческим языком, а не только таблицами.', ko:'AI 스승 모드입니다. 명식과 맥락을 사용해 계산표가 아니라 이해하기 쉬운 말로 답합니다.', es:'Modo AI Sifu: usa carta y contexto para responder en lenguaje claro, no solo tablas.' }
    },
    advanced_reading: {
      title: { th:'อ่านขั้นสูง', en:'Advanced Reading', zh:'高階解讀', cn:'高级解读', vi:'Luận giải nâng cao', ja:'上級鑑定', ru:'Расширенное чтение', ko:'고급 해석', es:'Lectura avanzada' },
      body: { th:'ส่วนพรีเมียมที่ใช้ข้อมูลหลายชั้นหรือโมเดลลึกกว่า เหมาะเมื่อคำถามมีความเสี่ยงหรือรายละเอียดสูง', en:'A premium layer using more systems or deeper models, best for complex, high-detail, or higher-risk questions.', zh:'進階/付費層，使用更多術數層或較深模型，適合複雜、高細節或高風險問題。', cn:'进阶/付费层，使用更多术数层或较深模型，适合复杂、高细节或高风险问题。', vi:'Lớp cao cấp dùng nhiều hệ hoặc mô hình sâu hơn, hợp câu hỏi phức tạp, chi tiết hoặc rủi ro cao.', ja:'複数の層や深いモデルを使うプレミアム機能です。複雑で詳細、リスクの高い質問に向きます。', ru:'Премиум-слой с большим числом систем или более глубокими моделями для сложных и рискованных вопросов.', ko:'더 많은 층이나 깊은 모델을 쓰는 프리미엄 영역입니다. 복잡하고 세밀하거나 위험도가 높은 질문에 맞습니다.', es:'Capa premium con más sistemas o modelos profundos, útil para preguntas complejas, detalladas o de mayor riesgo.' }
    },
    pdf_save: {
      title: { th:'บันทึกเป็น PDF', en:'Save as PDF', zh:'儲存 PDF', cn:'保存 PDF', vi:'Lưu PDF', ja:'PDF保存', ru:'Сохранить PDF', ko:'PDF 저장', es:'Guardar PDF' },
      body: { th:'สร้างไฟล์ PDF ให้ดาวน์โหลดเก็บไว้ ไม่ใช่สั่งพิมพ์ผ่านหน้าต่าง printer ของเบราว์เซอร์', en:'Creates a downloadable PDF file, not a browser print dialog.', zh:'產生可下載保存的 PDF 檔，而不是開啟瀏覽器列印視窗。', cn:'生成可下载保存的 PDF 文件，而不是打开浏览器打印窗口。', vi:'Tạo tệp PDF tải xuống, không mở hộp thoại in của trình duyệt.', ja:'ブラウザの印刷画面ではなく、保存できるPDFファイルを生成します。', ru:'Создает скачиваемый PDF-файл, а не диалог печати браузера.', ko:'브라우저 인쇄창이 아니라 다운로드 가능한 PDF 파일을 만듭니다.', es:'Crea un archivo PDF descargable, no un cuadro de impresión del navegador.' }
    }
  };

  var LEGACY_KEYS = {
    's.element':'five_elements',
    'g.tip.shi':'flow_hour',
    'g.tip.ri':'flow_day',
    'g.tip.yue':'flow_month',
    'g.tip.nian':'flow_year',
    'g.tip.dayun':'luck_pillar',
    'g.tip.life':'four_pillars'
  };

  var EXACT_I18N = {
    'c.dm.label':'day_master',
    'c.pt.day_master':'day_master',
    'c.pt.pillar':'four_pillars',
    'c.pt.hidden':'rootedness',
    'c.sec1.h2':'five_elements',
    'c.sec4.h2':'four_pillars',
    'c.sec4.h2.3p':'three_pillars',
    'c.sec5.h2':'interactions',
    'c.lp.drill_title':'flow_year',
    'c.lp.note_current':'luck_pillar',
    'c.ln.title_all':'flow_year',
    'c.ln.title_imp':'flow_year',
    'c.ln.title_near':'flow_year',
    'c.uRole.ji':'avoid_god',
    'c.uRole.yong':'useful_god',
    'mst.engine.label.4pillars':'four_pillars',
    'mst.premium.kicker':'fusion',
    'mst.premium.title':'fusion',
    'mst.nav.fusion':'fusion',
    'g.horizon.shi':'flow_hour',
    'g.horizon.ri':'flow_day',
    'g.horizon.yue':'flow_month',
    'g.horizon.nian':'flow_year',
    'g.horizon.dayun':'luck_pillar',
    'g.horizon.life':'four_pillars',
    't.s3.nu':'good_hour',
    'n.h.label':'useful_god',
    'n.cm.ys':'useful_god',
    'n.cm.ys.primary':'useful_god',
    'n.cm.ys.xishen':'joy_god',
    'n.cm.ys.jishen':'avoid_god',
    'n.cm.ys.tiaohou':'regulating_god',
    'n.tag.useful_element':'useful_god'
  };

  var DATA_T = {
    title:'tianxing',
    s_wheel:'tianxing',
    s_verdict:'tianxing',
    s_rule:'useful_god',
    s_chart:'tianxing',
    ms_title:'qimen',
    ms_intro:'qimen',
    ms_btn:'qimen'
  };

  var I18N_PATTERNS = [
    [/^c\.ov\.v_support/, 'useful_god'],
    [/^c\.ov\.v_caution/, 'avoid_god'],
    [/^c\.ov\.v_xishen/, 'joy_god'],
    [/^c\.ln\./, 'flow_year'],
    [/^c\.lp\./, 'luck_pillar'],
    [/^g\.notify\./, 'notification'],
    [/goodHour|good_hour|jishi|吉時/i, 'good_hour'],
    [/badHour|bad_hour|xiong|凶時/i, 'bad_hour'],
    [/goodDay|good_day|吉日/i, 'good_day'],
    [/badDay|avoidDay|忌日/i, 'avoid_day']
  ];

  var TEXT_RULES = [
    ['tianxing', ['天星擇日','天星择日','七政四餘','七政四余','Guolao','Tianxing']],
    ['qimen', ['奇門','奇门','Qi Men','Qimen','ฉีเหมิน','Kỳ Môn','Ки Мэнь','기문']],
    ['luopan', ['羅盤','罗盘','Luopan','หล่อแก','La bàn phong thủy','Лопань','나경']],
    ['fusion', ['Fusion','融合法','AI Sifu Fusion','融']],
    ['ask_sifu', ['問師','问师','Ask Sifu','ถามซินแส','Hỏi Sư phụ']],
    ['good_hour', ['吉時','吉时','Auspicious Hour','Good hour','ชั่วโมงดี','ฤกษ์ดี','Giờ tốt','吉時','길시','Hora auspiciosa']],
    ['bad_hour', ['凶時','凶时','Avoid Hour','ชั่วโมงต้องเลี่ยง','Giờ nên tránh','흉시','Hora a evitar']],
    ['good_day', ['吉日','Auspicious Day','วันเด่น','วันมงคล','Ngày tốt','길일','Día auspicioso']],
    ['avoid_day', ['忌日','Caution Day','วันต้องระวัง','Ngày cần tránh','기일','Día de cautela']],
    ['day_master', ['日主','Day Master','วันเกิดหลัก','ก้านวัน','Nhật chủ','Господин дня','일간','Maestro del día']],
    ['four_pillars', ['四柱','4 Pillars','Four Pillars','4 เสา','สี่เสา','Tứ trụ','Четыре столпа','사주','Cuatro pilares']],
    ['three_pillars', ['三柱','3 Pillars','Three Pillars','3 เสา','สามเสา','Tam trụ','Три столпа','삼주','Tres pilares']],
    ['birth_hour', ['出生時辰','出生时辰','Birth Hour','เวลาเกิด','ยามเกิด','Giờ sinh','出생','Hora natal']],
    ['ten_gods', ['十神','Ten Gods','สิบเทพ','Thập Thần','Десять богов','십신','Diez Dioses']],
    ['useful_god', ['用神','Useful God','ย่งเสิน','Dụng thần','Полезный элемент','용신','Dios útil']],
    ['joy_god', ['喜神','Support element','ธาตุเสริม','Hỷ thần','Поддерживающий элемент','희신']],
    ['avoid_god', ['忌神','Avoid element','กีเสิน','Kỵ thần','Нежелательный элемент','기신']],
    ['regulating_god', ['調候','调候','Regulating God','ปรับฤดูกาล','Điều hậu','조후']],
    ['luck_pillar', ['大運','大运','Luck Pillar','วัยจร','Đại vận','столп удачи','대운','Pilar decenal']],
    ['flow_year', ['流年','Annual Transit','ปีจร','Lưu niên','Годовой транзит','유년','Tránsito anual']],
    ['flow_month', ['流月','Monthly Transit','เดือนจร','Lưu nguyệt','Месячный транзит','유월','Tránsito mensual']],
    ['flow_day', ['流日','Daily Transit','วันจร','Lưu nhật','Дневной транзит','유일','Tránsito diario']],
    ['flow_hour', ['流時','流时','Hourly Transit','ชั่วยามจร','Lưu thời','Часовой транзит','유시','Tránsito horario']],
    ['five_elements', ['五行','Five Elements','ห้าธาตุ','Ngũ hành','Пять стихий','오행','Cinco elementos']],
    ['functional_strength', ['根氣折算','根气折算','Functional %','Functional Strength','พลังใช้ได้จริง']],
    ['rootedness', ['根氣','根气','Rootedness','รากธาตุ','Gốc khí','Укорененность']],
    ['interactions', ['關係','关系','Interactions','ปฏิกิริยา','Tương tác','Взаимодействия']],
    ['clash', ['六沖','六冲',' 沖',' 冲','Clash','ชง','Xung','충','Choque']],
    ['combine', ['六合','三合','天合',' 合','Combination','ผสาน','Hợp','합','Combinación']],
    ['harm', ['六害',' 害','Harm','ทำร้ายแฝง','Hại','해','Daño']],
    ['punishment', [' 刑','Punishment','ลงโทษ','Hình','형','Castigo']],
    ['break', ['六破',' 破','Break','แตก','Phá','파','Ruptura']],
    ['tai_sui', ['太歲','太岁','Tai Sui','ไท้ส่วย','Thái Tuế','태세']],
    ['sui_po', ['歲破','岁破','Year Breaker','ส่วยผั่ว','Tuế phá','세파']],
    ['void', ['空亡','Void','ช่องว่าง','Không vong','Пустота','공망','Vacío']],
    ['ming_gong', ['命宮','命宫','Ascendant','ลัคนา','Mệnh cung','Асцендент','명궁','Ascendente']],
    ['pdf_save', ['Save as PDF','บันทึกเป็น PDF','儲存 PDF','保存 PDF','Lưu PDF','PDF保存','PDF 저장','Guardar PDF']]
  ];

  function stateLocale() {
    try {
      var st = window.HK_LANG_STATE || (window.HK && window.HK.langState);
      if (st && typeof st.current === 'function') {
        var cur = st.current();
        if (cur && cur.raw === 'zh') return cur.variant === 'cn' ? 'cn' : 'zh';
        if (cur && cur.raw) return cur.raw;
      }
      if (st && typeof st.sifu === 'function') return st.sifu();
    } catch (_) {}
    try {
      var raw = String(localStorage.getItem('hk_locale') || localStorage.getItem('hk_lang') || 'th').toLowerCase();
      if (raw.indexOf('zh') === 0 || raw === 'zh') return localStorage.getItem('hk_zh_variant') === 'cn' ? 'cn' : 'zh';
      if (raw === 'cn' || raw === 'zh-cn' || raw === 'zh-hans') return 'cn';
      return raw || 'th';
    } catch (_) {
      return 'th';
    }
  }

  function pick(bag) {
    if (!bag) return '';
    var loc = stateLocale();
    return bag[loc] || (loc === 'cn' ? bag.zh : '') || bag.en || bag.th || '';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = `
      .hk-tip-host{--hk-tip-gold:var(--gold,#c8a44d);--hk-tip-fg:var(--fg,var(--paper,#f6f1e6));--hk-tip-muted:var(--fg-soft,var(--paper-dim,rgba(246,241,230,.66)));}
      .hk-tip-btn{appearance:none;border:1px solid color-mix(in srgb,var(--hk-tip-gold,#c8a44d) 55%,transparent);background:color-mix(in srgb,var(--hk-tip-gold,#c8a44d) 12%,transparent);color:var(--hk-tip-gold,#c8a44d);width:18px;height:18px;min-width:18px;border-radius:50%;padding:0;margin:0 0 0 6px;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;font:700 11px/1 'JetBrains Mono','SF Mono',monospace;letter-spacing:0;cursor:pointer!important;box-shadow:none;transform:none;transition:background .16s,border-color .16s,color .16s,box-shadow .16s;position:relative;z-index:2;}
      .hk-tip-btn:hover,.hk-tip-btn:focus-visible,.hk-tip-btn[aria-expanded="true"]{background:var(--hk-tip-gold,#c8a44d);color:#0d0f12;border-color:var(--hk-tip-gold,#c8a44d);box-shadow:0 0 0 3px color-mix(in srgb,var(--hk-tip-gold,#c8a44d) 22%,transparent);outline:none;}
      .hk-tip-popover{position:fixed;z-index:100000;display:none;width:min(360px,calc(100vw - 24px));background:rgba(15,17,21,.97);color:#f6f1e6;border:1px solid rgba(200,164,77,.38);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.42);backdrop-filter:blur(18px);padding:14px 15px 13px;font-family:'Noto Serif Thai','Inter',system-ui,sans-serif;line-height:1.58;text-align:left;letter-spacing:0;}
      .hk-tip-popover.on{display:block;}
      .hk-tip-popover::before{content:'';position:absolute;left:var(--hk-tip-arrow-x,50%);top:-6px;width:10px;height:10px;background:inherit;border-left:1px solid rgba(200,164,77,.38);border-top:1px solid rgba(200,164,77,.38);transform:translateX(-50%) rotate(45deg);}
      .hk-tip-popover.above::before{top:auto;bottom:-6px;border-left:0;border-top:0;border-right:1px solid rgba(200,164,77,.38);border-bottom:1px solid rgba(200,164,77,.38);}
      .hk-tip-head{display:flex;align-items:flex-start;gap:12px;justify-content:space-between;margin-bottom:7px;}
      .hk-tip-title{font-size:14px;font-weight:700;color:#e6c976;font-family:'Noto Serif TC','Noto Serif Thai',serif;line-height:1.35;}
      .hk-tip-body{font-size:12.5px;color:rgba(246,241,230,.78);}
      .hk-tip-close{appearance:none;border:1px solid rgba(246,241,230,.14);background:rgba(255,255,255,.04);color:rgba(246,241,230,.72);width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;cursor:pointer!important;font:700 13px/1 system-ui,sans-serif;flex:0 0 auto;}
      .hk-tip-close:hover,.hk-tip-close:focus-visible{color:#0d0f12;background:#c8a44d;border-color:#c8a44d;outline:none;}
      [data-theme="light"] .hk-tip-popover,body.light .hk-tip-popover{background:rgba(255,250,238,.98);color:#17130f;border-color:rgba(138,109,42,.35);box-shadow:0 18px 42px rgba(42,30,12,.18);}
      [data-theme="light"] .hk-tip-title,body.light .hk-tip-title{color:#8a6d2a;}
      [data-theme="light"] .hk-tip-body,body.light .hk-tip-body{color:rgba(26,22,18,.72);}
      [data-theme="light"] .hk-tip-close,body.light .hk-tip-close{color:rgba(26,22,18,.62);border-color:rgba(26,22,18,.12);background:rgba(26,22,18,.04);}
      @media(max-width:640px){.hk-tip-popover{width:calc(100vw - 24px);padding:15px 16px;}.hk-tip-btn{width:20px;height:20px;min-width:20px;font-size:12px;margin-left:7px;}}
      @media(prefers-reduced-motion:no-preference){.hk-tip-popover.on{animation:hkTipIn .12s ease-out;}@keyframes hkTipIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}}
    `;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function popover() {
    var el = document.getElementById(ROOT_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ROOT_ID;
    el.className = 'hk-tip-popover';
    el.setAttribute('role', 'tooltip');
    document.body.appendChild(el);
    return el;
  }

  function explicitKey(raw) {
    if (!raw) return '';
    var k = String(raw).trim();
    if (GLOSSARY[k]) return k;
    if (LEGACY_KEYS[k]) return LEGACY_KEYS[k];
    return '';
  }

  function keyFromI18n(key) {
    if (!key) return '';
    if (EXACT_I18N[key]) return EXACT_I18N[key];
    for (var i = 0; i < I18N_PATTERNS.length; i++) {
      if (I18N_PATTERNS[i][0].test(key)) return I18N_PATTERNS[i][1];
    }
    return '';
  }

  function keyFromText(text) {
    var s = normalizeText(text);
    if (!s || s.length > 180) return '';
    for (var i = 0; i < TEXT_RULES.length; i++) {
      var key = TEXT_RULES[i][0];
      var terms = TEXT_RULES[i][1];
      for (var j = 0; j < terms.length; j++) {
        if (s.indexOf(terms[j]) !== -1) return key;
      }
    }
    return '';
  }

  function resolveKey(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.getAttribute('data-hk-tip-title') || el.getAttribute('data-hk-tip-body')) return '__custom__';
    var key = explicitKey(el.getAttribute('data-hk-tip')) ||
      explicitKey(el.getAttribute('data-help')) ||
      explicitKey(el.getAttribute('data-tip'));
    if (key) return key;
    key = keyFromI18n(el.getAttribute('data-i18n'));
    if (key) return key;
    key = DATA_T[el.getAttribute('data-t') || ''];
    if (key) return key;
    var title = el.getAttribute('title');
    key = keyFromText(title);
    if (key) return key;
    return keyFromText(el.textContent || '');
  }

  function shouldSkip(el, explicit) {
    if (!el || el.nodeType !== 1) return true;
    if (el.getAttribute('data-hk-tip-bound')) return true;
    if (el.closest('[data-hk-tooltips-off],script,style,noscript,svg,canvas,iframe,.hk-tip-popover,.hk-um-panel')) return true;
    if (/^(INPUT|TEXTAREA|SELECT|OPTION|BUTTON)$/.test(el.tagName)) return true;
    if (!explicit && el.closest('a,button,[role="button"]')) return true;
    if (!explicit && el.parentElement && el.parentElement.closest('[data-hk-tip-bound]')) return true;
    if (!explicit && el.closest('p,li,footer')) return true;
    return false;
  }

  function attach(el, key) {
    if (!key) return;
    if (key !== '__custom__' && !GLOSSARY[key]) return;
    var explicit = !!(el.getAttribute('data-hk-tip') || el.getAttribute('data-hk-tip-title') || el.getAttribute('data-hk-tip-body'));
    if (shouldSkip(el, explicit)) return;
    el.setAttribute('data-hk-tip-bound', key);
    try { el.classList.add('hk-tip-host'); } catch (_) {}
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hk-tip-btn';
    btn.setAttribute('aria-label', pick(UI.more));
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('data-hk-tip-key', key);
    if (key === '__custom__') {
      btn.setAttribute('data-hk-tip-title', el.getAttribute('data-hk-tip-title') || '');
      btn.setAttribute('data-hk-tip-body', el.getAttribute('data-hk-tip-body') || el.getAttribute('title') || '');
    }
    btn.innerHTML = '<span aria-hidden="true">?</span>';
    el.appendChild(btn);
  }

  function collect(root) {
    var base = root && root.querySelectorAll ? root : document;
    var nodes = [];
    try {
      base.querySelectorAll('[data-hk-tip],[data-hk-tip-title],[data-hk-tip-body],[data-help],[data-tip]').forEach(function (el) { nodes.push(el); });
      base.querySelectorAll('h1,h2,h3,h4,h5,h6,summary,label,legend,th,.section-eyebrow,.eyebrow,.dm-label,.fn-badge,.hk-level-tag,.notify-card h4,.aim h3,.horizon-stop,.sec-head h2,.yong-card h3,.god-row b,.pt-tag,.tag,.chip,.card-title,.ttl,.title,.lab,.lbl,.k,.nu').forEach(function (el) { nodes.push(el); });
      base.querySelectorAll('[data-i18n],[data-t]').forEach(function (el) { nodes.push(el); });
    } catch (_) {}
    return nodes;
  }

  function apply(root) {
    if (!document.body) return;
    ensureStyle();
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    collect(root).forEach(function (el) {
      if (seen) {
        if (seen.has(el)) return;
        seen.add(el);
      }
      var key = resolveKey(el);
      attach(el, key);
    });
  }

  function scheduleApply(root) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(function () { apply(root || document); }, 160);
  }

  function customEntry(btn) {
    return {
      title: { th: btn.getAttribute('data-hk-tip-title') || pick(UI.more), en: btn.getAttribute('data-hk-tip-title') || pick(UI.more) },
      body: { th: btn.getAttribute('data-hk-tip-body') || '', en: btn.getAttribute('data-hk-tip-body') || '' }
    };
  }

  function positionTip(btn, tip) {
    if (!btn || !tip) return;
    var r = btn.getBoundingClientRect();
    var vw = window.innerWidth || document.documentElement.clientWidth || 360;
    var vh = window.innerHeight || document.documentElement.clientHeight || 640;
    var gap = 10;
    var rect = tip.getBoundingClientRect();
    var w = rect.width || Math.min(360, vw - 24);
    var h = rect.height || 160;
    var left = r.left + (r.width / 2) - (w / 2);
    left = Math.max(12, Math.min(left, vw - w - 12));
    var below = r.bottom + gap;
    var above = r.top - h - gap;
    var useAbove = below + h > vh - 10 && above > 10;
    var top = useAbove ? above : below;
    tip.classList.toggle('above', useAbove);
    tip.style.left = left + 'px';
    tip.style.top = Math.max(10, top) + 'px';
    var arrowX = r.left + (r.width / 2) - left;
    tip.style.setProperty('--hk-tip-arrow-x', Math.max(18, Math.min(arrowX, w - 18)) + 'px');
  }

  function closeTip() {
    var tip = document.getElementById(ROOT_ID);
    if (tip) tip.classList.remove('on');
    if (activeButton) activeButton.setAttribute('aria-expanded', 'false');
    activeButton = null;
  }

  function renderTip(btn) {
    var key = btn && btn.getAttribute('data-hk-tip-key');
    var entry = key === '__custom__' ? customEntry(btn) : GLOSSARY[key];
    if (!entry) return;
    var tip = popover();
    var title = pick(entry.title);
    var body = pick(entry.body);
    tip.innerHTML = '<div class="hk-tip-head"><div class="hk-tip-title">' + escapeHtml(title) + '</div><button type="button" class="hk-tip-close" aria-label="' + escapeHtml(pick(UI.close)) + '">×</button></div><div class="hk-tip-body">' + escapeHtml(body) + '</div>';
    tip.classList.add('on');
    btn.setAttribute('aria-expanded', 'true');
    activeButton = btn;
    requestAnimationFrame(function () { positionTip(btn, tip); });
  }

  function refreshLocale() {
    document.querySelectorAll('.hk-tip-btn').forEach(function (btn) {
      btn.setAttribute('aria-label', pick(UI.more));
    });
    if (activeButton) renderTip(activeButton);
    scheduleApply(document);
  }

  function bindEvents() {
    document.addEventListener('click', function (e) {
      var close = e.target && e.target.closest && e.target.closest('.hk-tip-close');
      if (close) {
        e.preventDefault();
        e.stopPropagation();
        closeTip();
        return;
      }
      var btn = e.target && e.target.closest && e.target.closest('.hk-tip-btn');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        if (activeButton === btn) {
          closeTip();
        } else {
          closeTip();
          renderTip(btn);
        }
        return;
      }
      var tip = document.getElementById(ROOT_ID);
      if (tip && tip.classList.contains('on') && !tip.contains(e.target)) closeTip();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeTip();
    });
    window.addEventListener('resize', function () {
      var tip = document.getElementById(ROOT_ID);
      if (activeButton && tip && tip.classList.contains('on')) positionTip(activeButton, tip);
    });
    window.addEventListener('scroll', function () {
      var tip = document.getElementById(ROOT_ID);
      if (activeButton && tip && tip.classList.contains('on')) positionTip(activeButton, tip);
    }, true);
    document.addEventListener('hk:locale', refreshLocale);
    window.addEventListener('storage', function (e) {
      if (e && /^(hk_locale|hk_lang|hk_zh_variant)$/.test(e.key || '')) refreshLocale();
    });
  }

  function boot() {
    ensureStyle();
    bindEvents();
    apply(document);
    try {
      observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          if (records[i].addedNodes && records[i].addedNodes.length) {
            scheduleApply(document);
            break;
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  window.HK_TOOLTIPS = {
    version: VERSION,
    apply: apply,
    close: closeTip,
    register: function (map) {
      if (map && typeof map === 'object') {
        Object.keys(map).forEach(function (k) { GLOSSARY[k] = map[k]; });
        scheduleApply(document);
      }
    },
    glossary: GLOSSARY
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
