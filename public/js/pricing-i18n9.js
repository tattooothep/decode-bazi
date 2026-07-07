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

  var UI_PATCH = {
    monthly:{ cn:'月付', vi:'Hằng tháng', ja:'月払い', ru:'Ежемесячно', ko:'월간', es:'Mensual' },
    yearly:{ cn:'年付', vi:'Hằng năm', ja:'年払い', ru:'Годовой', ko:'연간', es:'Anual' },
    save:{ cn:'省 2 个月', vi:'Miễn 2 tháng', ja:'2か月無料', ru:'2 месяца бесплатно', ko:'2개월 무료', es:'2 meses gratis' },
    perMonth:{ cn:'／月', vi:'/tháng', ja:'/月', ru:'/мес', ko:'/월', es:'/mes' },
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

    setMeta(meta);
    setOne('header.hero h1[data-l="en"]', latin.heroTitle, true);
    setOne('header.hero p.sub[data-l="en"]', latin.heroSub, true);
    setAll('.art small[data-l="en"]', latin.arts);
    setAll('.sec-head .kicker[data-l="en"]', [latin.compareKicker, latin.topupKicker, latin.faqKicker]);
    setAll('.sec-head h2[data-l="en"]', [latin.compareH2, latin.topupH2, latin.faqH2], true);
    setAll('.sec-head p[data-l="en"]', [latin.compareP, latin.topupP]);
    setAll('details.q summary[data-l="en"]', latin.faqs.map(function(x){ return x[0]; }));
    setAll('details.q .a[data-l="en"]', latin.faqs.map(function(x){ return x[1]; }));
    setAll('footer .flinks a[data-l="en"]', latin.footerLinks);
    setOne('footer > div[data-l="en"]', latin.footerNote);

    setOne('header.hero h1[data-l="zh"]', han.heroTitle, true);
    setOne('header.hero p.sub[data-l="zh"]', han.heroSub, true);
    setAll('.art small[data-l="zh"]', han.arts);
    setAll('.sec-head .kicker[data-l="zh"]', [han.compareKicker, han.topupKicker, han.faqKicker]);
    setAll('.sec-head h2[data-l="zh"]', [han.compareH2, han.topupH2, han.faqH2], true);
    setAll('.sec-head p[data-l="zh"]', [han.compareP, han.topupP]);
    setAll('details.q summary[data-l="zh"]', han.faqs.map(function(x){ return x[0]; }));
    setAll('details.q .a[data-l="zh"]', han.faqs.map(function(x){ return x[1]; }));
    setAll('footer .flinks a[data-l="zh"]', han.footerLinks);
    setOne('footer > div[data-l="zh"]', han.footerNote);
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

      patchTier(PRICING.tiers[0], {
        name:{ cn:'新人', vi:'Free', ja:'Free', ru:'Free', ko:'Free', es:'Free' },
        tag:{ cn:'免费开始 · 建立第一张命盘 · 试用 AI 师傅', vi:'Bắt đầu miễn phí · tạo lá số đầu tiên · thử AI Sifu', ja:'無料で開始 · 最初の命盤作成 · AI Sifuを試す', ru:'Начните бесплатно · создайте первую карту · попробуйте AI Sifu', ko:'무료 시작 · 첫 차트 생성 · AI Sifu 체험', es:'Empieza gratis · crea tu primera carta · prueba AI Sifu' },
        yam:{ cn:'注册送 500 时', vi:'500 lượt khi đăng ký', ja:'登録時に500クレジット', ru:'500 единиц при регистрации', ko:'가입 시 500 크레딧', es:'500 créditos al registrarte' },
        cta:{ cn:'免费开始 · 建第一张命盘', vi:'Bắt đầu miễn phí · tạo lá số', ja:'無料で開始 · 命盤作成', ru:'Начать бесплатно · первая карта', ko:'무료 시작 · 첫 차트', es:'Empieza gratis · primera carta' },
        feats:{
          cn:['注册 + 输入出生资料 + 打开命盘','完整四柱八字命盘','首 500 时用于试问 AI 师傅','适合先试用再升级'],
          vi:['Đăng ký + nhập ngày sinh + mở lá số','Lá số BaZi đủ 4 trụ','500 lượt đầu để thử AI Sifu','Dành cho thử trước khi nâng cấp'],
          ja:['登録 + 生年月日入力 + 命盤を開く','4柱のBaZi命盤','最初の500クレジットでAI Sifuを試す','アップグレード前の試用向け'],
          ru:['Регистрация + данные рождения + открытие карты','Полная карта BaZi из 4 столпов','Первые 500 единиц для пробы AI Sifu','Для пробы перед апгрейдом'],
          ko:['가입 + 생년월일 입력 + 차트 열기','4기둥 BaZi 차트','첫 500 크레딧으로 AI Sifu 체험','업그레이드 전 체험용'],
          es:['Registro + datos de nacimiento + abrir carta','Carta BaZi completa de 4 pilares','Primeros 500 créditos para probar AI Sifu','Pensado para probar antes de subir']
        }
      });
      patchTier(PRICING.tiers[1], {
        name:{ cn:'Premium', vi:'Premium', ja:'Premium', ru:'Premium', ko:'Premium', es:'Premium' },
        tag:{ cn:'推荐 · 解锁完整 6 术 + AI 师傅，适合正式使用', vi:'Khuyên dùng · mở 6 truyền thống + AI Sifu đầy đủ để dùng thật', ja:'おすすめ · 6占術 + 完全版AI Sifuを実用向けに開放', ru:'Рекомендуем · 6 традиций + полный AI Sifu для реальной работы', ko:'추천 · 6체계 + 전체 AI Sifu로 실사용', es:'Recomendado · 6 tradiciones + AI Sifu completo para uso real' },
        yam:{ cn:'500 时/月', vi:'500 lượt / tháng', ja:'500クレジット / 月', ru:'500 единиц / месяц', ko:'500 크레딧 / 월', es:'500 créditos / mes' },
        cta:{ cn:'解锁 Premium', vi:'Mở khóa Premium', ja:'Premiumを開放', ru:'Открыть Premium', ko:'Premium 잠금 해제', es:'Desbloquear Premium' },
        badge:{ cn:'⭐ 推荐 · 最适合', vi:'⭐ Khuyên dùng · hợp nhất', ja:'⭐ おすすめ · 最適', ru:'⭐ Рекомендуем · лучший выбор', ko:'⭐ 추천 · 최적', es:'⭐ Recomendado · mejor ajuste' },
        feats:{
          cn:['完整 6 术 + Master Fusion','完整 AI 师傅，可重复提问','择日 / 天星 / 日历 正式使用','适合开始长期使用的一般用户'],
          vi:['Đủ 6 truyền thống + Master Fusion','AI Sifu đầy đủ để hỏi lặp lại','Chọn ngày / Thiên Tinh / Lịch để dùng thật','Gói chính cho người dùng thường xuyên'],
          ja:['6占術フル + Master Fusion','完全版AI Sifuで繰り返し質問','日取り選び / 天星 / 暦を実用','継続利用する一般ユーザー向け'],
          ru:['Полные 6 традиций + Master Fusion','Полный AI Sifu для повторных вопросов','Выбор даты / Тяньсин / календарь для работы','Основной план для регулярных пользователей'],
          ko:['6체계 전체 + Master Fusion','반복 질문 가능한 전체 AI Sifu','택일 / 천성 / 달력 실사용','정기 사용자를 위한 메인 플랜'],
          es:['6 tradiciones completas + Master Fusion','AI Sifu completo para preguntas repetidas','Selección de fecha / Tianxing / calendario para uso real','El plan principal para usuarios regulares']
        }
      });
      patchTier(PRICING.tiers[2], {
        name:{ cn:'Master', vi:'Master', ja:'Master', ru:'Master', ko:'Master', es:'Master' },
        tag:{ cn:'多命盘 · 深度报告 · 专业使用', vi:'Nhiều lá số · báo cáo sâu · công việc chuyên nghiệp', ja:'多数の命盤 · 深いレポート · プロ用途', ru:'Много карт · глубокие отчеты · профессиональная работа', ko:'여러 차트 · 깊은 리포트 · 전문 작업', es:'Muchas cartas · reportes profundos · trabajo profesional' },
        yam:{ cn:'2,000 时/月', vi:'2.000 lượt / tháng', ja:'2,000クレジット / 月', ru:'2 000 единиц / месяц', ko:'2,000 크레딧 / 월', es:'2.000 créditos / mes' },
        cta:{ cn:'选择 Master', vi:'Chọn Master', ja:'Masterを選ぶ', ru:'Выбрать Master', ko:'Master 선택', es:'Elegir Master' },
        feats:{
          cn:['Premium 的全部内容','深度命书 / 报告工作','合盘 / 人脉 / 群组','每月 2,000 时 + AI 优先'],
          vi:['Tất cả trong Premium','Sách mệnh / báo cáo chuyên sâu','Hợp bàn / mạng lưới / nhóm','2.000 lượt/tháng + AI ưu tiên'],
          ja:['Premiumのすべて','深い命書 / レポート作業','合盤 / 人脈 / グループ','月2,000クレジット + AI優先'],
          ru:['Все из Premium','Глубокая работа с книгой / отчетом','Совместимость / сеть / группа','2 000 единиц/мес + приоритет AI'],
          ko:['Premium의 모든 것','심화 명서 / 리포트 작업','합반 / 인맥 / 그룹','월 2,000 크레딧 + AI 우선'],
          es:['Todo lo de Premium','Trabajo profundo de libro / reporte','Sinastría / red / grupo','2.000 créditos/mes + AI prioritario']
        }
      });
      merge(PRICING.topups[0].tag, { cn:'入门', vi:'Khởi đầu', ja:'スターター', ru:'Старт', ko:'시작', es:'Inicial' });
      merge(PRICING.topups[1].tag, { cn:'最划算', vi:'Đáng giá nhất', ja:'最もお得', ru:'Лучшая цена', ko:'최고 가성비', es:'Mejor valor' });
      merge(PRICING.topups[2].tag, { cn:'高用量', vi:'Dùng nhiều', ja:'ヘビー', ru:'Интенсивно', ko:'대량 사용', es:'Intensivo' });

      [
        [0,'grp',{ cn:'Activation — 免费完成首次使用', vi:'Activation — lần thành công đầu miễn phí', ja:'Activation — 無料で最初の成功', ru:'Activation — первый успех бесплатно', ko:'Activation — 무료 첫 성공', es:'Activation — primer éxito gratis' }],
        [1,'name',{ cn:'注册 + 输入出生资料 + 打开命盘', vi:'Đăng ký + nhập ngày sinh + mở lá số', ja:'登録 + 生年月日入力 + 命盤を開く', ru:'Регистрация + данные рождения + открыть карту', ko:'가입 + 생년월일 입력 + 차트 열기', es:'Registro + datos de nacimiento + abrir carta' }],
        [2,'name',{ cn:'四柱八字命盘', vi:'Lá số BaZi 4 trụ', ja:'4柱 BaZi 命盤', ru:'Карта BaZi 4 столпа', ko:'4기둥 BaZi 차트', es:'Carta BaZi de 4 pilares' }],
        [3,'name',{ cn:'首 500 时试用 AI 师傅', vi:'500 lượt đầu để thử AI Sifu', ja:'最初の500クレジットでAI Sifuを試す', ru:'Первые 500 единиц для пробы AI Sifu', ko:'첫 500 크레딧으로 AI Sifu 체험', es:'Primeros 500 créditos para probar AI Sifu' }],
        [4,'grp',{ cn:'Premium — 正式使用', vi:'Premium — dùng thật hằng ngày', ja:'Premium — 実用', ru:'Premium — реальная ежедневная работа', ko:'Premium — 실사용', es:'Premium — uso real diario' }],
        [5,'name',{ cn:'完整 6 术 + Master Fusion', vi:'Đủ 6 truyền thống + Master Fusion', ja:'6占術フル + Master Fusion', ru:'Полные 6 традиций + Master Fusion', ko:'6체계 전체 + Master Fusion', es:'6 tradiciones completas + Master Fusion' }],
        [6,'name',{ cn:'AI 师傅重复提问 / 追问', vi:'AI Sifu hỏi lặp lại / hỏi tiếp', ja:'AI Sifu 繰り返し質問 / 続き', ru:'AI Sifu повторные вопросы / уточнения', ko:'AI Sifu 반복 질문 / 후속 질문', es:'AI Sifu preguntas repetidas / seguimiento' }],
        [6,'free',{ cn:'首 500', vi:'500 đầu', ja:'最初の500', ru:'первые 500', ko:'첫 500', es:'primeros 500' }],
        [7,'name',{ cn:'天王星 · 90° 盘', vi:'Uranian · vòng 90°', ja:'Uranian · 90° dial', ru:'Uranian · круг 90°', ko:'Uranian · 90° 다이얼', es:'Uranian · dial 90°' }],
        [8,'grp',{ cn:'Premium 核心工具', vi:'Công cụ cốt lõi Premium', ja:'Premium 主要ツール', ru:'Ключевые инструменты Premium', ko:'Premium 핵심 도구', es:'Herramientas clave de Premium' }],
        [9,'name',{ cn:'日历 / 今日 日常使用', vi:'Lịch / Hôm nay để dùng thường xuyên', ja:'暦 / 今日を日常利用', ru:'Календарь / сегодня для регулярного использования', ko:'달력 / 오늘 정기 사용', es:'Calendario / Hoy para uso regular' }],
        [10,'name',{ cn:'董公择日', vi:'Chọn ngày 董公', ja:'董公の日取り選び', ru:'Выбор дат 董公', ko:'董公 택일', es:'Selección de fecha 董公' }],
        [11,'name',{ cn:'真实天星七政择日', vi:'Chọn ngày 七政 theo sao thật', ja:'実天 七政 の日取り', ru:'Дата по реальному небу 七政', ko:'실제 하늘 七政 택일', es:'Fecha 七政 con cielo real' }],
        [12,'name',{ cn:'风水 + 罗盘 羅盤', vi:'Phong thủy + la bàn 羅盤', ja:'風水 + 羅盤', ru:'Фэн-шуй + luopan 羅盤', ko:'풍수 + 나경 羅盤', es:'Feng shui + luopan 羅盤' }],
        [13,'name',{ cn:'奇门遁甲', vi:'Qi Men 奇門', ja:'奇門遁甲', ru:'Qi Men 奇門', ko:'기문둔갑 奇門', es:'Qi Men 奇門' }],
        [14,'grp',{ cn:'Master — 深度工作 / 多命盘', vi:'Master — việc sâu / nhiều lá số', ja:'Master — 深い作業 / 多数の命盤', ru:'Master — глубина / много карт', ko:'Master — 심화 작업 / 여러 차트', es:'Master — trabajo profundo / muchas cartas' }],
        [15,'name',{ cn:'深度命书 / 报告', vi:'Sách mệnh / báo cáo chuyên sâu', ja:'深い命書 / レポート', ru:'Глубокая книга / отчет', ko:'심화 명서 / 리포트', es:'Libro / reporte profundo' }],
        [15,'premium',{ cn:'有限', vi:'Giới hạn', ja:'制限あり', ru:'Лимит', ko:'제한', es:'Limitado' }],
        [15,'master',{ cn:'深度', vi:'Chuyên sâu', ja:'深い', ru:'Глубоко', ko:'심화', es:'Profundo' }],
        [16,'name',{ cn:'合盘 / 人脉 / 群组', vi:'Hợp bàn / mạng lưới / nhóm', ja:'合盤 / 人脈 / グループ', ru:'Совместимость / сеть / группа', ko:'합반 / 인맥 / 그룹', es:'Sinastría / red / grupo' }],
        [17,'name',{ cn:'AI 师傅优先队列', vi:'Hàng đợi AI Sifu ưu tiên', ja:'AI Sifu 優先キュー', ru:'Приоритетная очередь AI Sifu', ko:'AI Sifu 우선 대기열', es:'Cola prioritaria de AI Sifu' }],
        [18,'grp',{ cn:'每月时额度', vi:'Lượt hằng tháng', ja:'月次クレジット', ru:'Ежемесячные единицы', ko:'월 크레딧', es:'Créditos mensuales' }],
        [19,'name',{ cn:'时 (時) / 月', vi:'Lượt (時) mỗi tháng', ja:'クレジット (時) / 月', ru:'Единицы (時) в месяц', ko:'월 크레딧 (時)', es:'Créditos (時) por mes' }],
        [19,'free',{ cn:'注册 500', vi:'500 khi tham gia', ja:'登録時 500', ru:'500 при входе', ko:'가입 시 500', es:'500 al entrar' }]
      ].forEach(function(p){
        if (CMP[p[0]] && CMP[p[0]][p[1]]) merge(CMP[p[0]][p[1]], p[2]);
      });
      merge(CMP[1], { tool:{ th:'สมัคร → กรอกวันเกิด → เปิดดวง', en:'Sign-up → birth data → chart', zh:'註冊 → 出生資料 → 命盤', cn:'注册 → 出生资料 → 命盘', vi:'Đăng ký → ngày sinh → lá số', ja:'登録 → 生年月日 → 命盤', ru:'Регистрация → рождение → карта', ko:'가입 → 생년월일 → 차트', es:'Registro → nacimiento → carta' } });
      merge(CMP[2], { tool:{ th:'ผังดวง', en:'Chart', zh:'命盤', cn:'命盘', vi:'Lá số', ja:'命盤', ru:'Карта', ko:'차트', es:'Carta' } });
      merge(CMP[3], { tool:{ th:'AI ซินแส', en:'AI Sifu', zh:'AI 師傅', cn:'AI 师傅', vi:'AI Sifu', ja:'AI Sifu', ru:'AI Sifu', ko:'AI Sifu', es:'AI Sifu' } });
      merge(CMP[9], { tool:{ th:'ปฏิทิน · วันนี้', en:'Calendar · Today', zh:'曆 · 今日', cn:'日历 · 今日', vi:'Lịch · Hôm nay', ja:'暦 · 今日', ru:'Календарь · сегодня', ko:'달력 · 오늘', es:'Calendario · Hoy' } });
      merge(CMP[10], { tool:{ th:'วางฤกษ์', en:'Date selection', zh:'董公擇日', cn:'董公择日', vi:'Chọn ngày', ja:'日取り選び', ru:'Выбор даты', ko:'택일', es:'Selección de fecha' } });
      merge(CMP[11], { tool:{ th:'天星七政', en:'Real-sky date', zh:'天星七政', cn:'天星七政', vi:'Thiên tinh', ja:'天星七政', ru:'Тяньсин', ko:'천성칠정', es:'Tianxing' } });
      merge(CMP[12], { tool:{ th:'風水羅盤', en:'Feng shui', zh:'風水羅盤', cn:'风水罗盘', vi:'Phong thủy', ja:'風水羅盤', ru:'Фэн-шуй', ko:'풍수 나경', es:'Feng shui' } });
      merge(CMP[13], { tool:{ th:'奇門', en:'Qi Men', zh:'奇門', cn:'奇门', vi:'Kỳ Môn', ja:'奇門遁甲', ru:'Ци Мэнь', ko:'기문둔갑', es:'Qi Men' } });
      merge(CMP[15], { tool:{ th:'命書 · รายงาน', en:'Book · report', zh:'命書 · 報告', cn:'命书 · 报告', vi:'Sách mệnh · báo cáo', ja:'命書 · レポート', ru:'Книга · отчет', ko:'명서 · 리포트', es:'Libro · reporte' } });
      merge(CMP[16], { tool:{ th:'合盤 · เครือข่าย · กลุ่ม', en:'Synastry · network · group', zh:'合盤 · 人脈 · 群組', cn:'合盘 · 人脉 · 群组', vi:'Hợp bàn · mạng lưới · nhóm', ja:'合盤 · 人脈 · グループ', ru:'Совместимость · сеть · группа', ko:'합반 · 인맥 · 그룹', es:'Sinastría · red · grupo' } });
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
