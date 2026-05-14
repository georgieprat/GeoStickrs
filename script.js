// ── 1. SUPABASE CONFIG ──────────────────────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://bbornsnrwpqeugnmhmxb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qPM6-sPV3CvI3dl34_161A_Jfny2BC7';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 2. LOBBY STATE ───────────────────────────────────
let currentLobby = null; // { name, password }

// Restore lobby from sessionStorage (survives refresh, not new tab)
const savedLobby = sessionStorage.getItem('geostickrs_lobby');
if (savedLobby) {
  currentLobby = JSON.parse(savedLobby);
  window.addEventListener('load', () => enterApp());
}

// ── 3. LOBBY SCREEN ──────────────────────────────────
document.getElementById('btn-lobby-join').addEventListener('click', joinLobby);
document.getElementById('lobby-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinLobby();
});

// ── LOBBY CREATION ───────────────────────────────────
let homePickerMap = null;
let selectedHomeLat = null;
let selectedHomeLng = null;
let homeMarker = null;

document.getElementById('btn-lobby-create').addEventListener('click', () => {
  const creator = document.getElementById('lobby-creator');
  creator.style.display = creator.style.display === 'flex' ? 'none' : 'flex';
});

document.getElementById('btn-lobby-home').addEventListener('click', () => {
  const name = document.getElementById('lobby-new-name').value.trim();
  const password = document.getElementById('lobby-new-password').value.trim();
  const errorEl = document.getElementById('step-lobby-create-error');

  if (!name)     { errorEl.textContent = 'Please enter a lobby name.';     errorEl.style.display = 'block'; return; }
  if (!password) { errorEl.textContent = 'Please enter a lobby password.'; errorEl.style.display = 'block'; return; }
  errorEl.style.display = 'none';

  // Show home picker map
  document.getElementById('lobby-screen').style.display = 'none';
  const picker = document.getElementById('lobby-home-picker');
  picker.style.display = 'flex';
  document.getElementById('lobby-home-hint').style.display = 'flex';

  // Init picker map if not already done
  if (!homePickerMap) {
    homePickerMap = L.map('lobby-home-map').setView([20, 0], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO'
    }).addTo(homePickerMap);

    homePickerMap.on('click', (e) => {
      selectedHomeLat = e.latlng.lat;
      selectedHomeLng = e.latlng.lng;
      if (homeMarker) homePickerMap.removeLayer(homeMarker);
      homeMarker = L.circleMarker([selectedHomeLat, selectedHomeLng], {
        radius: 10, color: '#18181b', fillColor: '#facc15', fillOpacity: 1, weight: 2
      }).addTo(homePickerMap);
      document.getElementById('lobby-home-instruction').textContent =
        `🏠 ${selectedHomeLat.toFixed(4)}, ${selectedHomeLng.toFixed(4)} — confirm or adjust`;
      document.getElementById('btn-home-confirm').disabled = false;
    });
  } else {
    // Reset state for new lobby
    selectedHomeLat = null;
    selectedHomeLng = null;
    if (homeMarker) { homePickerMap.removeLayer(homeMarker); homeMarker = null; }
    document.getElementById('btn-home-confirm').disabled = true;
    document.getElementById('lobby-home-instruction').textContent = 'Click on the map to set your lobby\'s home point';
    setTimeout(() => homePickerMap.invalidateSize(), 100);
  }
});

document.getElementById('btn-home-back').addEventListener('click', () => {
  document.getElementById('lobby-home-picker').style.display = 'none';
  document.getElementById('lobby-home-hint').style.display = 'none';
  document.getElementById('lobby-screen').style.display = 'flex';
});

document.getElementById('btn-home-confirm').addEventListener('click', async () => {
  const name     = document.getElementById('lobby-new-name').value.trim();
  const password = document.getElementById('lobby-new-password').value.trim();
  const btn      = document.getElementById('btn-home-confirm');

  btn.disabled = true;
  btn.textContent = 'Creating…';

  // Check password not already taken
  const { data: existing } = await supabase
    .from('lobbies').select('id').eq('password', password).maybeSingle();

  if (existing) {
    btn.disabled = false;
    btn.textContent = 'Confirm home →';
    document.getElementById('lobby-home-picker').style.display = 'none';
    document.getElementById('lobby-home-hint').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    const errorEl = document.getElementById('step-lobby-create-error');
    errorEl.textContent = 'That password is already taken. Choose another.';
    errorEl.style.display = 'block';
    return;
  }

  const { error } = await supabase.from('lobbies').insert([{
    name,
    password,
    home_lat: selectedHomeLat,
    home_lng: selectedHomeLng,
  }]);

  btn.disabled = false;
  btn.textContent = 'Confirm home →';

  if (error) {
    alert('Error creating lobby: ' + error.message);
    return;
  }

  // Auto-join the newly created lobby
  document.getElementById('lobby-home-picker').style.display = 'none';
  document.getElementById('lobby-home-hint').style.display = 'none';
  currentLobby = { name, password, home_lat: selectedHomeLat, home_lng: selectedHomeLng };
  sessionStorage.setItem('geostickrs_lobby', JSON.stringify(currentLobby));
  enterApp();
});

/*async function showCreator() {
  const LobbyCreator = document.getElementById('lobby-creator');
  if (LobbyCreator.style.display == 'flex') {
    document.getElementById('btn-lobby-create').textContent = 'Create lobby →';
    LobbyCreator.style.display = 'none';
  }
  else {
    document.getElementById('btn-lobby-create').textContent = 'Close lobbycreator ↓';
    LobbyCreator.style.display = 'flex';
  }
};*/

async function joinLobby() {
  const input = document.getElementById('lobby-password').value.trim();
  const errorEl = document.getElementById('lobby-error');
  errorEl.style.display = 'none';

  if (!input) { showLobbyError('Please enter a password.'); return; }

  const btn = document.getElementById('btn-lobby-join');
  btn.disabled = true;
  btn.textContent = 'Checking…';

  const { data, error } = await supabase
    .from('lobbies')
    .select('name, password, home_lat, home_lng')
    .eq('password', input)
    .single();

  btn.disabled = false;
  btn.textContent = 'Join lobby →';

  if (error || !data) { showLobbyError('Wrong password. Try again.'); return; }

  currentLobby = { name: data.name, password: data.password, home_lat: data.home_lat, home_lng: data.home_lng };
  sessionStorage.setItem('geostickrs_lobby', JSON.stringify(currentLobby));
  enterApp();
}

function showLobbyError(msg) {
  const el = document.getElementById('lobby-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function enterApp() {
  document.getElementById('lobby-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('lobby-badge-name').textContent = `🏠 ${currentLobby.name}`;
  initMap();
}

// ── 4. LEAVE LOBBY ───────────────────────────────────
document.getElementById('btn-leave-lobby').addEventListener('click', () => {
  sessionStorage.removeItem('geostickrs_lobby');
  currentLobby = null;
  submission.username = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('lobby-screen').style.display = 'flex';
  document.getElementById('lobby-password').value = '';
  window.location.reload();
});

// ── 5. MAP SETUP ─────────────────────────────────────
let map = null;

function initMap() {
  if (map) return; // prevent double init
  map = L.map('map', { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO'
  }).addTo(map);

  // Click on map to set location
  map.on('click', (e) => {
    if (currentStep !== 'location') return;
    submission.lat = e.latlng.lat;
    submission.lng = e.latlng.lng;
    placePreviewMarker(submission.lat, submission.lng);
    setLocationMsg(`📍 ${submission.lat.toFixed(4)}, ${submission.lng.toFixed(4)} — press Continue.`, true);
    document.getElementById('btn-location-next').disabled = false;
  });

  loadAllStickers();
  loadLeaderboard();
}

// ── 6. SUBMISSION STATE ──────────────────────────────
let currentStep = null;
let submission = {
  username: null,
  lat: null,
  lng: null,
  photoFile: null,
  photoDataUrl: null,
};
let previewMarker = null;

// ── COLOR FROM USERNAME ───────────────────────────────
function usernameToColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    fill: `hsl(${hue}, 70%, 55%)`,
    border: `hsl(${hue}, 70%, 35%)`
  };
}

// ── 7. STEP FLOW ─────────────────────────────────────
function openStep(step) {
  currentStep = step;
  hideAllSteps();

  // Hide FAB
  const fab = document.getElementById('fab-submit');
  fab.style.opacity = '0';
  fab.style.pointerEvents = 'none';

  const overlay = document.getElementById('map-overlay');
  if (step === 'location') {
    overlay.classList.remove('active');
    document.getElementById('location-hint').style.display = 'flex';
  } else {
    overlay.classList.add('active');
    document.getElementById('location-hint').style.display = 'none';
  }

  if (step) {
    const el = document.getElementById(`step-${step}`);
    if (el) { el.style.display = 'flex'; el.classList.add('pop-in'); }
  }
}

function hideAllSteps() {
  ['username', 'location', 'camera', 'confirm'].forEach(s => {
    const el = document.getElementById(`step-${s}`);
    if (el) { el.style.display = 'none'; el.classList.remove('pop-in'); }
  });
  document.querySelectorAll('.step-error').forEach(e => e.style.display = 'none');
}

function closeFlow() {
  currentStep = null;
  hideAllSteps();
  document.getElementById('map-overlay').classList.remove('active');
  document.getElementById('location-hint').style.display = 'none';
  // Show FAB again
  const fab = document.getElementById('fab-submit');
  fab.style.opacity = '1';
  fab.style.pointerEvents = 'auto';
  if (previewMarker) { map.removeLayer(previewMarker); previewMarker = null; }
}

// ── 8. FAB ───────────────────────────────────────────
document.getElementById('fab-submit').addEventListener('click', () => {
  submission.lat = null;
  submission.lng = null;
  submission.photoFile = null;
  submission.photoDataUrl = null;
  if (submission.username) {
    openStep('location');
    requestGPS();
  } else {
    openStep('username');
  }
});

// ── 9. STEP: USERNAME ────────────────────────────────
document.getElementById('btn-username-next').addEventListener('click', () => {
  const val = document.getElementById('input-username').value.trim();
  if (!val) { showStepError('username', 'Please enter a username.'); return; }
  submission.username = val;
  openStep('location');
  requestGPS();
});

document.getElementById('btn-username-cancel').addEventListener('click', closeFlow);

document.getElementById('input-username').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-username-next').click();
});

// ── 10. STEP: LOCATION ───────────────────────────────
function requestGPS() {
  document.getElementById('btn-location-next').disabled = true;
  if (!navigator.geolocation) {
    setLocationMsg('GPS not available — click on the map to place your sticker.', false);
    return;
  }
  setLocationMsg('📡 Requesting GPS…', false);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      submission.lat = pos.coords.latitude;
      submission.lng = pos.coords.longitude;
      placePreviewMarker(submission.lat, submission.lng);
      map.setView([submission.lat, submission.lng], 6);
      setLocationMsg('✅ GPS found! Adjust by clicking the map, or continue.', true);
      document.getElementById('btn-location-next').disabled = false;
    },
    () => {
      setLocationMsg('GPS denied — click anywhere on the map to place your sticker.', false);
    }
  );
}

function setLocationMsg(msg, success) {
  const el = document.getElementById('location-instruction');
  el.textContent = msg;
  el.style.color = success ? '#16a34a' : '#52525b';
}

document.getElementById('btn-location-next').addEventListener('click', () => {
  if (!submission.lat) { setLocationMsg('Please allow GPS or click the map first.', false); return; }
  openStep('camera');
});

document.getElementById('btn-location-back').addEventListener('click', () => openStep('username'));

// ── 11. STEP: CAMERA ─────────────────────────────────
document.getElementById('btn-camera-take').addEventListener('click', () => {
  document.getElementById('camera-input').click();
});

document.getElementById('btn-camera-upload').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

['camera-input', 'file-input'].forEach(id => {
  document.getElementById(id).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    submission.photoFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      submission.photoDataUrl = ev.target.result;
      document.getElementById('photo-preview').src = ev.target.result;
      document.getElementById('photo-preview-wrap').style.display = 'block';
      document.getElementById('btn-camera-next').disabled = false;
    };
    reader.readAsDataURL(file);
  });
});

document.getElementById('btn-camera-skip').addEventListener('click', () => {
  submission.photoFile = null;
  submission.photoDataUrl = null;
  openStep('confirm');
  populateConfirm();
});

document.getElementById('btn-camera-next').addEventListener('click', () => {
  openStep('confirm');
  populateConfirm();
});

document.getElementById('btn-camera-back').addEventListener('click', () => openStep('location'));

// ── 12. STEP: CONFIRM ────────────────────────────────
function populateConfirm() {
  document.getElementById('confirm-username').textContent = submission.username;
  document.getElementById('confirm-location').textContent =
    `${submission.lat.toFixed(4)}, ${submission.lng.toFixed(4)}`;
  document.getElementById('confirm-lobby').textContent = currentLobby.name;
  const imgWrap = document.getElementById('confirm-photo-wrap');
  if (submission.photoDataUrl) {
    document.getElementById('confirm-photo').src = submission.photoDataUrl;
    imgWrap.style.display = 'block';
  } else {
    imgWrap.style.display = 'none';
  }
}

document.getElementById('btn-confirm-back').addEventListener('click', () => openStep('camera'));

document.getElementById('btn-confirm-submit').addEventListener('click', async () => {
  const btn = document.getElementById('btn-confirm-submit');
  btn.disabled = true;
  btn.textContent = '⏳ Submitting…';

  try {
    let photoURL = null;

    if (submission.photoFile) {
      // Store photos in a subfolder per lobby name (sanitised)
      const lobbyFolder = currentLobby.name.replace(/\s+/g, '_').toLowerCase();
      const fileName = `${lobbyFolder}/${Date.now()}_${submission.photoFile.name.replace(/\s/g, '_')}`;

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, submission.photoFile, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
      photoURL = urlData.publicUrl;
    }

    const { score } = await calculateScore(submission.lat, submission.lng);

    const { error: insertError } = await supabase.from('stickers').insert([{
      username: submission.username,
      lat: submission.lat,
      lng: submission.lng,
      photo_url: photoURL,
      score,
      lobby: currentLobby.name,  // tag sticker with lobby name
    }]);
    if (insertError) throw insertError;

    const savedLat = submission.lat;
    const savedLng = submission.lng;

    closeFlow();
    addMarkerToMap({
      username: submission.username,
      lat: savedLat,
      lng: savedLng,
      photo_url: photoURL,
      score,
    });
    map.setView([savedLat, savedLng], 8);

    submission.lat = null;
    submission.lng = null;
    submission.photoFile = null;
    submission.photoDataUrl = null;

    btn.disabled = false;
    btn.textContent = 'Submit 🚀';

    showToast(`✅ Sticker posted! Score: ${score} pts`);
    loadLeaderboard();

  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'Submit 🚀';
    showStepError('confirm', `Error: ${err.message}`);
  }
});

// ── 13. SCORING ──────────────────────────────────────
async function calculateScore(lat, lng) {
  let score = 0;
  const homeLat = currentLobby.home_lat ?? 48.2082;
  const homeLng = currentLobby.home_lng ?? 16.3738;
  const distKm = getDistanceKm(lat, lng, homeLat, homeLng);
  score += Math.min(Math.round(distKm / 100), 50);
  if (distKm > 1000) score += 10;
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
    const data = await res.json();
    score += Math.min(Math.round(Math.max(0, data.elevation[0]) / 100), 30);
  } catch (e) { /* optional */ }
  return { score };
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── 14. MARKERS ──────────────────────────────────────
function placePreviewMarker(lat, lng) {
  if (previewMarker) map.removeLayer(previewMarker);
  previewMarker = L.circleMarker([lat, lng], {
    radius: 10, color: '#18181b', fillColor: '#facc15', fillOpacity: 1, weight: 2
  }).addTo(map);
}

function addMarkerToMap(s) {
  const color = usernameToColor(s.username);

  // Custom colored circle marker icon
  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width: 22px;
      height: 22px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      background: ${color.fill};
      border: 2.5px solid ${color.border};
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -24]
  });

  const marker = L.marker([s.lat, s.lng], { icon }).addTo(map);
  marker.bindPopup(`
    <div style="font-family:sans-serif;font-size:13px;max-width:180px;line-height:1.5;">
      <span style="
        display:inline-block;
        width:10px;height:10px;
        border-radius:50%;
        background:${color.fill};
        margin-right:5px;
        vertical-align:middle;
      "></span>
      <strong>${s.username}</strong><br>
      🏆 <strong>${s.score} pts</strong>
      ${s.photo_url
        ? `<br><img src="${s.photo_url}"
            style="max-width:160px;margin-top:6px;border-radius:6px;display:block;">`
        : ''}
    </div>
  `);
}

// Load only stickers belonging to current lobby
async function loadAllStickers() {
  const { data, error } = await supabase
    .from('stickers')
    .select('*')
    .eq('lobby', currentLobby.name)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  data.forEach(addMarkerToMap);
}

// ── 15. LEADERBOARD (lobby-filtered) ─────────────────
async function loadLeaderboard() {
  const mode = document.getElementById('leaderboard-mode')?.value || 'top';
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = '<li class="loading">Loading…</li>';

  const { data, error } = await supabase
    .from('stickers')
    .select('username, score')
    .eq('lobby', currentLobby.name)
    .order('score', { ascending: false });

  if (error || !data) return;

  let entries = [];

  if (mode === 'top') {
    // Best single score per entry, top 5
    entries = data.slice(0, 5);
  } else {
    // Combine scores by username
    const totals = {};
    data.forEach(s => {
      totals[s.username] = (totals[s.username] || 0) + s.score;
    });
    entries = Object.entries(totals)
      .map(([username, score]) => ({ username, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  list.innerHTML = entries.length === 0
    ? '<li class="loading">No stickers yet!</li>'
    : entries.map((s, i) => {
        const color = usernameToColor(s.username);
        return `<li>
          <span class="lb-rank">${['🥇','🥈','🥉','4.','5.'][i]}</span>
          <span class="lb-dot" style="background:${color.fill};border-color:${color.border};"></span>
          <span class="lb-name">${s.username}</span>
          <span class="lb-score">${s.score} pts</span>
        </li>`;
      }).join('');
}

// Reload leaderboard when switching mode
document.getElementById('leaderboard-mode')?.addEventListener('change', loadLeaderboard);

// ── 16. TOAST & ERRORS ───────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

function showStepError(step, msg) {
  const el = document.getElementById(`step-${step}-error`);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
