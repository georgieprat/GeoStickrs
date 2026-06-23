// ── MAIN ENTRY POINT ────────────────────────────────
// Imports all modules and wires them together.
// Modules live in the js/ folder.

import './js/lobby.js';
import { init, loadAllStickers, loadLeaderboard, submission } from './js/submission.js';
import { supabase } from './js/supabase.js';

const GLOBAL_ADMIN_PASSWORD = 'LBS_Admin';


// ── MAP SETUP ────────────────────────────────────────
let map = null;

let activeManhunt = null;
let manhuntBoxLayer = null;
let manhuntHiderMarker = null;


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

    // Treasure Hunt Creator active?
    if (treasureHuntDraft) {
      handleTreasureHuntClick(e.latlng.lat, e.latlng.lng);
      return;
    }

    const savedHunt = localStorage.getItem(getTreasureHuntStorageKey());

    if (savedHunt) {
    checkTreasureHuntProgress(e.latlng.lat, e.latlng.lng);
    }

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
  loadTreasureHuntFromSupabase();
  loadManhuntFromSupabase();
}

// ── ENTER APP ────────────────────────────────────────
function enterApp() {
  document.getElementById('lobby-screen').style.display = 'none';
  document.getElementById('app').style.display          = 'block';

  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  document.getElementById('lobby-badge-name').textContent = `🏠 ${lobby?.name ?? ''}`;

  
  
  
  
  const adminButton = document.getElementById('btn-admin-panel');



  if (adminButton) {
  adminButton.style.display = 'inline-block';
  }






  initMap();
  setTimeout(() => {
  if (map) {
    map.invalidateSize();
  }
}, 300);
}

// Expose globally so lobby.js can call window._enterApp()
window._enterApp = enterApp;

// Auto-enter if session already has a lobby (page refresh)
if (sessionStorage.getItem('geostickrs_lobby')) {
  window.addEventListener('load', enterApp);
}


// ── FIRST VISIT INTRO ────────────────────────────────

function initIntro() {
  const introScreen = document.getElementById('intro-screen');
  const skipButton = document.getElementById('btn-intro-skip');

  if (!introScreen || !skipButton) return;

  const introSeen = localStorage.getItem('geostickrs_intro_seen');

  if (!introSeen) {
    introScreen.style.display = 'flex';
  }

  skipButton.addEventListener('click', () => {
    localStorage.setItem('geostickrs_intro_seen', 'true');
    introScreen.style.display = 'none';
  });
}

window.addEventListener('load', initIntro);



// ── ADMIN PANEL ──────────────────────────────────────

function initAdminPanel() {
  const adminButton = document.getElementById('btn-admin-panel');
  const adminPanel = document.getElementById('admin-panel');
  const closeButton = document.getElementById('btn-admin-close');

  const treasurePanel = document.getElementById('treasure-panel');

  const treasureMenuButton = document.getElementById('btn-admin-treasure');
  const treasureBackButton = document.getElementById('btn-treasure-back');

  const treasureCreateButton = document.getElementById('btn-treasure-create');
  const treasureStartButton = document.getElementById('btn-treasure-start');
  const treasureStopButton = document.getElementById('btn-treasure-stop');


  const treasureButton = document.getElementById('btn-admin-treasure');
  console.log('Treasure button found:', treasureButton);

  if (!adminButton || !adminPanel || !closeButton) return;

  adminButton.addEventListener('click', () => {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));

  const localToken = localStorage.getItem(
    `geostickrs_admin_${lobby.name}`
  );

  if (
    localToken &&
    lobby.admin_token &&
    localToken === lobby.admin_token
  ) {
    adminPanel.style.display = 'flex';
    return;
  }

  const adminLoginModal = document.getElementById('admin-login-modal');

  if (adminLoginModal) {
    adminLoginModal.style.display = 'flex';
  }
});

  closeButton.addEventListener('click', () => {
    adminPanel.style.display = 'none';
  });

  adminPanel.addEventListener('click', (e) => {
    if (e.target === adminPanel) {
      adminPanel.style.display = 'none';
    }
  });

  treasureMenuButton?.addEventListener('click', () => {
  treasurePanel.style.display = 'block';
  });

  treasureBackButton?.addEventListener('click', () => {
  treasurePanel.style.display = 'none';
  });

  treasureCreateButton?.addEventListener('click', () => {
  startTreasureHuntCreator();
  });

  treasureStartButton?.addEventListener('click', () => {
  startPreparedTreasureHunt();
  });

  treasureStopButton?.addEventListener('click', () => {
  endTreasureHunt();
  });

  document.getElementById('btn-admin-manhunt')?.addEventListener('click', () => {
  console.log('Manhunt button clicked');
  startManhunt();
  });

  document.getElementById('btn-admin-capture')?.addEventListener('click', () => {
    alert('Capture The Sticker coming soon.');
  });

  document.getElementById('btn-admin-review')?.addEventListener('click', () => {
    alert('Sticker review coming soon.');
  });

  document.getElementById('btn-admin-rules')?.addEventListener('click', () => {
    alert('Rules & Legal coming soon.');
  });

  document.getElementById('btn-admin-settings')?.addEventListener('click', () => {
    alert('Lobby settings coming soon.');
  });

  document.getElementById('btn-admin-endhunt')?.addEventListener('click', () => {
  endTreasureHunt();
});

  document.getElementById('btn-admin-stop-manhunt')?.addEventListener('click', () => {
  endManhunt();
});
}

window.addEventListener('load', initAdminPanel);




// ── TREASURE HUNT CREATOR ────────────────────────────

let treasureHuntDraft = null;
let treasureHuntStep = 0;
let treasureHuntMarkers = [];
let pendingCheckpoint = null;
let pendingCheckpointMarker = null;
let treasureHuntCheckpointCount = 3;

function getTreasureHuntStorageKey() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  return `geostickrs_treasure_hunt_${lobby?.name ?? 'default'}`;
}

function startTreasureHuntCreator() {
  console.log('Treasure Hunt Creator started');
  const adminPanel = document.getElementById('admin-panel');
  if (adminPanel) adminPanel.style.display = 'none';

  const countInput = document.getElementById('treasure-checkpoint-count');
  const selectedCount = Number(countInput?.value);

  treasureHuntCheckpointCount =
  Number.isInteger(selectedCount) && selectedCount > 0
    ? selectedCount
    : 3;


  const durationMinutes = 60; // default: 1 hour

  //const durationMinutes = Number(duration);

    const expiresAt = durationMinutes > 0
  ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
  : null;

  treasureHuntDraft = {
    name: 'Treasure Hunt',
    checkpoints: [],
    checkpointCount: treasureHuntCheckpointCount,
    treasure: null,
    createdAt: new Date().toISOString(),
    expiresAt,
    active: false
  };

  treasureHuntStep = 0;

  alert(
  `Treasure Hunt Creator started. Click on the map to set Checkpoint 1 of ${treasureHuntCheckpointCount}.`);
  }

function handleTreasureHuntClick(lat, lng) {
  console.log('Treasure Hunt click received:', lat, lng, treasureHuntStep);
  if (!map || !treasureHuntDraft) return;

  // First clicks = checkpoints
  if (treasureHuntStep < treasureHuntCheckpointCount) {
    const hintModal = document.getElementById('hint-modal');
    const hintInput = document.getElementById('checkpoint-hint-input');

    pendingCheckpoint = { lat, lng };

    if (hintInput) {
      hintInput.value = '';
    }

    if (hintModal) {
      hintModal.style.display = 'flex';
    }

    return;
  }

  // Next click = treasure
  treasureHuntDraft.treasure = { lat, lng };

  const treasureMarker = L.marker([lat, lng])
    .addTo(map)
    .bindPopup('🏆 Treasure')
    .openPopup();

  treasureHuntMarkers.push(treasureMarker);

  localStorage.setItem(getTreasureHuntStorageKey(), JSON.stringify(treasureHuntDraft));

  saveTreasureHuntToSupabase(treasureHuntDraft);

  console.log('Treasure Hunt created:', treasureHuntDraft);

  alert('🏴‍☠️ Treasure Hunt created and saved locally!');

  treasureHuntDraft = null;
  treasureHuntStep = 0;
}


function loadSavedTreasureHunt() {
  const saved = localStorage.getItem(getTreasureHuntStorageKey());
  if (!saved || !map) return;

  const hunt = JSON.parse(saved);

  if (!hunt.active) {
  return;
  }

  if (hunt.expiresAt && new Date(hunt.expiresAt) < new Date()) {
    localStorage.removeItem(getTreasureHuntStorageKey());
    return;
  }

  hunt.checkpoints.forEach((checkpoint, index) => {
    L.marker([checkpoint.lat, checkpoint.lng])
      .addTo(map)
      .bindPopup(`Checkpoint ${index + 1}`);
  });

  if (hunt.treasure) {
  L.marker([hunt.treasure.lat, hunt.treasure.lng])
    .addTo(map)
    .bindPopup('🏆 Treasure');
}

showHuntBadge(hunt);
}

let huntTimerInterval = null;

function showHuntBadge(hunt) {
  const badge = document.getElementById('hunt-badge');
  const timer = document.getElementById('hunt-timer');

  if (!badge || !timer || !hunt) return;

  badge.style.display = 'block';

  function updateTimer() {
    if (!hunt.expiresAt) {
      timer.textContent = 'No time limit';
      return;
    }

    const remainingMs = new Date(hunt.expiresAt) - new Date();

    if (remainingMs <= 0) {
      timer.textContent = 'Expired';
      badge.style.display = 'none';
      localStorage.removeItem('geostickrs_treasure_hunt');
      clearInterval(huntTimerInterval);
      return;
    }

    const minutes = Math.floor(remainingMs / 60000);
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;

    timer.textContent = hours > 0
      ? `${hours}h ${restMinutes}min remaining`
      : `${minutes}min remaining`;
  }

  updateTimer();
clearInterval(huntTimerInterval);
huntTimerInterval = setInterval(updateTimer, 1000);

}
let activePlayerHunt = null;

function endTreasureHunt() {
  localStorage.removeItem(getTreasureHuntStorageKey());

  treasureHuntMarkers.forEach(marker => {
    if (map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  });

  treasureHuntMarkers = [];
  treasureHuntDraft = null;
  treasureHuntStep = 0;
  activePlayerHunt = null;
  

  const badge = document.getElementById('hunt-badge');
  if (badge) {
    badge.style.display = 'none';
  }
  endTreasureHuntInSupabase();
  alert('Treasure Hunt ended.');
}


function initHintModal() {
  const hintModal = document.getElementById('hint-modal');
  const hintInput = document.getElementById('checkpoint-hint-input');
  const saveButton = document.getElementById('btn-save-hint');

  if (!hintModal || !hintInput || !saveButton) return;

  saveButton.addEventListener('click', () => {
    if (!pendingCheckpoint || !treasureHuntDraft) return;

    const hint = hintInput.value.trim() || `Hint for Checkpoint ${treasureHuntStep + 1}`;

    treasureHuntDraft.checkpoints.push({
      lat: pendingCheckpoint.lat,
      lng: pendingCheckpoint.lng,
      hint
    });

    const marker = L.marker([pendingCheckpoint.lat, pendingCheckpoint.lng])
      .addTo(map)
      .bindPopup(`
        <strong>Checkpoint ${treasureHuntStep + 1}</strong><br>
        ${hint}
      `)
      .openPopup();  

    treasureHuntMarkers.push(marker);

    pendingCheckpoint = null;
    hintModal.style.display = 'none';

    treasureHuntStep++;

    if (treasureHuntStep < treasureHuntCheckpointCount) {
      alert(`Checkpoint ${treasureHuntStep} saved. Set Checkpoint ${treasureHuntStep + 1}.`);
    } else {
      alert(
  `Checkpoint ${treasureHuntCheckpointCount} saved. Now place the Treasure.`);
    }
  });
}

window.addEventListener('load', initHintModal);


function startPreparedTreasureHunt() {
  const saved = localStorage.getItem(getTreasureHuntStorageKey());

  if (!saved) {
    alert('No Treasure Hunt created yet.');
    return;
  }

  const hunt = JSON.parse(saved);

  if (
    !hunt.checkpoints ||
    hunt.checkpoints.length < hunt.checkpointCount ||
    !hunt.treasure
  ) {
    alert(`Treasure Hunt is incomplete. Please create ${hunt.checkpointCount} checkpoints and a treasure first.`);
    return;
  }

  const durationMinutes = 60;

  hunt.active = true;
  hunt.startedAt = new Date().toISOString();
  hunt.expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  localStorage.setItem(getTreasureHuntStorageKey(), JSON.stringify(hunt));

  updateTreasureHuntInSupabase(hunt);

  showHuntBadge(hunt);

  alert('🏴‍☠️ Treasure Hunt started!');
}




function checkTreasureHuntProgress(lat, lng) {
  const saved = localStorage.getItem(getTreasureHuntStorageKey());
  if (!saved) return;

  const hunt = JSON.parse(saved);

  if (!hunt.active) return;

  if (!activePlayerHunt) {
    activePlayerHunt = {
      currentCheckpoint: 0,
      treasureUnlocked: false,
      completed: false
    };
  }

  if (activePlayerHunt.completed) return;

  const radiusMeters = 50000; // 50 km for testing

  if (!activePlayerHunt.treasureUnlocked) {
    const currentIndex = activePlayerHunt.currentCheckpoint;
    const checkpoint = hunt.checkpoints[currentIndex];

    if (!checkpoint) return;

    const distance = map.distance(
      [lat, lng],
      [checkpoint.lat, checkpoint.lng]
    );

    if (distance <= radiusMeters) {
      activePlayerHunt.currentCheckpoint++;

      if (activePlayerHunt.currentCheckpoint < hunt.checkpoints.length) {
        const nextHint = hunt.checkpoints[activePlayerHunt.currentCheckpoint].hint;
        alert(`✅ Checkpoint ${currentIndex + 1} found!\n\nNext hint:\n${nextHint}`);
      } else {
        activePlayerHunt.treasureUnlocked = true;
        alert('✅ All checkpoints found!\n\nNow find the treasure.');
      }
    } else {
      alert('Not close enough. Keep searching!');
    }

    return;
  }

  const treasureDistance = map.distance(
    [lat, lng],
    [hunt.treasure.lat, hunt.treasure.lng]
  );

  if (treasureDistance <= radiusMeters) {
    activePlayerHunt.completed = true;
    alert('🏆 Treasure Hunt completed!');
  } else {
    alert('Treasure is not here. Keep searching!');
  }
}


function initAdminLoginModal() {
  const modal = document.getElementById('admin-login-modal');
  const input = document.getElementById('admin-token-input');
  const loginButton = document.getElementById('btn-admin-login');
  const closeButton = document.getElementById('btn-admin-login-close');
  const adminPanel = document.getElementById('admin-panel');

  if (!modal || !input || !loginButton || !closeButton || !adminPanel) return;

  closeButton.addEventListener('click', () => {
    modal.style.display = 'none';
    input.value = '';
  });

  loginButton.addEventListener('click', () => {
    const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
    const enteredToken = input.value.trim();

    if (!enteredToken) {
      alert('Please enter an admin code.');
      return;
    }

    if (
      (lobby?.admin_token && enteredToken === lobby.admin_token) ||
      enteredToken === GLOBAL_ADMIN_PASSWORD
    ) {
      localStorage.setItem(`geostickrs_admin_${lobby.name}`,
        lobby.admin_token
    );

      modal.style.display = 'none';
      input.value = '';

      adminPanel.style.display = 'flex';
      return;
    }

    alert('Wrong admin code.');
  });
}

window.addEventListener('load', initAdminLoginModal);


async function saveTreasureHuntToSupabase(hunt) {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));

  if (!lobby || !hunt) {
    alert('No lobby or hunt found.');
    return;
  }

  const { error } = await supabase
    .from('treasure_hunts')
    .insert([{
      lobby: lobby.name,
      active: hunt.active,
      expires_at: hunt.expiresAt,
      hunt_data: hunt
    }]);

  if (error) {
    console.error('Error saving Treasure Hunt:', error);
    alert('Error saving Treasure Hunt to Supabase.');
    return;
  }

  console.log('Treasure Hunt saved to Supabase:', hunt);
}

async function updateTreasureHuntInSupabase(hunt) {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));

  if (!lobby || !hunt) return;

  const { error } = await supabase
    .from('treasure_hunts')
    .update({
      active: hunt.active,
      expires_at: hunt.expiresAt,
      hunt_data: hunt
    })
    .eq('lobby', lobby.name);

  if (error) {
    console.error('Error updating Treasure Hunt:', error);
    alert('Error updating Treasure Hunt in Supabase.');
    return;
  }

  console.log('Treasure Hunt updated in Supabase:', hunt);
}

async function endTreasureHuntInSupabase() {
  const lobby = JSON.parse(
    sessionStorage.getItem('geostickrs_lobby')
  );

  if (!lobby) return;

  const { error } = await supabase
    .from('treasure_hunts')
    .update({ active: false })
    .eq('lobby', lobby.name);

  if (error) {
    console.error('Error ending Treasure Hunt:', error);
    return;
  }

  console.log('Treasure Hunt ended in Supabase.');
}

async function loadTreasureHuntFromSupabase() {
  const lobby = JSON.parse(
    sessionStorage.getItem('geostickrs_lobby')
  );

  if (!lobby) return;

  const { data, error } = await supabase
    .from('treasure_hunts')
    .select('*')
    .eq('lobby', lobby.name)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error loading Treasure Hunt:', error);
    return;
  }

  if (!data) {
    console.log('No active Treasure Hunt found.');
    return;
  }

  console.log('Active Treasure Hunt loaded:', data);

  localStorage.setItem(
    getTreasureHuntStorageKey(),
    JSON.stringify(data.hunt_data)
  );

  loadSavedTreasureHunt();
}




// ── MANHUNT ─────────────────────────────────────────

async function startManhunt() {

  if (!navigator.geolocation) {
    alert('GPS not available.');
    return;
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
  console.log('GPS position received:', pos.coords.latitude, pos.coords.longitude);

    const lobby = JSON.parse(
      sessionStorage.getItem('geostickrs_lobby')
    );

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    const offsetLat = (Math.random() * 0.4) - 0.2;
    const offsetLng = (Math.random() * 0.4) - 0.2;

    const box = {
      south: lat - 0.1 + offsetLat,
      north: lat + 0.1 + offsetLat,
      west: lng - 0.1 + offsetLng,
      east: lng + 0.1 + offsetLng
    };

    const { error } = await supabase
      .from('manhunts')
      .insert([{
        lobby: lobby.name,
        active: true,
        hider_name: 'Hider',
        hider_lat: lat,
        hider_lng: lng,
        box_geojson: box
      }]);

    if (error) {
      console.error(error);
      alert('Failed to start manhunt.');
      return;
    }
    console.log('Manhunt saved to Supabase');

    await loadManhuntFromSupabase();

    alert('🏃 Manhunt started.');

    },
    (err) => {
      console.error('GPS ERROR:', err);
      alert('GPS ERROR: ' + err.message);
    });
    }


    async function loadManhuntFromSupabase() {
  const lobby = JSON.parse(
    sessionStorage.getItem('geostickrs_lobby')
  );

  if (!lobby || !map) return;

  const { data, error } = await supabase
    .from('manhunts')
    .select('*')
    .eq('lobby', lobby.name)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error loading Manhunt:', error);
    return;
  }

  if (!data) {
    console.log('No active Manhunt found.');
    return;
  }

  console.log('Active Manhunt loaded:', data);

  activeManhunt = data;
  showManhuntOnMap(data);
}


function showManhuntOnMap(manhunt) {
  if (!map || !manhunt?.box_geojson) return;

  const box = manhunt.box_geojson;

  if (manhuntBoxLayer && map.hasLayer(manhuntBoxLayer)) {
    map.removeLayer(manhuntBoxLayer);
  }

  const bounds = [
    [box.south, box.west],
    [box.north, box.east]
  ];

  manhuntBoxLayer = L.rectangle(bounds, {
    color: '#ef4444',
    weight: 2,
    fillColor: '#ef4444',
    fillOpacity: 0.12,
    dashArray: '8, 6'
  }).addTo(map);

  map.fitBounds(bounds);

  const panel = document.getElementById('manhunt-panel');
  const status = document.getElementById('manhunt-status');
  const hint = document.getElementById('manhunt-hint');

  if (panel) panel.style.display = 'block';
  if (status) status.textContent = 'Active manhunt running';
  if (hint) hint.textContent = 'Search inside the red area. Find the hider and press Caught!';
}

function initManhuntCaughtButton() {
  const btn = document.getElementById('btn-manhunt-caught');

  if (!btn) return;

  btn.addEventListener('click', () => {
    checkManhuntCaught();
  });
}

window.addEventListener('load', initManhuntCaughtButton);


function checkManhuntCaught() {
  if (!activeManhunt) {
    alert('No active manhunt loaded.');
    return;
  }

  if (!navigator.geolocation) {
    alert('GPS not available.');
    return;
  }

  navigator.geolocation.getCurrentPosition((pos) => {
    const hunterLat = pos.coords.latitude;
    const hunterLng = pos.coords.longitude;

    const distance = map.distance(
      [hunterLat, hunterLng],
      [activeManhunt.hider_lat, activeManhunt.hider_lng]
    );

    const catchRadiusMeters = 50;

    if (distance <= catchRadiusMeters) {
      alert(`🏆 Caught! Distance: ${Math.round(distance)} m`);
    } else {
      alert(`❌ Not close enough. Distance: ${Math.round(distance)} m`);
    }

  }, (err) => {
    alert('GPS error: ' + err.message);
  });
}


async function endManhunt() {

  const lobby = JSON.parse(
    sessionStorage.getItem('geostickrs_lobby')
  );

  if (!lobby) return;

  const { error } = await supabase
    .from('manhunts')
    .update({ active: false })
    .eq('lobby', lobby.name)
    .eq('active', true);

  if (error) {
    console.error(error);
    alert('Failed to end manhunt.');
    return;
  }

  if (manhuntBoxLayer && map.hasLayer(manhuntBoxLayer)) {
    map.removeLayer(manhuntBoxLayer);
  }

  activeManhunt = null;

  document.getElementById('manhunt-panel').style.display = 'none';

  alert('🛑 Manhunt ended.');
}