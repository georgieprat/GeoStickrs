// ── 1. SUPABASE CONFIG ──────────────────────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://bbornsnrwpqeugnmhmxb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qPM6-sPV3CvI3dl34_161A_Jfny2BC7';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 2. MAP SETUP ─────────────────────────────────────
const map = L.map('map', { zoomControl: true }).setView([20, 0], 2);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap © CARTO'
}).addTo(map);

// ── 3. STATE ─────────────────────────────────────────
let currentStep = null;
let submission = {
  username: null,
  lat: null,
  lng: null,
  photoFile: null,
  photoDataUrl: null,
};
let previewMarker = null;

// ── 4. STEP FLOW ─────────────────────────────────────
function openStep(step) {
  currentStep = step;
  hideAllSteps();

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
  // clear errors
  document.querySelectorAll('.step-error').forEach(e => e.style.display = 'none');
}

function closeFlow() {
  currentStep = null;
  hideAllSteps();
  document.getElementById('map-overlay').classList.remove('active');
  document.getElementById('location-hint').style.display = 'none';
  if (previewMarker) { map.removeLayer(previewMarker); previewMarker = null; }
}

// ── 5. FAB BUTTON ────────────────────────────────────
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

// ── 6. STEP: USERNAME ────────────────────────────────
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

// ── 7. STEP: LOCATION ────────────────────────────────
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
      setLocationMsg(`✅ GPS found! Adjust by clicking the map, or continue.`, true);
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

map.on('click', (e) => {
  if (currentStep !== 'location') return;
  submission.lat = e.latlng.lat;
  submission.lng = e.latlng.lng;
  placePreviewMarker(submission.lat, submission.lng);
  setLocationMsg(`📍 ${submission.lat.toFixed(4)}, ${submission.lng.toFixed(4)} — press Continue.`, true);
  document.getElementById('btn-location-next').disabled = false;
});

document.getElementById('btn-location-next').addEventListener('click', () => {
  if (!submission.lat) { setLocationMsg('Please allow GPS or click the map first.', false); return; }
  openStep('camera');
});

document.getElementById('btn-location-back').addEventListener('click', () => openStep('username'));

// ── 8. STEP: CAMERA ──────────────────────────────────
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

document.getElementById('btn-camera-back').addEventListener('click', () => {
  openStep('location');
});

// ── 9. STEP: CONFIRM ─────────────────────────────────
function populateConfirm() {
  document.getElementById('confirm-username').textContent = submission.username;
  document.getElementById('confirm-location').textContent =
    `${submission.lat.toFixed(4)}, ${submission.lng.toFixed(4)}`;
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
      const fileName = `${Date.now()}_${submission.photoFile.name.replace(/\s/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('photos').upload(fileName, submission.photoFile, { cacheControl: '3600', upsert: false });
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
    }]);
    if (insertError) throw insertError;

    const savedLat = submission.lat;
    const savedLng = submission.lng;

    closeFlow();
    addMarkerToMap({ username: submission.username, lat: savedLat, lng: savedLng, photo_url: photoURL, score });
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

// ── 10. SCORING ──────────────────────────────────────
const HOME_LAT = 48.2082;
const HOME_LNG = 16.3738;

async function calculateScore(lat, lng) {
  let score = 0;
  const distKm = getDistanceKm(lat, lng, HOME_LAT, HOME_LNG);
  score += Math.min(Math.round(distKm / 100), 50);
  if (distKm > 1000) score += 10;
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
    const data = await res.json();
    score += Math.min(Math.round(Math.max(0, data.elevation[0]) / 100), 30);
  } catch (e) { /* elevation optional */ }
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

// ── 11. MARKERS ──────────────────────────────────────
function placePreviewMarker(lat, lng) {
  if (previewMarker) map.removeLayer(previewMarker);
  previewMarker = L.circleMarker([lat, lng], {
    radius: 10, color: '#18181b', fillColor: '#facc15', fillOpacity: 1, weight: 2
  }).addTo(map);
}

function addMarkerToMap(s) {
  const marker = L.marker([s.lat, s.lng]).addTo(map);
  marker.bindPopup(`
    <div style="font-family:sans-serif;font-size:13px;max-width:180px;line-height:1.5;">
      <strong>${s.username}</strong><br>
      🏆 <strong>${s.score} pts</strong>
      ${s.photo_url ? `<br><img src="${s.photo_url}" style="max-width:160px;margin-top:6px;border-radius:6px;display:block;">` : ''}
    </div>
  `);
}

async function loadAllStickers() {
  const { data, error } = await supabase.from('stickers').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  data.forEach(addMarkerToMap);
}

// ── 12. LEADERBOARD ──────────────────────────────────
async function loadLeaderboard() {
  const { data, error } = await supabase
    .from('stickers').select('username, score')
    .order('score', { ascending: false }).limit(5);
  if (error) return;
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = data.length === 0
    ? '<li class="loading">No stickers yet!</li>'
    : data.map((s, i) =>
        `<li>
          <span class="lb-rank">${['🥇','🥈','🥉','4.','5.'][i]}</span>
          <span class="lb-name">${s.username}</span>
          <span class="lb-score">${s.score} pts</span>
        </li>`
      ).join('');
}

// ── 13. TOAST ────────────────────────────────────────
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

// ── INIT ─────────────────────────────────────────────
loadAllStickers();
loadLeaderboard();
