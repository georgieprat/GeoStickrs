// ── MAIN ENTRY POINT ────────────────────────────────
// Imports all modules and wires them together.
// Modules live in the js/ folder.

import './js/lobby.js';
import { init, loadAllStickers, loadLeaderboard, submission } from './js/submission.js';

// ── MAP SETUP ────────────────────────────────────────
let map = null;

function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO'
  }).addTo(map);

  // Read current lobby from session
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));

  // Pass map and lobby into submission module
  init(map, lobby);

  // Map click for location picking — dispatched to submission module
  map.on('click', (e) => {
    submission.lat = e.latlng.lat;
    submission.lng = e.latlng.lng;
    const el = document.getElementById('location-instruction');
    if (el) {
      el.textContent = `📍 ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)} — press Continue.`;
      el.style.color  = '#16a34a';
    }
    document.getElementById('btn-location-next').disabled = false;

    // Place preview marker via submission module
    import('./js/submission.js').then(m => m.placePreviewMarker(e.latlng.lat, e.latlng.lng));
  });

  loadAllStickers();
  loadLeaderboard();
}

// ── ENTER APP ────────────────────────────────────────
function enterApp() {
  document.getElementById('lobby-screen').style.display = 'none';
  document.getElementById('app').style.display          = 'block';
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  document.getElementById('lobby-badge-name').textContent = `🏠 ${lobby?.name ?? ''}`;
  initMap();
}

// Expose globally so lobby.js can call window._enterApp()
window._enterApp = enterApp;

// Auto-enter if session already has a lobby (page refresh)
if (sessionStorage.getItem('geostickrs_lobby')) {
  window.addEventListener('load', enterApp);
}
