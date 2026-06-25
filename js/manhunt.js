import { supabase } from './supabase.js';
import { loadLeaderboard } from './submission.js';

// ── STATE ────────────────────────────────────────────
let map              = null;
let activeManhunt    = null;
let manhuntBoxLayer  = null;
let manhuntDraft     = null;
let locationWatchId  = null;
let seekerWatchId    = null;
let seekerLat        = null;
let seekerLng        = null;
let lastLocationSent = 0;
let expiryInterval   = null;
let countdownInterval = null;
let myLocationMarker = null;
const LOCATION_INTERVAL_MS = 5000;

const MANHUNT_RADIUS_METERS = { tiny: 20, small: 200, medium: 500, large: 1000 };

// ── INIT ─────────────────────────────────────────────
export function initManhunt(mapInstance) {
  map = mapInstance;
  window._getActiveManhunt = () => activeManhunt;

  document.getElementById('btn-manhunt-caught')
    ?.addEventListener('click', checkManhuntCaught);

  document.getElementById('manhunt-mobile-fab')
    ?.addEventListener('click', () => {
      const panel = document.getElementById('manhunt-panel');
      const isVisible = panel.style.display === 'block';
      if (!isVisible) updateManhuntPanelRole();
      panel.style.display = isVisible ? 'none' : 'block';
    });

  subscribeLobbyManhunt();
}

function isMobile() {
  return window.innerWidth <= 600;
}

function updateManhuntPanelRole() {
  if (!activeManhunt) return;
  const isHider = String(sessionStorage.getItem('geostickrs_hider_manhunt_id')) === String(activeManhunt.id);

  document.getElementById('btn-manhunt-caught').style.display = isHider ? 'none' : 'block';

  const note = document.getElementById('manhunt-hider-note');
  if (note) note.style.display = isHider ? 'block' : 'none';

  const targetEl     = document.getElementById('manhunt-target');
  const targetNameEl = document.getElementById('manhunt-target-name');
  if (targetEl && targetNameEl) {
    if (isHider) {
      targetEl.style.display = 'none';
    } else {
      targetNameEl.textContent = activeManhunt.hider_name;
      targetEl.style.display   = 'block';
    }
  }

  document.getElementById('manhunt-hint').textContent = isHider
    ? 'Keep moving — seekers are looking for you!'
    : 'Search inside the red area and press Caught!';
}

function showManhuntUI() {
  const panel = document.getElementById('manhunt-panel');
  const fab   = document.getElementById('manhunt-mobile-fab');
  updateManhuntPanelRole();
  if (isMobile()) {
    fab.style.display   = 'flex';
    panel.style.display = 'none';
  } else {
    fab.style.display   = 'none';
    panel.style.display = 'block';
  }
}

function hideManhuntUI() {
  document.getElementById('manhunt-panel').style.display        = 'none';
  document.getElementById('manhunt-mobile-fab').style.display   = 'none';
}

// ── BUTTON STATE ─────────────────────────────────────
export function updateManhuntButtons(state) {
  const create = document.getElementById('btn-manhunt-create');
  const start  = document.getElementById('btn-manhunt-start');
  const stop   = document.getElementById('btn-manhunt-stop');
  if (!create || !start || !stop) return;
  create.style.display = state === 'create' ? 'block' : 'none';
  start.style.display  = state === 'start'  ? 'block' : 'none';
  stop.style.display   = state === 'stop'   ? 'block' : 'none';
}

// ── CREATE DRAFT ─────────────────────────────────────
export function createManhuntDraft() {
  const radiusKey    = document.getElementById('manhunt-radius')?.value ?? 'medium';
  const durationMin  = Number(document.getElementById('manhunt-duration')?.value ?? 30);

  manhuntDraft = {
    radiusMeters:    MANHUNT_RADIUS_METERS[radiusKey] ?? 500,
    durationMinutes: durationMin,
  };

  updateManhuntButtons('start');
  alert(
    `✅ Move & Seek configured!\nRadius: ${manhuntDraft.radiusMeters} m — ` +
    `Duration: ${durationMin > 0 ? durationMin + ' min' : 'No limit'}\n\nPress Start when everyone is ready.`
  );
}

// ── START ────────────────────────────────────────────
export async function startManhunt() {
  if (!navigator.geolocation) { alert('GPS not available.'); return; }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
    const lat   = pos.coords.latitude;
    const lng   = pos.coords.longitude;

    const draft     = manhuntDraft ?? { radiusMeters: 500, durationMinutes: 30 };
    const radiusDeg = draft.radiusMeters / 111000;

    const box = {
      south: lat - radiusDeg, north: lat + radiusDeg,
      west:  lng - radiusDeg, east:  lng + radiusDeg,
    };

    const expiresAt = draft.durationMinutes > 0
      ? new Date(Date.now() + draft.durationMinutes * 60 * 1000).toISOString()
      : null;

    const { data: inserted, error } = await supabase.from('manhunts').insert([{
      lobby:       lobby.name,
      active:      true,
      hider_name:  lobby.username || 'Hider',
      hider_lat:   lat,
      hider_lng:   lng,
      box_geojson: box,
      expires_at:  expiresAt,
    }]).select().single();

    if (error) { console.error(error); alert('Failed to start Move & Seek.'); return; }

    manhuntDraft  = null;
    activeManhunt = inserted;
    sessionStorage.setItem('geostickrs_hider_manhunt_id', inserted.id);
    updateManhuntButtons('stop');
    showManhuntOnMap(inserted, true);
    startLocationTracking(inserted.id, draft.radiusMeters);
    subscribeToManhuntUpdates();
    startSeekerTracking();
    startExpiryTimer();
    startCountdown();
    alert('🏃 Move & Seek started. Your location is now being tracked live.');

  }, (err) => {
    console.error('GPS ERROR:', err);
    alert('GPS ERROR: ' + err.message);
  });
}

// ── LIVE LOCATION TRACKING (Hider) ───────────────────
function startLocationTracking(manhuntId, radiusMeters) {
  if (!navigator.geolocation) return;

  locationWatchId = navigator.geolocation.watchPosition((pos) => {
    const now = Date.now();
    if (now - lastLocationSent < LOCATION_INTERVAL_MS) return;
    lastLocationSent = now;

    const lat       = pos.coords.latitude;
    const lng       = pos.coords.longitude;
    const radiusDeg = radiusMeters / 111000;
    const box       = {
      south: lat - radiusDeg, north: lat + radiusDeg,
      west:  lng - radiusDeg, east:  lng + radiusDeg,
    };

    supabase.from('manhunts')
      .update({ hider_lat: lat, hider_lng: lng, box_geojson: box })
      .eq('id', manhuntId)
      .then(({ error }) => { if (error) console.error('Location update error:', error); });

    if (activeManhunt) {
      activeManhunt.hider_lat  = lat;
      activeManhunt.hider_lng  = lng;
      activeManhunt.box_geojson = box;
    }
  }, (err) => console.error('GPS watch error:', err), {
    enableHighAccuracy: true,
    maximumAge:         0,
  });
}

// ── COUNTDOWN DISPLAY ────────────────────────────────
function startCountdown() {
  stopCountdown();
  const el = document.getElementById('manhunt-timer');
  if (!el) return;

  function tick() {
    if (!activeManhunt?.expires_at) {
      el.textContent = '∞ No time limit';
      const fab = document.getElementById('manhunt-fab-timer');
      if (fab) fab.textContent = '∞';
      return;
    }
    const remaining = new Date(activeManhunt.expires_at) - new Date();
    if (remaining <= 0) {
      el.textContent = '⏰ Time up!';
      const fab = document.getElementById('manhunt-fab-timer');
      if (fab) fab.textContent = '⏰';
      stopCountdown();
      return;
    }
    const totalSec = Math.floor(remaining / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const timeStr = h > 0
      ? `⏱ ${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `⏱ ${m}:${String(s).padStart(2,'0')}`;
    el.textContent = timeStr;
    const fab = document.getElementById('manhunt-fab-timer');
    if (fab) fab.textContent = h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${m}:${String(s).padStart(2,'0')}`;
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

function stopCountdown() {
  if (countdownInterval !== null) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  const el = document.getElementById('manhunt-timer');
  if (el) el.textContent = '';
}

// ── EXPIRY TIMER ─────────────────────────────────────
function startExpiryTimer() {
  stopExpiryTimer();
  if (!activeManhunt?.expires_at) return;

  expiryInterval = setInterval(() => {
    if (!activeManhunt?.expires_at) return;
    if (new Date(activeManhunt.expires_at) <= new Date()) {
      stopExpiryTimer();
      alert('⏰ Move & Seek time is up! Hunt ended automatically.');
      endManhunt();
    }
  }, 10000); // check every 10 seconds
}

function stopExpiryTimer() {
  if (expiryInterval !== null) {
    clearInterval(expiryInterval);
    expiryInterval = null;
  }
}

// ── DISTANCE DISPLAY ─────────────────────────────────
function updateDistanceDisplay() {
  if (seekerLat === null || !activeManhunt?.hider_lat) return;
  const dist = map.distance(
    [seekerLat, seekerLng],
    [activeManhunt.hider_lat, activeManhunt.hider_lng]
  );
  const el = document.getElementById('manhunt-distance');
  if (!el) return;
  const label = dist < 1000
    ? `📍 ~${Math.round(dist)} m from the hider`
    : `📍 ~${(dist / 1000).toFixed(1)} km from the hider`;
  el.textContent = label;
}

// ── SEEKER LIVE POSITION ──────────────────────────────
function startSeekerTracking() {
  if (!navigator.geolocation) return;
  seekerWatchId = navigator.geolocation.watchPosition((pos) => {
    seekerLat = pos.coords.latitude;
    seekerLng = pos.coords.longitude;
    updateDistanceDisplay();
    updateMyLocationMarker(seekerLat, seekerLng);
  }, (err) => console.error('Seeker GPS error:', err), {
    enableHighAccuracy: true,
    maximumAge: 5000,
  });
}

function updateMyLocationMarker(lat, lng) {
  if (!map) return;
  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;border-radius:50%;
      background:#3b82f6;border:3px solid #fff;
      box-shadow:0 0 0 3px rgba(59,130,246,0.35);
    "></div>`,
    iconSize: [16,16], iconAnchor: [8,8],
  });
  if (myLocationMarker) {
    myLocationMarker.setLatLng([lat, lng]);
  } else {
    myLocationMarker = L.marker([lat, lng], { icon, zIndexOffset: 500 }).addTo(map);
    myLocationMarker.bindTooltip('You', { permanent: false, direction: 'top' });
  }
}

function removeMyLocationMarker() {
  if (myLocationMarker && map) {
    map.removeLayer(myLocationMarker);
    myLocationMarker = null;
  }
}

// ── REALTIME SUBSCRIPTION (Seekers) ──────────────────
function subscribeToManhuntUpdates() {
  if (!activeManhunt) return;

  supabase
    .channel('manhunt-live-' + activeManhunt.id)
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'manhunts',
      filter: `id=eq.${activeManhunt.id}`,
    }, payload => {
      const updated = payload.new;
      if (!updated.active) {
        if (manhuntBoxLayer && map.hasLayer(manhuntBoxLayer)) map.removeLayer(manhuntBoxLayer);
        hideManhuntUI();
        document.getElementById('manhunt-distance').textContent = '';
        stopSeekerTracking();
        activeManhunt = null;
        updateManhuntButtons('create');
        return;
      }
      activeManhunt = { ...activeManhunt, ...updated };
      showManhuntOnMap(updated, false);
      updateDistanceDisplay();
    })
    .subscribe();
}

// ── LOBBY-LEVEL SUBSCRIPTION (auto-show for all players) ─
function subscribeLobbyManhunt() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;

  supabase
    .channel('manhunt-lobby-' + lobby.name)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'manhunts',
      filter: `lobby=eq.${lobby.name}`,
    }, () => {
      // New hunt started — load it for everyone
      loadManhuntFromSupabase();
    })
    .subscribe();
}

// ── LOAD FROM SUPABASE ───────────────────────────────
export async function loadManhuntFromSupabase() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby || !map) return;

  const { data, error } = await supabase
    .from('manhunts')
    .select('*')
    .eq('lobby', lobby.name)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) { console.error('Error loading Manhunt:', error); return; }
  if (!data)  { console.log('No active Manhunt found.'); return; }

  activeManhunt = data;
  updateManhuntButtons('stop');
  showManhuntOnMap(data, true);
  subscribeToManhuntUpdates();
  startSeekerTracking();
  startExpiryTimer();
  startCountdown();

  // Rejoin as hider: restart location tracking if this device started the hunt
  const hiderManhuntId = sessionStorage.getItem('geostickrs_hider_manhunt_id');
  if (hiderManhuntId && String(hiderManhuntId) === String(data.id)) {
    const radiusMeters = Math.round(
      Math.max(
        Math.abs(data.box_geojson.north - data.box_geojson.south),
        Math.abs(data.box_geojson.east  - data.box_geojson.west)
      ) / 2 * 111000
    );
    startLocationTracking(data.id, radiusMeters);
  }
}

function stopSeekerTracking() {
  if (seekerWatchId !== null) {
    navigator.geolocation.clearWatch(seekerWatchId);
    seekerWatchId = null;
  }
  seekerLat = null;
  seekerLng = null;
  removeMyLocationMarker();
}

// ── SHOW ON MAP ──────────────────────────────────────
function showManhuntOnMap(manhunt, panToBox = false) {
  if (!map || !manhunt?.box_geojson) return;

  const box    = manhunt.box_geojson;
  const bounds = [[box.south, box.west], [box.north, box.east]];

  if (manhuntBoxLayer && map.hasLayer(manhuntBoxLayer)) {
    map.removeLayer(manhuntBoxLayer);
  }

  manhuntBoxLayer = L.rectangle(bounds, {
    color: '#ef4444', weight: 2,
    fillColor: '#ef4444', fillOpacity: 0.12, dashArray: '8, 6',
  }).addTo(map);

  if (panToBox) map.fitBounds(bounds);

  document.getElementById('manhunt-status').textContent = 'Active Move & Seek — live tracking';
  showManhuntUI();
}

// ── CAUGHT CHECK ─────────────────────────────────────
let caughtPos = null;

function checkManhuntCaught() {
  if (!activeManhunt) { alert('No active Move & Seek loaded.'); return; }
  if (!navigator.geolocation) { alert('GPS not available.'); return; }
  const hiderManhuntId = sessionStorage.getItem('geostickrs_hider_manhunt_id');
  if (hiderManhuntId && String(hiderManhuntId) === String(activeManhunt.id)) {
    alert("🙈 You're the hider — you can't catch yourself!"); return;
  }

  navigator.geolocation.getCurrentPosition((pos) => {
    const distance = map.distance(
      [pos.coords.latitude, pos.coords.longitude],
      [activeManhunt.hider_lat, activeManhunt.hider_lng]
    );

    if (distance <= 50) {
      caughtPos = pos;
      openCaughtModal();
    } else {
      alert(`❌ Not close enough. Distance: ${Math.round(distance)} m`);
    }
  }, (err) => alert('GPS error: ' + err.message));
}

function openCaughtModal() {
  // reset state
  document.getElementById('manhunt-caught-preview-wrap').style.display = 'none';
  document.getElementById('manhunt-caught-preview').src = '';
  document.getElementById('manhunt-caught-camera-input').value = '';
  document.getElementById('manhunt-caught-file-input').value = '';
  document.getElementById('manhunt-caught-status').textContent = '';
  document.getElementById('btn-manhunt-caught-submit').disabled = true;
  document.getElementById('manhunt-caught-modal').style.display = 'flex';
}

function closeCaughtModal() {
  document.getElementById('manhunt-caught-modal').style.display = 'none';
  caughtPos = null;
}

// ── CAUGHT MODAL WIRING ───────────────────────────────
let caughtPhotoFile = null;

document.getElementById('btn-manhunt-caught-camera')
  ?.addEventListener('click', () => document.getElementById('manhunt-caught-camera-input').click());

document.getElementById('btn-manhunt-caught-upload')
  ?.addEventListener('click', () => document.getElementById('manhunt-caught-file-input').click());

['manhunt-caught-camera-input', 'manhunt-caught-file-input'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    caughtPhotoFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById('manhunt-caught-preview').src = ev.target.result;
      document.getElementById('manhunt-caught-preview-wrap').style.display = 'block';
      document.getElementById('btn-manhunt-caught-submit').disabled = false;
    };
    reader.readAsDataURL(file);
  });
});

document.getElementById('btn-manhunt-caught-cancel')
  ?.addEventListener('click', closeCaughtModal);

document.getElementById('btn-manhunt-caught-submit')
  ?.addEventListener('click', async () => {
    if (!caughtPos || !caughtPhotoFile) return;
    const btn = document.getElementById('btn-manhunt-caught-submit');
    btn.disabled = true;
    btn.textContent = '⏳ Submitting…';
    document.getElementById('manhunt-caught-status').textContent = 'Uploading photo…';

    try {
      const lobby      = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
      const winnerName = lobby?.username || 'Hunter';
      const lobbyFolder = lobby.name.replace(/\s+/g, '_').toLowerCase();
      const fileName    = `${lobbyFolder}/manhunt_${Date.now()}_${caughtPhotoFile.name.replace(/\s/g,'_')}`;

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, caughtPhotoFile, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);

      await saveManhuntScore(caughtPos.coords.latitude, caughtPos.coords.longitude, winnerName, urlData.publicUrl);
      closeCaughtModal();
      endManhunt();
    } catch (err) {
      console.error(err);
      document.getElementById('manhunt-caught-status').textContent = `Error: ${err.message}`;
      btn.disabled = false;
      btn.textContent = 'Submit 🚀';
    }
  });

// ── SAVE SCORE ───────────────────────────────────────
async function saveManhuntScore(lat, lng, username, photoUrl = null) {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;

  const { error } = await supabase.from('stickers').insert([{
    username, lat, lng, photo_url: photoUrl, score: 100,
    lobby: lobby.name, mode: 'manhunt',
  }]);

  if (error) { console.error('Error saving Manhunt score:', error); return; }
  loadLeaderboard();
}

// ── END ──────────────────────────────────────────────
export async function endManhunt() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;

  const { error } = await supabase
    .from('manhunts')
    .update({ active: false })
    .eq('lobby', lobby.name)
    .eq('active', true);

  if (error) { console.error(error); alert('Failed to end Move & Seek.'); return; }

  if (manhuntBoxLayer && map.hasLayer(manhuntBoxLayer)) {
    map.removeLayer(manhuntBoxLayer);
  }

  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
  stopSeekerTracking();
  stopExpiryTimer();
  stopCountdown();

  activeManhunt = null;
  manhuntDraft  = null;
  sessionStorage.removeItem('geostickrs_hider_manhunt_id');

  hideManhuntUI();
  document.getElementById('manhunt-distance').textContent = '';
  updateManhuntButtons('create');
  alert('🛑 Move & Seek ended.');
}
