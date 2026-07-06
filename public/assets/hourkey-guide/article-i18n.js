(function () {
  'use strict';

  var LANGS = [
    ['th', 'TH', 'th'],
    ['en', 'EN', 'en'],
    ['zh', '中文', 'zh-Hant'],
    ['vi', 'VI', 'vi'],
    ['ja', 'JP', 'ja'],
    ['ko', 'KO', 'ko'],
    ['ru', 'RU', 'ru'],
    ['es', 'ES', 'es'],
    ['fr', 'FR', 'fr']
  ];

  var UI = {
    th: {
      language: 'ภาษา', hub: 'กลับสารบัญศาสตร์', home: 'hourkey', hubStage: 'science hub preview · noindex',
      detailStage: 'science detail · noindex', all: 'ดูศาสตร์ทั้งหมด', start: 'ลำดับสำหรับมือใหม่',
      advanced: 'อ่านแบบขั้นสูง', open: 'เปิดบทความ →', backHub: 'สารบัญศาสตร์',
      backHubSub: 'กลับไปดูทุกศาสตร์', readNext: 'อ่านต่อ', chart: 'เปิดดวง →', fusion: 'ดู Fusion →',
      sections: ['ศาสตร์นี้คืออะไร', 'ที่มาของศาสตร์และพัฒนาการ', 'องค์ประกอบหลัก', 'วิธีอ่านลงลึก', 'อ่านอะไรได้ / ไม่ควรใช้ตอบอะไร', 'มือใหม่ควรเริ่มอ่านตรงไหน', 'ต่างจากศาสตร์ข้างเคียงอย่างไร', 'อิงจากคลังตำรา Hourkey', 'ใช้ใน Hourkey อย่างไร'],
      good: 'อ่านได้ดี', limit: 'ไม่ควรใช้เดี่ยว ๆ'
    },
    en: {
      language: 'Language', hub: 'Science index', home: 'hourkey', hubStage: 'science hub preview · noindex',
      detailStage: 'science detail · noindex', all: 'View all sciences', start: 'Beginner path',
      advanced: 'Advanced reading', open: 'Open article →', backHub: 'Science index',
      backHubSub: 'Back to every science', readNext: 'Read next', chart: 'Open chart →', fusion: 'View Fusion →',
      sections: ['What this science is', 'Origin and development', 'Core components', 'How to read deeply', 'What it reads / what it should not answer alone', 'Where beginners should start', 'How it differs from nearby tools', 'Hourkey canon and source layer', 'How Hourkey uses it'],
      good: 'Reads well', limit: 'Do not use alone'
    },
    zh: {
      language: '語言', hub: '返回術數索引', home: 'hourkey', hubStage: '術數導覽預覽 · noindex',
      detailStage: '術數詳解 · noindex', all: '查看全部術數', start: '新手順序',
      advanced: '進階閱讀', open: '打開文章 →', backHub: '術數索引',
      backHubSub: '返回所有術數', readNext: '繼續閱讀', chart: '開命盤 →', fusion: '看 Fusion →',
      sections: ['這門術數是什麼', '來源與發展', '核心構件', '如何深入閱讀', '適合讀什麼 / 不宜單獨回答什麼', '新手從哪裡開始', '與相鄰工具的差異', 'Hourkey 典籍與來源層', 'Hourkey 如何使用'],
      good: '適合閱讀', limit: '不宜單獨使用'
    },
    vi: {
      language: 'Ngôn ngữ', hub: 'Mục lục học thuật', home: 'hourkey', hubStage: 'science hub preview · noindex',
      detailStage: 'science detail · noindex', all: 'Xem toàn bộ', start: 'Lộ trình mới bắt đầu',
      advanced: 'Đọc nâng cao', open: 'Mở bài →', backHub: 'Mục lục học thuật',
      backHubSub: 'Quay lại tất cả môn', readNext: 'Đọc tiếp', chart: 'Mở lá số →', fusion: 'Xem Fusion →',
      sections: ['Môn này là gì', 'Nguồn gốc và quá trình phát triển', 'Thành phần cốt lõi', 'Cách đọc sâu', 'Đọc tốt điều gì / không nên dùng đơn lẻ', 'Người mới nên bắt đầu ở đâu', 'Khác gì với công cụ lân cận', 'Lớp kinh điển và nguồn Hourkey', 'Hourkey dùng như thế nào'],
      good: 'Đọc tốt', limit: 'Không dùng một mình'
    },
    ja: {
      language: '言語', hub: '術数インデックス', home: 'hourkey', hubStage: 'science hub preview · noindex',
      detailStage: 'science detail · noindex', all: '全体系を見る', start: '初心者の順序',
      advanced: '上級の読み方', open: '記事を開く →', backHub: '術数インデックス',
      backHubSub: 'すべての体系へ戻る', readNext: '次を読む', chart: '命盤を開く →', fusion: 'Fusionを見る →',
      sections: ['この体系とは何か', '起源と発展', '中核要素', '深く読む方法', '読めること / 単独で答えるべきでないこと', '初心者はどこから始めるか', '隣接する道具との違い', 'Hourkey の典籍・ソース層', 'Hourkey での使い方'],
      good: '得意な読み', limit: '単独使用しない'
    },
    ko: {
      language: '언어', hub: '술수 목록', home: 'hourkey', hubStage: 'science hub preview · noindex',
      detailStage: 'science detail · noindex', all: '전체 보기', start: '초보자 순서',
      advanced: '심화 읽기', open: '글 열기 →', backHub: '술수 목록',
      backHubSub: '모든 술수로 돌아가기', readNext: '다음 읽기', chart: '명식 열기 →', fusion: 'Fusion 보기 →',
      sections: ['이 술수는 무엇인가', '기원과 발전', '핵심 구성', '깊게 읽는 방법', '잘 읽는 것 / 단독으로 답하면 안 되는 것', '초보자는 어디서 시작할까', '인접 도구와의 차이', 'Hourkey 전적과 소스 층', 'Hourkey에서의 사용'],
      good: '잘 읽는 영역', limit: '단독 사용 금지'
    },
    ru: {
      language: 'Язык', hub: 'Индекс школ', home: 'hourkey', hubStage: 'science hub preview · noindex',
      detailStage: 'science detail · noindex', all: 'Все школы', start: 'Путь новичка',
      advanced: 'Глубокое чтение', open: 'Открыть статью →', backHub: 'Индекс школ',
      backHubSub: 'Назад ко всем школам', readNext: 'Далее', chart: 'Открыть карту →', fusion: 'Смотреть Fusion →',
      sections: ['Что это за система', 'Происхождение и развитие', 'Ключевые элементы', 'Как читать глубоко', 'Что читает хорошо / что не отвечает в одиночку', 'С чего начать новичку', 'Чем отличается от соседних инструментов', 'Канон Hourkey и слой источников', 'Как Hourkey использует это'],
      good: 'Хорошо читает', limit: 'Не использовать отдельно'
    },
    es: {
      language: 'Idioma', hub: 'Indice de ciencias', home: 'hourkey', hubStage: 'science hub preview · noindex',
      detailStage: 'science detail · noindex', all: 'Ver todas', start: 'Ruta inicial',
      advanced: 'Lectura avanzada', open: 'Abrir articulo →', backHub: 'Indice de ciencias',
      backHubSub: 'Volver a todas las ciencias', readNext: 'Leer siguiente', chart: 'Abrir carta →', fusion: 'Ver Fusion →',
      sections: ['Que es esta ciencia', 'Origen y desarrollo', 'Componentes centrales', 'Como leer en profundidad', 'Que lee bien / que no debe responder sola', 'Por donde empieza un usuario nuevo', 'Diferencia con herramientas vecinas', 'Canon Hourkey y capa de fuentes', 'Como lo usa Hourkey'],
      good: 'Lee bien', limit: 'No usar sola'
    },
    fr: {
      language: 'Langue', hub: 'Index des sciences', home: 'hourkey', hubStage: 'science hub preview · noindex',
      detailStage: 'science detail · noindex', all: 'Voir toutes', start: 'Parcours debutant',
      advanced: 'Lecture avancee', open: 'Ouvrir article →', backHub: 'Index des sciences',
      backHubSub: 'Retour a toutes les sciences', readNext: 'Lire ensuite', chart: 'Ouvrir le theme →', fusion: 'Voir Fusion →',
      sections: ['Ce que cette science etudie', 'Origine et developpement', 'Composants centraux', 'Comment lire en profondeur', 'Ce que cela lit bien / ce que cela ne doit pas trancher seul', 'Par ou commencer', 'Difference avec les outils voisins', 'Canon Hourkey et couche de sources', 'Comment Hourkey l utilise'],
      good: 'Lit bien', limit: 'Ne pas utiliser seul'
    }
  };

  var SCIENCES = {
    bazi: {
      symbol: '命', asset: 'bazi', href: '/articles/sciences/bazi.html', next: ['qizheng', 'date-picking'],
      title: 'BaZi 八字', subtitle: 'Four Pillars', kicker: 'four pillars · day master · ten gods',
      pills: ['天干', '地支', '日主', '十神', '大運'],
      components: ['Four Pillars: year, month, day, hour', 'Heavenly Stems and Earthly Branches', 'Day Master, Ten Gods, hidden stems', 'Useful element, avoided element, luck pillars'],
      sources: '淵海子平, 三命通會, 子平真詮, 滴天髓, 窮通寶鑑',
      lead: {
        th: 'ปาจื้อแปลงวันเดือนปีและเวลาเกิดเป็น 4 เสา 8 อักษร เพื่ออ่านโครงสร้างพลังของชีวิต ธาตุที่ใช้ปรับสมดุล ธาตุที่ควรเลี่ยง และวัยจร ไม่ใช่การดูปีนักษัตรแบบผิวเผิน',
        en: 'BaZi converts birth year, month, day and hour into Four Pillars and Eight Characters, then reads life structure, useful elements, avoided elements and ten-year luck cycles rather than a shallow zodiac-year label.',
        zh: '八字把出生年、月、日、時化成四柱八字，用來讀命局結構、用神忌神與大運，不是只看生肖年份。',
        vi: 'BaZi biến năm, tháng, ngày và giờ sinh thành Tứ trụ Bát tự để đọc cấu trúc mệnh, dụng thần, yếu tố nên tránh và đại vận, không phải chỉ xem con giáp.',
        ja: 'BaZi は出生年・月・日・時を四柱八字に変換し、命式構造、用神、避ける要素、大運を読む体系で、単なる干支年占いではありません。',
        ko: 'BaZi는 출생 년·월·일·시를 사주팔자로 바꾸어 명식 구조, 용신, 피해야 할 기운, 대운을 읽는 체계이며 띠만 보는 방식이 아닙니다.',
        ru: 'BaZi переводит год, месяц, день и час рождения в четыре столпа и восемь знаков, чтобы читать структуру карты, полезные элементы, избегаемые элементы и десятилетние циклы.',
        es: 'BaZi convierte ano, mes, dia y hora de nacimiento en Cuatro Pilares y Ocho Caracteres para leer estructura vital, elemento util, elemento a evitar y ciclos de suerte.',
        fr: 'BaZi transforme annee, mois, jour et heure de naissance en Quatre Piliers et Huit Caracteres afin de lire structure de vie, element utile, element a eviter et cycles decennaux.'
      },
      origin: {
        th: 'รากของปาจื้ออยู่ในปฏิทินก้านฟ้า-กิ่งดิน รอบหกสิบ甲子 และ節氣ที่ผูกเวลาเข้ากับฤดูกาลจริง สาย子平ย้ายแกนการอ่านมาไว้ที่ Day Master และทำให้การดูดวงละเอียดกว่าปีนักษัตรมาก',
        en: 'Its roots are the sexagenary stem-branch calendar and jieqi solar terms. The Zi Ping lineage made the day stem the Day Master, turning calendar notation into a structural fate-reading grammar.',
        zh: '其根基在干支六十甲子與節氣。子平法以日干為日主，把曆法記號變成可讀格局、旺衰、病藥與大運的命理語法。',
        vi: 'Gốc của nó là lịch can chi lục thập hoa giáp và tiết khí. Dòng Tử Bình đặt nhật can làm Day Master, biến ký hiệu lịch thành ngữ pháp đọc mệnh cục.',
        ja: '根は六十甲子の干支暦と節気にあります。子平法は日干を日主に置き、暦の記号を格局・旺衰・病薬・大運を読む文法へ発展させました。',
        ko: '뿌리는 육십갑자 간지력과 절기에 있습니다. 자평법은 일간을 일주로 세워 달력 기호를 격국, 왕쇠, 병약, 대운을 읽는 문법으로 만들었습니다.',
        ru: 'Корень системы в шестидесятиричном календаре стволов-ветвей и солнечных сезонах jieqi. Школа Zi Ping поставила дневной ствол в центр как Day Master.',
        es: 'Su raiz esta en el calendario sexagenario de troncos y ramas y en los jieqi solares. La escuela Zi Ping puso el tallo del dia como Day Master.',
        fr: 'Sa racine se trouve dans le calendrier sexagesimal des troncs-branches et les termes solaires jieqi. La lignee Zi Ping place le tronc du jour au centre comme Day Master.'
      },
      method: 'Set the chart with correct time and solar terms, read month command, Day Master strength, roots, hidden stems, combinations, clashes, punishments, structure and luck pillars before naming a useful element.',
      good: 'Character structure, work style, pressure from wealth/authority/relationships, useful timing themes and the way luck cycles activate the natal chart.',
      limit: 'It should not replace medical, legal or financial advice, and detailed date selection still needs the actual date, hour, stars and place.',
      compare: 'BaZi is the person layer. Qi Men is the situation layer. Date Picking chooses a start time. Luopan reads real direction and space.',
      use: 'Hourkey uses BaZi as the owner profile that feeds Today, Calendar, Date Picking, Luopan and AI Sifu so later advice is not floating away from the person.'
    },
    qizheng: {
      symbol: '星', asset: 'qizheng', href: '/articles/sciences/qizheng.html', next: ['western', 'date-picking'],
      title: '七政四餘', subtitle: 'Real Sky', kicker: 'real planets · lunar nodes · sky timing',
      pills: ['日月五星', '四餘', '宿度', '天星擇日'],
      components: ['Seven visible rulers: Sun, Moon, five planets', 'Four remainders and calculated points', 'Lunar mansions and sky degrees', 'Real-sky timing for selection'],
      sources: '果老星宗, 七政四餘 manuals, 天星擇日 rules, modern astronomy engine',
      lead: {
        th: '七政四餘อ่านฟ้าจริงของจีน: อาทิตย์ จันทร์ ดาวเคราะห์ห้าดวง และจุดคำนวณสำคัญ เพื่อเพิ่มชั้นดาราศาสตร์จริงให้การอ่านเวลาและฤกษ์',
        en: 'Qi Zheng Si Yu reads the Chinese real sky: Sun, Moon, five planets and calculated remainders, adding an astronomical layer to timing and date selection.',
        zh: '七政四餘讀中國真天星：日月五星與四餘計算點，為時間與擇日加入實際天象層。',
        vi: 'Qi Zheng Si Yu đọc bầu trời thật của Trung Hoa: Mặt trời, Mặt trăng, năm hành tinh và các điểm tính toán, bổ sung lớp thiên văn cho thời điểm và chọn ngày.',
        ja: '七政四餘は中国の実天を読む体系です。太陽、月、五惑星、計算点を使い、時機と擇日に天文層を加えます。',
        ko: '칠정사여는 중국식 실제 하늘을 읽습니다. 해, 달, 다섯 행성, 계산점을 통해 시간 판단과 택일에 천문 층을 더합니다.',
        ru: 'Qi Zheng Si Yu читает реальное китайское небо: Солнце, Луну, пять планет и вычисляемые точки, добавляя астрономический слой к выбору времени.',
        es: 'Qi Zheng Si Yu lee el cielo real chino: Sol, Luna, cinco planetas y puntos calculados, anadiendo astronomia a la eleccion del tiempo.',
        fr: 'Qi Zheng Si Yu lit le ciel reel chinois: Soleil, Lune, cinq planetes et points calcules, ajoutant une couche astronomique au choix du temps.'
      },
      origin: {
        th: 'ศาสตร์นี้เติบโตจากโหราศาสตร์ดาวจริงของจีนที่ต้องรู้ตำแหน่งดาว ไม่ใช่แค่ปฏิทินก้านกิ่ง จึงเป็นสะพานระหว่างตารางโบราณกับการคำนวณดาราศาสตร์',
        en: 'It grew from Chinese stellar astrology where actual planetary position matters, making it a bridge between classical tables and reproducible astronomical computation.',
        zh: '它來自重視實際星位的中國星命傳統，是古典表法與可覆核天文計算之間的橋。',
        vi: 'Nó phát triển từ truyền thống tinh mệnh Trung Hoa coi trọng vị trí hành tinh thật, là cầu nối giữa bảng cổ điển và tính toán thiên văn kiểm chứng được.',
        ja: '実際の惑星位置を重視する中国星命から発展し、古典表と再計算できる天文学の橋になります。',
        ko: '실제 행성 위치를 중시하는 중국 성명 전통에서 발전하여 고전 표와 재현 가능한 천문 계산을 잇습니다.',
        ru: 'Система выросла из китайской звездной астрологии, где важны реальные положения планет, поэтому соединяет классические таблицы и проверяемый расчет.',
        es: 'Nace de la astrologia estelar china, donde importa la posicion real de los planetas, y une tablas clasicas con calculo astronomico reproducible.',
        fr: 'Elle vient de l astrologie stellaire chinoise ou la position reelle des planetes compte, reliant tables classiques et calcul astronomique verifiable.'
      },
      method: 'Calculate real planetary longitude, speed, dignity, lunar mansion and relation to the selected date. Then compare the sky layer against stem-branch date rules.',
      good: 'Real celestial conditions, date quality, planetary support, warnings when a calendar date looks good but the sky layer is weak.',
      limit: 'It cannot read a full life by itself without a natal layer, and it should not be reduced to a lucky star label.',
      compare: 'Compared with BaZi, it is the live-sky layer. Compared with Western or Vedic, it keeps Chinese mansion and selection grammar.',
      use: 'Hourkey uses it to prevent date picking from being only a printed almanac: actual sky and classical time rules are checked together.'
    },
    ziwei: {
      symbol: '紫', asset: 'ziwei', href: '/articles/sciences/ziwei.html', next: ['bazi', 'western'],
      title: 'Zi Wei Dou Shu 紫微斗數', subtitle: 'Palace Chart', kicker: 'twelve palaces · main stars · four transformations',
      pills: ['命宮', '身宮', '十四主星', '四化', '三方四正'],
      components: ['Twelve life palaces', 'Fourteen main stars and auxiliary stars', 'Four transformations', 'Major and annual cycles'],
      sources: '紫微斗數全書, 紫微斗數全集, 三方四正 and 四化 lineages',
      lead: {
        th: 'จื่อเวยโต่วซูอ่านชีวิตผ่าน 12 วัง ดาวหลัก ดาวเสริม สี่ฮั่ว และรอบเวลา เหมาะกับการแยกเรื่องงาน เงิน คู่ครอง บ้าน สุขภาพ และบทบาทชีวิตเป็นหมวดชัด',
        en: 'Zi Wei Dou Shu reads life through twelve palaces, main stars, auxiliary stars, four transformations and time cycles, making each life topic visible as its own chamber.',
        zh: '紫微斗數以十二宮、主星輔星、四化與限運讀人生，能把事業、財帛、夫妻、田宅、健康等分宮細看。',
        vi: 'Zi Wei Dou Shu đọc đời người qua 12 cung, chính tinh, phụ tinh, tứ hóa và chu kỳ thời gian, giúp tách công việc, tiền bạc, hôn nhân, nhà cửa, sức khỏe thành từng cung.',
        ja: '紫微斗数は十二宮、主星・副星、四化、限運で人生を読み、仕事、財、配偶、家、健康を宮ごとに分けて見ます。',
        ko: '자미두수는 12궁, 주성·보조성, 사화, 운한으로 인생을 읽어 직업, 재물, 배우자, 집, 건강을 궁별로 나눕니다.',
        ru: 'Zi Wei Dou Shu читает жизнь через двенадцать дворцов, главные и вспомогательные звезды, четыре трансформации и циклы времени.',
        es: 'Zi Wei Dou Shu lee la vida por doce palacios, estrellas principales, auxiliares, cuatro transformaciones y ciclos, separando trabajo, dinero, pareja y hogar.',
        fr: 'Zi Wei Dou Shu lit la vie par douze palais, etoiles principales et auxiliaires, quatre transformations et cycles de temps.'
      },
      origin: {
        th: 'รากของจื่อเวยอยู่ในระบบวังและดาวจีนที่จัดชีวิตเป็น 12 หมวด ไม่ได้อ่านจากธาตุอย่างเดียว แต่ดูดาวที่นั่งในวังและวังสามฝ่ายสี่ทิศร่วมกัน',
        en: 'Its lineage is a Chinese palace-and-star system. Instead of only balancing elements, it locates stars in palaces and reads the palace network by trines and oppositions.',
        zh: '其脈絡是中國宮星系統，不只看五行平衡，而是看星曜落宮、三方四正與四化飛動。',
        vi: 'Nguồn mạch của nó là hệ cung sao Trung Hoa: không chỉ cân bằng ngũ hành mà đọc sao trong cung, tam phương tứ chính và tứ hóa.',
        ja: '中国の宮星体系を源流とし、五行だけでなく、星がどの宮に入り三方四正と四化でどう動くかを読みます。',
        ko: '중국의 궁성 체계가 뿌리이며 오행 균형뿐 아니라 별의 입궁, 삼방사정, 사화의 움직임을 읽습니다.',
        ru: 'Это китайская система дворцов и звезд: важны не только элементы, но и то, какие звезды стоят в каких дворцах и как они связаны.',
        es: 'Su linaje es chino de palacios y estrellas: no solo balancea elementos, sino que mira estrellas en palacios, triangulos, oposiciones y transformaciones.',
        fr: 'Sa lignee est celle des palais et etoiles chinois: au-dela des elements, elle lit les etoiles dans les palais, les trigones, oppositions et transformations.'
      },
      method: 'Locate the life palace, body palace, main stars, auxiliary stars, four transformations and decade cycle; then read each palace through San Fang Si Zheng rather than one star alone.',
      good: 'Life topics by palace: career, wealth, spouse, children, property, health, friends, parents, travel and decade changes.',
      limit: 'A single star cannot be judged without its palace, transformations, opposite palace and time cycle.',
      compare: 'BaZi reads elemental structure; Zi Wei shows the life map as palaces. Fusion is strongest when both agree on the same life topic.',
      use: 'Hourkey uses Zi Wei as a palace map for Natal Book and AI Sifu so a question can be tied to the correct area of life.'
    },
    western: {
      symbol: '占', asset: 'western', href: '/articles/sciences/western.html', next: ['vedic', 'uranian'],
      title: 'Western Astrology', subtitle: 'Zodiac Houses', kicker: 'planets · signs · houses · aspects',
      pills: ['planets', 'zodiac', 'houses', 'aspects', 'transits'],
      components: ['Planets as functions', 'Signs as styles', 'Houses as life fields', 'Aspects, transits and progressions'],
      sources: 'Hellenistic astrology, medieval/renaissance transmission, modern psychological and transit practice',
      lead: {
        th: 'โหราศาสตร์ตะวันตกอ่านดาว ราศี เรือน และมุมสัมพันธ์ในวงล้อเกิด ไม่ใช่แค่ราศีอาทิตย์รายเดือน จุดแข็งคือภาษาของ archetype และ transit ที่เห็นจังหวะปัจจุบันได้ชัด',
        en: 'Western astrology reads planets, signs, houses and aspects in a natal wheel. It is not monthly sun-sign content; its strength is archetypal language and transits.',
        zh: '西洋占星讀本命盤中的行星、星座、宮位與相位，不只是太陽星座月運；其強項在原型語言與行運。',
        vi: 'Chiêm tinh phương Tây đọc hành tinh, cung hoàng đạo, nhà và góc chiếu trong bản đồ sinh, không chỉ là cung Mặt trời hàng tháng.',
        ja: '西洋占星は出生図の惑星、サイン、ハウス、アスペクトを読みます。月間太陽星座占いではなく、元型と言行運が強みです。',
        ko: '서양 점성술은 출생차트의 행성, 사인, 하우스, 애스펙트를 읽습니다. 월간 태양궁 운세가 아니라 원형 언어와 트랜싯이 강점입니다.',
        ru: 'Западная астрология читает планеты, знаки, дома и аспекты натальной карты. Это не месячный солнечный знак, а язык архетипов и транзитов.',
        es: 'La astrologia occidental lee planetas, signos, casas y aspectos en la carta natal; no es solo horoscopo mensual del signo solar.',
        fr: 'L astrologie occidentale lit planetes, signes, maisons et aspects du theme natal; ce n est pas un simple horoscope solaire mensuel.'
      },
      origin: {
        th: 'สายตะวันตกสืบจากบาบิโลน กรีก เฮลเลนิสติก อาหรับ ยุโรปยุคกลาง และยุคใหม่ที่เพิ่มมิติด้านจิตวิทยา แต่แกนเรขาคณิต 360° และมุมสัมพันธ์ยังเป็นหัวใจ',
        en: 'It descends through Babylonian, Greek, Hellenistic, Arabic, medieval and modern streams. The 360-degree circle and angular relationship remain the core grammar.',
        zh: '其傳承經巴比倫、希臘、希臘化、阿拉伯、中世紀與現代心理占星；360 度圓與相位仍是核心文法。',
        vi: 'Nó đi qua các dòng Babylon, Hy Lạp, Hy Lạp hóa, Ả Rập, trung cổ và hiện đại; vòng 360 độ và quan hệ góc vẫn là ngữ pháp lõi.',
        ja: 'バビロニア、ギリシャ、ヘレニズム、アラビア、中世、現代へ継承され、360度円と角度関係が中核文法です。',
        ko: '바빌로니아, 그리스, 헬레니즘, 아랍, 중세, 현대를 거치며 전승되었고 360도 원과 각도 관계가 핵심 문법입니다.',
        ru: 'Традиция проходит через Вавилон, Грецию, эллинизм, арабскую и средневековую Европу; круг 360 градусов и аспекты остаются ядром.',
        es: 'Desciende de corrientes babilonias, griegas, helenisticas, arabes, medievales y modernas; el circulo de 360 grados y los aspectos son la gramatica central.',
        fr: 'Elle traverse les courants babyloniens, grecs, hellenistiques, arabes, medievaux et modernes; le cercle de 360 degres et les aspects restent le coeur.'
      },
      method: 'Read chart sect, angles, planets, signs, houses, rulers, dignity, aspects and transits. A planet is never interpreted outside its house and aspect network.',
      good: 'Psychological pattern, relationship dynamics, life topics by house, timing by transit/progression and comparison with other natal systems.',
      limit: 'Sun-sign summaries are too thin; exact birth time is critical for houses and angles.',
      compare: 'Vedic uses a sidereal frame and dasha timing. Uranian compresses the same circle into midpoint pictures.',
      use: 'Hourkey uses Western astrology as a transparent sky-wheel layer in Master Fusion and AI Sifu explanations.'
    },
    vedic: {
      symbol: '吠', asset: 'vedic', href: '/articles/sciences/vedic.html', next: ['western', 'uranian'],
      title: 'Vedic Astrology', subtitle: 'Jyotisha', kicker: 'sidereal zodiac · nakshatra · dasha',
      pills: ['lagna', 'graha', 'bhava', 'nakshatra', 'dasha'],
      components: ['Sidereal zodiac and ayanamsa', 'Lagna and houses', 'Graha, nakshatra and pada', 'Dasha and gochara timing'],
      sources: 'Brihat Parashara Hora Shastra, Jaimini, nakshatra and dasha traditions',
      lead: {
        th: 'โหราศาสตร์พระเวทหรือ Jyotisha ใช้จักรราศีแบบ sidereal, ลัคนา, ดาว graha, นักษัตร และ dasha เพื่ออ่านโครงชีวิตกับช่วงเวลาที่ดาวให้ผล',
        en: 'Vedic astrology, or Jyotisha, uses the sidereal zodiac, lagna, graha, nakshatra and dasha systems to read life structure and planetary periods.',
        zh: '印度吠陀占星 Jyotisha 使用恆星黃道、上升、九曜、nakshatra 與 dasha 來讀生命結構與行星期。',
        vi: 'Jyotisha dùng hoàng đạo sidereal, lagna, graha, nakshatra và dasha để đọc cấu trúc đời người và các thời kỳ hành tinh.',
        ja: 'Jyotisha は恒星黄道、ラグナ、グラハ、ナクシャトラ、ダシャーで人生構造と惑星期を読みます。',
        ko: '조티시는 항성황도, 라그나, 그라하, 낙샤트라, 다샤로 삶의 구조와 행성 기간을 읽습니다.',
        ru: 'Джйотиша использует сидерический зодиак, лагну, грахи, накшатры и даши для чтения структуры жизни и планетных периодов.',
        es: 'Jyotisha usa zodiaco sideral, lagna, graha, nakshatra y dasha para leer estructura de vida y periodos planetarios.',
        fr: 'Jyotisha utilise zodiaque sideral, lagna, graha, nakshatra et dasha pour lire structure de vie et periodes planetaires.'
      },
      origin: {
        th: 'รากอยู่ใน Vedanga Jyotisha และประเพณีอินเดียที่ผูกเวลา พิธีกรรม และดาวฤกษ์ ระบบ dasha ทำให้มองเวลาเป็นช่วงกรรมของดาว ไม่ใช่แค่ transit รายวัน',
        en: 'Its roots are in Vedanga Jyotisha and Indian ritual timekeeping. Dasha systems make time readable as planetary periods, not only daily transits.',
        zh: '其根在 Vedanga Jyotisha 與印度祭儀時間傳統。Dasha 讓時間成為行星期，而非只有每日行運。',
        vi: 'Gốc nằm trong Vedanga Jyotisha và truyền thống thời gian nghi lễ Ấn Độ. Dasha biến thời gian thành các thời kỳ hành tinh.',
        ja: '根は Vedanga Jyotisha とインドの儀礼時間にあります。ダシャーは時間を日々の行運だけでなく惑星期として読ませます。',
        ko: '뿌리는 Vedanga Jyotisha와 인도 의례 시간 전통입니다. 다샤는 시간을 단순 트랜싯이 아니라 행성 기간으로 읽게 합니다.',
        ru: 'Корни в Vedanga Jyotisha и индийском ритуальном времени. Даши позволяют читать время как планетные периоды.',
        es: 'Sus raices estan en Vedanga Jyotisha y el tiempo ritual indio. Los dasha leen el tiempo como periodos planetarios.',
        fr: 'Ses racines sont dans Vedanga Jyotisha et le temps rituel indien. Les dasha lisent le temps comme periodes planetaires.'
      },
      method: 'Confirm birth time, lagna, house system, ayanamsa, planetary dignity, nakshatra, yogas, dasha and gochara. Timing is read by period lord plus current transit.',
      good: 'Life periods, vocation, relationship karma, spiritual pattern, and why one theme becomes active in a particular planetary period.',
      limit: 'Without accurate birth time, lagna, houses and some dashas can shift; remedies should be treated culturally, not as guaranteed fixes.',
      compare: 'Western uses tropical signs by default; Vedic uses sidereal reference and period timing. Fusion compares both coordinate systems.',
      use: 'Hourkey uses Vedic as the sidereal timing layer in Master Fusion, especially when dasha periods clarify why a theme is active now.'
    },
    uranian: {
      symbol: '軸', asset: 'uranian', href: '/articles/sciences/uranian.html', next: ['western', 'vedic'],
      title: 'Uranian Astrology', subtitle: 'Hamburg School', kicker: 'midpoint · 90-degree dial · planetary pictures',
      pills: ['midpoint', '90° dial', 'planetary pictures', 'axis'],
      components: ['Midpoints and axes', '90-degree dial', 'Planetary pictures', 'Event and sensitive points'],
      sources: 'Alfred Witte, Hamburg School, Uranian midpoint practice',
      lead: {
        th: 'ยูเรเนียนอ่านแกน midpoint และ planetary pictures บนวงล้อ 90 องศา เหมาะกับการจับรูปเหตุการณ์ที่ซ่อนอยู่ในความสัมพันธ์เชิงเรขาคณิตของดาว',
        en: 'Uranian astrology reads midpoints and planetary pictures on the 90-degree dial, finding event structures hidden in geometric relationships.',
        zh: 'Hamburg/Uranian 以中點、行星圖像與 90 度盤讀事件軸，捕捉藏在幾何關係中的結構。',
        vi: 'Uranian đọc midpoint và planetary pictures trên vòng 90 độ để bắt cấu trúc sự kiện ẩn trong quan hệ hình học của hành tinh.',
        ja: 'ウラニアンは90度ダイヤル上のミッドポイントと planetary pictures を読み、幾何関係に隠れた出来事軸を捉えます。',
        ko: '우라니안은 90도 다이얼의 미드포인트와 planetary pictures를 읽어 행성 기하 속 사건 구조를 포착합니다.',
        ru: 'Уранианская школа читает средние точки и planetary pictures на 90-градусном круге, выявляя структуру событий в геометрии планет.',
        es: 'La astrologia uraniana lee midpoints y planetary pictures en el dial de 90 grados para ver estructuras de evento.',
        fr: 'L astrologie uranienne lit les mi-points et planetary pictures sur le cadran de 90 degres pour voir les structures d evenement.'
      },
      origin: {
        th: 'สายนี้มาจาก Hamburg School และ Alfred Witte ที่เน้นความแม่นของแกน มุม และ midpoint มากกว่าการเล่าเชิงสัญลักษณ์กว้าง ๆ',
        en: 'It comes from the Hamburg School and Alfred Witte, emphasizing axes, angular precision and midpoint equations more than broad symbolic narration.',
        zh: '它來自 Hamburg School 與 Alfred Witte，重視軸線、角度精度與中點方程，多於寬泛象徵敘事。',
        vi: 'Nó đến từ Hamburg School và Alfred Witte, nhấn mạnh trục, độ chính xác góc và phương trình midpoint hơn là diễn giải biểu tượng rộng.',
        ja: 'Hamburg School と Alfred Witte に由来し、広い象徴解釈よりも軸、角度精度、ミッドポイント方程式を重視します。',
        ko: 'Hamburg School과 Alfred Witte에서 왔으며 넓은 상징보다 축, 각도 정밀도, 미드포인트 방정식을 중시합니다.',
        ru: 'Происходит из Hamburg School и работ Alfred Witte, где важны оси, точность углов и уравнения средних точек.',
        es: 'Viene de Hamburg School y Alfred Witte, con enfasis en ejes, precision angular y ecuaciones de midpoint.',
        fr: 'Elle vient de la Hamburg School et d Alfred Witte, avec accent sur axes, precision angulaire et equations de mi-points.'
      },
      method: 'Normalize longitudes, fold them into the 90-degree dial, inspect midpoint trees and planetary pictures, then require repeated signatures before judging an event.',
      good: 'Event signatures, hidden connections, relationship/event axes, and checking whether another astrology result has a precise geometric echo.',
      limit: 'It is easy to over-read one formula; the method needs repeated axes, tight orbs and context from the natal or event chart.',
      compare: 'Western explains the symbolic wheel; Uranian compresses it into axes and midpoint equations for verification.',
      use: 'Hourkey uses Uranian as a precision-check layer in Fusion when a theme needs geometric confirmation.'
    },
    qimen: {
      symbol: '奇', asset: 'qimen', href: '/articles/sciences/qimen.html', next: ['date-picking', 'fengshui-luopan'],
      title: 'Qi Men Dun Jia 奇門遁甲', subtitle: 'Situation Map', kicker: 'nine palaces · doors · stars · deities',
      pills: ['九宮', '八門', '九星', '八神', '值符'],
      components: ['Nine palaces', 'Eight doors', 'Nine stars', 'Eight deities and stems'],
      sources: '奇門遁甲 classical palace methods, hour-board and situation reading lineages',
      lead: {
        th: 'Qi Men อ่านสถานการณ์เฉพาะหน้าเป็นแผนที่เก้าวัง มีประตู ดาว เทพ ก้านฟ้า และทิศ ใช้เมื่อคำถามคือ “ตอนนี้ควรทำอะไร ทางไหน และเมื่อไหร่”',
        en: 'Qi Men reads a live situation as a nine-palace map with doors, stars, deities, stems and directions: what to do now, from which direction, and when.',
        zh: '奇門以九宮盤讀當下局勢，含八門、九星、八神、天干與方位，用於判斷此刻如何行動。',
        vi: 'Qi Men đọc tình huống hiện tại như bản đồ cửu cung với cửa, sao, thần, thiên can và phương hướng: nên làm gì, đi hướng nào, lúc nào.',
        ja: '奇門遁甲は九宮盤、八門、九星、八神、天干、方位で現在の状況を読み、今何をどう動くかを判断します。',
        ko: '기문둔갑은 구궁, 팔문, 구성, 팔신, 천간, 방향으로 현재 상황을 읽어 지금 무엇을 어떻게 할지 판단합니다.',
        ru: 'Qi Men читает текущую ситуацию как карту девяти дворцов с дверями, звездами, духами, стволами и направлениями.',
        es: 'Qi Men lee una situacion presente como mapa de nueve palacios con puertas, estrellas, deidades, tallos y direcciones.',
        fr: 'Qi Men lit une situation presente comme carte a neuf palais avec portes, etoiles, divinites, troncs et directions.'
      },
      origin: {
        th: 'รากของ Qi Men อยู่ในศาสตร์ยุทธศาสตร์ เวลา และทิศทางของจีน จากการจัดฟ้า-ดิน-คนลงในเก้าวัง เพื่ออ่านช่องทางที่เปิดหรือปิดในสถานการณ์หนึ่ง',
        en: 'Its roots are Chinese strategy, timing and direction. Heaven, earth and human layers are arranged into nine palaces to see which gates are open.',
        zh: '其根在中國戰略、時間與方位術，把天、地、人三層排入九宮，以看局中何門可用。',
        vi: 'Gốc của nó là chiến lược, thời gian và phương hướng Trung Hoa: thiên, địa, nhân được đặt vào cửu cung để xem cửa nào mở.',
        ja: '中国の戦略、時間、方位術に根を持ち、天・地・人を九宮に配して、どの門が使えるかを見ます。',
        ko: '중국의 전략, 시간, 방위술에 뿌리를 두고 천·지·인을 구궁에 배치해 어떤 문이 열렸는지 봅니다.',
        ru: 'Корни в китайской стратегии, времени и направлении: небо, земля и человек раскладываются по девяти дворцам.',
        es: 'Sus raices estan en estrategia china, tiempo y direccion: cielo, tierra y humano se colocan en nueve palacios.',
        fr: 'Ses racines sont dans la strategie chinoise, le temps et la direction: ciel, terre et humain sont places dans neuf palais.'
      },
      method: 'Build the chart for the exact question time, locate asker/useful god, door, star, deity, palace condition, direction and interaction between palaces.',
      good: 'Negotiation, travel, choosing an approach, immediate strategy, lost-and-found style questions and whether action or waiting is better.',
      limit: 'It is not a full natal profile; the question must be concrete and the time of asking matters.',
      compare: 'BaZi is stable birth structure. Qi Men is the moving battlefield. Date Picking can later choose the start time.',
      use: 'Hourkey uses Qi Men for situational answers and AI Sifu follow-up when the user asks what to do now.'
    },
    'fengshui-luopan': {
      symbol: '羅', asset: 'fengshui-luopan', href: '/articles/sciences/fengshui-luopan.html', next: ['qimen', 'date-picking'],
      title: 'Luopan / Feng Shui 羅盤', subtitle: 'Space Compass', kicker: 'real degree · 24 mountains · flying stars',
      pills: ['24 mountains', 'sitting/facing', 'flying stars', 'floor plan'],
      components: ['Measured compass degree', 'Sitting and facing', 'Twenty-four mountains', 'Flying stars and floor plan pins'],
      sources: '玄空飛星, 24 mountains, Later Heaven Bagua, luopan ring logic',
      lead: {
        th: 'Luopan AI อ่านองศาทิศจริง แปลน พื้นที่ ประตู น้ำ โต๊ะ เตา และดาวเหิน เพื่อให้คำตอบเรื่องบ้านหรือร้านไม่ลอยจากพื้นที่จริง',
        en: 'Luopan AI reads real compass degrees, plan, door, water, desk, stove and flying stars so space advice is grounded in the actual place.',
        zh: '羅盤 AI 讀實際度數、平面圖、門、水、桌、灶與飛星，讓空間建議不脫離真實場域。',
        vi: 'Luopan AI đọc độ la bàn thật, mặt bằng, cửa, nước, bàn, bếp và phi tinh để lời khuyên không rời khỏi không gian thật.',
        ja: 'Luopan AI は実測方位、平面図、門、水、机、炉、飛星を読み、空間助言を実際の場所に結びます。',
        ko: 'Luopan AI는 실제 방위각, 평면도, 문, 물, 책상, 부엌, 비성을 읽어 공간 조언을 실제 장소에 묶습니다.',
        ru: 'Luopan AI читает реальные градусы, план, дверь, воду, стол, плиту и летящие звезды, чтобы совет был связан с местом.',
        es: 'Luopan AI lee grados reales, plano, puerta, agua, mesa, cocina y estrellas volantes para anclar el consejo al espacio real.',
        fr: 'Luopan AI lit les degres reels, plan, porte, eau, bureau, cuisiniere et etoiles volantes pour ancrer le conseil au lieu reel.'
      },
      origin: {
        th: 'รากของฮวงจุ้ยอยู่ที่การอ่านภูมิประเทศ ทิศ ลม น้ำ และเวลา ต่อมาระบบหล่อแกทำให้ความรู้เหล่านี้เป็นวงแหวนองศา เช่น 24 ภูเขา ปากั้ว และดาวเหิน',
        en: 'Feng Shui began with landform, direction, wind, water and time. The luopan turned that knowledge into rings: 24 mountains, bagua, stems, branches and flying stars.',
        zh: '風水源於形勢、方位、風、水與時間。羅盤把這些知識化成二十四山、八卦、干支與飛星等環層。',
        vi: 'Phong thủy bắt đầu từ hình thế, phương hướng, gió, nước và thời gian. La bàn biến tri thức đó thành 24 sơn, bát quái, can chi và phi tinh.',
        ja: '風水は形勢、方位、風、水、時間から始まり、羅盤はそれを二十四山、八卦、干支、飛星の環へ整理しました。',
        ko: '풍수는 형세, 방향, 바람, 물, 시간에서 시작했고 나침반은 이를 24산, 팔괘, 간지, 비성의 고리로 정리했습니다.',
        ru: 'Фэн-шуй начался с формы земли, направления, ветра, воды и времени. Лопань оформил это в кольца: 24 горы, багуа, стволы, ветви и летящие звезды.',
        es: 'Feng Shui nace de forma del terreno, direccion, viento, agua y tiempo. El luopan lo organiza en anillos: 24 montanas, bagua y estrellas volantes.',
        fr: 'Le Feng Shui part des formes du terrain, de la direction, du vent, de l eau et du temps. Le luopan organise cela en anneaux: 24 montagnes, bagua et etoiles volantes.'
      },
      method: 'Measure real degrees, confirm sitting/facing, map the plan, place doors and activity zones, then read mountains, rings and flying stars together with the resident profile.',
      good: 'House/shop orientation, room use, door and desk direction, renovation risk, water placement and whether a sector should be active or quiet.',
      limit: 'Without a measured plan, advice remains rough; do not renovate or disturb difficult sectors without date and risk checks.',
      compare: 'Qi Men reads a momentary direction; Luopan reads a fixed place. Date Picking chooses when to activate or renovate it.',
      use: 'Hourkey uses Luopan AI to pass real degrees, rings, flying stars and plan pins into AI Sifu instead of relying on vague compass labels.'
    },
    'date-picking': {
      symbol: '擇', asset: 'date-picking', href: '/articles/sciences/date-picking.html', next: ['bazi', 'qizheng'],
      title: 'Date Picking 擇日', subtitle: 'Auspicious Timing', kicker: 'almanac · owner chart · event type',
      pills: ['通書', '十二建除', '二十八宿', '太歲', '三煞'],
      components: ['Event type and owner chart', 'Stem-branch day and hour', 'Twelve officers and twenty-eight mansions', 'Tai Sui, San Sha, clash and avoid rules'],
      sources: '通書, 董公擇日, 二十八宿, 十二建除, 天星擇日',
      lead: {
        th: 'Date Picking คือการเลือกวันเวลาเริ่มงานให้ตรงกับประเภทงาน เจ้าของงาน สถานที่ และข้อห้าม ไม่ใช่แค่เลือกวันที่ปฏิทินเขียนว่าดี',
        en: 'Date Picking selects a start date and hour that match the event, owner, place and avoid rules, not merely a day that an almanac labels lucky.',
        zh: '擇日是為事件、主人、地點與禁忌選擇啟動日時，不只是挑通書上寫吉的日子。',
        vi: 'Chọn ngày là chọn ngày giờ khởi sự phù hợp loại việc, chủ sự, địa điểm và điều cần tránh, không chỉ lấy ngày ghi là tốt.',
        ja: '擇日は、行事、当事者、場所、禁忌に合う開始日時を選ぶことで、暦に吉と書かれた日を拾うだけではありません。',
        ko: '택일은 일의 종류, 주인, 장소, 피해야 할 규칙에 맞는 시작 날짜와 시간을 고르는 것이며 달력의 길일만 보는 것이 아닙니다.',
        ru: 'Выбор даты подбирает день и час начала под событие, владельца, место и запреты, а не просто берет день с пометкой удачно.',
        es: 'Date Picking elige dia y hora de inicio segun evento, dueno, lugar y reglas de evitacion; no solo un dia marcado como bueno.',
        fr: 'La selection de date choisit jour et heure de depart selon l evenement, le proprietaire, le lieu et les interdits, pas seulement une date dite chanceuse.'
      },
      origin: {
        th: 'รากอยู่ในปฏิทินจีน 通書 ระบบ建除 12 วัน 二十八宿 ฤกษ์ดาวจริง และกฎหลีกเลี่ยงอย่าง 太歲 三煞 月破 日破 การอ่านจริงต้องรวมหลายชั้น',
        en: 'It grows from Tong Shu almanacs, the twelve officers, twenty-eight mansions, real-sky selection and avoid rules such as Tai Sui, San Sha and day/month breakers.',
        zh: '其根在通書、十二建除、二十八宿、天星擇日，以及太歲、三煞、月破、日破等避忌。',
        vi: 'Gốc nằm trong thông thư, 12 trực, 28 tú, thiên tinh trạch nhật và quy tắc tránh như Thái Tuế, Tam Sát, nguyệt phá, nhật phá.',
        ja: '通書、十二建除、二十八宿、天星擇日、太歳・三煞・月破・日破などの避忌に根があります。',
        ko: '통서, 12건제, 28수, 천성택일, 태세·삼살·월파·일파 같은 회피 규칙에 뿌리를 둡니다.',
        ru: 'Корни в Tong Shu, двенадцати офицерах, 28 лунных стоянках, звездном выборе и запретах Tai Sui, San Sha, breakers.',
        es: 'Su raiz esta en Tong Shu, doce oficiales, 28 mansiones, seleccion por estrellas reales y reglas como Tai Sui, San Sha y breakers.',
        fr: 'Ses racines sont dans Tong Shu, les douze officiers, 28 demeures, selection par etoiles reelles et regles Tai Sui, San Sha, breakers.'
      },
      method: 'Define the event, owner and place first; filter hard avoid rules; score day/hour; then compare with BaZi, real sky and direction before recommending a window.',
      good: 'Opening, signing, moving, renovation, launch, ritual start and any action where the first moment matters.',
      limit: 'A generically good day can still clash with the owner or the place; it should not override practical readiness.',
      compare: 'BaZi tells who the date is for; Qi Zheng checks the sky; Luopan checks the place; Date Picking chooses the start window.',
      use: 'Hourkey uses Date Picking to convert personal profile, sky and place constraints into readable ranked days and reasons.'
    },
    heluo: {
      symbol: '河', asset: 'heluo', href: '/articles/sciences/heluo.html', next: ['fengshui-luopan', 'bazi'],
      title: 'He Luo 河洛', subtitle: 'Cosmology Base', kicker: 'hetu · luoshu · bagua · numbers',
      pills: ['河圖', '洛書', '八卦', '五行', '九宮'],
      components: ['Hetu and Luoshu number patterns', 'Bagua and Later Heaven arrangement', 'Five phases and directions', 'Nine-palace cosmology'],
      sources: '河圖, 洛書, 易經, 先天/後天八卦, 九宮 number systems',
      lead: {
        th: 'He Luo คือรากฐานตัวเลข ทิศ ปากั้ว ห้าธาตุ และเก้าวังของศาสตร์จีนหลายแขนง เป็นฐานคิด ไม่ใช่เครื่องมือทำนายรายวันโดยลำพัง',
        en: 'He Luo is the number, direction, bagua, five-phase and nine-palace foundation beneath many Chinese systems. It is a cosmological base, not a daily oracle by itself.',
        zh: '河洛是許多中國術數背後的數、方位、八卦、五行與九宮基礎，是宇宙論底層，不是單獨每日占卜工具。',
        vi: 'He Luo là nền tảng số, phương hướng, bát quái, ngũ hành và cửu cung của nhiều môn Trung Hoa; đây là tầng vũ trụ luận, không phải công cụ xem ngày đơn lẻ.',
        ja: '河洛は中国術数の背後にある数、方位、八卦、五行、九宮の基盤で、宇宙論の土台であり単独の日運占いではありません。',
        ko: '하락은 여러 중국 술수의 수, 방향, 팔괘, 오행, 구궁 기반이며 우주론의 바탕이지 단독 일일 점술은 아닙니다.',
        ru: 'He Luo - основа чисел, направлений, багуа, пяти фаз и девяти дворцов во многих китайских системах; это космологическая база.',
        es: 'He Luo es la base de numeros, direcciones, bagua, cinco fases y nueve palacios bajo muchas ciencias chinas.',
        fr: 'He Luo est la base des nombres, directions, bagua, cinq phases et neuf palais sous de nombreuses sciences chinoises.'
      },
      origin: {
        th: '河圖และ洛書เป็นแผนภาพตัวเลขโบราณที่ถูกใช้ตีความความสัมพันธ์ของฟ้า ดิน ทิศ ฤดูกาล และห้าธาตุ ต่อมาปากั้วและเก้าวังรับโครงนี้ไปใช้ในฮวงจุ้ย ฉีเหมิน และปฏิทิน',
        en: 'Hetu and Luoshu are ancient number diagrams used to model heaven-earth, direction, season and five-phase relationships; bagua and nine palaces inherit the pattern.',
        zh: '河圖洛書是古代數圖，用來建模天地、方位、季節與五行關係；八卦與九宮承接其結構。',
        vi: 'Hà đồ và Lạc thư là đồ hình số cổ mô hình hóa trời đất, phương hướng, mùa và ngũ hành; bát quái và cửu cung kế thừa cấu trúc đó.',
        ja: '河図・洛書は天地、方位、季節、五行関係を表す古代数図で、八卦と九宮がその構造を継承します。',
        ko: '하도와 낙서는 천지, 방향, 계절, 오행 관계를 모델링한 고대 숫자 도식이며 팔괘와 구궁이 그 구조를 잇습니다.',
        ru: 'Hetu и Luoshu - древние числовые схемы для моделирования неба-земли, направлений, сезонов и пяти фаз.',
        es: 'Hetu y Luoshu son diagramas numericos antiguos para modelar cielo-tierra, direccion, estacion y cinco fases.',
        fr: 'Hetu et Luoshu sont des diagrammes numeriques anciens pour modeler ciel-terre, directions, saisons et cinq phases.'
      },
      method: 'Read number placement, polarity, five-phase relation, bagua position and nine-palace movement as a structural language behind other calculations.',
      good: 'Explaining why directions, numbers, palaces, bagua and five phases relate across Feng Shui, Qi Men and calendrical systems.',
      limit: 'It is too foundational to answer personal questions alone; it needs a concrete system such as BaZi, Qi Men or Luopan.',
      compare: 'He Luo is the grammar layer. Luopan, Qi Men and Date Picking are applied languages built on that grammar.',
      use: 'Hourkey uses He Luo as the conceptual foundation for explaining why rings, palaces, directions and elements connect.'
    }
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
    });
  }

  function langMeta(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === code) return LANGS[i];
    return LANGS[0];
  }

  function getLang() {
    try {
      var q = new URLSearchParams(location.search).get('lang');
      if (q && UI[q]) return q;
      var s = localStorage.getItem('hk_article_locale') || localStorage.getItem('hk_locale') || localStorage.getItem('hk_lang');
      if (s && UI[s]) return s;
    } catch (e) {}
    return document.documentElement.dataset.lang && UI[document.documentElement.dataset.lang] ? document.documentElement.dataset.lang : 'th';
  }

  function setMeta(name, value) {
    var el = document.querySelector('meta[name="' + name + '"]');
    if (el) el.setAttribute('content', value);
  }

  function setProp(prop, value) {
    var el = document.querySelector('meta[property="' + prop + '"]');
    if (el) el.setAttribute('content', value);
  }

  function injectLangSelect(current) {
    var topbar = document.querySelector('.topbar');
    if (!topbar || document.getElementById('articleLang')) return;
    var label = document.createElement('label');
    label.className = 'article-lang';
    var options = LANGS.map(function (l) {
      return '<option value="' + l[0] + '">' + l[1] + '</option>';
    }).join('');
    label.innerHTML = '<span>' + esc((UI[current] || UI.th).language) + '</span><select id="articleLang" aria-label="Language">' + options + '</select>';
    topbar.appendChild(label);
    var sel = label.querySelector('select');
    sel.value = current;
    sel.addEventListener('change', function () {
      apply(sel.value);
      try {
        var url = new URL(location.href);
        url.searchParams.set('lang', sel.value);
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch (e) {}
    });
  }

  function syncLang(code) {
    var meta = langMeta(code);
    document.documentElement.lang = meta[2];
    document.documentElement.dataset.lang = code;
    try {
      localStorage.setItem('hk_article_locale', code);
      localStorage.setItem('hk_locale', code);
      localStorage.setItem('hk_lang', code);
    } catch (e) {}
    var sel = document.getElementById('articleLang');
    if (sel) {
      sel.value = code;
      var label = sel.parentNode && sel.parentNode.querySelector('span');
      if (label) label.textContent = (UI[code] || UI.th).language;
    }
  }

  function localized(obj, code) {
    if (obj && typeof obj === 'object') return obj[code] || obj.en || obj.th || '';
    return obj || '';
  }

  function paragraphBlock(items) {
    return items.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  }

  function buildComponents(s) {
    return '<ul class="learn-list">' + s.components.map(function (item) {
      var parts = item.split(':');
      var head = parts.length > 1 ? parts.shift() : item;
      var tail = parts.length ? parts.join(':').trim() : '';
      return '<li><b>' + esc(head) + (tail ? ':</b> ' + esc(tail) : '</b>') + '</li>';
    }).join('') + '</ul>';
  }

  var DETAIL_COPY = {
    en: {
      grammar: '%name% uses a defined calculation grammar, not a free-form fortune prompt. The chart has to be built first; interpretation comes after the structure is visible.',
      layer: 'Hourkey treats this layer as a historical technical language: calendar, sky, direction, number and palace rules are kept separate until the fusion step asks how they agree or conflict.',
      deep: 'A deep reading checks order and dependency: first the chart basis, then strength or condition, then relationships, then time activation, then practical advice. A single attractive keyword is never enough.',
      start: 'Start with the most stable layer, then add timing, direction and situational layers. For this science, the first task is to learn what the chart is measuring before asking for a prediction.',
      source: 'The internal reading order is designed so AI Sifu can show why a conclusion was reached: source rule, computed chart, conflict check and final human-readable advice.',
      technical: 'Technical detail'
    },
    zh: {
      grammar: '%name% 有明確計算文法，不是自由發揮的算命 prompt。必須先排出盤局，看到結構之後才解讀。',
      layer: 'Hourkey 把這一層當作歷史形成的技術語言：曆法、天象、方位、數理與宮位先分清，Fusion 時才比較其相合與相衝。',
      deep: '深入閱讀要看次序與依賴：先定盤，再看旺衰或狀態，再看關係，再看時間觸發，最後才給可行建議。單一吉凶詞不夠。',
      start: '新手先讀最穩定的命盤層，再加入時間、方位與情境。這門術數首先要知道盤在量測什麼，再問判斷。',
      source: '內部閱讀順序讓 AI Sifu 能交代結論來源：典籍規則、計算盤、衝突檢查，最後轉成可讀建議。',
      technical: '技術細節'
    },
    vi: {
      grammar: '%name% co ngu phap tinh toan ro rang, khong phai prompt doan menh tu do. Phai lap ban do truoc, thay cau truc roi moi dien giai.',
      layer: 'Hourkey xem lop nay nhu mot ngon ngu ky thuat co lich su: lich, bau troi, phuong huong, so va cung duoc tach rieng truoc khi Fusion so sanh diem hop hay xung.',
      deep: 'Doc sau can dung thu tu: nen tang la so, suc manh hoac trang thai, quan he, kich hoat theo thoi gian, roi moi thanh loi khuyen hanh dong. Mot tu khoa cat-hung rieng le khong du.',
      start: 'Nguoi moi nen bat dau tu lop on dinh nhat, sau do them thoi diem, phuong huong va tinh huong. Viec dau tien la hieu ban do nay dang do dieu gi.',
      source: 'Thu tu doc noi bo giup AI Sifu giai thich vi sao ket luan xuat hien: quy tac kinh dien, ban do tinh toan, kiem tra xung dot va loi khuyen de hieu.',
      technical: 'Chi tiet ky thuat'
    },
    ja: {
      grammar: '%name% は明確な計算文法を持つ体系で、自由作文の占い prompt ではありません。まず盤を作り、構造が見えてから解釈します。',
      layer: 'Hourkey はこの層を歴史的な技術言語として扱います。暦、実天、方位、数、宮位を分け、Fusion で一致と衝突を見ます。',
      deep: '深い読解は順序を守ります。盤の基礎、強弱や状態、関係、時間による発動、最後に実行可能な助言です。単語一つの吉凶では足りません。',
      start: '初心者は最も安定した層から始め、時間、方位、状況を加えます。この体系ではまず盤が何を測っているかを知ることが重要です。',
      source: '内部の読解順序により、AI Sifu は典籍規則、計算結果、矛盾確認、最後の助言まで理由を示せます。',
      technical: '技術詳細'
    },
    ko: {
      grammar: '%name% 는 정해진 계산 문법을 가진 체계이며 자유형 운세 prompt 가 아닙니다. 먼저 차트를 세우고 구조가 보인 뒤 해석합니다.',
      layer: 'Hourkey는 이 층을 역사적 기술 언어로 다룹니다. 달력, 실제 하늘, 방향, 숫자, 궁위를 분리한 뒤 Fusion에서 일치와 충돌을 봅니다.',
      deep: '깊은 해석은 순서를 따릅니다. 차트 기반, 강약이나 상태, 관계, 시간 활성화, 마지막으로 실행 가능한 조언입니다. 하나의 길흉 키워드로는 부족합니다.',
      start: '초보자는 가장 안정적인 층에서 시작하고 시간, 방향, 상황을 더해야 합니다. 먼저 이 차트가 무엇을 측정하는지 이해해야 합니다.',
      source: '내부 읽기 순서는 AI Sifu가 고전 규칙, 계산 차트, 충돌 점검, 최종 조언까지 결론의 이유를 보이게 합니다.',
      technical: '기술 세부'
    },
    ru: {
      grammar: '%name% имеет строгую вычислительную грамматику; это не свободный prompt для гадания. Сначала строится карта, затем читается видимая структура.',
      layer: 'Hourkey рассматривает этот слой как исторический технический язык: календарь, небо, направление, числа и дворцы разделяются до этапа Fusion.',
      deep: 'Глубокое чтение идет по порядку: основа карты, сила или состояние, связи, активация временем и только затем практический совет. Одного яркого ключевого слова недостаточно.',
      start: 'Новичку лучше начать с самого стабильного слоя, затем добавить время, направление и ситуацию. Сначала нужно понять, что именно измеряет карта.',
      source: 'Внутренний порядок чтения позволяет AI Sifu показать происхождение вывода: правило источника, расчетная карта, проверка конфликта и понятный совет.',
      technical: 'Техническая деталь'
    },
    es: {
      grammar: '%name% tiene una gramatica de calculo definida; no es un prompt libre de adivinacion. Primero se construye la carta y despues se interpreta la estructura visible.',
      layer: 'Hourkey trata esta capa como lenguaje tecnico historico: calendario, cielo, direccion, numero y palacio se separan antes de comparar acuerdos o conflictos en Fusion.',
      deep: 'La lectura profunda sigue un orden: base de la carta, fuerza o condicion, relaciones, activacion temporal y consejo practico. Una sola palabra auspiciosa no basta.',
      start: 'Un usuario nuevo empieza por la capa mas estable y despues suma tiempo, direccion y situacion. Primero hay que saber que mide esta carta.',
      source: 'El orden interno permite que AI Sifu muestre la razon: regla de fuente, carta calculada, chequeo de conflicto y recomendacion legible.',
      technical: 'Detalle tecnico'
    },
    fr: {
      grammar: '%name% possede une grammaire de calcul definie; ce n est pas un prompt divinatoire libre. On construit d abord la carte, puis on interprete la structure visible.',
      layer: 'Hourkey traite cette couche comme un langage technique historique: calendrier, ciel, direction, nombre et palais sont separes avant la comparaison Fusion.',
      deep: 'La lecture profonde suit un ordre: base de la carte, force ou condition, relations, activation temporelle, puis conseil praticable. Un seul mot favorable ne suffit pas.',
      start: 'Un debutant commence par la couche la plus stable, puis ajoute temps, direction et situation. La premiere question est de savoir ce que cette carte mesure.',
      source: 'L ordre interne permet a AI Sifu de montrer la raison: regle source, carte calculee, controle des conflits et conseil lisible.',
      technical: 'Detail technique'
    }
  };

  function dc(code, key, vars) {
    var pack = DETAIL_COPY[code] || DETAIL_COPY.en;
    var text = pack[key] || DETAIL_COPY.en[key] || '';
    vars = vars || {};
    Object.keys(vars).forEach(function (k) {
      text = text.replace(new RegExp('%' + k + '%', 'g'), vars[k]);
    });
    return text;
  }

  function techLine(code, text) {
    return (code === 'en' ? '' : (dc(code, 'technical') + ': ')) + text;
  }

  function scienceCopy(s, code) {
    var t = UI[code] || UI.th;
    var name = s.title + (s.subtitle ? ' / ' + s.subtitle : '');
    var lead = localized(s.lead, code);
    var origin = localized(s.origin, code);
    var sections = t.sections;
    return [
      '<section><h2>' + esc(sections[0]) + '</h2>' + paragraphBlock([lead, dc(code, 'grammar', {name: name})]) + '</section>',
      '<section><h2>' + esc(sections[1]) + '</h2>' + paragraphBlock([origin, dc(code, 'layer')]) + '</section>',
      '<section><h2>' + esc(sections[2]) + '</h2>' + buildComponents(s) + '</section>',
      '<section><h2>' + esc(sections[3]) + '</h2>' + paragraphBlock([techLine(code, s.method), dc(code, 'deep')]) + '</section>',
      '<section><h2>' + esc(sections[4]) + '</h2><div class="facts"><div class="fact"><b>' + esc(t.good) + '</b><p>' + esc(techLine(code, s.good)) + '</p></div><div class="fact"><b>' + esc(t.limit) + '</b><p>' + esc(techLine(code, s.limit)) + '</p></div></div></section>',
      '<section><h2>' + esc(sections[5]) + '</h2>' + paragraphBlock([dc(code, 'start')]) + '</section>',
      '<section><h2>' + esc(sections[6]) + '</h2>' + paragraphBlock([techLine(code, s.compare)]) + '</section>',
      '<section><h2>' + esc(sections[7]) + '</h2>' + paragraphBlock(['Reference layer: ' + s.sources + '.', dc(code, 'source')]) + '</section>',
      '<section class="final-box"><h2>' + esc(sections[8]) + '</h2>' + paragraphBlock([techLine(code, s.use)]) + '<div class="actions"><a class="btn primary" href="/chart">' + esc(t.chart) + '</a><a class="btn" href="/master-fusion">' + esc(t.fusion) + '</a></div></section>'
    ].join('');
  }

  function renderScience(slug, code) {
    var s = SCIENCES[slug];
    if (!s) return;
    var t = UI[code] || UI.th;
    var title = s.title + ' | hourkey';
    var desc = localized(s.lead, code);
    document.title = title;
    setMeta('description', desc);
    setProp('og:title', s.title);
    setProp('og:description', desc);
    setProp('twitter:description', desc);

    var brandText = document.querySelector('.brand span:last-child');
    if (brandText) brandText.textContent = t.hub;
    var stage = document.querySelector('.stage');
    if (stage) stage.textContent = t.detailStage;

    var hero = document.querySelector('.detail-head');
    if (hero) {
      hero.innerHTML = [
        '<div class="detail-copy">',
        '<p class="kicker">' + esc(s.kicker) + '</p>',
        '<h1>' + esc(s.title) + '<br/><span class="han">' + esc(s.subtitle) + '</span></h1>',
        '<p class="lead">' + esc(desc) + '</p>',
        '<div class="pill-row">' + s.pills.map(function (p) { return '<span class="pill">' + esc(p) + '</span>'; }).join('') + '</div>',
        '</div>',
        '<figure class="poster media-card">',
        '<video autoplay muted loop playsinline preload="metadata" poster="/assets/hourkey-guide/science-' + esc(s.asset) + '-hero-v3.webp"><source src="/assets/hourkey-guide/science-' + esc(s.asset) + '-loop-v3.mp4" type="video/mp4"/></video>',
        '<figcaption>' + esc(s.title + ' visual layer: ' + s.components.slice(0, 3).join(' · ')) + '</figcaption>',
        '</figure>'
      ].join('');
    }

    var article = document.querySelector('main article');
    if (article) article.innerHTML = scienceCopy(s, code);
    var side = document.querySelector('.sidebar');
    if (side) {
      side.innerHTML = '<a class="link-card" href="/article-hourkey-guide.html"><b>' + esc(t.backHub) + '</b><span>' + esc(t.backHubSub) + '</span></a>' +
        s.next.map(function (n) {
          var ns = SCIENCES[n];
          return ns ? '<a class="link-card" href="' + esc(ns.href) + '"><b>' + esc(t.readNext + ': ' + ns.title) + '</b><span>' + esc(localized(ns.lead, code)) + '</span></a>' : '';
        }).join('');
    }
  }

  function renderHub(code) {
    var t = UI[code] || UI.th;
    document.title = code === 'th' ? 'คู่มือศาสตร์ Hourkey: เลือกศาสตร์ให้ตรงคำถาม' : 'Hourkey Science Guide: choose the right lens';
    var desc = code === 'th'
      ? 'คู่มือให้ความรู้ว่าแต่ละศาสตร์ใน Hourkey คืออะไร ใช้ตอบคำถามแบบไหน และควรอ่านร่วมกันอย่างไร'
      : 'Educational guide to every Hourkey science: what each system reads, where it comes from, and how AI Sifu fuses the layers.';
    setMeta('description', desc);
    setProp('og:description', desc);

    var brandText = document.querySelector('.brand span:last-child');
    if (brandText) brandText.textContent = t.home;
    var stage = document.querySelector('.stage');
    if (stage) stage.textContent = t.hubStage;

    var heroInner = document.querySelector('.hero-inner');
    if (heroInner) {
      heroInner.innerHTML = '<p class="kicker">命 · 星 · 紫 · 占 · 吠 · 軸 · 奇 · 羅 · 擇 · 河</p>' +
        '<h1>' + esc(code === 'th' ? 'เลือกศาสตร์ให้ตรงคำถาม' : 'Choose the right science for the question') + '</h1>' +
        '<p class="lead">' + esc(code === 'th' ? 'Hourkey แยกเลนส์ให้ชัด: พื้นดวง ดวงดาว สถานการณ์ พื้นที่ ฤกษ์ และรากฐานระบบจีน เพื่อให้ผู้ใช้ใหม่รู้ว่าควรเริ่มตรงไหน และผู้ใช้ขั้นสูงอ่านหลายชั้นร่วมกันได้' : 'Hourkey separates the lenses: natal structure, real sky, palace maps, situational strategy, space, date selection and Chinese cosmology. New users get a path; advanced users get a fusion map.') + '</p>' +
        '<div class="actions"><a class="btn primary" href="#sciences">' + esc(t.all) + '</a><a class="btn" href="#start">' + esc(t.start) + '</a><a class="btn" href="#advanced">' + esc(t.advanced) + '</a></div>';
    }

    var article = document.querySelector('main article');
    if (!article) return;
    var cards = Object.keys(SCIENCES).map(function (slug) {
      var s = SCIENCES[slug];
      return '<a class="science-card" href="' + esc(s.href) + '?lang=' + esc(code) + '"><img src="/assets/hourkey-guide/science-' + esc(s.asset) + '-hero-v3.webp" alt="' + esc(s.title) + '" loading="lazy"/><div class="body"><small>' + esc(s.subtitle) + '</small><h3><em>' + esc(s.symbol) + '</em>' + esc(s.title) + '</h3><p>' + esc(localized(s.lead, code)) + '</p><span class="go">' + esc(t.open) + '</span></div></a>';
    }).join('');
    article.innerHTML = [
      '<section id="overview"><p class="kicker">system map</p><h2>' + esc(code === 'th' ? 'ก่อนอ่าน ต้องแยก “ศาสตร์” กับ “หน้าใช้งาน”' : 'Separate the science from the product surface') + '</h2>',
      paragraphBlock([code === 'th' ? 'ศาสตร์คือระบบคำนวณและภาษาเหตุผล เช่น BaZi, Qi Men หรือ Luopan ส่วน Today, Calendar, Natal Book และ AI Sifu คือหน้าที่นำผลไปใช้ การแยกสองชั้นนี้ทำให้คนอ่านไม่งงและทำให้ SEO ตอบ intent ได้ชัด' : 'A science is a calculation language such as BaZi, Qi Men or Luopan. Today, Calendar, Natal Book and AI Sifu are product surfaces that reuse those results. Keeping them separate makes the article useful and the search intent clear.']),
      '</section><section id="sciences"><p class="kicker">science index</p><h2>' + esc(code === 'th' ? 'หน้าแยกครบทุกศาสตร์' : 'Dedicated page for every science') + '</h2><p class="section-sub">' + esc(code === 'th' ? 'แต่ละหน้าอธิบายที่มา วิธีอ่านลงลึก ข้อจำกัด และการใช้ใน Hourkey' : 'Each page explains origin, deep reading method, limits and how Hourkey uses the science.') + '</p><div class="science-grid">' + cards + '</div></section>',
      '<figure><img src="/assets/hourkey-guide/hourkey-sciences-hero-v3.webp" alt="Hourkey science map" loading="lazy"/><figcaption>' + esc(code === 'th' ? 'ฟ้าเดียวกัน หลายเลนส์: คน เวลา สถานการณ์ พื้นที่ และฤกษ์ต้องอ่านเป็นชั้น ไม่ใช่ปนกันจนกลายเป็นคำทำนายลอย ๆ' : 'One sky, many lenses: person, time, situation, space and starting moment are layered instead of mixed into a floating prediction.') + '</figcaption></figure>',
      '<section id="start"><p class="kicker">beginner path</p><h2>' + esc(t.start) + '</h2>' + paragraphBlock([code === 'th' ? 'เริ่มจากโปรไฟล์ดวงที่นิ่งที่สุด แล้วค่อยเพิ่มวันนี้ ปฏิทิน สถานการณ์ พื้นที่ และฤกษ์ เมื่อเข้าใจลำดับนี้ AI Sifu จะตอบจากข้อมูลจริง ไม่ใช่ prompt ลอย ๆ' : 'Start with the stable birth profile, then add today, calendar, situation, space and date selection. This order lets AI Sifu answer from real data rather than a floating prompt.']) + '</section>',
      '<section id="advanced"><p class="kicker">fusion principle</p><h2>' + esc(t.advanced) + '</h2>' + paragraphBlock([code === 'th' ? 'Fusion ที่ดีไม่ใช่การเอาคำทำนายหลายศาสตร์มาต่อกัน แต่ต้องบอกว่าอะไรคือฐาน อะไรคือจังหวะชั่วคราว อะไรคือทิศ/พื้นที่ และข้อขัดแย้งใดควรให้มนุษย์ตัดสินใจ' : 'Good fusion is not a pile of predictions. It explains what is the natal base, what is temporary timing, what belongs to direction or space, and which conflict needs human judgment.']) + '</section>',
      '<section id="tools"><p class="kicker">product surface</p><h2>' + esc(code === 'th' ? 'เครื่องมือในเว็บเอาศาสตร์ไปใช้ตรงไหน' : 'Where the website uses each layer') + '</h2><div class="reading-order"><a href="/chart"><em>命</em><div><b>Chart / Profile</b><span>BaZi profile and owner data</span></div><span class="go">' + esc(t.chart) + '</span></a><a href="/master-fusion"><em>合</em><div><b>Master Fusion</b><span>Multi-science comparison</span></div><span class="go">' + esc(t.fusion) + '</span></a><a href="/master"><em>師</em><div><b>AI Sifu</b><span>Question layer over real computed data</span></div><span class="go">AI Sifu →</span></a></div></section>',
      '<footer>Preview article set · education-first science guide · noindex until approved.</footer>'
    ].join('');
  }

  function getSlug() {
    var m = location.pathname.match(/\/articles\/sciences\/([^\/]+)\.html$/);
    return m ? m[1] : '';
  }

  function ensureThaiSnapshot() {
    if (window.__hkArticleThaiSnapshot) return;
    window.__hkArticleThaiSnapshot = {
      title: document.title,
      htmlLang: document.documentElement.lang || 'th',
      body: document.body.innerHTML
    };
  }

  function restoreThaiSnapshot() {
    var snap = window.__hkArticleThaiSnapshot;
    if (!snap) return;
    document.title = snap.title;
    document.body.innerHTML = snap.body;
    injectLangSelect('th');
    bindMotion();
  }

  function bindMotion() {
    var video = document.getElementById('heroVideo');
    var btn = document.getElementById('motionBtn');
    if (!video || !btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () {
      if (video.paused) {
        video.play();
        btn.textContent = 'pause motion';
      } else {
        video.pause();
        btn.textContent = 'play motion';
      }
    });
  }

  function apply(code) {
    if (!UI[code]) code = 'th';
    ensureThaiSnapshot();
    if (code === 'th') {
      restoreThaiSnapshot();
      syncLang(code);
      injectLangSelect(code);
      return;
    }
    syncLang(code);
    injectLangSelect(code);
    var slug = getSlug();
    if (slug) renderScience(slug, code);
    else if (/article-hourkey-guide\.html$/.test(location.pathname)) renderHub(code);
  }

  document.addEventListener('DOMContentLoaded', function () {
    apply(getLang());
  });
})();
