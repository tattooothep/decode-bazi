/**
 * hk-settings-drawer.js · กล่องตั้งค่า slide-in
 * - ดึงดวงตัวเอง (active profile) จาก /api/profile
 * - แก้: name, birth_datetime (date+time), location, gender
 * - แสดง TST (true solar time) อัตโนมัติ
 * - บันทึก PUT /api/profile/[id]
 *
 * ใช้ผ่าน window.HK_openSettings()
 */
(function(){
  if (window.HK_settingsLoaded) return;
  window.HK_settingsLoaded = true;

  // styles
  var style = document.createElement('style');
  style.textContent = `
    .hk-set-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);opacity:0;transition:opacity .25s;}
    .hk-set-overlay.on{opacity:1;}
    .hk-set-drawer{position:fixed;top:0;right:-460px;width:440px;max-width:92vw;height:100vh;z-index:9999;background:var(--bg,#0d0f12);color:var(--fg,#f6f1e6);border-left:1px solid rgba(200,164,77,.3);box-shadow:-12px 0 30px rgba(0,0,0,.4);transition:right .3s;display:flex;flex-direction:column;font-family:var(--thai,'Noto Serif Thai',serif);}
    .hk-set-drawer.on{right:0;}
    .hk-set-head{display:flex;align-items:center;gap:10px;padding:18px 22px;border-bottom:1px solid rgba(200,164,77,.22);}
    .hk-set-head h3{font-family:var(--serif,'Cormorant Garamond',serif);font-size:22px;font-weight:600;letter-spacing:.02em;margin:0;flex:1;}
    .hk-set-close{background:transparent;border:0;color:inherit;font-size:24px;cursor:pointer;opacity:.7;}
    .hk-set-close:hover{opacity:1;}
    .hk-set-body{padding:20px 22px;overflow-y:auto;flex:1;}
    .hk-set-grp{margin-bottom:18px;}
    .hk-set-grp label{display:block;font-size:11px;letter-spacing:.06em;color:rgba(246,241,230,.55);margin-bottom:6px;text-transform:uppercase;}
    .hk-set-grp input, .hk-set-grp select{width:100%;padding:9px 11px;font-size:14px;background:rgba(38,42,50,.55);border:1px solid rgba(246,241,230,.10);color:inherit;outline:none;font-family:inherit;}
    .hk-set-grp input:focus{border-color:rgba(200,164,77,.55);}
    body.light .hk-set-drawer{background:#f6f1e6;color:#1a1d24;}
    body.light .hk-set-grp input,body.light .hk-set-grp select{background:rgba(255,253,247,.7);border-color:rgba(26,29,36,.15);}
    .hk-set-row3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
    .hk-set-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
    .hk-set-tst{margin-top:6px;padding:11px 13px;border:1px solid rgba(200,164,77,.28);background:rgba(200,164,77,.08);font-family:var(--mono,'JetBrains Mono',monospace);font-size:11px;line-height:1.7;}
    .hk-set-tst b{color:var(--gold,#c8a44d);}
    .hk-set-save{width:100%;padding:11px;background:var(--gold,#c8a44d);color:#0d0f12;border:0;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;letter-spacing:.04em;}
    .hk-set-save:hover{opacity:.92;}
    .hk-set-save:disabled{opacity:.4;cursor:wait;}
    .hk-set-toast{position:fixed;bottom:24px;right:24px;padding:12px 18px;border:1px solid;z-index:10000;font-size:13px;font-family:inherit;}
    .hk-set-toast.ok{background:rgba(125,211,123,.15);border-color:rgba(125,211,123,.5);color:rgba(125,211,123,1);}
    .hk-set-toast.err{background:rgba(226,107,93,.15);border-color:rgba(226,107,93,.5);color:rgba(226,107,93,1);}
    .hk-set-loading{padding:40px;text-align:center;color:rgba(246,241,230,.55);}
    /* iOS Safari: ≥16px กัน zoom-on-focus · เฉพาะ city input */
    #set-city-input{font-size:16px !important;}
    .hk-set-loading-hint{margin-top:6px;font-size:11px;color:rgba(246,241,230,.45);letter-spacing:.04em;}
    body.light .hk-set-loading-hint{color:rgba(26,29,36,.55);}
    /* Codex: Google Places dropdown ต้องอยู่หน้า overlay/drawer (9998/9999) */
    .pac-container{z-index:10001 !important;}
  `;
  document.head.appendChild(style);

  // Codex G1: lazy-load Google Places · script โหลดเฉพาะตอนเปิด drawer ครั้งแรก
  function ensurePlacesScript() {
    return new Promise(function(resolve, reject){
      if (window.google && window.google.maps && window.google.maps.places) return resolve();
      if (window.__hkPlacesLoading) {
        window.__hkPlacesLoading.then(resolve, reject);
        return;
      }
      window.__hkPlacesLoading = new Promise(function(res, rej){
        var done = false;
        function fail(msg){
          if (done) return; done = true;
          clearTimeout(to);
          try { delete window.__hkInitDrawerPlaces; } catch(_){}
          /* Codex: เคลียร์เพื่อให้ retry ครั้งต่อไปได้ · กัน promise rejected poison */
          try { delete window.__hkPlacesLoading; } catch(_){}
          rej(new Error(msg));
        }
        var to = setTimeout(function(){ fail('places script timeout'); }, 8000);
        window.__hkInitDrawerPlaces = function(){
          if (done) return; done = true;
          clearTimeout(to);
          try { delete window.__hkInitDrawerPlaces; } catch(_){}
          res();
        };
        var s = document.createElement('script');
        s.async = true;
        s.src = '/api/maps-script?callback=__hkInitDrawerPlaces';
        s.onerror = function(){ fail('places script load error'); };
        document.head.appendChild(s);
      });
      window.__hkPlacesLoading.then(resolve, reject);
    });
  }
  /* Expose สำหรับ /yongsennetwork · person modal ใช้ร่วมกัน */
  window.HK_ensurePlacesScript = ensurePlacesScript;

  // Compute TST shift (longitude + EOT approx)
  function computeTST(lng, date) {
    var LNG_REF = 105; // Asia/Bangkok standard meridian · UTC+7 × 15°
    var longitudeShiftMin = (lng - LNG_REF) * 4;
    // Equation of Time approximation (radians)
    var n = (function(d){
      var start = new Date(d.getFullYear(),0,0);
      var diff = (d - start) + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000);
      return Math.floor(diff / (1000*60*60*24));
    })(date);
    var B = (2 * Math.PI * (n - 81)) / 365;
    var eotMin = 9.87 * Math.sin(2*B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    var totalMin = longitudeShiftMin + eotMin;
    return {
      longitudeShift: Math.round(longitudeShiftMin * 10)/10,
      eot: Math.round(eotMin * 10)/10,
      total: Math.round(totalMin * 10)/10,
    };
  }

  // Open drawer · ป้องกันเปิดซ้อน
  window.HK_openSettings = async function() {
    /* 🛡 กันเปิด drawer ซ้อน · ถ้ามีอยู่แล้วให้ return ทันที */
    if (document.querySelector('.hk-set-drawer')) {
      console.warn('[hk-settings] drawer already open · skip duplicate');
      return;
    }
    // Build drawer
    var overlay = document.createElement('div');
    overlay.className = 'hk-set-overlay';
    var drawer = document.createElement('aside');
    drawer.className = 'hk-set-drawer';
    drawer.innerHTML = `
      <div class="hk-set-head">
        <h3>⚙ ตั้งค่าดวงของฉัน</h3>
        <button class="hk-set-close" id="hk-set-close" aria-label="ปิด">✕</button>
      </div>
      <div class="hk-set-body" id="hk-set-body">
        <div class="hk-set-loading">กำลังโหลด…</div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    setTimeout(function(){ overlay.classList.add('on'); drawer.classList.add('on'); }, 10);

    function close() {
      overlay.classList.remove('on');
      drawer.classList.remove('on');
      setTimeout(function(){ overlay.remove(); drawer.remove(); }, 280);
    }
    overlay.addEventListener('click', close);
    drawer.querySelector('#hk-set-close').addEventListener('click', close);

    // Fetch active profile
    var profile = null;
    try {
      var pr = await fetch('/api/profile');
      var pj = await pr.json();
      var arr = (pj.profiles || []).filter(function(p){ return !p.is_archived; });
      // Find: prefer hk_profile_id, else first
      var activeId = null;
      try { activeId = localStorage.getItem('hk_profile_id'); } catch(e){}
      profile = arr.find(function(p){ return p.id === activeId; }) || arr[0] || null;
    } catch(e) { console.warn('settings load', e); }

    var body = drawer.querySelector('#hk-set-body');
    if (!profile) {
      body.innerHTML = '<div class="hk-set-loading">ยังไม่มีดวงในระบบ · <a href="/input" style="color:var(--gold);text-decoration:underline">เพิ่มดวงแรก</a></div>';
      return;
    }

    var dt = new Date(profile.birth_datetime);
    // Use original Asia/Bangkok components
    var year = dt.getUTCFullYear();
    var month = dt.getUTCMonth() + 1;
    var day = dt.getUTCDate();
    var hour = (dt.getUTCHours() + 7) % 24;
    var minute = dt.getUTCMinutes();
    var initialLat = profile.birth_lat != null ? Number(profile.birth_lat) : 13.7563;
    var initialLng = profile.birth_lng != null ? Number(profile.birth_lng) : 100.5018;
    var initialLoc = profile.birth_location_name || 'Bangkok';

    body.innerHTML = `
      <div class="hk-set-grp">
        <label>ชื่อ / Profile name</label>
        <input id="set-name" type="text" value="${escapeHtml(profile.name || '')}">
      </div>
      <div class="hk-set-grp">
        <label>วันเกิด · DD / MM / YYYY</label>
        <div class="hk-set-row3">
          <input id="set-d" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${day}" placeholder="วัน" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="hk_d_${Date.now()}" data-lpignore="true" data-1p-ignore="true">
          <input id="set-m" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${month}" placeholder="เดือน" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="hk_m_${Date.now()}" data-lpignore="true" data-1p-ignore="true">
          <input id="set-y" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${year}" placeholder="ปี" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="hk_y_${Date.now()}" data-lpignore="true" data-1p-ignore="true">
        </div>
      </div>
      <div class="hk-set-grp">
        <label>เวลา · HH : MM</label>
        <div class="hk-set-row2">
          <input id="set-hh" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${hour}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="hk_hh_${Date.now()}" data-lpignore="true" data-1p-ignore="true">
          <input id="set-mn" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${minute}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="hk_mn_${Date.now()}" data-lpignore="true" data-1p-ignore="true">
        </div>
        <!-- 19 พ.ค. Option α · ไม่ทราบเวลาเกิด · 3-pillar mode -->
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;cursor:pointer;">
          <input type="checkbox" id="set-no-btime" ${profile.birth_time_known === false ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer;"/>
          <span>ไม่ทราบเวลาเกิด · 3 เสา (no Hour) · 不知時辰</span>
        </label>
      </div>
      <div class="hk-set-grp">
        <label>จังหวัด / เมือง</label>
        <input id="set-city-input" type="text"
               value="${escapeHtml(initialLoc)}"
               placeholder="พิมพ์ชื่อเมือง · เช่น Bangkok, Tokyo, London"
               autocomplete="off">
        <input type="hidden" id="set-lat"      value="${initialLat.toFixed(4)}">
        <input type="hidden" id="set-lng"      value="${initialLng.toFixed(4)}">
        <input type="hidden" id="set-loc-name" value="${escapeHtml(initialLoc)}">
        <div class="hk-set-loading-hint" id="set-city-hint" style="display:none">กำลังโหลด Google Places…</div>
      </div>
      <div class="hk-set-grp">
        <label>เพศ</label>
        <select id="set-gender">
          <option value="">— ไม่ระบุ —</option>
          <option value="male" ${profile.gender==='male'?'selected':''}>ชาย</option>
          <option value="female" ${profile.gender==='female'?'selected':''}>หญิง</option>
        </select>
      </div>
      <div class="hk-set-grp">
        <label>True Solar Time · เวลาสุริยคติจริง</label>
        <div class="hk-set-tst" id="set-tst">กำลังคำนวณ…</div>
      </div>
      <div class="hk-set-grp">
        <label>ขอบเขตวันเปลี่ยน · Day Boundary</label>
        <select id="set-day-boundary">
          <option value="23:00">23:00 · ตำราคลาสสิก (早子時)</option>
          <option value="00:00">00:00 · สากล (Voytek/晚子時)</option>
        </select>
        <div class="hk-set-loading-hint" id="set-day-boundary-hint">มีผลกับคนที่เกิดช่วง 23:00-23:59 เท่านั้น</div>
      </div>
      <button class="hk-set-save" id="set-save">💾 บันทึก</button>
    `;
    /* restore from localStorage */
    try {
      var savedBoundary = localStorage.getItem('hk_day_boundary');
      if (savedBoundary === '00:00') document.getElementById('set-day-boundary').value = '00:00';
    } catch(_){}

    function normalizeYearCE(raw) {
      var y = parseInt(String(raw || '').trim(), 10);
      if (!isFinite(y)) return NaN;
      // รับปี พ.ศ. ที่ผู้ใช้กรอก แล้วแปลงเป็น ค.ศ. อัตโนมัติ
      if (y >= 2400 && y <= 2600) y -= 543;
      return y;
    }
    function recalcTST() {
      var y = normalizeYearCE(document.getElementById('set-y').value);
      var m = +document.getElementById('set-m').value;
      var d = +document.getElementById('set-d').value;
      var hh = +document.getElementById('set-hh').value;
      var mn = +document.getElementById('set-mn').value;
      var lng = +document.getElementById('set-lng').value;
      if (!isFinite(y)) return;
      var date = new Date(Date.UTC(y, m-1, d, hh-7, mn));
      var t = computeTST(lng, date);
      var trueMinutes = hh*60 + mn + t.total;
      var tH = Math.floor(((trueMinutes % 1440 + 1440) % 1440) / 60);
      var tM = Math.round(((trueMinutes % 1440 + 1440) % 1440) % 60);
      document.getElementById('set-tst').innerHTML =
        'Longitude shift: <b>'+t.longitudeShift+'</b> นาที<br>'+
        'Equation of Time: <b>'+t.eot+'</b> นาที<br>'+
        'รวมแก้: <b>'+t.total+'</b> นาที<br>'+
        'เวลาจริงคำนวณ: <b>'+pad(tH)+':'+pad(tM)+'</b>';
    }
    function pad(n){ return n<10?'0'+n:n; }
    ['set-y','set-m','set-d','set-hh','set-mn'].forEach(function(id){
      var el = document.getElementById(id);
      el.addEventListener('input', recalcTST);
      /* 🛡 focus → select all · ป้องกัน maxlength ตัดท้าย เมื่อพิมพ์ทับ */
      el.addEventListener('focus', function(){ this.select(); });
      el.addEventListener('click', function(){ this.select(); });
    });
    document.getElementById('set-y').addEventListener('blur', function(){
      var y = normalizeYearCE(this.value);
      if (isFinite(y)) this.value = String(y);
      recalcTST();
    });
    recalcTST();

    // Codex G1: lazy autocomplete · onerror/timeout safe · normalize input on pick
    var placesReady = false;
    var placesFailed = false;
    (async function wireCityAutocomplete(){
      var inp = document.getElementById('set-city-input');
      var hint = document.getElementById('set-city-hint');
      if (!inp) return;
      hint.style.display = 'block';
      try {
        await ensurePlacesScript();
        hint.style.display = 'none';
        placesReady = true;
        var ac = new google.maps.places.Autocomplete(inp, {
          types: ['(cities)'],
          fields: ['name','geometry','formatted_address','place_id'],
        });
        ac.addListener('place_changed', function(){
          var p = ac.getPlace();
          if (!p.geometry || !p.geometry.location) return;
          var chosen = p.name || p.formatted_address || inp.value;
          inp.value = chosen; // normalize for guard comparison
          document.getElementById('set-lat').value      = p.geometry.location.lat().toFixed(4);
          document.getElementById('set-lng').value      = p.geometry.location.lng().toFixed(4);
          document.getElementById('set-loc-name').value = chosen;
          recalcTST();
        });
      } catch(e) {
        placesFailed = true;
        hint.textContent = 'โหลด Google Places ไม่สำเร็จ · เก็บที่อยู่เดิม';
        hint.style.color = 'rgba(226,107,93,.85)';
      }
    })();

    document.getElementById('set-save').addEventListener('click', async function(){
      var btn = this;
      // Codex G1.6: typed-without-pick guard · block while loading too
      // ปลอดภัยเฉพาะกรณี placesFailed · ไม่งั้น mismatch = abort
      var inp = document.getElementById('set-city-input');
      var locHidden = document.getElementById('set-loc-name');
      if (!placesFailed && inp.value.trim() !== (locHidden.value || '').trim()) {
        toast('กรุณาเลือกเมืองจากรายการที่ขึ้นมา', 'err');
        return;
      }
      btn.disabled = true;
      btn.textContent = '⏳ กำลังบันทึก…';
      /* Persist day boundary toggle · localStorage only (per browser) */
      try {
        var sb = document.getElementById('set-day-boundary').value;
        localStorage.setItem('hk_day_boundary', sb === '00:00' ? '00:00' : '23:00');
      } catch(_){}
      var y = normalizeYearCE(document.getElementById('set-y').value);
      if (isFinite(y)) document.getElementById('set-y').value = String(y);
      var m = pad(+document.getElementById('set-m').value);
      var d = pad(+document.getElementById('set-d').value);
      var hh = pad(+document.getElementById('set-hh').value);
      var mn = pad(+document.getElementById('set-mn').value);
      if (!isFinite(y) || y < 1900 || y > 2100) {
        toast('ปีเกิดไม่ถูกต้อง', 'err');
        btn.disabled = false;
        btn.textContent = '💾 บันทึก';
        return;
      }
      /* 19 พ.ค. Option α · ไม่ทราบเวลาเกิด → birthTimeKnown=false */
      var noBtimeEl = document.getElementById('set-no-btime');
      var birthTimeKnown = !(noBtimeEl && noBtimeEl.checked);
      var payload = {
        name: document.getElementById('set-name').value.trim(),
        birthDate: String(y) + '-' + m + '-' + d,
        birthTime: hh + ':' + mn,
        birthLng: Number(document.getElementById('set-lng').value),
        birthLat: Number(document.getElementById('set-lat').value),
        locationName: document.getElementById('set-loc-name').value,
        gender: document.getElementById('set-gender').value || null,
        birthTimeKnown: birthTimeKnown,
      };
      try {
        var r = await fetch('/api/profile/' + profile.id, {
          method: 'PUT', headers: {'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        });
        var j = await r.json();
        if (j.ok) {
          toast('✓ บันทึกแล้ว · ระบบคำนวณดวงใหม่อัตโนมัติ', 'ok');
          setTimeout(function(){ close(); setTimeout(function(){ location.reload(); }, 200); }, 800);
        } else {
          toast('✗ ' + (j.error || 'ผิดพลาด'), 'err');
        }
      } catch(e) {
        toast('✗ network error', 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = '💾 บันทึก';
      }
    });
  };

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'hk-set-toast ' + (kind || 'ok');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3000);
  }
})();
