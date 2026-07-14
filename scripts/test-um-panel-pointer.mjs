/* regression test: เมนูผู้ใช้ปิดต้องไม่ดักคลิกทับเนื้อหา (hk-um-panel pointer-events bug)
 * usage: node test-pointer-regression.mjs <pageName> <PUBDIR> [viewportW] [viewportH]
 *   pageName: luopan | fengshui
 * ต้องล้มกับโค้ดเดิม (panel.style.pointerEvents='auto') · ผ่านหลังลบบรรทัดนั้น
 */
import { chromium } from 'playwright';
import fs from 'fs';

const PAGE = process.argv[2] || 'luopan';
const PUB = process.argv[3] || '/root/releases/decode-app-r515-mobile-api/public';
const VW = +(process.argv[4] || 1400), VH = +(process.argv[5] || 900);
const ORIGIN = 'https://hourkey.io';
const CT = p => p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.json')?'application/json':p.endsWith('.html')?'text/html':'text/plain';

const results = [];
const check = (name, pass, detail) => { results.push({name, pass, detail}); console.log(`${pass?'✅':'❌'} ${name}${detail?' · '+detail:''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:VW,height:VH} });
const page = await ctx.newPage();
const navs = [];
page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url()); });

await ctx.route('**/*', async route => {
  const u = new URL(route.request().url()); const path = u.pathname;
  if (path === '/'+PAGE || path === '/'+PAGE+'/' || path.endsWith(PAGE+'.html'))
    return route.fulfill({ status:200, contentType:'text/html', body: fs.readFileSync(`${PUB}/${PAGE}.html`,'utf8') });
  if (path.startsWith('/js/')||path.startsWith('/css/')||path.startsWith('/i18n/')||path.startsWith('/data/')||path.endsWith('.svg')||path.endsWith('.ico')) {
    const fp = PUB + path.split('?')[0];
    if (fs.existsSync(fp)) return route.fulfill({ status:200, contentType:CT(fp), body: fs.readFileSync(fp) });
    return route.fulfill({ status:404, body:'' });
  }
  if (path === '/api/auth/me') return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ok:true,user:{id:1,email:'t@x.com',name:'Test'}}) });
  if (path === '/api/account/me') return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({plan:'master',in_trial:false,caps:{luopan_mode:'full',luopan_pins:'full'}}) });
  if (path.startsWith('/api/luopan/data')) return route.fulfill({ status:200, contentType:'application/json', body:'{}' });
  if (path === '/api/profile') return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({profiles:[],active_profile:null}) });
  if (path.startsWith('/api/')) return route.fulfill({ status:200, contentType:'application/json', body:'{}' });
  if (path.includes('maps')||path.includes('gstatic')||path.includes('googleapis')) return route.fulfill({ status:200, contentType:'application/javascript', body:'' });
  return route.fulfill({ status:404, body:'' });
});

await page.goto(ORIGIN+'/'+PAGE, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3500);
// ปิด help modal ถ้ามี (fengshui)
const hm = page.locator('#fs-help-modal');
if (await hm.isVisible().catch(()=>false)) { await page.click('#fs-help-modal-close').catch(()=>{}); await page.waitForTimeout(400); }

// รอ portal ย้ายเมนูเข้า body
await page.waitForTimeout(500);

// ── เงื่อนไข 1: เมนูปิด ต้องไม่ดักคลิก (จุดในกล่องเมนูที่ปิด → elementFromPoint ต้องไม่ใช่ hk-um-*) ──
const probe = await page.evaluate(() => {
  const panel = document.querySelector('#hk-um-panel');
  if (!panel) return { err:'no panel' };
  const isOpen = panel.classList.contains('on');
  const r = panel.getBoundingClientRect();
  // จุดกลางพื้นที่กล่องเมนู (ตอนปิด box ยังมีขนาดอยู่)
  const cx = Math.round(r.left + r.width/2), cy = Math.round(r.top + r.height/2);
  const top = document.elementFromPoint(cx, cy);
  const inMenu = !!(top && top.closest && top.closest('#hk-um-panel'));
  const cs = getComputedStyle(panel).pointerEvents;
  return { isOpen, box:{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}, cx, cy, topTag:top?top.tagName+'.'+(top.className||'').toString().slice(0,30):'null', inMenu, pointerEvents:cs };
});
check('1·เมนูปิดไม่ดักคลิก', probe.err ? false : (!probe.isOpen && !probe.inMenu),
  probe.err || `panel ${probe.isOpen?'เปิด':'ปิด'} · pointer-events:${probe.pointerEvents} · จุดกลางกล่องโดน ${probe.topTag} · inMenu=${probe.inMenu}`);

// ── เงื่อนไข 2 (เฉพาะ luopan): rr-toggle เป็น topmost + คลิกแล้ว open + ไม่ navigate ──
if (PAGE === 'luopan') {
  const hasToggle = await page.locator('#ringList .rr-toggle').count();
  if (hasToggle > 0) {
    const urlBefore = page.url();
    // scroll ปุ่มเข้ากลางจอก่อน (mobile viewport เล็ก ปุ่มอยู่ล่าง)
    await page.evaluate(() => document.querySelector('#ringList .rr-toggle').scrollIntoView({block:'center'}));
    await page.waitForTimeout(300);
    const tg = await page.evaluate(() => {
      const el = document.querySelector('#ringList .rr-toggle');
      const r = el.getBoundingClientRect();
      const cx = Math.round(r.left+r.width/2), cy = Math.round(r.top+r.height/2);
      const top = document.elementFromPoint(cx, cy);
      return { cx, cy, isToggleTop: top === el || (top && el.contains(top)), topTag: top?top.tagName+'.'+(top.className||'').toString().slice(0,30):'null' };
    });
    await page.mouse.click(tg.cx, tg.cy);
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => {
      const el = document.querySelector('#ringList .rr-toggle');
      return { open: el?.closest('.ring-row')?.classList.contains('open') };
    });
    const urlAfter = page.url();
    check('2·rr-toggle เป็น topmost', tg.isToggleTop, `จุดปุ่มโดน ${tg.topTag}`);
    check('2·คลิก toggle → เปิด inline + ไม่ navigate', state.open && urlBefore===urlAfter, `open=${state.open} · url ${urlBefore===urlAfter?'คงเดิม':'เปลี่ยน→'+urlAfter}`);
  } else {
    check('2·rr-toggle render', false, 'ไม่มี rr-toggle (inspector ไม่ render)');
  }
}

// ── เงื่อนไข 3: เปิดเมนู avatar แล้วลิงก์ในเมนูกดได้ (pointer-events:auto ตอนเปิด) ──
const openable = await page.evaluate(() => {
  const trig = document.querySelector('.hk-um-trigger');
  if (!trig) return { err:'no trigger' };
  trig.click();
  return { clicked:true };
});
await page.waitForTimeout(400);
const menuOpen = await page.evaluate(() => {
  const panel = document.querySelector('#hk-um-panel');
  if (!panel) return { err:'no panel' };
  const isOpen = panel.classList.contains('on');
  const cs = getComputedStyle(panel).pointerEvents;
  // หา item ลิงก์ในเมนู แล้วเช็คว่ารับคลิกได้ (elementFromPoint = ตัวมันเอง/ลูก)
  const item = panel.querySelector('a, .hk-um-item, button');
  let itemClickable = false, itemTag='none';
  if (item) {
    const r = item.getBoundingClientRect();
    const top = document.elementFromPoint(Math.round(r.left+r.width/2), Math.round(r.top+r.height/2));
    itemClickable = !!(top && (top===item || item.contains(top) || (top.closest && top.closest('#hk-um-panel'))));
    itemTag = item.tagName;
  }
  return { isOpen, pointerEvents:cs, itemClickable, itemTag };
});
check('3·เมนูเปิดแล้วลิงก์กดได้', menuOpen.err ? false : (menuOpen.isOpen && menuOpen.pointerEvents==='auto' && menuOpen.itemClickable),
  menuOpen.err || `เปิด=${menuOpen.isOpen} · pointer-events:${menuOpen.pointerEvents} · item(${menuOpen.itemTag})กดได้=${menuOpen.itemClickable}`);

await browser.close();
const allPass = results.every(r => r.pass);
console.log(`\n${'='.repeat(50)}\n[${PAGE} ${VW}x${VH}] ${allPass?'✅ PASS ทั้งหมด':'❌ FAIL'} (${results.filter(r=>r.pass).length}/${results.length})`);
process.exit(allPass ? 0 : 1);
