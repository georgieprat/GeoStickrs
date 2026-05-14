import { supabase } from './supabase.js';

// ── LOBBY STATE ──────────────────────────────────────
// Exported so map.js and submission.js can read current lobby
export let currentLobby = null;

// ── RESTORE FROM SESSION ─────────────────────────────
const savedLobby = sessionStorage.getItem('geostickrs_lobby');
if (savedLobby) {
  currentLobby = JSON.parse(savedLobby);
  window.addEventListener('load', () => {
    // enterApp is set by main script.js after all modules load
    window._enterApp?.();
  });
}

// ── JOIN LOBBY ───────────────────────────────────────
document.getElementById('btn-lobby-join').addEventListener('click', joinLobby);
document.getElementById('lobby-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinLobby();
});

export async function joinLobby() {
  const input   = document.getElementById('lobby-password').value.trim();
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

  currentLobby = {
    name:     data.name,
    password: data.password,
    home_lat: data.home_lat,
    home_lng: data.home_lng,
  };
  sessionStorage.setItem('geostickrs_lobby', JSON.stringify(currentLobby));
  window._enterApp?.();
}

// ── CREATE LOBBY ─────────────────────────────────────
let homePickerMap    = null;
let selectedHomeLat  = null;
let selectedHomeLng  = null;
let homeMarker       = null;

document.getElementById('btn-lobby-create').addEventListener('click', () => {
  const creator = document.getElementById('lobby-creator');
  const isOpen  = creator.style.display === 'flex';
  creator.style.display = isOpen ? 'none' : 'flex';
  document.getElementById('btn-lobby-create').textContent = isOpen
    ? 'Create lobby →'
    : 'Close lobbycreator ↓';
});

document.getElementById('btn-lobby-home').addEventListener('click', () => {
  const name     = document.getElementById('lobby-new-name').value.trim();
  const password = document.getElementById('lobby-new-password').value.trim();
  const errorEl  = document.getElementById('step-lobby-create-error');

  if (!name)     { errorEl.textContent = 'Please enter a lobby name.';     errorEl.style.display = 'block'; return; }
  if (!password) { errorEl.textContent = 'Please enter a lobby password.'; errorEl.style.display = 'block'; return; }
  errorEl.style.display = 'none';

  // Show home picker
  document.getElementById('lobby-screen').style.display = 'none';
  document.getElementById('lobby-home-picker').style.display = 'flex';
  document.getElementById('lobby-home-hint').style.display   = 'flex';

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
    selectedHomeLat = null;
    selectedHomeLng = null;
    if (homeMarker) { homePickerMap.removeLayer(homeMarker); homeMarker = null; }
    document.getElementById('btn-home-confirm').disabled = true;
    document.getElementById('lobby-home-instruction').textContent =
      "Click on the map to set your lobby's home point";
    setTimeout(() => homePickerMap.invalidateSize(), 100);
  }
});

document.getElementById('btn-home-back').addEventListener('click', () => {
  document.getElementById('lobby-home-picker').style.display = 'none';
  document.getElementById('lobby-home-hint').style.display   = 'none';
  document.getElementById('lobby-screen').style.display      = 'flex';
});

document.getElementById('btn-home-confirm').addEventListener('click', async () => {
  const name     = document.getElementById('lobby-new-name').value.trim();
  const password = document.getElementById('lobby-new-password').value.trim();
  const btn      = document.getElementById('btn-home-confirm');

  btn.disabled    = true;
  btn.textContent = 'Creating…';

  // Check password not already taken
  const { data: existing } = await supabase
    .from('lobbies').select('id').eq('password', password).maybeSingle();

  if (existing) {
    btn.disabled    = false;
    btn.textContent = 'Confirm home →';
    document.getElementById('lobby-home-picker').style.display = 'none';
    document.getElementById('lobby-home-hint').style.display   = 'none';
    document.getElementById('lobby-screen').style.display      = 'flex';
    const errorEl = document.getElementById('step-lobby-create-error');
    errorEl.textContent    = 'That password is already taken. Choose another.';
    errorEl.style.display  = 'block';
    return;
  }

  const { error } = await supabase.from('lobbies').insert([{
    name,
    password,
    home_lat: selectedHomeLat,
    home_lng: selectedHomeLng,
  }]);

  btn.disabled    = false;
  btn.textContent = 'Confirm home →';

  if (error) { alert('Error creating lobby: ' + error.message); return; }

  // Auto-join the new lobby
  document.getElementById('lobby-home-picker').style.display = 'none';
  document.getElementById('lobby-home-hint').style.display   = 'none';
  currentLobby = { name, password, home_lat: selectedHomeLat, home_lng: selectedHomeLng };
  sessionStorage.setItem('geostickrs_lobby', JSON.stringify(currentLobby));
  window._enterApp?.();
});

// ── LEAVE LOBBY ──────────────────────────────────────
document.getElementById('btn-leave-lobby').addEventListener('click', () => {
  sessionStorage.removeItem('geostickrs_lobby');
  window.location.reload();
});

// ── HELPERS ──────────────────────────────────────────
function showLobbyError(msg) {
  const el = document.getElementById('lobby-error');
  el.textContent    = msg;
  el.style.display  = 'block';
}
