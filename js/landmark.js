import { supabase } from './supabase.js';

// ── STATE ────────────────────────────────────────────
let map                      = null;
let treasureHuntDraft        = null;
let treasureHuntStep         = 0;
let treasureHuntMarkers      = [];
let pendingCheckpoint        = null;
let treasureHuntCheckpointCount = 3;
let huntTimerInterval        = null;
let activePlayerHunt         = null;
let landmarkGuessMode        = false;

// ── INIT ─────────────────────────────────────────────
export function initLandmark(mapInstance) {
  map = mapInstance;

  document.getElementById('btn-landmark-guess')
    ?.addEventListener('click', () => {
      landmarkGuessMode = true;
      alert('🎯 Guess Mode enabled.\n\nClick on the map to place your guess.');
    });

  initHintModal();
}

// Getters for map click handler in script.js
export const getTreasureHuntDraft    = () => treasureHuntDraft;
export const isLandmarkGuessMode     = () => landmarkGuessMode;

// ── STORAGE KEY ──────────────────────────────────────
export function getTreasureHuntStorageKey() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  return `geostickrs_treasure_hunt_${lobby?.name ?? 'default'}`;
}

// ── BUTTON STATE ─────────────────────────────────────
export function updateLandmarkHuntButtons(state) {
  const create = document.getElementById('btn-treasure-create');
  const start  = document.getElementById('btn-treasure-start');
  const stop   = document.getElementById('btn-treasure-stop');
  if (!create || !start || !stop) return;
  create.style.display = state === 'create' ? 'block' : 'none';
  start.style.display  = state === 'start'  ? 'block' : 'none';
  stop.style.display   = state === 'stop'   ? 'block' : 'none';
}

// ── CREATE ───────────────────────────────────────────
export function startTreasureHuntCreator() {
  document.getElementById('admin-panel').style.display = 'none';

  const selectedCount = Number(document.getElementById('treasure-checkpoint-count')?.value);
  treasureHuntCheckpointCount = Number.isInteger(selectedCount) && selectedCount > 0 ? selectedCount : 3;

  const durationMinutes = Number(document.getElementById('treasure-duration')?.value ?? 60);
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
    active: false,
  };

  treasureHuntStep = 0;
  alert(`Treasure Hunt Creator started. Click on the map to set Checkpoint 1 of ${treasureHuntCheckpointCount}.`);
}

// ── MAP CLICK HANDLER ────────────────────────────────
export function handleTreasureHuntClick(lat, lng) {
  if (!map || !treasureHuntDraft) return;

  if (treasureHuntStep < treasureHuntCheckpointCount) {
    pendingCheckpoint = { lat, lng };
    document.getElementById('checkpoint-hint-input').value = '';
    document.getElementById('hint-modal').style.display = 'flex';
    return;
  }

  // Place treasure
  treasureHuntDraft.treasure = { lat, lng };

  const marker = L.marker([lat, lng]).addTo(map).bindPopup('🏆 Treasure').openPopup();
  treasureHuntMarkers.push(marker);

  localStorage.setItem(getTreasureHuntStorageKey(), JSON.stringify(treasureHuntDraft));
  saveTreasureHuntToSupabase(treasureHuntDraft);

  alert('🏛️ Landmark Hunt created! You can now start it.');
  updateLandmarkHuntButtons('start');

  treasureHuntDraft = null;
  treasureHuntStep  = 0;
}

// ── HINT MODAL ───────────────────────────────────────
function initHintModal() {
  const saveButton = document.getElementById('btn-save-hint');
  if (!saveButton) return;

  saveButton.addEventListener('click', () => {
    if (!pendingCheckpoint || !treasureHuntDraft) return;

    const hintInput = document.getElementById('checkpoint-hint-input');
    const hint = hintInput.value.trim() || `Hint Level ${treasureHuntStep + 1}`;

    treasureHuntDraft.checkpoints.push({
      lat: pendingCheckpoint.lat,
      lng: pendingCheckpoint.lng,
      hint,
    });

    const marker = L.marker([pendingCheckpoint.lat, pendingCheckpoint.lng])
      .addTo(map)
      .bindPopup(`<strong>Hint ${treasureHuntStep + 1}</strong><br>${hint}`)
      .openPopup();

    treasureHuntMarkers.push(marker);
    pendingCheckpoint = null;
    document.getElementById('hint-modal').style.display = 'none';
    treasureHuntStep++;

    if (treasureHuntStep < treasureHuntCheckpointCount) {
      alert(`Hint ${treasureHuntStep} saved. Set Hint ${treasureHuntStep + 1}.`);
    } else {
      alert(`Checkpoint ${treasureHuntCheckpointCount} saved. Now place the Treasure.`);
    }
  });
}

// ── START ────────────────────────────────────────────
export function startPreparedTreasureHunt() {
  const saved = localStorage.getItem(getTreasureHuntStorageKey());
  if (!saved) { alert('No Treasure Hunt created yet.'); return; }

  const hunt = JSON.parse(saved);

  if (!hunt.checkpoints || hunt.checkpoints.length < hunt.checkpointCount || !hunt.treasure) {
    alert(`Treasure Hunt is incomplete. Please create ${hunt.checkpointCount} checkpoints and a treasure first.`);
    return;
  }

  const durationMinutes = Number(document.getElementById('treasure-duration')?.value ?? 60);

  hunt.active    = true;
  hunt.startedAt = new Date().toISOString();
  hunt.expiresAt = durationMinutes > 0
    ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
    : null;

  localStorage.setItem(getTreasureHuntStorageKey(), JSON.stringify(hunt));
  updateTreasureHuntInSupabase(hunt);
  showHuntBadge(hunt);
  alert('🏛️ Landmark Hunt started!');
  updateLandmarkHuntButtons('stop');
}

// ── END ──────────────────────────────────────────────
export function endTreasureHunt() {
  localStorage.removeItem(getTreasureHuntStorageKey());

  treasureHuntMarkers.forEach(m => { if (map?.hasLayer(m)) map.removeLayer(m); });
  treasureHuntMarkers  = [];
  treasureHuntDraft    = null;
  treasureHuntStep     = 0;
  activePlayerHunt     = null;
  landmarkGuessMode    = false;

  document.getElementById('hunt-badge').style.display    = 'none';
  document.getElementById('landmark-panel').style.display = 'none';
  document.getElementById('landmark-progress').textContent      = '';
  document.getElementById('landmark-current-hint').textContent  = '';
  document.getElementById('landmark-max-score').textContent     = '';

  updateLandmarkHuntButtons('create');
  endTreasureHuntInSupabase();
  alert('Landmark Hunt ended.');
}

// ── BADGE + TIMER ────────────────────────────────────
function showHuntBadge(hunt) {
  const badge = document.getElementById('hunt-badge');
  const timer = document.getElementById('hunt-timer');
  if (!badge || !timer || !hunt) return;

  badge.style.display = 'none';
  showLandmarkPanel(hunt);

  function updateTimer() {
    if (!hunt.expiresAt) { timer.textContent = 'No time limit'; return; }

    const remainingMs = new Date(hunt.expiresAt) - new Date();
    if (remainingMs <= 0) {
      timer.textContent = 'Expired';
      badge.style.display = 'none';
      localStorage.removeItem(getTreasureHuntStorageKey());
      clearInterval(huntTimerInterval);
      return;
    }

    const minutes = Math.floor(remainingMs / 60000);
    const hours   = Math.floor(minutes / 60);
    timer.textContent = hours > 0
      ? `${hours}h ${minutes % 60}min remaining`
      : `${minutes}min remaining`;
  }

  updateTimer();
  clearInterval(huntTimerInterval);
  huntTimerInterval = setInterval(updateTimer, 1000);
}

// ── PLAYER PANEL ─────────────────────────────────────
function showLandmarkPanel(hunt) {
  const panel = document.getElementById('landmark-panel');
  if (!panel || !hunt?.checkpoints?.length) return;

  panel.style.display = 'block';
  document.getElementById('landmark-progress').textContent     = 'Hint 1 / ' + hunt.checkpoints.length;
  document.getElementById('landmark-current-hint').textContent = hunt.checkpoints[0].hint;
  document.getElementById('landmark-max-score').textContent    = 'Max Score: 500 pts';
}

// ── TREASURE HUNT PROGRESS (map click) ───────────────
export function checkTreasureHuntProgress(lat, lng) {
  const saved = localStorage.getItem(getTreasureHuntStorageKey());
  if (!saved) return;

  const hunt = JSON.parse(saved);
  if (!hunt.active) return;

  if (!activePlayerHunt) {
    activePlayerHunt = { currentCheckpoint: 0, treasureUnlocked: false, completed: false };
  }

  if (activePlayerHunt.completed) return;

  const radiusMeters = 50000;

  if (!activePlayerHunt.treasureUnlocked) {
    const checkpoint = hunt.checkpoints[activePlayerHunt.currentCheckpoint];
    if (!checkpoint) return;

    const distance = map.distance([lat, lng], [checkpoint.lat, checkpoint.lng]);

    if (distance <= radiusMeters) {
      activePlayerHunt.currentCheckpoint++;
      if (activePlayerHunt.currentCheckpoint < hunt.checkpoints.length) {
        alert(`✅ Checkpoint ${activePlayerHunt.currentCheckpoint} found!\n\nNext hint:\n${hunt.checkpoints[activePlayerHunt.currentCheckpoint].hint}`);
      } else {
        activePlayerHunt.treasureUnlocked = true;
        alert('✅ All checkpoints found!\n\nNow find the treasure.');
      }
    } else {
      alert('Not close enough. Keep searching!');
    }
    return;
  }

  const treasureDistance = map.distance([lat, lng], [hunt.treasure.lat, hunt.treasure.lng]);
  if (treasureDistance <= radiusMeters) {
    activePlayerHunt.completed = true;
    alert('🏆 Treasure Hunt completed!');
  } else {
    alert('Treasure is not here. Keep searching!');
  }
}

// ── LANDMARK GUESS ───────────────────────────────────
export function handleLandmarkGuess(lat, lng) {
  landmarkGuessMode = false;

  const saved = localStorage.getItem(getTreasureHuntStorageKey());
  if (!saved) { alert('No active Landmark Hunt.'); return; }

  const hunt = JSON.parse(saved);
  if (!hunt.treasure) { alert('No landmark configured.'); return; }

  const distance = map.distance([lat, lng], [hunt.treasure.lat, hunt.treasure.lng]);

  let score = 0;
  if      (distance <= 1000)   score = 500;
  else if (distance <= 10000)  score = 300;
  else if (distance <= 50000)  score = 200;
  else if (distance <= 200000) score = 100;

  alert(`🎯 Guess submitted!\n\nDistance: ${Math.round(distance / 1000)} km\nScore: ${score} pts`);
}

// ── LOAD FROM SUPABASE ───────────────────────────────
export async function loadTreasureHuntFromSupabase() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;

  const { data, error } = await supabase
    .from('treasure_hunts')
    .select('*')
    .eq('lobby', lobby.name)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) { console.error('Error loading Treasure Hunt:', error); return; }
  if (!data)  { console.log('No active Treasure Hunt found.'); return; }

  localStorage.setItem(getTreasureHuntStorageKey(), JSON.stringify(data.hunt_data));
  updateLandmarkHuntButtons('stop');

  const hunt = data.hunt_data;
  if (!hunt.active) return;
  if (hunt.expiresAt && new Date(hunt.expiresAt) < new Date()) {
    localStorage.removeItem(getTreasureHuntStorageKey());
    return;
  }
  showHuntBadge(hunt);
}

// ── SUPABASE HELPERS ─────────────────────────────────
async function saveTreasureHuntToSupabase(hunt) {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby || !hunt) return;

  const { error } = await supabase.from('treasure_hunts').insert([{
    lobby:      lobby.name,
    active:     hunt.active,
    expires_at: hunt.expiresAt,
    hunt_data:  hunt,
  }]);

  if (error) console.error('Error saving Treasure Hunt:', error);
}

async function updateTreasureHuntInSupabase(hunt) {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby || !hunt) return;

  const { error } = await supabase
    .from('treasure_hunts')
    .update({ active: hunt.active, expires_at: hunt.expiresAt, hunt_data: hunt })
    .eq('lobby', lobby.name);

  if (error) console.error('Error updating Treasure Hunt:', error);
}

async function endTreasureHuntInSupabase() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;

  const { error } = await supabase
    .from('treasure_hunts')
    .update({ active: false })
    .eq('lobby', lobby.name);

  if (error) console.error('Error ending Treasure Hunt:', error);
}
