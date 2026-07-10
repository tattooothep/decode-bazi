(function(){
  if (window.__HK_PRICING_I18N9__) return;
  window.__HK_PRICING_I18N9__ = true;

  var LANG_BUTTONS = [
    { v:'th', label:'TH', title:'ไทย' },
    { v:'en', label:'EN', title:'English' },
    { v:'zh', label:'繁', title:'繁體中文' },
    { v:'cn', label:'简', title:'简体中文' },
    { v:'vi', label:'VI', title:'Tiếng Việt' },
    { v:'ja', label:'JA', title:'日本語' },
    { v:'ru', label:'RU', title:'Русский' },
    { v:'ko', label:'KO', title:'한국어' },
    { v:'es', label:'ES', title:'Español' }
  ];
  var LANG_SET = LANG_BUTTONS.reduce(function(m, x){ m[x.v] = true; return m; }, {});

  var STATIC = {
    en: {
      title:'Pricing and plans · 6 traditions in one chart · hourkey',
      desc:'hourkey combines 6 astrological traditions in one chart. Start free to create your first chart, upgrade to Premium for real use, or choose Master for many charts and deep work.',
      heroTitle:'Six Traditions, <span class="gd">One Chart</span>',
      heroSub:'Others read one system at a time — <b>hourkey lays BaZi, Seven Planets, Zi Wei, Western, Vedic and Uranian side by side on a single screen</b>, then lets the AI Sifu commit to a verdict from what the traditions agree on. Start free.',
      arts:['BaZi','Seven Pl.','Zi Wei','Western','Vedic','Uranian'],
      compareKicker:'Pick the right plan',
      compareH2:'Free to try · Premium for real use · Master for deep work',
      compareP:'This page is designed to make Premium the main choice for most users. Master is for people who already know they need many charts or deeper reports.',
      topupKicker:'Top up credits',
      topupH2:'Add <span class="han">時</span> credits anytime',
      topupP:'Credits power every AI Sifu reading. Each plan includes a monthly grant — top up more whenever you like.',
      faqKicker:'FAQ',
      faqH2:'Before you subscribe',
      faqs:[
        ['What is a "credit" (時)?','A credit (時) powers the AI Sifu and deep analysis. Each question or reading spends credits by length. Opening your chart, the calendar and the daily score costs nothing.'],
        ['Why is annual cheaper?','Annual is priced at 10 months — a full year with 2 months free. Premium annual ฿3,990 (vs ฿4,788) · Master annual ฿9,900 (vs ฿11,880).'],
        ['How far does Free go?','Free is for real activation: sign up, enter birth data, create the first chart, open the chart and try AI Sifu with the first 500 credits. Upgrade to Premium when you need repeat use and the full 6-tradition toolset.'],
        ['How do I pay — is it safe?','Cards and PromptPay are handled on Stripe secure checkout — we never store card numbers on our servers. Credits and membership are applied automatically once payment clears.'],
        ['Can I cancel?','Anytime. Your membership stays active until the paid period ends, with no silent auto-renewal. Separately purchased credits never expire.']
      ],
      footerLinks:['6-tradition reading','AI Sifu','Date selection','My account'],
      footerNote:'All prices in Thai Baht (THB), inclusive. Access and credits are verified and granted server-side after successful payment only. Monthly credit refills for members are rolling out in full.',
      footerMono:'hourkey.io · 六術一堂 · TH / EN / 繁 / 简 / VI / JA / RU / KO / ES'
    },
    zh: {
      title:'價格與方案 · 六術同盤 · hourkey',
      desc:'hourkey 把六術放在同一張命盤。Free 建立第一張命盤，Premium 正式使用，Master 用於多命盤與深度工作。',
      heroTitle:'六術 · <span class="gd">同盤合參</span>',
      heroSub:'別處只用單一體系——<b>hourkey 把八字、七政、紫微、西洋、吠陀與天王星同盤並列</b>，再由 AI 師傅依跨體系共識果斷斷事。可免費開始。',
      arts:['八字','七政','紫微','西洋','吠陀','天王'],
      compareKicker:'按用途選方案',
      compareH2:'Free 試用 · Premium 正式使用 · Master 深度工作',
      compareP:'本頁以 Premium 作為多數人的主選。Master 留給已確定需要多命盤或深度報告的人。',
      topupKicker:'加值時',
      topupH2:'隨時加值<span class="han">時</span>',
      topupP:'「時」是呼叫 AI 師傅的單位 · 每個方案都含每月額度，隨時可再加值。',
      faqKicker:'常見問題',
      faqH2:'訂閱前想問',
      faqs:[
        ['「時」是什麼？','「時」用於呼叫 AI 師傅與深度分析，依長度計費。查看命盤、曆法與每日分數則免費。'],
        ['年費為何較划算？','年費以 10 個月計價——用滿一年、免 2 個月。賢者年費 ฿3,990（原 ฿4,788）· 大師年費 ฿9,900（原 ฿11,880）。'],
        ['免費能用到哪？','Free 用來完成真正啟動：註冊、輸入出生資料、建立第一張命盤、打開命盤，並用首 500 時試問 AI 師傅。需要重複使用與完整六術時再升級 Premium。'],
        ['如何付款、安全嗎？','信用卡與 PromptPay 由 Stripe 安全結帳處理，我們不在伺服器保存卡號。付款完成後自動加值與升級。'],
        ['可以取消嗎？','隨時可取消。會員權益維持至已付週期結束，不會無聲自動續扣。另行加值的時額度永不過期。']
      ],
      footerLinks:['六術合參','AI 師傅','擇日','我的帳戶'],
      footerNote:'所有價格以泰銖（THB）計、含稅。權限與時額度僅於付款成功後由伺服器端核發。會員每月時額度補充正逐步全面啟用。',
      footerMono:'hourkey.io · 六術一堂 · TH / EN / 繁 / 简 / VI / JA / RU / KO / ES'
    },
    cn: {
      title:'价格与套餐 · 六术同盘 · hourkey',
      desc:'hourkey 把六术放在同一张命盘。Free 建立第一张命盘，Premium 正式使用，Master 用于多命盘与深度工作。',
      heroTitle:'六术 · <span class="gd">同盘合参</span>',
      heroSub:'其他地方只用一种体系——<b>hourkey 把八字、七政、紫微、西洋、吠陀与天王星同盘并列</b>，再由 AI 师傅按跨体系共识果断判断。可免费开始。',
      arts:['八字','七政','紫微','西洋','吠陀','天王'],
      compareKicker:'按用途选套餐',
      compareH2:'Free 试用 · Premium 正式使用 · Master 深度工作',
      compareP:'本页以 Premium 作为多数人的主选。Master 留给已经确定需要多命盘或深度报告的人。',
      topupKicker:'加值时',
      topupH2:'随时加值<span class="han">時</span>',
      topupP:'“时”是调用 AI 师傅的单位 · 每个套餐都含每月额度，也可随时加值。',
      faqKicker:'常见问题',
      faqH2:'订阅前想问',
      faqs:[
        ['“时”是什么？','“时”用于调用 AI 师傅和深度分析，按内容长度计费。查看命盘、历法和每日分数免费。'],
        ['年付为什么更划算？','年付按 10 个月计价——用满一年，送 2 个月。Premium 年付 ฿3,990（原 ฿4,788）· Master 年付 ฿9,900（原 ฿11,880）。'],
        ['Free 能用到哪里？','Free 用来完成真正启动：注册、输入出生资料、建立第一张命盘、打开命盘，并用首 500 时试问 AI 师傅。需要重复使用和完整六术时再升级 Premium。'],
        ['怎么付款，安全吗？','信用卡、借记卡和 PromptPay 由 Stripe 安全结账处理，我们不会在服务器保存卡号。付款成功后自动加值和升级。'],
        ['可以取消吗？','可以随时取消。会员权益会保留到已付款周期结束，不会无声自动续扣。单独加值的时额度永不过期。']
      ],
      footerLinks:['六术合参','AI 师傅','择日','我的账户'],
      footerNote:'所有价格以泰铢（THB）计，已包含费用。权限与时额度只会在付款成功后由服务器核发。会员每月时额度补充正在逐步全面启用。',
      footerMono:'hourkey.io · 六術一堂 · TH / EN / 繁 / 简 / VI / JA / RU / KO / ES'
    },
    vi: {
      title:'Giá và gói · 6 truyền thống trong một lá số · hourkey',
      desc:'hourkey đặt BaZi, Thất Chính, Tử Vi, Tây phương, Vệ Đà và Uranian trên cùng một màn hình, kèm AI Sifu để kết luận, chọn ngày và phong thủy. Bắt đầu miễn phí.',
      heroTitle:'Sáu Truyền Thống, <span class="gd">Một Lá Số</span>',
      heroSub:'Nơi khác xem từng hệ một — <b>hourkey đặt BaZi, Thất Chính, Tử Vi, Tây phương, Vệ Đà và Uranian cạnh nhau trên cùng màn hình</b>, rồi để AI Sifu đưa kết luận từ điểm các hệ cùng xác nhận. Bắt đầu miễn phí.',
      arts:['BaZi','Thất Chính','Tử Vi','Tây phương','Vệ Đà','Uranian'],
      compareKicker:'Chọn đúng gói',
      compareH2:'Free để thử · Premium để dùng thật · Master cho việc sâu',
      compareP:'Trang này hướng đa số người dùng đến Premium trước. Master dành cho người đã biết mình cần nhiều lá số hoặc báo cáo sâu.',
      topupKicker:'Nạp lượt',
      topupH2:'Nạp thêm <span class="han">時</span> bất cứ lúc nào',
      topupP:'Lượt dùng cho mọi lần hỏi AI Sifu. Mỗi gói có hạn mức hằng tháng và có thể nạp thêm khi cần.',
      faqKicker:'FAQ',
      faqH2:'Trước khi đăng ký',
      faqs:[
        ['Lượt (時) là gì?','Lượt (時) dùng cho AI Sifu và phân tích chuyên sâu. Mỗi câu hỏi hoặc bài luận dùng lượt theo độ dài. Mở lá số, lịch và điểm ngày không tốn lượt.'],
        ['Vì sao gói năm rẻ hơn?','Gói năm tính bằng 10 tháng — dùng trọn năm và được miễn 2 tháng. Premium năm ฿3,990 (so với ฿4,788) · Master năm ฿9,900 (so với ฿11,880).'],
        ['Free dùng được đến đâu?','Free dành cho bước khởi động thật: đăng ký, nhập ngày sinh, tạo lá số đầu tiên, mở lá số và thử AI Sifu bằng 500 lượt đầu. Nâng lên Premium khi cần dùng lặp lại và bộ 6 truyền thống đầy đủ.'],
        ['Thanh toán thế nào, có an toàn không?','Thẻ và PromptPay được xử lý qua trang thanh toán bảo mật của Stripe. Chúng tôi không lưu số thẻ trên máy chủ. Lượt và quyền thành viên tự động cập nhật sau khi thanh toán thành công.'],
        ['Có hủy được không?','Có thể hủy bất cứ lúc nào. Quyền thành viên còn hiệu lực đến hết chu kỳ đã thanh toán, không tự gia hạn âm thầm. Lượt nạp riêng không hết hạn.']
      ],
      footerLinks:['Luận 6 truyền thống','AI Sifu','Chọn ngày','Tài khoản'],
      footerNote:'Tất cả giá tính bằng Baht Thái (THB), đã bao gồm phí. Quyền truy cập và lượt chỉ được xác nhận từ máy chủ sau khi thanh toán thành công. Lượt hằng tháng cho thành viên đang được triển khai đầy đủ.',
      footerMono:'hourkey.io · 六術一堂 · TH / EN / 繁 / 简 / VI / JA / RU / KO / ES'
    },
    ja: {
      title:'料金とプラン · 6つの占術を一つの命盤に · hourkey',
      desc:'hourkey は BaZi、七政、紫微、西洋、ヴェーダ、Uranian を一画面で比較し、AI Sifu が判断、日取り選び、風水を支援します。無料で始められます。',
      heroTitle:'六つの占術を <span class="gd">一つの命盤に</span>',
      heroSub:'多くの鑑定は一つの体系だけで読みます — <b>hourkey は BaZi、七政、紫微、西洋、ヴェーダ、Uranian を同じ画面に並べます</b>。その上で AI Sifu が複数体系の一致点から判断します。無料で開始できます。',
      arts:['BaZi','七政','紫微','西洋','ヴェーダ','Uranian'],
      compareKicker:'用途に合うプラン',
      compareH2:'Free は試用 · Premium は実用 · Master は深い作業',
      compareP:'このページでは、多くのユーザーに Premium を主な選択肢として示します。Master は多数の命盤や深いレポートが必要な人向けです。',
      topupKicker:'クレジット追加',
      topupH2:'必要な時に <span class="han">時</span> を追加',
      topupP:'クレジットは AI Sifu の鑑定に使います。各プランには月次付与があり、必要に応じて追加できます。',
      faqKicker:'FAQ',
      faqH2:'登録前の質問',
      faqs:[
        ['クレジット（時）とは？','クレジット（時）は AI Sifu と深い分析に使う単位です。質問や鑑定の長さに応じて消費します。命盤、暦、毎日のスコア閲覧は無料です。'],
        ['年払いが安い理由は？','年払いは 10か月分の価格で、1年使えて2か月分が無料です。Premium 年払い ฿3,990（通常 ฿4,788）· Master 年払い ฿9,900（通常 ฿11,880）。'],
        ['Free ではどこまで使えますか？','Free は実際の開始用です。登録、生年月日の入力、最初の命盤作成、命盤表示、最初の 500 クレジットで AI Sifu を試せます。継続利用と6占術フル機能が必要なら Premium へ進みます。'],
        ['支払いは安全ですか？','カードと PromptPay は Stripe の安全な決済画面で処理されます。カード番号は当社サーバーに保存しません。支払い完了後、クレジットと会員権限が自動付与されます。'],
        ['キャンセルできますか？','いつでも可能です。会員権限は支払い済み期間の終了まで有効です。通知なしの自動更新はありません。別途購入したクレジットは失効しません。']
      ],
      footerLinks:['6占術鑑定','AI Sifu','日取り選び','アカウント'],
      footerNote:'すべての価格はタイバーツ（THB）で表示され、税込です。権限とクレジットは支払い成功後にサーバー側で確認、付与されます。会員の月次クレジット補充は段階的に全面展開中です。',
      footerMono:'hourkey.io · 六術一堂 · TH / EN / 繁 / 简 / VI / JA / RU / KO / ES'
    },
    ru: {
      title:'Цены и планы · 6 традиций в одной карте · hourkey',
      desc:'hourkey сравнивает BaZi, Seven Planets, Zi Wei, западную, ведическую и уранианскую астрологию на одном экране, а AI Sifu помогает с выводом, выбором даты и фэн-шуй.',
      heroTitle:'Шесть Школ, <span class="gd">Одна Карта</span>',
      heroSub:'Обычно читают одну систему за раз — <b>hourkey ставит BaZi, Seven Planets, Zi Wei, западную, ведическую и уранианскую астрологию рядом на одном экране</b>, а AI Sifu делает вывод по совпадениям между традициями. Можно начать бесплатно.',
      arts:['BaZi','Seven Pl.','Zi Wei','Western','Vedic','Uranian'],
      compareKicker:'Выберите подходящий план',
      compareH2:'Free для пробы · Premium для реальной работы · Master для глубины',
      compareP:'Эта страница ведет большинство пользователей к Premium. Master нужен тем, кто уже понимает, что работает со многими картами или глубокими отчетами.',
      topupKicker:'Пополнить единицы',
      topupH2:'Добавляйте <span class="han">時</span> в любой момент',
      topupP:'Единицы используются для чтений AI Sifu. Каждый план включает ежемесячный лимит, а пополнить можно в любое время.',
      faqKicker:'FAQ',
      faqH2:'Перед подпиской',
      faqs:[
        ['Что такое единица (時)?','Единица (時) используется для AI Sifu и глубокого анализа. Каждый вопрос или чтение расходует единицы по длине. Карта, календарь и дневной балл бесплатны.'],
        ['Почему годовой план дешевле?','Годовой план стоит как 10 месяцев — полный год с 2 бесплатными месяцами. Premium год ฿3,990 (вместо ฿4,788) · Master год ฿9,900 (вместо ฿11,880).'],
        ['Что доступно в Free?','Free нужен для настоящего старта: регистрация, ввод данных рождения, первая карта, открытие карты и проба AI Sifu на первых 500 единицах. Для повторного использования и полного набора 6 традиций переходите на Premium.'],
        ['Как платить и безопасно ли это?','Карты и PromptPay обрабатываются через защищенную оплату Stripe. Мы не храним номера карт на сервере. Единицы и доступ применяются автоматически после успешной оплаты.'],
        ['Можно отменить?','Да, в любое время. Доступ действует до конца оплаченного периода, без скрытого автосписания. Отдельно купленные единицы не сгорают.']
      ],
      footerLinks:['Чтение 6 традиций','AI Sifu','Выбор даты','Аккаунт'],
      footerNote:'Все цены указаны в тайских батах (THB), включая сборы. Доступ и единицы подтверждаются и выдаются сервером только после успешной оплаты. Ежемесячное пополнение единиц для участников запускается поэтапно.',
      footerMono:'hourkey.io · 六術一堂 · TH / EN / 繁 / 简 / VI / JA / RU / KO / ES'
    },
    ko: {
      title:'가격과 플랜 · 여섯 체계를 하나의 차트에 · hourkey',
      desc:'hourkey는 BaZi, 칠정, 자미두수, 서양, 베다, Uranian을 한 화면에 놓고 AI Sifu가 판단, 택일, 풍수를 돕습니다. 무료로 시작할 수 있습니다.',
      heroTitle:'여섯 체계, <span class="gd">하나의 차트</span>',
      heroSub:'다른 곳은 한 체계씩 봅니다 — <b>hourkey는 BaZi, 칠정, 자미두수, 서양, 베다, Uranian을 한 화면에 나란히 놓습니다</b>. 그리고 AI Sifu가 여러 체계의 공통 근거로 결론을 냅니다. 무료로 시작하세요.',
      arts:['BaZi','칠정','자미','서양','베다','Uranian'],
      compareKicker:'맞는 플랜 선택',
      compareH2:'Free는 체험 · Premium은 실사용 · Master는 심화 작업',
      compareP:'이 페이지는 대부분의 사용자가 Premium을 먼저 선택하도록 설계했습니다. Master는 여러 차트나 깊은 리포트가 필요한 사람용입니다.',
      topupKicker:'크레딧 충전',
      topupH2:'언제든 <span class="han">時</span> 추가',
      topupP:'크레딧은 AI Sifu 해석에 사용됩니다. 각 플랜에는 월 제공량이 있고 필요할 때 추가 충전할 수 있습니다.',
      faqKicker:'FAQ',
      faqH2:'구독 전 질문',
      faqs:[
        ['크레딧(時)이란?','크레딧(時)은 AI Sifu와 심층 분석에 쓰는 단위입니다. 질문이나 해석 길이에 따라 차감됩니다. 차트, 달력, 일일 점수는 무료입니다.'],
        ['연간 플랜이 왜 더 저렴한가요?','연간은 10개월 가격으로 1년을 쓰고 2개월이 무료입니다. Premium 연간 ฿3,990 (기존 ฿4,788) · Master 연간 ฿9,900 (기존 ฿11,880).'],
        ['Free는 어디까지 되나요?','Free는 실제 시작용입니다. 가입, 생년월일 입력, 첫 차트 생성, 차트 열기, 첫 500 크레딧으로 AI Sifu 체험까지 할 수 있습니다. 반복 사용과 6체계 전체 도구가 필요하면 Premium으로 이동합니다.'],
        ['결제는 어떻게 하나요, 안전한가요?','카드와 PromptPay는 Stripe 보안 결제 화면에서 처리됩니다. 카드 번호는 서버에 저장하지 않습니다. 결제 성공 후 크레딧과 멤버십이 자동 적용됩니다.'],
        ['취소할 수 있나요?','언제든 가능합니다. 멤버십은 결제한 기간 끝까지 유지되며 조용한 자동 갱신은 없습니다. 별도로 충전한 크레딧은 만료되지 않습니다.']
      ],
      footerLinks:['6체계 해석','AI Sifu','택일','내 계정'],
      footerNote:'모든 가격은 태국 바트(THB) 기준이며 포함 가격입니다. 접근 권한과 크레딧은 결제 성공 후 서버에서만 확인 및 지급됩니다. 멤버 월 크레딧 보충은 단계적으로 전체 적용 중입니다.',
      footerMono:'hourkey.io · 六術一堂 · TH / EN / 繁 / 简 / VI / JA / RU / KO / ES'
    },
    es: {
      title:'Precios y planes · 6 tradiciones en una carta · hourkey',
      desc:'hourkey combina BaZi, Siete Planetas, Zi Wei, occidental, védica y Uranian en una sola pantalla, con AI Sifu para dictamen, selección de fechas y feng shui. Empieza gratis.',
      heroTitle:'Seis Tradiciones, <span class="gd">Una Carta</span>',
      heroSub:'Otros leen un sistema a la vez — <b>hourkey coloca BaZi, Siete Planetas, Zi Wei, occidental, védica y Uranian lado a lado en una sola pantalla</b>, y AI Sifu da un dictamen desde lo que las tradiciones confirman en común. Empieza gratis.',
      arts:['BaZi','Siete Pl.','Zi Wei','Occidental','Védica','Uranian'],
      compareKicker:'Elige el plan correcto',
      compareH2:'Free para probar · Premium para uso real · Master para trabajo profundo',
      compareP:'Esta página lleva a la mayoría de usuarios hacia Premium. Master es para quien ya sabe que necesita muchas cartas o reportes profundos.',
      topupKicker:'Recargar créditos',
      topupH2:'Añade <span class="han">時</span> cuando quieras',
      topupP:'Los créditos alimentan cada lectura de AI Sifu. Cada plan incluye una asignación mensual y puedes recargar más cuando lo necesites.',
      faqKicker:'FAQ',
      faqH2:'Antes de suscribirte',
      faqs:[
        ['¿Qué es un crédito (時)?','Un crédito (時) alimenta AI Sifu y el análisis profundo. Cada pregunta o lectura consume créditos según su longitud. Abrir tu carta, el calendario y la puntuación diaria no cuesta nada.'],
        ['¿Por qué anual es más barato?','El anual cuesta como 10 meses: un año completo con 2 meses gratis. Premium anual ฿3,990 (vs ฿4,788) · Master anual ฿9,900 (vs ฿11,880).'],
        ['¿Hasta dónde llega Free?','Free es para activación real: registrarte, ingresar datos de nacimiento, crear la primera carta, abrir la carta y probar AI Sifu con los primeros 500 créditos. Sube a Premium cuando necesites uso repetido y las 6 tradiciones completas.'],
        ['¿Cómo pago, es seguro?','Tarjetas y PromptPay se procesan en el pago seguro de Stripe. No guardamos números de tarjeta en nuestros servidores. Créditos y membresía se aplican automáticamente tras el pago exitoso.'],
        ['¿Puedo cancelar?','En cualquier momento. Tu membresía sigue activa hasta el final del periodo pagado, sin renovación silenciosa. Los créditos comprados aparte no caducan.']
      ],
      footerLinks:['Lectura 6 tradiciones','AI Sifu','Selección de fecha','Mi cuenta'],
      footerNote:'Todos los precios están en baht tailandés (THB), incluidos. El acceso y los créditos se verifican y otorgan desde el servidor solo tras un pago exitoso. Las recargas mensuales de créditos para miembros se están desplegando por completo.',
      footerMono:'hourkey.io · 六術一堂 · TH / EN / 繁 / 简 / VI / JA / RU / KO / ES'
    }
  };

  /* Commercial copy is kept separate from legacy editorial translations so
     pricing, trial length, passes and FAQ cannot drift by locale. */
  var COMMERCIAL = {
    en:{compareP:'Start free, choose Premium for complete personal tools, or Master for multiple charts, groups, and technical evidence.',topupP:'Credits from signup, a pass, or a top-up never expire.',faqs:[['What is a credit (時)?','Credits power AI Sifu and deep analysis and are charged by answer length. Charts, calendar and daily scores are free.'],['Does the 30-day pass auto-renew?','No. It lasts 30 days after successful payment and never renews or charges automatically.'],['How far does Free go?','Signup includes 1,000 credits and a 14-day trial. Afterwards Chart, Calendar, Today, Forecast and Palmistry remain available; deeper features stay visibly locked.'],['Do pass credits refill monthly?','No. Premium adds 500 and Master adds 2,000 once per purchase. Credits never expire and can be topped up.'],['How do I pay - is it safe?','Stripe handles cards and PromptPay. Hourkey does not store card numbers; access is granted server-side after payment.'],['Can I cancel?','There is nothing to cancel: passes do not auto-renew and remain active through their paid 30 days.']],footerNote:'Prices are in THB. Passes last 30 days with no auto-renewal. The 14-day trial starts at signup. Credits never expire.'},
    zh:{compareP:'先免費開始；完整個人工具選 Premium，多命盤、群組與技術依據選 Master。',topupP:'註冊、購買通行證或加值所得的時永不過期。',faqs:[['「時」是什麼？','「時」用於 AI 師傅與深度分析，依答案長度扣除；命盤、曆與每日分數免費。'],['30 天通行證會自動續期嗎？','不會。付款成功後有效 30 天，不自動續期或扣款。'],['免費能用到哪？','註冊送 1,000 時與 14 天試用；之後命盤、曆、今日、預測與手相仍可用，進階功能保留鎖定提示。'],['通行證的時每月補發嗎？','不會。Premium 每次購買加 500 時，Master 加 2,000 時；時永不過期並可加值。'],['如何付款、安全嗎？','Stripe 處理信用卡與 PromptPay；Hourkey 不保存卡號，付款成功後由伺服器核發權益。'],['可以取消嗎？','無需取消：通行證不自動續期，已購權益會使用至 30 天期滿。']],footerNote:'價格為泰銖。通行證有效 30 天且不自動續期；14 天試用自註冊起算；時永不過期。'},
    cn:{compareP:'先免费开始；完整个人工具选 Premium，多命盘、群组和技术依据选 Master。',topupP:'注册、购买通行证或加值所得的时永不过期。',faqs:[['“时”是什么？','“时”用于 AI 师傅和深度分析，按答案长度扣除；命盘、日历和每日分数免费。'],['30 天通行证会自动续期吗？','不会。付款成功后有效 30 天，不自动续期或扣款。'],['Free 能用到哪里？','注册送 1,000 时和 14 天试用；之后命盘、日历、今日、预测和手相仍可用，进阶功能保留锁定提示。'],['通行证的时每月补发吗？','不会。Premium 每次购买加 500 时，Master 加 2,000 时；时永不过期并可加值。'],['怎么付款，安全吗？','Stripe 处理银行卡和 PromptPay；Hourkey 不保存卡号，付款成功后由服务器发放权益。'],['可以取消吗？','无需取消：通行证不自动续期，已购权益会使用至 30 天期满。']],footerNote:'价格为泰铢。通行证有效 30 天且不自动续期；14 天试用从注册开始；时永不过期。'},
    vi:{compareP:'Bắt đầu miễn phí, chọn Premium cho công cụ cá nhân đầy đủ, hoặc Master cho nhiều lá số, nhóm và bằng chứng kỹ thuật.',topupP:'Lượt từ đăng ký, pass hoặc nạp thêm không hết hạn.',faqs:[['Lượt (時) là gì?','Lượt dùng cho AI Sifu và phân tích sâu, tính theo độ dài câu trả lời; lá số, lịch và điểm ngày miễn phí.'],['Pass 30 ngày có tự gia hạn không?','Không. Pass có hiệu lực 30 ngày sau thanh toán và không tự gia hạn hay trừ tiền.'],['Free dùng được đến đâu?','Đăng ký nhận 1.000 lượt và dùng thử 14 ngày. Sau đó Lá số, Lịch, Hôm nay, Dự báo và Xem tay vẫn dùng được; tính năng sâu vẫn hiện kèm khóa.'],['Lượt của pass có nạp lại hằng tháng không?','Không. Premium cộng 500 và Master cộng 2.000 mỗi lần mua; lượt không hết hạn và có thể nạp thêm.'],['Thanh toán có an toàn không?','Stripe xử lý thẻ và PromptPay; Hourkey không lưu số thẻ và chỉ cấp quyền từ máy chủ sau thanh toán.'],['Có cần hủy không?','Không cần: pass không tự gia hạn và dùng đến hết 30 ngày đã mua.']],footerNote:'Giá bằng THB. Pass dùng 30 ngày, không tự gia hạn. Dùng thử 14 ngày bắt đầu khi đăng ký. Lượt không hết hạn.'},
    ja:{compareP:'無料で始め、個人機能を十分に使うなら Premium、複数命盤・グループ・技術根拠なら Master を選べます。',topupP:'登録、Pass購入、追加購入で得たクレジットは失効しません。',faqs:[['クレジット（時）とは？','AI Sifu と深い分析に使い、回答の長さで消費します。命盤・暦・毎日のスコアは無料です。'],['30日Passは自動更新されますか？','いいえ。支払い後30日間有効で、自動更新・自動請求はありません。'],['Freeではどこまで使えますか？','登録時に1,000クレジットと14日試用。終了後も命盤・暦・今日・予測・手相は使え、深い機能は鍵付きで表示されます。'],['Passのクレジットは毎月補充されますか？','いいえ。購入ごとにPremiumは500、Masterは2,000を追加。失効せず追加購入できます。'],['支払いは安全ですか？','カードとPromptPayはStripeが処理し、Hourkeyはカード番号を保存しません。支払い後にサーバー側で権限を付与します。'],['解約できますか？','解約は不要です。Passは自動更新せず、購入した30日間の終了まで有効です。']],footerNote:'価格はTHB。Passは30日間で自動更新なし。14日試用は登録時開始。クレジットは失効しません。'},
    ko:{compareP:'무료로 시작하고, 개인 도구 전체는 Premium, 여러 차트·그룹·기술 근거는 Master를 선택하세요.',topupP:'가입, Pass 구매, 추가 충전으로 받은 크레딧은 만료되지 않습니다.',faqs:[['크레딧(時)이란?','AI Sifu와 심층 분석에 쓰며 답변 길이에 따라 차감됩니다. 차트·달력·일일 점수는 무료입니다.'],['30일 Pass는 자동 갱신되나요?','아니요. 결제 후 30일 동안 유효하며 자동 갱신이나 자동 결제가 없습니다.'],['Free는 어디까지 가능한가요?','가입 시 1,000 크레딧과 14일 체험을 받습니다. 이후에도 차트·달력·오늘·예측·손금은 사용 가능하고 심화 기능은 잠금 상태로 보입니다.'],['Pass 크레딧은 매월 충전되나요?','아니요. 구매할 때 Premium은 500, Master는 2,000이 한 번 추가되며 만료 없이 추가 충전할 수 있습니다.'],['결제는 안전한가요?','Stripe가 카드와 PromptPay를 처리하며 Hourkey는 카드 번호를 저장하지 않습니다. 결제 후 서버가 권한을 부여합니다.'],['해지해야 하나요?','필요 없습니다. Pass는 자동 갱신되지 않고 구매한 30일이 끝날 때까지 유효합니다.']],footerNote:'가격은 THB입니다. Pass는 30일이며 자동 갱신이 없습니다. 14일 체험은 가입 때 시작하고 크레딧은 만료되지 않습니다.'},
    ru:{compareP:'Начните бесплатно, выберите Premium для полных личных инструментов или Master для многих карт, групп и технических оснований.',topupP:'Единицы за регистрацию, Pass или пополнение не сгорают.',faqs:[['Что такое единица (時)?','Она нужна для AI Sifu и глубокого анализа и списывается по длине ответа. Карта, календарь и дневной балл бесплатны.'],['Pass на 30 дней продлевается автоматически?','Нет. Он действует 30 дней после оплаты без автопродления и автосписания.'],['Что доступно в Free?','При регистрации даются 1 000 единиц и 14 дней пробного доступа. Затем остаются Карта, Календарь, Сегодня, Прогноз и Хиромантия; глубокие функции видны с замком.'],['Единицы Pass пополняются ежемесячно?','Нет. При каждой покупке Premium добавляет 500, Master 2 000; единицы не сгорают и пополняются отдельно.'],['Оплата безопасна?','Stripe обрабатывает карты и PromptPay; Hourkey не хранит номера карт, доступ выдает сервер после оплаты.'],['Нужно отменять?','Нет: Pass не продлевается автоматически и действует до конца купленных 30 дней.']],footerNote:'Цены в THB. Pass действует 30 дней без автопродления. Пробный период 14 дней начинается при регистрации. Единицы не сгорают.'},
    es:{compareP:'Empieza gratis, elige Premium para herramientas personales completas o Master para varias cartas, grupos y evidencia técnica.',topupP:'Los créditos de registro, pass o recarga no caducan.',faqs:[['¿Qué es un crédito (時)?','Sirve para AI Sifu y análisis profundo y se cobra según la longitud de la respuesta. Carta, calendario y puntuación diaria son gratis.'],['¿El pass de 30 días se renueva solo?','No. Dura 30 días tras el pago y no se renueva ni cobra automáticamente.'],['¿Hasta dónde llega Free?','El registro incluye 1.000 créditos y prueba de 14 días. Después siguen Carta, Calendario, Hoy, Pronóstico y Quiromancia; lo profundo queda visible con candado.'],['¿Los créditos del pass se recargan cada mes?','No. Cada compra añade 500 en Premium o 2.000 en Master; no caducan y puedes recargar.'],['¿El pago es seguro?','Stripe procesa tarjetas y PromptPay; Hourkey no guarda números de tarjeta y el servidor activa el acceso tras el pago.'],['¿Hay que cancelar?','No: el pass no se renueva solo y sigue activo hasta terminar los 30 días comprados.']],footerNote:'Precios en THB. El pass dura 30 días sin renovación automática. La prueba de 14 días empieza al registrarte. Los créditos no caducan.'}
  };

  var UI_PATCH = {
    monthly:{ cn:'30 天通行证', vi:'Pass 30 ngày', ja:'30日Pass', ru:'Pass на 30 дней', ko:'30일 Pass', es:'Pass de 30 días' },
    yearly:{ cn:'年付', vi:'Hằng năm', ja:'年払い', ru:'Годовой', ko:'연간', es:'Anual' },
    save:{ cn:'省 2 个月', vi:'Miễn 2 tháng', ja:'2か月無料', ru:'2 месяца бесплатно', ko:'2개월 무료', es:'2 meses gratis' },
    perMonth:{ cn:'／30 天', vi:'/30 ngày', ja:'/30日', ru:'/30 дней', ko:'/30일', es:'/30 días' },
    perYear:{ cn:'／年', vi:'/năm', ja:'/年', ru:'/год', ko:'/년', es:'/año' },
    yearlyNote:{ cn:'≈฿{M}/月 · 送 {F} 个月', vi:'≈฿{M}/tháng · miễn {F} tháng', ja:'≈฿{M}/月 · {F}か月無料', ru:'≈฿{M}/мес · {F} мес. бесплатно', ko:'≈฿{M}/월 · {F}개월 무료', es:'≈฿{M}/mes · {F} meses gratis' },
    free:{ cn:'免费开始', vi:'Miễn phí để bắt đầu', ja:'無料で開始', ru:'Бесплатно для старта', ko:'무료로 시작', es:'Gratis para empezar' },
    colFeat:{ cn:'功能 · 工具', vi:'Tính năng · công cụ', ja:'機能 · ツール', ru:'Функция · инструмент', ko:'기능 · 도구', es:'Función · herramienta' },
    buyTopup:{ cn:'加值', vi:'Nạp lượt', ja:'追加する', ru:'Пополнить', ko:'충전', es:'Recargar' },
    loginNeed:{ cn:'付款前请先登录', vi:'Vui lòng đăng nhập trước khi thanh toán', ja:'支払い前にログインしてください', ru:'Войдите перед оплатой', ko:'결제 전에 로그인하세요', es:'Inicia sesión antes de pagar' },
    redirect:{ cn:'正在前往安全结账...', vi:'Đang chuyển tới thanh toán bảo mật...', ja:'安全な決済画面へ移動中...', ru:'Переход к защищенной оплате...', ko:'보안 결제 화면으로 이동 중...', es:'Abriendo pago seguro...' },
    netErr:{ cn:'连接失败', vi:'Kết nối thất bại', ja:'接続に失敗しました', ru:'Ошибка подключения', ko:'연결 실패', es:'Conexión fallida' },
    payErr:{ cn:'无法开始付款', vi:'Không thể bắt đầu thanh toán', ja:'支払いを開始できません', ru:'Не удалось начать оплату', ko:'결제를 시작할 수 없습니다', es:'No se pudo iniciar el pago' },
    best:{ cn:'最划算', vi:'Đáng giá nhất', ja:'最もお得', ru:'Лучшая цена', ko:'최고 가성비', es:'Mejor valor' },
    themeBtn:{ cn:'切换主题', vi:'Đổi giao diện', ja:'テーマ切替', ru:'Переключить тему', ko:'테마 전환', es:'Cambiar tema' }
  };

  var TX_PATCH = {
    payTitle:{ cn:'使用 PromptPay 付款', vi:'Thanh toán bằng PromptPay', ja:'PromptPayで支払う', ru:'Оплата PromptPay', ko:'PromptPay 결제', es:'Pagar con PromptPay' },
    sandbox:{ cn:'测试模式 — 不会真实扣款', vi:'Chế độ thử nghiệm — không trừ tiền thật', ja:'テストモード — 実際の請求はありません', ru:'Тестовый режим — без реального списания', ko:'테스트 모드 — 실제 청구 없음', es:'Modo sandbox — sin cargo real' },
    scan:{ cn:'用银行 App 扫描 QR 付款', vi:'Quét QR bằng ứng dụng ngân hàng để thanh toán', ja:'銀行アプリでQRを読み取って支払います', ru:'Отсканируйте QR в банковском приложении', ko:'은행 앱으로 QR을 스캔해 결제하세요', es:'Escanea el QR con tu app bancaria' },
    amount:{ cn:'支付金额', vi:'Số tiền', ja:'金額', ru:'Сумма', ko:'금액', es:'Importe' },
    waiting:{ cn:'正在等待付款...', vi:'Đang chờ thanh toán...', ja:'支払いを待っています...', ru:'Ожидание оплаты...', ko:'결제 대기 중...', es:'Esperando pago...' },
    simulate:{ cn:'模拟付款成功（测试）', vi:'Mô phỏng thanh toán thành công (test)', ja:'支払い成功をシミュレート（テスト）', ru:'Симулировать успешную оплату (тест)', ko:'결제 성공 시뮬레이션(테스트)', es:'Simular pago exitoso (test)' },
    close:{ cn:'关闭', vi:'Đóng', ja:'閉じる', ru:'Закрыть', ko:'닫기', es:'Cerrar' },
    timeout:{ cn:'等待付款超时，请重试', vi:'Hết thời gian chờ thanh toán. Thử lại.', ja:'支払い待ちがタイムアウトしました。再試行してください。', ru:'Время ожидания оплаты истекло. Попробуйте снова.', ko:'결제 대기 시간이 초과되었습니다. 다시 시도하세요.', es:'El pago agotó el tiempo. Inténtalo de nuevo.' },
    paidOk:{ cn:'付款成功！+{N} 時 · 余额 {B} 時', vi:'Đã thanh toán! +{N} 時 · số dư {B} 時', ja:'支払い完了！+{N} 時 · 残高 {B} 時', ru:'Оплачено! +{N} 時 · баланс {B} 時', ko:'결제 완료! +{N} 時 · 잔액 {B} 時', es:'¡Pagado! +{N} 時 · saldo {B} 時' }
  };

  function merge(dst, src){
    if (!dst || !src) return;
    Object.keys(src).forEach(function(k){ dst[k] = src[k]; });
  }
  function readLs(k){ try { return localStorage.getItem(k) || ''; } catch(_) { return ''; } }
  function pricingLocale(){
    var d = document.documentElement;
    var domVariant = d.getAttribute('data-zh-variant') || readLs('hk_zh_variant');
    var raw = d.getAttribute('data-hk-locale') || '';
    var st = null;
    try { st = window.HK_LANG_STATE && window.HK_LANG_STATE.current ? window.HK_LANG_STATE.current() : null; } catch(_) {}
    if (st && st.raw && !raw) raw = st.raw;
    if (!raw) raw = readLs('hk_locale') || readLs('hk_lang') || d.getAttribute('data-lang') || 'th';
    raw = String(raw || 'th').toLowerCase().replace('_','-');
    if (raw === 'cn' || raw === 'zh-cn' || raw === 'zh-hans') return 'cn';
    if (raw.indexOf('zh') === 0) return domVariant === 'cn' ? 'cn' : 'zh';
    if (LANG_SET[raw]) return raw;
    if (raw.indexOf('en') === 0) return 'en';
    if (raw.indexOf('th') === 0) return 'th';
    return 'en';
  }
  function L9(o, fb){
    var code = pricingLocale();
    if (o == null) return fb || '';
    if (typeof o === 'string') return o;
    return o[code] || (code === 'cn' ? o.zh : '') || o.en || o.th || fb || '';
  }
  function esc9(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function stateCode(code){
    if (code === 'cn') return 'zh-cn';
    if (code === 'zh') return 'zh-hant';
    return code;
  }
  function renderLangSeg(){
    var seg = document.getElementById('langSeg');
    if (!seg) return;
    if (seg.getAttribute('data-i18n9') !== '1') {
      seg.innerHTML = LANG_BUTTONS.map(function(l){
        return '<button data-lang="'+esc9(l.v)+'" title="'+esc9(l.title)+'" aria-label="'+esc9(l.title)+'">'+esc9(l.label)+'</button>';
      }).join('');
      seg.setAttribute('data-i18n9','1');
    }
    var code = pricingLocale();
    seg.querySelectorAll('button[data-lang]').forEach(function(b){
      b.classList.toggle('on', b.getAttribute('data-lang') === code);
    });
  }
  function setOne(selector, value, html){
    var el = document.querySelector(selector);
    if (!el || value == null) return;
    if (html) el.innerHTML = value;
    else el.textContent = value;
  }
  function setAll(selector, values, html){
    var nodes = document.querySelectorAll(selector);
    values = values || [];
    nodes.forEach(function(el, i){
      if (values[i] == null) return;
      if (html) el.innerHTML = values[i];
      else el.textContent = values[i];
    });
  }
  function setMeta(copy){
    if (!copy) return;
    document.title = copy.title || document.title;
    var desc = document.querySelector('meta[name="description"]');
    if (desc && copy.desc) desc.setAttribute('content', copy.desc);
    var ogt = document.querySelector('meta[property="og:title"]');
    if (ogt && copy.title) ogt.setAttribute('content', copy.title);
    var ogd = document.querySelector('meta[property="og:description"]');
    if (ogd && copy.desc) ogd.setAttribute('content', copy.desc);
    var twt = document.querySelector('meta[name="twitter:title"]');
    if (twt && copy.title) twt.setAttribute('content', copy.title);
    var twd = document.querySelector('meta[name="twitter:description"]');
    if (twd && copy.desc) twd.setAttribute('content', copy.desc);
  }
  function renderStaticText(){
    var code = pricingLocale();
    var latin = (code !== 'th' && code !== 'zh' && code !== 'cn' && STATIC[code]) ? STATIC[code] : STATIC.en;
    var han = code === 'cn' ? STATIC.cn : STATIC.zh;
    var meta = STATIC[code] || STATIC.en;
    var commercial = COMMERCIAL[code] || COMMERCIAL.en;

    if (code !== 'th') setMeta(meta);
    setOne('header.hero h1[data-l="en"]', latin.heroTitle, true);
    setOne('header.hero p.sub[data-l="en"]', latin.heroSub, true);
    setAll('.art small[data-l="en"]', latin.arts);
    setAll('.sec-head .kicker[data-l="en"]', [latin.compareKicker, latin.topupKicker, latin.faqKicker]);
    setAll('.sec-head h2[data-l="en"]', [latin.compareH2, latin.topupH2, latin.faqH2], true);
    setAll('.sec-head p[data-l="en"]', [commercial.compareP, commercial.topupP]);
    setAll('details.q summary [data-l="en"]', commercial.faqs.map(function(x){ return x[0]; }));
    setAll('details.q .a[data-l="en"]', commercial.faqs.map(function(x){ return x[1]; }));
    setAll('footer .flinks a[data-l="en"]', latin.footerLinks);
    setOne('footer > div[data-l="en"]', commercial.footerNote);

    setOne('header.hero h1[data-l="zh"]', han.heroTitle, true);
    setOne('header.hero p.sub[data-l="zh"]', han.heroSub, true);
    setAll('.art small[data-l="zh"]', han.arts);
    setAll('.sec-head .kicker[data-l="zh"]', [han.compareKicker, han.topupKicker, han.faqKicker]);
    setAll('.sec-head h2[data-l="zh"]', [han.compareH2, han.topupH2, han.faqH2], true);
    setAll('.sec-head p[data-l="zh"]', [commercial.compareP, commercial.topupP]);
    setAll('details.q summary [data-l="zh"]', commercial.faqs.map(function(x){ return x[0]; }));
    setAll('details.q .a[data-l="zh"]', commercial.faqs.map(function(x){ return x[1]; }));
    setAll('footer .flinks a[data-l="zh"]', han.footerLinks);
    setOne('footer > div[data-l="zh"]', commercial.footerNote);
    setOne('footer .mono', meta.footerMono || STATIC.en.footerMono);
  }

  function patchTier(tier, p){
    if (!tier || !p) return;
    ['name','tag','yam','cta','badge'].forEach(function(k){ if (tier[k] && p[k]) merge(tier[k], p[k]); });
    if (tier.feats && p.feats) merge(tier.feats, p.feats);
  }
  function patchData(){
    try {
      Object.keys(UI_PATCH).forEach(function(k){ if (UI && UI[k]) merge(UI[k], UI_PATCH[k]); });
      if (typeof TX !== 'undefined') Object.keys(TX_PATCH).forEach(function(k){ if (TX[k]) merge(TX[k], TX_PATCH[k]); });

      /* Sync with entitlement contract: 1,000 yam + 14-day trial. */
      patchTier(PRICING.tiers[0], {
        name:{ cn:'新人', vi:'Free', ja:'Free', ru:'Free', ko:'Free', es:'Free' },
        tag:{
          cn:'1,000 时 + 14 天试用 · 之后免费模式',
          vi:'1.000 lượt + dùng thử 14 ngày · rồi chế độ miễn phí',
          ja:'1,000クレジット + 14日トライアル · その後フリー',
          ru:'1 000 единиц + 14 дней пробного · затем бесплатно',
          ko:'1,000 크레딧 + 14일 체험 · 이후 무료 모드',
          es:'1.000 créditos + prueba 14 días · luego modo gratis'
        },
        yam:{
          cn:'注册送 1,000 时（永不过期）',
          vi:'1.000 lượt khi đăng ký (không hết hạn)',
          ja:'登録時 1,000クレジット（失効なし）',
          ru:'1 000 единиц при регистрации (не сгорают)',
          ko:'가입 시 1,000 크레딧 (만료 없음)',
          es:'1.000 créditos al registrarte (no caducan)'
        },
        cta:{
          cn:'免费开始 · 建第一张命盘',
          vi:'Bắt đầu miễn phí · tạo lá số',
          ja:'無料で開始 · 命盤作成',
          ru:'Начать бесплатно · первая карта',
          ko:'무료 시작 · 첫 차트',
          es:'Empieza gratis · primera carta'
        },
        feats:{
          cn:[
            '注册 + 出生资料 + 打开命盘',
            '注册送 1,000 时 · AI 用到完',
            '14 天试用：Fusion 最多 3 · 命书 2 · 择日 1 盘 · Vision 1 次 · 房宅 3',
            '14 天后：命盘／历／今日／预测／手相 + 剩余时问 AI · 深层功能保留锁定提示'
          ],
          vi:[
            'Đăng ký + ngày sinh + mở lá số',
            '1.000 lượt khi vào · AI dùng đến hết',
            'Dùng thử 14 ngày: Fusion tối đa 3 · Sách 2 · chọn ngày 1 lá · Vision 1× · 3 nhà',
            'Sau ngày 14: lá số/lịch/hôm nay/dự báo/xem tay + AI bằng lượt còn · công cụ sâu vẫn hiện khóa'
          ],
          ja:[
            '登録 + 生年月日 + 命盤を開く',
            '登録時 1,000クレジット · AIは使い切りまで',
            '14日トライアル：Fusion最大3 · 命書2 · 日取り1盤 · Vision 1回 · 家3',
            '14日後：命盤/暦/今日/予測/手相 + 残クレジットでAI · 深い機能は鍵付き表示'
          ],
          ru:[
            'Регистрация + данные рождения + открыть карту',
            '1 000 единиц при входе · AI до исчерпания',
            'Пробный 14 дней: Fusion макс 3 · Книга 2 · дата 1 карта · Vision 1× · 3 дома',
            'После 14 дней: карта/календарь/сегодня/прогноз/хиромантия + AI с остатком · глубокие функции видны с замком'
          ],
          ko:[
            '가입 + 생년월일 + 차트 열기',
            '가입 시 1,000 크레딧 · AI는 소진까지',
            '14일 체험: Fusion 최대 3 · 명서 2 · 택일 1차트 · Vision 1회 · 집 3',
            '14일 후: 차트/달력/오늘/예측/손금 + 남은 크레딧 AI · 심화 기능은 잠금 표시'
          ],
          es:[
            'Registro + datos de nacimiento + abrir carta',
            '1.000 créditos al unirte · AI hasta agotarlos',
            'Prueba 14 días: Fusion máx 3 · Libro 2 · fechas 1 carta · Vision 1× · 3 casas',
            'Tras día 14: carta/calendario/hoy/pronóstico/quiromancia + AI con saldo · funciones profundas visibles con candado'
          ]
        }
      });
      patchTier(PRICING.tiers[1], {
        name:{ cn:'Premium', vi:'Premium', ja:'Premium', ru:'Premium', ko:'Premium', es:'Premium' },
        tag:{
          cn:'推荐 · 单人命盘工具 + 有限 Fusion／命书',
          vi:'Khuyên dùng · công cụ 1 lá + Fusion/Sách giới hạn',
          ja:'おすすめ · 単命盤ツール + 制限付き Fusion/命書',
          ru:'Рекомендуем · соло-инструменты + лимит Fusion/Книги',
          ko:'추천 · 단일 차트 도구 + 제한 Fusion/명서',
          es:'Recomendado · herramientas solo + Fusion/Libro limitado'
        },
        yam:{
          cn:'购买时 +500 时（尚未每月自动补发）',
          vi:'+500 lượt khi mua (chưa nạp lại hằng tháng tự động)',
          ja:'購入時 +500クレジット（月次自動補充は未対応）',
          ru:'+500 единиц при покупке (авто-пополнение пока нет)',
          ko:'구매 시 +500 크레딧 (월 자동 충전 아직 없음)',
          es:'+500 créditos al comprar (sin recarga mensual auto aún)'
        },
        cta:{
          cn:'解锁 Premium',
          vi:'Mở khóa Premium',
          ja:'Premiumを開放',
          ru:'Открыть Premium',
          ko:'Premium 잠금 해제',
          es:'Desbloquear Premium'
        },
        badge:{
          cn:'⭐ 推荐 · 最适合',
          vi:'⭐ Khuyên dùng · hợp nhất',
          ja:'⭐ おすすめ · 最適',
          ru:'⭐ Рекомендуем · лучший выбор',
          ko:'⭐ 추천 · 최적',
          es:'⭐ Recomendado · mejor ajuste'
        },
        feats:{
          cn:['择日／天星／风水罗盘／奇门／天王星','Fusion 最多 4 术 · 1 命盘','命书最多 3 术（无深度融合章）','可存多房宅 · AI 师傅依使用扣时'],
          vi:['Chọn ngày / Thiên Tinh / Phong thủy·la bàn / Kỳ Môn / Uranian','Fusion tối đa 4 · 1 lá','Sách mệnh tối đa 3 (chưa có chương hợp nhất sâu)','Lưu nhiều nhà · AI Sifu trừ lượt theo dùng'],
          ja:['日取り / 天星 / 風水・羅盤 / 奇門 / Uranian','Fusion 最大4術 · 1命盤','命書最大3術（深い融合章なし）','複数の家を保存 · AI Sifuは使用分を消費'],
          ru:['Дата / Тяньсин / фэн-шуй·луопань / Ци Мэнь / Uranian','Fusion до 4 · 1 карта','Книга до 3 (без глубокого синтеза)','Много домов · AI Sifu тратит единицы по факту'],
          ko:['택일 / 천성 / 풍수·나경 / 기문 / Uranian','Fusion 최대 4 · 1차트','명서 최대 3 (심화 융합 장 없음)','여러 집 저장 · AI Sifu는 사용량만큼 차감'],
          es:['Fechas / Tianxing / feng shui·luopan / Qi Men / Uranian','Fusion hasta 4 · 1 carta','Libro hasta 3 (sin capítulo de síntesis profunda)','Varias casas · AI Sifu gasta créditos al usarse']
        }
      });
      patchTier(PRICING.tiers[2], {
        name:{ cn:'Master', vi:'Master', ja:'Master', ru:'Master', ko:'Master', es:'Master' },
        tag:{
          cn:'多命盘 · 完整命书 · 人脉／群组',
          vi:'Nhiều lá · Sách đầy đủ · mạng lưới/nhóm',
          ja:'多数命盤 · 完全命書 · 人脈/グループ',
          ru:'Много карт · полная Книга · сеть/группа',
          ko:'여러 차트 · 전체 명서 · 인맥/그룹',
          es:'Muchas cartas · Libro completo · red/grupo'
        },
        yam:{
          cn:'购买时 +2,000 时（尚未每月自动补发）',
          vi:'+2.000 lượt khi mua (chưa nạp lại hằng tháng tự động)',
          ja:'購入時 +2,000クレジット（月次自動補充は未対応）',
          ru:'+2 000 единиц при покупке (авто-пополнение пока нет)',
          ko:'구매 시 +2,000 크레딧 (월 자동 충전 아직 없음)',
          es:'+2.000 créditos al comprar (sin recarga mensual auto aún)'
        },
        cta:{
          cn:'选择大师',
          vi:'Chọn Master',
          ja:'Masterを選ぶ',
          ru:'Выбрать Master',
          ko:'Master 선택',
          es:'Elegir Master'
        },
        feats:{
          cn:['包含 Premium 全部','Fusion 完整 6 术 · 多命盘','完整命书 + 融合章 · 合盘／人脉／群组','购买时 +2,000 时 · 适合专业／多案'],
          vi:['Tất cả trong Premium','Fusion đủ 6 · nhiều lá','Sách đầy đủ + hợp nhất · hợp bàn/mạng/nhóm','+2.000 lượt khi mua · pro / nhiều case'],
          ja:['Premiumのすべて','Fusion 全6術 · 多命盤','完全命書 + 融合 · 合盤/人脈/グループ','購入時 +2,000 · プロ/多ケース向け'],
          ru:['Всё из Premium','Fusion все 6 · много карт','Полная Книга + синтез · совместимость/сеть/группа','+2 000 при покупке · pro / много кейсов'],
          ko:['Premium 전체','Fusion 6체계 전체 · 여러 차트','전체 명서 + 융합 · 합반/인맥/그룹','구매 시 +2,000 · 프로/다건 작업'],
          es:['Todo lo de Premium','Fusion las 6 · multi-carta','Libro completo + síntesis · sinastría/red/grupo','+2.000 al comprar · pro / multi-caso']
        }
      });
      merge(PRICING.topups[0].tag, { cn:'入门', vi:'Khởi đầu', ja:'スターター', ru:'Старт', ko:'시작', es:'Inicial' });
      merge(PRICING.topups[1].tag, { cn:'热门', vi:'Phổ biến', ja:'人気', ru:'Популярно', ko:'인기', es:'Popular' });
      merge(PRICING.topups[2].tag, { cn:'最划算', vi:'Đáng giá nhất', ja:'最もお得', ru:'Лучшая цена', ko:'최고 가성비', es:'Mejor valor' });

      /* CMP indices sync với pricing.html ปัจจุบัน */
      [
        [0,'grp',{ cn:'Activation — 免费注册', vi:'Activation — đăng ký miễn phí', ja:'Activation — 無料登録', ru:'Activation — бесплатная регистрация', ko:'Activation — 무료 가입', es:'Activation — registro gratis' }],
        [1,'name',{ cn:'注册 + 出生资料 + 打开命盘', vi:'Đăng ký + ngày sinh + mở lá số', ja:'登録 + 生年月日 + 命盤を開く', ru:'Регистрация + рождение + открыть карту', ko:'가입 + 생년월일 + 차트 열기', es:'Registro + nacimiento + abrir carta' }],
        [2,'name',{ cn:'四柱八字命盘', vi:'Lá số BaZi 4 trụ', ja:'4柱 BaZi 命盤', ru:'Карта BaZi 4 столпа', ko:'4기둥 BaZi 차트', es:'Carta BaZi de 4 pilares' }],
        [3,'name',{ cn:'注册 1,000 时（AI 用到完）', vi:'1.000 lượt khi vào (AI đến hết)', ja:'登録 1,000クレジット（AI使い切り）', ru:'1 000 единиц при входе (AI до конца)', ko:'가입 1,000 크레딧 (AI 소진까지)', es:'1.000 créditos al unirte (AI hasta agotar)' }],
        [4,'name',{ cn:'14 天试用（深入功能保留锁定）', vi:'Dùng thử 14 ngày (tính năng sâu vẫn hiện khóa)', ja:'14日トライアル（深い機能も鍵付き表示）', ru:'Пробный 14 дней (глубокие функции видны с замком)', ko:'14일 체험 (심화 기능 잠금 표시)', es:'Prueba 14 días (funciones profundas visibles con candado)' }],
        [4,'tool',{ cn:'注册自动', vi:'tự động khi đăng ký', ja:'登録時自動', ru:'авто при регистрации', ko:'가입 시 자동', es:'auto al registrarse' }],
        [4,'free',{ cn:'首 14 天', vi:'14 ngày đầu', ja:'最初の14日', ru:'первые 14 дней', ko:'첫 14일', es:'primeros 14 días' }],
        [4,'premium',{ cn:'不需', vi:'n/a', ja:'不要', ru:'н/д', ko:'해당 없음', es:'n/a' }],
        [4,'master',{ cn:'不需', vi:'n/a', ja:'不要', ru:'н/д', ko:'해당 없음', es:'n/a' }],
        [5,'grp',{ cn:'Fusion / 深度 AI', vi:'Fusion / AI sâu', ja:'Fusion / 深度 AI', ru:'Fusion / глубокий AI', ko:'Fusion / 심층 AI', es:'Fusion / AI profunda' }],
        [6,'name',{ cn:'Master Fusion（多术）', vi:'Master Fusion (đa hệ)', ja:'Master Fusion（多術）', ru:'Master Fusion (мульти)', ko:'Master Fusion (다중 체계)', es:'Master Fusion (multi)' }],
        [6,'free',{ cn:'试用后最多 2 · 试用期 3', vi:'sau trial tối đa 2 · trial 3', ja:'トライアル後最大2 · 試用中3', ru:'после trial макс 2 · trial 3', ko:'체험 후 최대 2 · 체험 중 3', es:'tras trial máx 2 · trial 3' }],
        [6,'premium',{ cn:'最多 4 术 · 1 盘', vi:'tối đa 4 · 1 lá', ja:'最大4術 · 1盤', ru:'макс 4 · 1 карта', ko:'최대 4 · 1차트', es:'máx 4 · 1 carta' }],
        [6,'master',{ cn:'完整 6 · 多盘', vi:'đủ 6 · nhiều lá', ja:'全6 · 多盤', ru:'все 6 · много карт', ko:'전체 6 · 여러 차트', es:'las 6 · multi-carta' }],
        [7,'name',{ cn:'AI 师傅追问', vi:'AI Sifu hỏi tiếp', ja:'AI Sifu 追問', ru:'AI Sifu уточнения', ko:'AI Sifu 후속 질문', es:'AI Sifu seguimiento' }],
        [7,'free',{ cn:'扣时', vi:'trừ lượt', ja:'クレジット消費', ru:'тратит единицы', ko:'크레딧 차감', es:'gasta créditos' }],
        [7,'premium',{ cn:'扣时', vi:'trừ lượt', ja:'クレジット消費', ru:'тратит единицы', ko:'크레딧 차감', es:'gasta créditos' }],
        [7,'master',{ cn:'扣时', vi:'trừ lượt', ja:'クレジット消費', ru:'тратит единицы', ko:'크레딧 차감', es:'gasta créditos' }],
        [8,'name',{ cn:'天王星 · 90° 盘', vi:'Uranian · vòng 90°', ja:'Uranian · 90° dial', ru:'Uranian · круг 90°', ko:'Uranian · 90° 다이얼', es:'Uranian · dial 90°' }],
        [8,'free',{ cn:'试用期', vi:'trong trial', ja:'トライアル中', ru:'в trial', ko:'체험 중', es:'en trial' }],
        [9,'grp',{ cn:'日常工具', vi:'Công cụ hằng ngày', ja:'日常ツール', ru:'Ежедневные инструменты', ko:'일상 도구', es:'Herramientas diarias' }],
        [10,'name',{ cn:'日历 / 今日', vi:'Lịch / Hôm nay', ja:'暦 / 今日', ru:'Календарь / Сегодня', ko:'달력 / 오늘', es:'Calendario / Hoy' }],
        [11,'name',{ cn:'董公择日（绑命盘）', vi:'Chọn ngày 董公 (gắn lá số)', ja:'董公择日（命盤連動）', ru:'Дата 董公 (с картами)', ko:'董公 택일 (차트 연동)', es:'Fechas 董公 (cartas vinculadas)' }],
        [11,'free',{ cn:'trial/免费 · 1 盘 · 层约 30%', vi:'trial/free · 1 lá · lớp ~30%', ja:'trial/free · 1盤 · 層約30%', ru:'trial/free · 1 карта · ~30% слоёв', ko:'trial/free · 1차트 · 계층 ~30%', es:'trial/free · 1 carta · capas ~30%' }],
        [11,'premium',{ cn:'最多 3 盘', vi:'tối đa 3 lá', ja:'最大3盤', ru:'макс 3 карты', ko:'최대 3차트', es:'máx 3 cartas' }],
        [11,'master',{ cn:'最多 10 盘', vi:'tối đa 10 lá', ja:'最大10盤', ru:'макс 10 карт', ko:'최대 10차트', es:'máx 10 cartas' }],
        [12,'name',{ cn:'天星七政', vi:'七政 / 天星 thật', ja:'天星七政', ru:'七政 / 天星', ko:'천성칠정', es:'七政 / 天星' }],
        [12,'free',{ cn:'试用期', vi:'trong trial', ja:'トライアル中', ru:'в trial', ko:'체험 중', es:'en trial' }],
        [13,'name',{ cn:'风水 + 罗盘 · 存房宅', vi:'Phong thủy + la bàn · lưu nhà', ja:'風水 + 羅盤 · 家を保存', ru:'Фэн-шуй + луопань · дома', ko:'풍수 + 나경 · 집 저장', es:'Feng shui + luopan · guardar casas' }],
        [13,'free',{ cn:'可看 · 不能新存*', vi:'xem · không lưu mới*', ja:'閲覧可 · 新規保存不可*', ru:'смотр · без новых сохранений*', ko:'보기 · 신규 저장 불가*', es:'ver · sin guardados nuevos*' }],
        [13,'premium',{ cn:'可存多宅', vi:'lưu nhiều nhà', ja:'複数保存可', ru:'много домов', ko:'여러 집 저장', es:'varias casas' }],
        [13,'master',{ cn:'近乎不限', vi:'gần không giới hạn', ja:'ほぼ無制限', ru:'почти без лимита', ko:'거의 무제한', es:'casi ilimitado' }],
        [14,'name',{ cn:'罗盘 · 平面图 AI Vision', vi:'La bàn · ảnh mặt bằng AI Vision', ja:'羅盤 · 間取り AI Vision', ru:'Луопань · план AI Vision', ko:'나경 · 평면도 AI Vision', es:'Luopan · plano AI Vision' }],
        [14,'free',{ cn:'试用后关 · 试用 1 次 · 主盘约 30%', vi:'sau trial tắt · trial 1× · vòng chính ~30%', ja:'トライアル後オフ · 試用1回 · 主層約30%', ru:'после trial выкл · trial 1× · ядро ~30%', ko:'체험 후 끔 · 체험 1회 · 핵심 ~30%', es:'post-trial off · trial 1× · anillos base ~30%' }],
        [14,'premium',{ cn:'额度较宽 · 扣时', vi:'hạn mức rộng · trừ lượt', ja:'枠が広い · クレジット消費', ru:'широкая квота · тратит', ko:'넓은 할당 · 차감', es:'cuota amplia · gasta' }],
        [14,'master',{ cn:'近乎不限 · 扣时', vi:'gần không giới hạn · trừ lượt', ja:'ほぼ無制限 · 消費', ru:'почти без лимита · тратит', ko:'거의 무제한 · 차감', es:'casi ilimitado · gasta' }],
        [15,'name',{ cn:'奇门遁甲', vi:'Kỳ Môn 奇門', ja:'奇門遁甲', ru:'Ци Мэнь 奇門', ko:'기문둔갑 奇門', es:'Qi Men 奇門' }],
        [15,'free',{ cn:'试用：局盘+入门 · 搜索/师傅关', vi:'trial: bàn + cơ bản · search/sifu tắt', ja:'試用：盤+入門 · 検索/師傅オフ', ru:'trial: карта+новичок · search/sifu выкл', ko:'체험: 국판+입문 · 검색/sifu 끔', es:'trial: carta+principiante · search/sifu off' }],
        [16,'grp',{ cn:'深度 / 多命盘', vi:'Việc sâu / nhiều lá', ja:'深度 / 多命盤', ru:'Глубина / много карт', ko:'심화 / 여러 차트', es:'Profundidad / muchas cartas' }],
        [17,'name',{ cn:'命书（约 18 时／术 + 10 融合）', vi:'Sách mệnh (~18 lượt/hệ + 10 hợp nhất)', ja:'命書（約18/術 + 10融合）', ru:'Книга (~18/наука + 10 синтез)', ko:'명서 (약 18/체계 + 10 융합)', es:'Libro (~18/ciencia + 10 síntesis)' }],
        [17,'free',{ cn:'试用后关 · 试用最多 2', vi:'sau trial tắt · trial tối đa 2', ja:'トライアル後オフ · 試用最大2', ru:'после trial выкл · trial макс 2', ko:'체험 후 끔 · 체험 최대 2', es:'post-trial off · trial máx 2' }],
        [17,'premium',{ cn:'最多 3 术', vi:'tối đa 3 hệ', ja:'最大3術', ru:'макс 3', ko:'최대 3', es:'máx 3' }],
        [17,'master',{ cn:'完整 6 + 融合', vi:'đủ 6 + hợp nhất', ja:'全6 + 融合', ru:'все 6 + синтез', ko:'전체 6 + 융합', es:'las 6 + síntesis' }],
        [18,'name',{ cn:'合盘 / 人脉 / 群组', vi:'Hợp bàn / mạng / nhóm', ja:'合盤 / 人脈 / グループ', ru:'Совместимость / сеть / группа', ko:'합반 / 인맥 / 그룹', es:'Sinastría / red / grupo' }],
        [19,'name',{ cn:'AI 优先队列', vi:'Hàng đợi AI ưu tiên', ja:'AI 優先キュー', ru:'Приоритет AI', ko:'AI 우선 대기열', es:'Cola AI prioritaria' }],
        [19,'master',{ cn:'规划中', vi:'đang lên kế hoạch', ja:'計画中', ru:'в планах', ko:'계획 중', es:'planificado' }],
        [20,'grp',{ cn:'时额度 — 尚未每月自动补发', vi:'Lượt (時) — chưa nạp lại hằng tháng tự động', ja:'時 — 月次自動補充は未対応', ru:'Единицы (時) — без авто-пополнения', ko:'크레딧 (時) — 월 자동 충전 없음', es:'Créditos (時) — sin recarga mensual auto' }],
        [21,'name',{ cn:'可得时额', vi:'Lượt bạn nhận', ja:'もらえるクレジット', ru:'Единицы, которые вы получаете', ko:'받는 크레딧', es:'Créditos que obtienes' }],
        [21,'free',{ cn:'注册 1,000', vi:'1.000 khi đăng ký', ja:'登録 1,000', ru:'1 000 при регистрации', ko:'가입 시 1,000', es:'1.000 al registrarte' }],
        [21,'premium',{ cn:'购买 +500', vi:'+500 khi mua', ja:'購入 +500', ru:'+500 при покупке', ko:'구매 +500', es:'+500 al comprar' }],
        [21,'master',{ cn:'购买 +2,000', vi:'+2.000 khi mua', ja:'購入 +2,000', ru:'+2 000 при покупке', ko:'구매 +2,000', es:'+2.000 al comprar' }]
      ].forEach(function(p){
        if (CMP[p[0]] && (CMP[p[0]][p[1]] != null || p[1] === 'tool' || p[1] === 'free' || p[1] === 'premium' || p[1] === 'master' || p[1] === 'name' || p[1] === 'grp')) {
          if (typeof CMP[p[0]][p[1]] === 'object' && CMP[p[0]][p[1]] !== null) merge(CMP[p[0]][p[1]], p[2]);
          else if (CMP[p[0]][p[1]] == null || typeof CMP[p[0]][p[1]] === 'string') CMP[p[0]][p[1]] = Object.assign({ th:'', en:'', zh:'' }, p[2]);
        }
      });
      merge(CMP[1], { tool:{ th:'สมัคร → กรอกวันเกิด → เปิดดวง', en:'Sign-up → birth data → chart', zh:'註冊 → 出生資料 → 命盤', cn:'注册 → 出生资料 → 命盘', vi:'Đăng ký → ngày sinh → lá số', ja:'登録 → 生年月日 → 命盤', ru:'Регистрация → рождение → карта', ko:'가입 → 생년월일 → 차트', es:'Registro → nacimiento → carta' } });
      merge(CMP[2], { tool:{ th:'/chart', en:'/chart', zh:'/chart', cn:'/chart', vi:'/chart', ja:'/chart', ru:'/chart', ko:'/chart', es:'/chart' } });
      merge(CMP[3], { tool:{ th:'AI ซินแส', en:'AI Sifu', zh:'AI 師傅', cn:'AI 师傅', vi:'AI Sifu', ja:'AI Sifu', ru:'AI Sifu', ko:'AI Sifu', es:'AI Sifu' } });
      merge(CMP[10], { tool:{ th:'/calendar · /today', en:'/calendar · /today', zh:'/calendar · /today', cn:'/calendar · /today', vi:'/calendar · /today', ja:'/calendar · /today', ru:'/calendar · /today', ko:'/calendar · /today', es:'/calendar · /today' } });
      merge(CMP[11], { tool:{ th:'/datepick', en:'/datepick', zh:'/datepick', cn:'/datepick', vi:'/datepick', ja:'/datepick', ru:'/datepick', ko:'/datepick', es:'/datepick' } });
      merge(CMP[12], { tool:{ th:'/tianxing', en:'/tianxing', zh:'/tianxing', cn:'/tianxing', vi:'/tianxing', ja:'/tianxing', ru:'/tianxing', ko:'/tianxing', es:'/tianxing' } });
      merge(CMP[13], { tool:{ th:'/fengshui', en:'/fengshui', zh:'/fengshui', cn:'/fengshui', vi:'/fengshui', ja:'/fengshui', ru:'/fengshui', ko:'/fengshui', es:'/fengshui' } });
      merge(CMP[14], { tool:{ th:'/luopan', en:'/luopan', zh:'/luopan', cn:'/luopan', vi:'/luopan', ja:'/luopan', ru:'/luopan', ko:'/luopan', es:'/luopan' } });
      merge(CMP[15], { tool:{ th:'/qimen', en:'/qimen', zh:'/qimen', cn:'/qimen', vi:'/qimen', ja:'/qimen', ru:'/qimen', ko:'/qimen', es:'/qimen' } });
      merge(CMP[17], { tool:{ th:'/book', en:'/book', zh:'/book', cn:'/book', vi:'/book', ja:'/book', ru:'/book', ko:'/book', es:'/book' } });
      merge(CMP[18], { tool:{ th:'/network', en:'/network', zh:'/network', cn:'/network', vi:'/network', ja:'/network', ru:'/network', ko:'/network', es:'/network' } });
      merge(CMP[21], { tool:{ th:'เติมเพิ่มได้ที่ Top-up', en:'Top-up anytime', zh:'可隨時加值', cn:'可随时加值', vi:'Nạp thêm bất cứ lúc nào', ja:'いつでも追加', ru:'Пополнить в любое время', ko:'언제든 충전', es:'Recarga cuando quieras' } });
    } catch (_) {}
  }

  var patched = false;
  function patchOnce(){
    if (patched) return;
    patched = true;
    patchData();
  }
  var baseApply = null;
  try { baseApply = applyLang; } catch(_) {}
  function applyAll(){
    patchOnce();
    if (baseApply) {
      try { baseApply(); } catch(_) {}
    }
    renderLangSeg();
    renderStaticText();
  }
  try {
    lang = pricingLocale;
    L = L9;
    applyLang = applyAll;
  } catch (_) {}
  var seg = document.getElementById('langSeg');
  if (seg) {
    seg.addEventListener('click', function(e){
      var b = e.target && e.target.closest ? e.target.closest('button[data-lang]') : null;
      if (!b) return;
      var code = b.getAttribute('data-lang');
      if (window.HK_LANG_STATE && window.HK_LANG_STATE.set) window.HK_LANG_STATE.set(stateCode(code));
      try {
        localStorage.setItem('hk_locale', code === 'cn' ? 'zh' : code === 'zh' ? 'zh' : code);
        localStorage.setItem('hk_lang', code === 'cn' ? 'zh' : code === 'zh' ? 'zh' : code);
        if (code === 'cn') localStorage.setItem('hk_zh_variant','cn');
        else if (code === 'zh') localStorage.setItem('hk_zh_variant','hant');
      } catch(_) {}
      setTimeout(applyAll, 0);
    }, true);
  }
  document.addEventListener('hk:locale', function(){ setTimeout(applyAll, 0); });
  setTimeout(applyAll, 0);
})();
