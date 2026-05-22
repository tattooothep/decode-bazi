/*
 * hourkey profile sync
 * Keeps static HTML pages on the same logged-in self profile across devices.
 */
(function () {
  if (window.__hkProfileSyncLoaded) return;
  window.__hkProfileSyncLoaded = true;

  function splitDt(iso) {
    var m = String(iso || '').match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
    return m ? { date: m[1], time: m[2] } : { date: '', time: '' };
  }

  function pickProfile(payload) {
    var list = (payload && payload.profiles || []).filter(function (p) { return !p.is_archived; });
    if (!list.length) return null;
    if (payload && payload.active_profile && payload.active_profile.id) {
      var active = list.find(function (p) { return p.id === payload.active_profile.id; });
      if (active) return active;
    }
    var self = list.find(function (p) { return !!p.is_self; });
    return self || list[0];
  }

  function writeProfile(p) {
    if (!p || !p.id) return p;
    var dt = splitDt(p.birth_datetime);
    var ys = p.yongshen || {};
    var top3 = Array.isArray(ys) ? ys : (Array.isArray(ys.top3) ? ys.top3 : []);
    try {
      localStorage.setItem('hk_profile_id', p.id);
      if (p.name) localStorage.setItem('hk_profile_name', p.name);
      if (top3.length) localStorage.setItem('hk_user_yongshen', JSON.stringify(top3.slice(0, 3)));
      if (dt.date) {
        var birthTimeKnown = p.birthTimeKnown !== false && p.birth_time_known !== false;
        localStorage.setItem('hk_birth', JSON.stringify({
          name: p.name || '',
          date: dt.date,
          time: dt.time || '12:00',
          place: p.birth_location_name || 'Bangkok',
          longitude: p.birth_lng != null ? Number(p.birth_lng) : 100.5018,
          lng: p.birth_lng != null ? Number(p.birth_lng) : 100.5018,
          latitude: p.birth_lat != null ? Number(p.birth_lat) : 13.7563,
          gender: p.gender === 'female' || p.gender === 'F' ? 'F' : 'M',
          profileId: p.id,
          birthTimeKnown: birthTimeKnown,
          source: 'db-sync'
        }));
      }
    } catch (_) {}
    return p;
  }

  window.__hkPickActiveProfile = pickProfile;
  window.__hkWriteActiveProfile = writeProfile;
  window.__hkProfileReady = fetch('/api/profile', {
    credentials: 'include',
    cache: 'no-store'
  })
    .then(function (r) {
      if (!r.ok) return null;
      return r.json();
    })
    .then(function (payload) {
      return writeProfile(pickProfile(payload));
    })
    .catch(function () { return null; });
})();
