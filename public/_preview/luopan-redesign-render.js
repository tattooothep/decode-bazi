/* ═══════════════════════════════════════════════════════════════════
 * luopan-redesign-render.js — เอนจินวาดหล่อแก 22 วงครบชั้น (ใช้ร่วม 4 ดีไซน์)
 * รัศมี/ลำดับชั้น ลอกตรงจาก public/luopan.html (r515 · buildLuopan) ให้ตรงตำรา
 * ข้อมูลทั้งหมดมาจาก window.LUOPAN (luopan-redesign-data.js · คัมภีร์ชุดเดิม)
 * วาดโดยรับ STYLE object → แต่ละดีไซน์ส่งสไตล์ของตัวเองเข้ามา (เนื้อหา 22 ชั้นเท่ากัน)
 * สร้าง 14 ก.ค. 2026 · จาวิสเขียนเอง
 *
 * 22 ชั้นวิชา (ใน→นอก ตามรัศมี):
 *  地支 · 天干 · 五行 · 奇門 · 飛星 · 後天八卦 · 先天八卦 · 透地60龍 · 60甲子 ·
 *  穿山72龍 · 天盤24山 · 地盤24山(หลัก) · 人盤24山 · 山編碼 · 周天度 · 120分金 ·
 *  24節氣 · 64卦五行 · 64卦 · 卦運 · 384爻 · 28宿   (+ 三元龍 overlay + 太極 แกนกลาง)
 * ═══════════════════════════════════════════════════════════════════ */
(function(global){
  const VB = 780, CX = 390, CY = 390;
  const toRad = d => (d - 90) * Math.PI / 180;
  const polar = (r, d) => [CX + r * Math.cos(toRad(d)), CY + r * Math.sin(toRad(d))];

  function ring(r, stroke, sw, extra){
    return `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${sw}" ${extra||''}/>`;
  }
  function bandFill(r1, r2, fill, extra){
    const rm = (r1 + r2) / 2;
    return `<circle cx="${CX}" cy="${CY}" r="${rm.toFixed(2)}" fill="none" stroke="${fill}" stroke-width="${(r2-r1).toFixed(2)}" ${extra||''}/>`;
  }
  function brd(r1, r2, deg, stroke, sw){
    const [a,b] = polar(r1, deg), [c,e] = polar(r2, deg);
    return `<line x1="${a.toFixed(2)}" y1="${b.toFixed(2)}" x2="${c.toFixed(2)}" y2="${e.toFixed(2)}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  function rt(r, deg, text, o){
    o = o || {};
    const [x,y] = polar(r, deg); let rot = deg;
    if (o.flip !== false && deg > 90 && deg < 270) rot += 180;
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${o.fam||"serif"}" `
      + `font-size="${o.fs||10}" font-weight="${o.fw||500}" fill="${o.fill}" text-anchor="middle" `
      + `dominant-baseline="middle" opacity="${o.op!=null?o.op:1}" letter-spacing="${o.ls||0}" `
      + `transform="rotate(${rot.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})">${text}</text>`;
  }
  // เส้นข่วย 3 ขีด (สำหรับ 8卦) วางแนวรัศมี
  function trigramBars(rMid, center, lines, color, w, gap, sw){
    let s = '';
    lines.forEach((yang, i) => {
      const r = rMid + (i - 1) * gap, [mx,my] = polar(r, center);
      const ang = center * Math.PI/180, dx = Math.cos(ang)*w, dy = Math.sin(ang)*w;
      if (yang) s += `<line x1="${mx-dx}" y1="${my-dy}" x2="${mx+dx}" y2="${my+dy}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
      else s += `<line x1="${mx-dx}" y1="${my-dy}" x2="${mx-dx*.22}" y2="${my-dy*.22}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`
             + `<line x1="${mx+dx*.22}" y1="${my+dy*.22}" x2="${mx+dx}" y2="${my+dy}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
    });
    return s;
  }

  // 8門/9星 คงที่ตามทิศ (ค่าโครงตำรา · ค่าจริงต้องอิงเวลา)
  const QIMEN_GATES = { '坎':'休','艮':'生','震':'傷','巽':'杜','離':'景','坤':'死','兌':'驚','乾':'開' };
  const DIR_ABBR = { '坎':'N','艮':'NE','震':'E','巽':'SE','離':'S','坤':'SW','兌':'W','乾':'NW' };

  /* ───────── เอนจินหลัก ───────── */
  function renderLuopan22(S){
    const D = global.LUOPAN;
    const P = S.pal, F = S.font;
    const EC = P.el; // {金,木,水,火,土}
    const g = [];
    const push = s => g.push(s);
    const bg = (r1,r2,i) => S.ringBg ? S.ringBg(r1,r2,i,P) : '';
    const sep = (r,i) => ring(r, P.line, .6, i%2? 'opacity=".8"':'');

    // พื้นหลังทุกชั้น (ถ้าสไตล์กำหนด)
    if (S.ringBg){
      const bands = [[60,80],[80,92],[92,104],[104,122],[122,140],[140,154],[154,169],[169,182],
        [182,195],[195,208],[208,220],[220,244],[244,256],[256,270],[270,282],[282,294],
        [294,308],[308,320],[320,336],[336,350],[350,366],[366,378]];
      bands.forEach((b,i)=> push(S.ringBg(b[0],b[1],i,P)));
    }

    // ── แกนกลาง 太極 (หยินหยาง) ──
    push(S.taiji(50, P));

    // ── 1. 地支 (60-80) ──
    push(ring(60, P.line, .6) + ring(80, P.gold, .7, 'opacity=".55"'));
    D.BRANCHES_12.forEach((b,i)=>{
      const c = i*30;
      push(brd(60,80,c-15, P.line, .45));
      push(rt(70, c, b, {fs:13, fw:700, fill: EC[D.BRANCH_META[b].el], fam:F.cjk}));
    });

    // ── 2. 天干 (80-92) · 8 ก้าน ──
    push(ring(92, P.line, .6));
    [['壬',345],['癸',15],['甲',75],['乙',105],['丙',165],['丁',195],['庚',255],['辛',285]].forEach(([c,deg])=>{
      push(rt(86, deg, c, {fs:9.5, fw:600, fill: EC[D.STEM_META[c].el], fam:F.cjk}));
    });

    // ── 3. 五行 (92-104) · ธาตุ 8 ทิศ ──
    push(ring(104, P.line, .6));
    D.TRIGRAMS_POST.forEach(t=>{
      push(brd(92,104,t.center-22.5, P.line, .35));
      push(rt(98, t.center, t.el, {fs:9.5, fw:600, fill: EC[t.el], fam:F.cjk, op:.95}));
    });

    // ── 4. 奇門 (104-122) · 8門โครง ──
    push(ring(122, P.line, .7));
    D.TRIGRAMS_POST.forEach(t=>{
      push(brd(104,122,t.center-22.5, P.line, .4));
      push(rt(113, t.center, (QIMEN_GATES[t.c]||'')+'門', {fs:8.5, fw:600, fill:P.dim, fam:F.cjk}));
    });

    // ── 5. 飛星 (122-140) · 山/向/運 8 ทิศ+กลาง ──
    push(ring(140, P.line, .6));
    D.TRIGRAMS_POST.forEach(t=>{
      const fs = D.FLYING_STARS_P9[t.dir];
      push(brd(122,140,t.center-22.5, P.line, .35));
      if (fs) push(rt(131, t.center, `${fs.mt}·${fs.wt}·${fs.er}`, {fs:7, fw:600, fill:P.dim, fam:F.mono}));
    });

    // ── 6. 後天八卦 (140-154) ──
    push(ring(154, P.gold, .7, 'opacity=".6"'));
    D.TRIGRAMS_POST.forEach(t=>{
      push(brd(140,154,t.center-22.5, P.line, .5));
      push(rt(147, t.center, t.c, {fs:12, fw:700, fill:P.ink, fam:F.cjk}));
    });

    // ── 7. 先天八卦 (154-169) · เส้นข่วย ──
    push(ring(169, P.line, .6));
    D.TRIGRAMS_PRE.forEach(t=>{
      push(brd(154,169,t.center-22.5, P.line, .35));
      push(trigramBars(161.5, t.center, t.lines, P.gold, 6, 4.2, 1.7));
    });

    // ── 8. 透地60龍 (169-182, offset 3°) ──
    push(ring(182, P.line, .6));
    D.buildChuanshan().forEach((d,k)=>{
      const c = (337.5 + k*6 + 3) % 360;
      push(brd(169,182,(337.5+k*6)%360, P.line, .28));
      push(rt(175.5, c, d.s, {fs:6.4, fill:P.dim, fam:F.cjk, op:.88}));
    });

    // ── 9. 60甲子 (182-195) ──
    push(ring(195, P.line, .6));
    D.JIAZI_60.forEach((j,k)=>{
      const c = k*6 + 3;
      push(brd(182,195,k*6, P.line, .28));
      push(rt(188.5, c, j.s+j.b, {fs:5.6, fill:P.dim, fam:F.cjk, op:.85}));
    });

    // ── 10. 穿山72龍 (195-208) ──
    push(ring(208, P.line, .6));
    D.build72Dragons().forEach((d,k)=>{
      const c = (352.5 + k*5 + 2.5) % 360;
      push(brd(195,208,(352.5+k*5)%360, P.line, .25));
      push(rt(201.5, c, d.type==='jiazi'? d.s : '空', {fs:6, fill: d.type==='jiazi'?P.dim:P.faint, fam:F.cjk, op:.85}));
    });

    // ── 11. 天盤24山 縫針 (208-220, offset -7.5°) ──
    push(ring(220, P.line, .6));
    D.MOUNTAINS_24.forEach((m,i)=>{
      const c = (345 + i*15 - 7.5) % 360;
      push(rt(214, c, m.c, {fs:9, fw:600, fill:P.dim, fam:F.cjk, op:.9}));
    });

    // ── 12. 地盤24山 正針 หลัก (220-244) ──
    if (S.mtnBg) push(S.mtnBg(220,244,P));
    push(ring(244, P.gold, 1.1));
    // 三元龍 overlay: จุดสี 3 元 ที่ขอบใน
    const YUAN = [P.el['水'], P.el['火'], P.el['土']]; // 地/天/人 元 · สีต่างเพื่อแยก
    D.MOUNTAINS_24.forEach((m,i)=>{
      const c = (345 + i*15) % 360, strong = (i%3===0);
      push(brd(220,244,c-7.5, strong?P.gold:P.line, strong?.9:.4));
      push(rt(232, c, m.c, {fs:16, fw:900, fill: m.t==='卦'? P.goldBright : EC[m.el], fam:F.cjk, effect:S.mtnEffect}));
      // 三元 marker
      push(`<circle cx="${polar(223,c)[0].toFixed(1)}" cy="${polar(223,c)[1].toFixed(1)}" r="1.6" fill="${YUAN[i%3]}"/>`);
    });

    // ── 13. 人盤24山 中針 (244-256, offset +7.5°) ──
    push(ring(256, P.line, .6));
    D.MOUNTAINS_24.forEach((m,i)=>{
      const c = (345 + i*15 + 7.5) % 360;
      push(rt(250, c, m.c, {fs:9, fw:600, fill:P.dim, fam:F.cjk, op:.9}));
    });

    // ── 14. 山編碼 codes (256-270) ──
    push(ring(270, P.line, .6));
    D.MOUNTAINS_24.forEach((m,i)=>{
      const c = (345 + i*15) % 360;
      const code = (DIR_ABBR[m.grp]||'?') + (i%3 + 1);
      push(rt(263, c, code, {fs:6.5, fill:P.faint, fam:F.mono}));
    });

    // ── 15. 周天度 (270-282) ──
    push(ring(282, P.gold, 1) + ring(270, P.line, .5));
    for (let d=0; d<360; d+=3){
      const major = d%15===0;
      push(brd(major?272:276, 280, d, major?P.gold:P.line, major?.9:.35));
    }
    for (let d=0; d<360; d+=30) push(rt(276, d, String(d), {fs:6.5, fill:P.faint, fam:F.mono, flip:true}));

    // ── 16. 120分金 (282-294) ──
    push(ring(294, P.line, .6));
    for (let k=0; k<120; k++){
      const c = k*3 + 1.5;
      push(brd(282,294, k*3, P.line, .22));
      push(rt(288, c, D.FENJIN_LABELS[k%5], {fs:5, fill:P.faint, fam:F.cjk}));
    }

    // ── 17. 24節氣 (294-308) ──
    push(ring(308, P.line, .6));
    D.SOLAR_TERMS.forEach((s,i)=>{
      const c = i*15;
      push(brd(294,308,c-7.5, P.line, .3));
      push(rt(301, c, s, {fs:8.5, fill:P.dim, fam:F.cjk}));
    });

    // ── 18. 64卦五行 (308-320) ──
    push(ring(320, P.line, .6));
    const wH = 360/64;
    D.HEXAGRAMS_64.forEach((h,i)=>{
      const c = i*wH + wH/2, el = D.hexElement(i);
      push(rt(314, c, el, {fs:5.6, fill: EC[el]||P.dim, fam:F.cjk, op:.9}));
    });

    // ── 19. 64卦 (320-336) ──
    push(ring(336, P.line, .6));
    D.HEXAGRAMS_64.forEach((h,i)=>{
      const c = i*wH + wH/2;
      push(brd(320,336, i*wH, P.line, .22));
      push(rt(328, c, h, {fs:6.6, fill:P.dim, fam:F.cjk, op:.9}));
    });

    // ── 20. 卦運 (336-350) ──
    push(ring(350, P.line, .6));
    D.HEXAGRAMS_64.forEach((h,i)=>{
      const c = i*wH + wH/2, v = D.hexPeriod(i);
      push(rt(343, c, v, {fs:6.5, fill:P.faint, fam:F.mono}));
    });

    // ── 21. 384爻 (350-366) · เส้นข่วย 6 ต่อกว้า ──
    push(ring(366, P.line, .6));
    for (let i=0; i<384; i++){
      const c = i*(360/384) + (360/768);
      const hexIdx = Math.floor(i/6), yao = i%6;
      const lines6 = D.hexLines6(hexIdx);
      const yang = lines6[yao];
      const [mx,my] = polar(358, c);
      const ang = c*Math.PI/180, w=4.5, dx=Math.cos(ang+Math.PI/2)*w, dy=Math.sin(ang+Math.PI/2)*w;
      if (yang) push(`<line x1="${(mx-dx).toFixed(1)}" y1="${(my-dy).toFixed(1)}" x2="${(mx+dx).toFixed(1)}" y2="${(my+dy).toFixed(1)}" stroke="${P.dim}" stroke-width="1.2"/>`);
      else push(`<line x1="${(mx-dx).toFixed(1)}" y1="${(my-dy).toFixed(1)}" x2="${(mx-dx*.3).toFixed(1)}" y2="${(my-dy*.3).toFixed(1)}" stroke="${P.dim}" stroke-width="1.2"/>`
              + `<line x1="${(mx+dx*.3).toFixed(1)}" y1="${(my+dy*.3).toFixed(1)}" x2="${(mx+dx).toFixed(1)}" y2="${(my+dy).toFixed(1)}" stroke="${P.dim}" stroke-width="1.2"/>`);
    }

    // ── 22. 28宿 (366-378) ──
    push(ring(378, P.gold, 1.1));
    const wM = 360/28;
    D.MANSIONS_28.forEach((m,i)=>{
      const c = i*wM + wM/2;
      push(brd(366,378, i*wM, P.line, .3));
      push(rt(372, c, m.c, {fs:8, fw:600, fill:P.dim, fam:F.cjk}));
    });

    // ── เส้นแกน 8 ทิศ (ถ้าสไตล์เปิด) ──
    if (S.axis){
      for (let d=0; d<360; d+=45) push(brd(60, 378, d, P.gold, d%90===0?.9:.5) .replace('/>',' opacity=".32"/>'));
    }

    // ── เข็มหันหน้า (ชาด) ──
    const fl = S.facingLabel || 'FACING';
    push(`<line x1="${CX}" y1="${CY-50}" x2="${CX}" y2="${CY-372}" stroke="${P.verm}" stroke-width="1.5" opacity=".9" ${S.needleEffect||''}/>`);
    push(`<path d="M ${CX} ${CY-382} l -5 12 l 10 0 Z" fill="${P.verm}"/>`);
    push(`<text x="${CX}" y="${CY-388}" text-anchor="middle" font-family="${F.mono}" font-size="9.5" letter-spacing=".26em" fill="${P.verm}">${fl}</text>`);

    const defs = S.defs ? S.defs(P) : '';
    return `<svg id="dial" viewBox="0 0 ${VB} ${VB}" role="img" aria-label="Luopan 22 rings">${defs}${g.join('')}</svg>`;
  }

  global.renderLuopan22 = renderLuopan22;
  global.LP_HELP = { polar, ring, bandFill, brd, rt, trigramBars, CX, CY, VB };
})(window);
