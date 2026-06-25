// ── MAIN ENTRY POINT ────────────────────────────────
// Wires together all modules. Feature logic lives in js/.

import './js/lobby.js';
import './js/admin.js';
import { init, loadAllStickers, loadLeaderboard, submission, placePreviewMarker } from './js/submission.js';
import { initManhunt,      loadManhuntFromSupabase }       from './js/manhunt.js';
import { initLandmark, loadActiveLandmarkHunt, subscribeToSubmissionUpdates } from './js/landmark.js';
import {
  initLobbySettings, isHomePickerActive, saveNewHomeLocation,
} from './js/lobby-settings.js';

// ── MAP ──────────────────────────────────────────────
let map = null;

function initMap() {
  if (map) return;

  map = L.map('map', { zoomControl: false }).setView([20, 0], 2);
  L.control.zoom({ position: 'bottomright' }).addTo(map);


  const cartoLight = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  {
    attribution: '© OpenStreetMap © CARTO',
  }
);

const osm = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    attribution: '© OpenStreetMap contributors',
  }
);

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    attribution: '© Esri',
  }
);

const topo = L.tileLayer(
  'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  {
    attribution: '© OpenTopoMap',
  }
);

// Standardkarte
cartoLight.addTo(map);

// Umschalter
L.control.layers(
  {
    "🌙 Light": cartoLight,
    "🗺️ OpenStreetMap": osm,
    "🛰️ Satellite": satellite,
    "⛰️ Topographic": topo,
  },
  null,
  {
    collapsed: true,
    position: 'topleft'
  }
).addTo(map);

  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));

  // Init all modules that need the map
  init(map, lobby);
  initManhunt(map);
  initLandmark(map);
  initLobbySettings(map);

  // ── Map click dispatcher ─────────────────────────
  map.on('click', (e) => {
    const { lat, lng } = e.latlng;

    if (isHomePickerActive()) {
      saveNewHomeLocation(lat, lng);
      return;
    }

    // Normal sticker placement
    submission.lat = lat;
    submission.lng = lng;
    const el = document.getElementById('location-instruction');
    if (el) {
      el.textContent = `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)} — press Continue.`;
      el.style.color = '#16a34a';
    }
    document.getElementById('btn-location-next').disabled = false;
    placePreviewMarker(lat, lng);
  });

  // Home location marker
  if (lobby?.home_lat && lobby?.home_lng) {
    const homeIcon = L.divIcon({
      className: '',
      html: `<div style="
        font-size: 22px;
        line-height: 1;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
      ">🏠</div>`,
      iconSize:    [24, 24],
      iconAnchor:  [12, 22],
      popupAnchor: [0, -26],
    });
    L.marker([lobby.home_lat, lobby.home_lng], { icon: homeIcon, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup(`<strong>🏠 Home: ${lobby.name}</strong>`);
  }

  loadAllStickers();
  loadLeaderboard();
  loadActiveLandmarkHunt();
  loadManhuntFromSupabase();
  subscribeToSubmissionUpdates();
}

// ── ENTER APP ────────────────────────────────────────
function enterApp() {
  document.getElementById('lobby-screen').style.display = 'none';
  document.getElementById('app').style.display          = 'block';

  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  document.getElementById('lobby-badge-name').textContent = `🏠 ${lobby?.name ?? ''}`;

  const adminButton = document.getElementById('btn-admin-panel');
  if (adminButton) adminButton.style.display = 'inline-block';

  initMap();
  setTimeout(() => map?.invalidateSize(), 300);
}

// Expose so lobby.js can call window._enterApp()
window._enterApp = enterApp;

// Auto-enter on page refresh if session exists
if (sessionStorage.getItem('geostickrs_lobby')) {
  window.addEventListener('load', enterApp);
}

// ── INTRO SCREEN ─────────────────────────────────────
window.addEventListener('load', () => {
  const introScreen = document.getElementById('intro-screen');
  const skipButton  = document.getElementById('btn-intro-skip');
  if (!introScreen || !skipButton) return;

  if (!localStorage.getItem('geostickrs_intro_seen')) {
    introScreen.style.display = 'flex';
  }

  skipButton.addEventListener('click', () => {
    localStorage.setItem('geostickrs_intro_seen', 'true');
    introScreen.style.display = 'none';
  });
});
