/* hourkey · 64 卦 deep popup · shared component · 17 พ.ค. 2026
 * ใช้ทุกหน้าที่อ้างถึง 64 卦 · /chart §12 + /datepick + /forecast
 * API: GET /api/akg/hex-deep?hex=N&line=L → คืนตำราจากอากง v3
 */
(function(){
  if (window.showHexDeep) return; // already loaded
  async function showHexDeep(hexNum, lineNum){
    let popup = document.getElementById('hex-popup');
    if (popup) popup.remove();
    popup = document.createElement('div');
    popup.id = 'hex-popup';
    popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:var(--th,"Noto Serif Thai",serif);';
    popup.innerHTML = '<div style="background:var(--bg-2,#13131a);border:1px solid var(--gold,#c8a44d);border-radius:14px;padding:24px;max-width:600px;max-height:85vh;overflow-y:auto;color:var(--fg,#f3ebd9);"><div style="text-align:center;color:var(--fg-soft,#c2b694)">⏳ โหลดตำรา...</div></div>';
    popup.onclick = (e) => { if (e.target === popup) popup.remove(); };
    document.body.appendChild(popup);
    try {
      const r = await fetch('/api/akg/hex-deep?hex='+hexNum+'&line='+lineNum);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'fail');
      const deep = d.deep || {};
      const yao = d.yao_line || {};
      const inner = popup.querySelector('div');
      inner.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:14px;">
          <div>
            <div style="font-family:'Noto Serif TC',serif;font-size:42px;color:var(--gold,#c8a44d);font-weight:600;line-height:1;">${d.hex} ${d.name}</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--fg-faint,#7a7160);letter-spacing:.15em;margin-top:4px;">HEX ${d.hex} · LINE ${d.line||'-'}</div>
          </div>
          <button onclick="document.getElementById('hex-popup').remove()" style="background:none;border:1px solid var(--gold-line,rgba(200,164,77,.28));color:var(--gold,#c8a44d);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:14px;">✕</button>
        </div>
        ${deep.core_lesson ? `<div style="background:rgba(200,164,77,.06);border-left:3px solid var(--gold,#c8a44d);padding:10px 14px;margin-bottom:12px;font-size:14px;line-height:1.7;"><b style="color:var(--gold,#c8a44d);">📖 บทเรียนหลัก:</b><br/>${deep.core_lesson}</div>` : ''}
        ${deep.situation_thai ? `<div style="margin-bottom:12px;font-size:13px;color:var(--fg-soft,#c2b694);line-height:1.7;"><b style="color:var(--gold,#c8a44d);">🎯 สถานการณ์:</b> ${deep.situation_thai}</div>` : ''}
        ${deep.symbol_imagery ? `<div style="margin-bottom:12px;font-size:13px;color:var(--gold,#c8a44d);font-style:italic;">✨ ${deep.symbol_imagery}</div>` : ''}
        ${yao && yao.text_zh ? `
          <div style="background:rgba(200,164,77,.08);border:1px solid var(--gold-line,rgba(200,164,77,.28));border-radius:10px;padding:14px;margin-bottom:12px;">
            <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--gold,#c8a44d);letter-spacing:.15em;margin-bottom:6px;">📜 爻辭 · เส้นที่ ${d.line} · ${yao.name_zh||''}</div>
            <div style="font-family:'Noto Serif TC',serif;font-size:18px;color:var(--gold,#c8a44d);margin-bottom:8px;letter-spacing:1.5px;">${yao.text_zh}</div>
            ${yao.translation_thai ? `<div style="font-size:14px;color:var(--fg,#f3ebd9);margin-bottom:6px;">📜 ${yao.translation_thai}</div>` : ''}
            ${yao.meaning ? `<div style="font-size:13px;color:var(--fg-soft,#c2b694);margin-bottom:6px;">💡 ${yao.meaning}</div>` : ''}
            ${yao.advice ? `<div style="font-size:13px;color:#7dd37b;"><b>คำแนะนำ:</b> ${yao.advice}</div>` : ''}
          </div>` : ''}
        ${deep.positive_side?.length ? `<div style="margin-bottom:10px;font-size:12px;"><b style="color:#7dd37b">✓ ด้านดี:</b><ul style="margin:4px 0 0 18px;color:var(--fg-soft,#c2b694);">${deep.positive_side.slice(0,3).map(x=>'<li>'+x+'</li>').join('')}</ul></div>` : ''}
        ${deep.negative_side?.length ? `<div style="margin-bottom:10px;font-size:12px;"><b style="color:#e26b5d">⚠ ด้านเสีย:</b><ul style="margin:4px 0 0 18px;color:var(--fg-soft,#c2b694);">${deep.negative_side.slice(0,3).map(x=>'<li>'+x+'</li>').join('')}</ul></div>` : ''}
        ${deep.action_avoid?.length ? `<div style="margin-bottom:10px;font-size:12px;"><b style="color:#e26b5d">✗ ห้าม:</b><ul style="margin:4px 0 0 18px;color:var(--fg-soft,#c2b694);">${deep.action_avoid.slice(0,3).map(x=>'<li>'+x+'</li>').join('')}</ul></div>` : ''}
        ${deep.timing ? `<div style="font-size:11px;color:var(--fg-soft,#c2b694);background:var(--bg-3,#1a1a23);padding:8px 12px;border-radius:6px;">⏰ <b>ดี:</b> ${deep.timing.best_time||'—'} · <b>เลี่ยง:</b> ${deep.timing.worst_time||'—'}</div>` : ''}
        <div style="margin-top:12px;font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--fg-faint,#7a7160);text-align:center;letter-spacing:.1em;">${d.source||''}</div>
      `;
    } catch (e) {
      popup.querySelector('div').innerHTML = '<div style="color:#e26b5d;padding:20px;">⚠ '+e.message+'</div>';
    }
  }
  window.showHexDeep = showHexDeep;
})();
