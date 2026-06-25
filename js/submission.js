import { supabase } from './supabase.js';
import { calculateScore } from './score.js';

// ── THESE ARE SET BY main script.js AFTER MAP INIT ───
// map, currentLobby, and previewMarker are passed in via init()
let map           = null;
let currentLobby  = null;
let previewMarker = null;
let clusterGroup  = null;

export function init(mapInstance, lobbyRef) {
  map          = mapInstance;
  currentLobby = lobbyRef;
  clusterGroup = L.markerClusterGroup({ maxClusterRadius: 40, showCoverageOnHover: false });
  map.addLayer(clusterGroup);

  // Pre-fill username from lobby session
  const lobbyData = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (lobbyData?.username) {
    submission.username = lobbyData.username;
    const input = document.getElementById('input-username');
    if (input) input.value = lobbyData.username;
  }
}

// ── SUBMISSION STATE ─────────────────────────────────
let currentStep = null;
export let submission = {
  username:     null,
  lat:          null,
  lng:          null,
  photoFile:    null,
  photoDataUrl: null,
};

// ── COLOR FROM USERNAME ───────────────────────────────
export function usernameToColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    fill:   `hsl(${hue}, 70%, 55%)`,
    border: `hsl(${hue}, 70%, 35%)`,
  };
}

// ── STEP FLOW ────────────────────────────────────────
export function openStep(step) {
  currentStep = step;
  hideAllSteps();

  const fab = document.getElementById('fab-submit');
  fab.style.opacity      = '0';
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

export function closeFlow() {
  currentStep = null;
  hideAllSteps();
  document.getElementById('map-overlay').classList.remove('active');
  document.getElementById('location-hint').style.display = 'none';
  const fab = document.getElementById('fab-submit');
  fab.style.opacity      = '1';
  fab.style.pointerEvents = 'auto';
  if (previewMarker) { map.removeLayer(previewMarker); previewMarker = null; }
}

function hideAllSteps() {
  ['username', 'location', 'camera', 'confirm'].forEach(s => {
    const el = document.getElementById(`step-${s}`);
    if (el) { el.style.display = 'none'; el.classList.remove('pop-in'); }
  });
  document.querySelectorAll('.step-error').forEach(e => e.style.display = 'none');
}

// ── FAB ──────────────────────────────────────────────
function startSubmissionFlow() {
  submission.lat          = null;
  submission.lng          = null;
  submission.photoFile    = null;
  submission.photoDataUrl = null;
  if (submission.username) {
    openStep('location');
    requestGPS();
  } else {
    openStep('username');
  }
}

document.getElementById('fab-submit').addEventListener('click', () => {
  if (window._getActiveManhunt && window._getActiveManhunt()) {
    document.getElementById('manhunt-mode-choice').style.display = 'flex';
    return;
  }
  startSubmissionFlow();
});

document.getElementById('btn-choice-classic')?.addEventListener('click', () => {
  document.getElementById('manhunt-mode-choice').style.display = 'none';
  startSubmissionFlow();
});

document.getElementById('btn-choice-manhunt')?.addEventListener('click', () => {
  document.getElementById('manhunt-mode-choice').style.display = 'none';
  document.getElementById('manhunt-panel').style.display = 'block';
});

document.getElementById('btn-choice-cancel')?.addEventListener('click', () => {
  document.getElementById('manhunt-mode-choice').style.display = 'none';
});

// ── STEP: USERNAME ───────────────────────────────────
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

// ── STEP: LOCATION ───────────────────────────────────
export function requestGPS() {
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

// ── STEP: CAMERA ─────────────────────────────────────
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
  submission.photoFile    = null;
  submission.photoDataUrl = null;
  openStep('confirm');
  populateConfirm();
});

document.getElementById('btn-camera-next').addEventListener('click', () => {
  openStep('confirm');
  populateConfirm();
});

document.getElementById('btn-camera-back').addEventListener('click', () => openStep('location'));

// ── STEP: CONFIRM ────────────────────────────────────
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
  btn.disabled    = true;
  btn.textContent = '⏳ Submitting…';

  try {
    let photoURL = null;

    if (submission.photoFile) {
      const lobbyFolder = currentLobby.name.replace(/\s+/g, '_').toLowerCase();
      const fileName    = `${lobbyFolder}/${Date.now()}_${submission.photoFile.name.replace(/\s/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, submission.photoFile, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
      photoURL = urlData.publicUrl;
    }

    const homeLat = currentLobby.home_lat ?? 48.2082;
    const homeLng = currentLobby.home_lng ?? 16.3738;
    const { score } = await calculateScore(submission.lat, submission.lng, homeLat, homeLng);

    const { error: insertError } = await supabase.from('stickers').insert([{
      username:  submission.username,
      lat:       submission.lat,
      lng:       submission.lng,
      photo_url: photoURL,
      score,
      lobby:     currentLobby.name,
      mode:      'classic'
    }]);


    if (insertError) throw insertError;

    const savedLat = submission.lat;
    const savedLng = submission.lng;

    closeFlow();
    addMarkerToMap({
      username:  submission.username,
      lat:       savedLat,
      lng:       savedLng,
      photo_url: photoURL,
      score,
    });
    map.setView([savedLat, savedLng], 8);

    submission.lat          = null;
    submission.lng          = null;
    submission.photoFile    = null;
    submission.photoDataUrl = null;

    btn.disabled    = false;
    btn.textContent = 'Submit 🚀';

    showToast(`✅ Sticker posted! Score: ${score} pts`);
    loadLeaderboard();

  } catch (err) {
    console.error(err);
    btn.disabled    = false;
    btn.textContent = 'Submit 🚀';
    showStepError('confirm', `Error: ${err.message}`);
  }
});

// ── MARKERS ──────────────────────────────────────────
export function placePreviewMarker(lat, lng) {
  if (previewMarker) map.removeLayer(previewMarker);
  const color = submission.username
    ? usernameToColor(submission.username)
    : { fill: '#facc15', border: '#18181b' };
  previewMarker = L.circleMarker([lat, lng], {
    radius: 10, color: color.border, fillColor: color.fill, fillOpacity: 1, weight: 2.5
  }).addTo(map);
}

export function addMarkerToMap(s) {
  const color = usernameToColor(s.username);
  const initial = (s.username?.trim()?.charAt(0) || '?').toUpperCase();

  const icon = L.divIcon({
    className: '',
    html: `
      <div style="
        position:relative;
        width:22px;
        height:22px;
      ">
        <div style="
          width:22px;
          height:22px;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          background:${color.fill};
          border:2.5px solid ${color.border};
          box-shadow:0 2px 6px rgba(0,0,0,0.25);
        "></div>

        <div style="
          position:absolute;
          top:2px;
          left:2px;
          width:18px;
          height:18px;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:11px;
          font-weight:700;
          color:white;
          text-shadow:0 1px 2px rgba(0,0,0,0.6);
          pointer-events:none;
        ">
          ${initial}
        </div>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -24],
  });

  const marker = L.marker([s.lat, s.lng], { icon });
  clusterGroup.addLayer(marker);
  marker.bindPopup(`
    <div style="font-family:sans-serif;font-size:13px;max-width:180px;line-height:1.5;">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
        background:${color.fill};margin-right:5px;vertical-align:middle;"></span>
      <strong>${s.username}</strong><br>
      🏆 <strong>${s.score} pts</strong>
      ${s.photo_url
        ? `<br><img src="${s.photo_url}"
            style="max-width:160px;margin-top:6px;border-radius:6px;display:block;">`
        : ''}
    </div>
  `);
}

export async function loadAllStickers() {
  const { data, error } = await supabase
    .from('stickers')
    .select('*')
    .eq('lobby', currentLobby.name)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  data.forEach(addMarkerToMap);
}

// ── LEADERBOARD ──────────────────────────────────────
export async function loadLeaderboard() {
  const activeFilter = document.querySelector('.lb-filter.active');
  const mode = activeFilter?.dataset.mode || 'total';
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = '<li class="loading">Loading…</li>';

  let query = supabase
  .from('stickers')
  .select('username, score, mode')
  .eq('lobby', currentLobby.name);

if (mode === 'classic') {
  query = query.eq('mode', 'classic');
}

if (mode === 'manhunt') {
  query = query.eq('mode', 'manhunt');
}

if (mode === 'treasure') {
  query = query.eq('mode', 'treasure');
}

const { data, error } = await query.order('score', { ascending: false });

  if (error || !data) return;

  let entries = [];


 if (mode === 'classic' ||
    mode === 'manhunt' ||
    mode === 'treasure') {

  const totals = {};

  data.forEach(s => {
    totals[s.username] =
      (totals[s.username] || 0) + s.score;
  });

  entries = Object.entries(totals)
    .map(([username, score]) => ({ username, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

} else {

  // TOTAL SCORE

  const totals = {};

  data.forEach(s => {
    totals[s.username] =
      (totals[s.username] || 0) + s.score;
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

// Leaderboard pill filters
document.querySelectorAll('.lb-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lb-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadLeaderboard();
  });
});

// Leaderboard collapse toggle
document.getElementById('leaderboard-header')?.addEventListener('click', () => {
  const body   = document.getElementById('leaderboard-body');
  const toggle = document.getElementById('btn-leaderboard-toggle');
  const collapsed = body.classList.toggle('collapsed');
  toggle.classList.toggle('collapsed', collapsed);
  toggle.textContent = collapsed ? '▶' : '▼';
});

//Prevents double-trigger
document.getElementById('btn-leaderboard-toggle')
  ?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

// Auto-collapse on mobile on load
if (window.innerWidth <= 600) {
  const body   = document.getElementById('leaderboard-body');
  const toggle = document.getElementById('btn-leaderboard-toggle');
  if (body && toggle) {
    body.classList.add('collapsed');
    toggle.classList.add('collapsed');
    toggle.textContent = '▶';
  }
}

// ── TOAST & ERRORS ────────────────────────────────────
export function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

export function showStepError(step, msg) {
  const el = document.getElementById(`step-${step}-error`);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
