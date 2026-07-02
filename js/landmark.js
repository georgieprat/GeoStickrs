import { supabase } from './supabase.js';
import { showToast, addMarkerToMap } from './submission.js';

// ── STATE ─────────────────────────────────────────────
let map                = null;
let activeLandmarkHunt = null;
let foundPhotoFile     = null;
let foundPhotoDataUrl  = null;
let hintPhotoFile      = null;

// ── INIT ──────────────────────────────────────────────
export function initLandmark(mapInstance) {
  map = mapInstance;

  document.getElementById('btn-lsh-found')?.addEventListener('click', openFoundModal);
  document.getElementById('btn-lsh-found-cancel')?.addEventListener('click', closeFoundModal);

  // FAB toggle
  document.getElementById('landmark-mobile-fab')?.addEventListener('click', () => {
    const panel = document.getElementById('landmark-panel');
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  });

  // Close button (mobile only — hidden via CSS on desktop)
  document.getElementById('btn-landmark-panel-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('landmark-panel').style.display = 'none';
  });

  // Prevent panel clicks from bubbling to the map
  document.getElementById('landmark-panel')?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Tap map to close panel on mobile
  map.on('click', () => {
    if (window.innerWidth <= 600) {
      document.getElementById('landmark-panel').style.display = 'none';
    }
  });

  // Admin hint photo
  document.getElementById('btn-lsh-hint-photo')?.addEventListener('click', () => {
    document.getElementById('lsh-hint-photo-input').click();
  });
  document.getElementById('lsh-hint-photo-input')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    hintPhotoFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('lsh-hint-photo-preview').src = ev.target.result;
      document.getElementById('lsh-hint-photo-preview-wrap').style.display = 'block';
    };
    reader.readAsDataURL(file);
  });

  // Hint photo lightbox
  document.getElementById('landmark-hint-photo')?.addEventListener('click', function() {
    if (this.src) window._openPhotoLightbox?.(this.src);
  });

  document.getElementById('btn-lsh-camera')?.addEventListener('click', () => {
    document.getElementById('lsh-camera-input').click();
  });
  document.getElementById('btn-lsh-upload')?.addEventListener('click', () => {
    document.getElementById('lsh-file-input-found').click();
  });

  ['lsh-camera-input', 'lsh-file-input-found'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      foundPhotoFile    = file;
      const reader      = new FileReader();
      reader.onload     = ev => {
        foundPhotoDataUrl = ev.target.result;
        document.getElementById('lsh-photo-preview').src = ev.target.result;
        document.getElementById('lsh-photo-preview-wrap').style.display = 'block';
        document.getElementById('btn-lsh-submit').disabled = false;
      };
      reader.readAsDataURL(file);
    });
  });

  document.getElementById('btn-lsh-submit')?.addEventListener('click', submitFound);
}

// Kept for script.js compat — new flow is GPS-based, no map clicks needed
export const getTreasureHuntDraft       = () => null;
export const isLandmarkGuessMode        = () => false;
export const getTreasureHuntStorageKey  = () => null;
export const checkTreasureHuntProgress  = () => {};
export const handleTreasureHuntClick    = () => {};
export const handleLandmarkGuess        = () => {};

// ── ADMIN: Post Hidden Sticker ────────────────────────
export async function postLandmarkSticker() {
  const hints = [1, 2, 3]
    .map(i => document.getElementById(`lsh-hint-${i}`)?.value.trim())
    .filter(Boolean);

  if (hints.length === 0) { alert('Please add at least one hint.'); return; }
  if (!navigator.geolocation) { alert('GPS not available on this device.'); return; }

  const btn = document.getElementById('btn-lsh-post');
  btn.disabled    = true;
  btn.textContent = '📡 Getting GPS…';

  navigator.geolocation.getCurrentPosition(async pos => {
    const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));

    // Upload hint photo if provided
    let hintPhotoUrl = null;
    if (hintPhotoFile) {
      const lobbyFolder = lobby.name.replace(/\s+/g, '_').toLowerCase();
      const fileName = `${lobbyFolder}/lsh_hint_${Date.now()}_${hintPhotoFile.name.replace(/\s/g, '_')}`;
      const { error: upErr } = await supabase.storage
        .from('photos').upload(fileName, hintPhotoFile, { cacheControl: '3600', upsert: false });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
        hintPhotoUrl = urlData.publicUrl;
      }
    }

    const { data, error } = await supabase.from('landmark_hunts').insert([{
      lobby:          lobby.name,
      active:         true,
      lat:            pos.coords.latitude,
      lng:            pos.coords.longitude,
      hints,
      hint_photo_url: hintPhotoUrl,
    }]).select().single();

    btn.disabled    = false;
    btn.textContent = '📍 Post Hidden Sticker';

    if (error) { alert('Error: ' + error.message); return; }

    hintPhotoFile = null;
    document.getElementById('lsh-hint-photo-preview-wrap').style.display = 'none';
    document.getElementById('lsh-hint-photo-input').value = '';

    activeLandmarkHunt = data;
    showAdminActivePhase();
    showPlayerPanel(data);
    alert('✅ Sticker Hunt posted! Players can now search.');
  }, err => {
    btn.disabled    = false;
    btn.textContent = '📍 Post Hidden Sticker';
    alert('GPS error: ' + err.message);
  });
}

// ── ADMIN: End Hunt ───────────────────────────────────
export async function endLandmarkHunt() {
  if (!activeLandmarkHunt) return;
  if (!confirm('End the Sticker Hunt?')) return;

  const { error } = await supabase
    .from('landmark_hunts')
    .update({ active: false })
    .eq('id', activeLandmarkHunt.id);

  if (error) { alert('Error: ' + error.message); return; }

  activeLandmarkHunt = null;
  document.getElementById('landmark-panel').style.display        = 'none';
  document.getElementById('landmark-mobile-fab').style.display   = 'none';
  document.getElementById('lsh-create-form').style.display       = 'block';
  document.getElementById('lsh-active-form').style.display       = 'none';
  [1, 2, 3].forEach(i => {
    const el = document.getElementById(`lsh-hint-${i}`);
    if (el) el.value = '';
  });
  alert('Sticker Hunt ended.');
}

// ── ADMIN: Load Submissions for Review ───────────────
export async function loadLandmarkSubmissions() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  const list  = document.getElementById('lsh-review-list');
  if (!list) return;
  list.innerHTML = 'Loading...';

  const { data, error } = await supabase
    .from('landmark_submissions')
    .select('*')
    .eq('lobby', lobby.name)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) { list.innerHTML = 'Error loading submissions.'; return; }
  if (!data.length) { list.innerHTML = '<p style="padding:8px">No pending submissions.</p>'; return; }

  list.innerHTML = data.map(s => `
    <div class="review-card" data-sub-id="${s.id}">
      <strong>${s.username}</strong><br>
      📍 ${Number(s.lat).toFixed(4)}, ${Number(s.lng).toFixed(4)}<br>
      ${s.photo_url
        ? `<img src="${s.photo_url}" style="width:100%;max-width:200px;border-radius:8px;margin:8px 0;">`
        : '<em>No photo</em>'}
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="lsh-approve-btn btn-primary"  data-id="${s.id}">✅ Approve</button>
        <button class="lsh-reject-btn  btn-secondary" data-id="${s.id}">❌ Reject</button>
      </div>
    </div>
  `).join('');
}

function calcLandmarkScore(subLat, subLng, huntLat, huntLng) {
  // Haversine distance in meters
  const R = 6371000;
  const dLat = (huntLat - subLat) * Math.PI / 180;
  const dLng = (huntLng - subLng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(subLat * Math.PI/180) * Math.cos(huntLat * Math.PI/180) * Math.sin(dLng/2)**2;
  const distMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  // 150 pts at 0m, 50 pts at 500m+
  const maxDist = 500;
  const distScore = Math.max(0, Math.floor((1 - Math.min(distMeters, maxDist) / maxDist) * 100));
  return { score: 50 + distScore, distMeters: Math.round(distMeters) };
}

export async function approveLandmarkSubmission(id) {
  await supabase.from('landmark_submissions').update({ status: 'approved' }).eq('id', id);

  const { data: sub } = await supabase
    .from('landmark_submissions').select('*').eq('id', id).single();

  if (sub) {
    const { data: hunt } = await supabase
      .from('landmark_hunts').select('id').eq('id', sub.hunt_id).single();

    const { data: newSticker } = await supabase.from('stickers').insert([{
      username:  sub.username,
      lat:       sub.lat,
      lng:       sub.lng,
      photo_url: sub.photo_url,
      score:     100,
      lobby:     sub.lobby,
      mode:      'landmark',
    }]).select().single();

    if (newSticker) addMarkerToMap(newSticker);

    alert(`✅ Submission approved! ${sub.username} gets 100 pts.\n\nHunt ended — first find wins!`);

    // End the hunt after first approval
    if (hunt) {
      await supabase.from('landmark_hunts').update({ active: false }).eq('id', hunt.id);
      activeLandmarkHunt = null;
    }
  } else {
    alert('✅ Submission approved!');
  }

  loadLandmarkSubmissions();
}

export async function rejectLandmarkSubmission(id) {
  const { error } = await supabase
    .from('landmark_submissions').update({ status: 'rejected' }).eq('id', id);
  if (error) { alert('Error: ' + error.message); return; }
  alert('Submission rejected.');
  loadLandmarkSubmissions();
}

// ── PLAYER: Realtime submission status notifications ──
export function subscribeToSubmissionUpdates() {
  const lobby    = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  const username = lobby?.username;
  if (!lobby || !username) return;

  supabase
    .channel('lsh-submission-status')
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'landmark_submissions',
    }, payload => {
      const row = payload.new;
      if (row.username !== username || row.lobby !== lobby.name) return;

      if (row.status === 'approved') {
        showToast('✅ Your Sticker Hunt find was approved!');
      } else if (row.status === 'rejected') {
        showToast('❌ Your Sticker Hunt find was rejected.');
      }
    })
    .subscribe();
}

// ── PLAYER: Load Active Hunt on Startup ───────────────
export async function loadActiveLandmarkHunt() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;

  const { data, error } = await supabase
    .from('landmark_hunts')
    .select('*')
    .eq('lobby', lobby.name)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) { console.error(error); return; }

  if (data) {
    activeLandmarkHunt = data;
    showPlayerPanel(data);
    showAdminActivePhase();
    subscribeToSubmissionUpdates();
  }

  subscribeLobbyLandmark();
}

// ── LOBBY-LEVEL SUBSCRIPTION (realtime start/stop for all) ──
function subscribeLobbyLandmark() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;

  supabase
    .channel('landmark-lobby-' + lobby.name)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'landmark_hunts',
      filter: `lobby=eq.${lobby.name}`,
    }, payload => {
      activeLandmarkHunt = payload.new;
      showPlayerPanel(payload.new);
      showAdminActivePhase();
      subscribeToSubmissionUpdates();
    })
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'landmark_hunts',
      filter: `lobby=eq.${lobby.name}`,
    }, payload => {
      if (!payload.new.active) {
        activeLandmarkHunt = null;
        document.getElementById('landmark-panel').style.display = 'none';
        document.getElementById('landmark-mobile-fab').style.display = 'none';
        document.getElementById('lsh-create-form').style.display = 'block';
        document.getElementById('lsh-active-form').style.display = 'none';
      }
    })
    .subscribe();
}

// ── UI HELPERS ────────────────────────────────────────
function isMobile() { return window.innerWidth <= 600; }

function showPlayerPanel(hunt) {
  const panel = document.getElementById('landmark-panel');
  const fab   = document.getElementById('landmark-mobile-fab');
  if (!panel || !hunt) return;

  const hints = Array.isArray(hunt.hints) ? hunt.hints : [];
  document.getElementById('landmark-current-hint').textContent = hints[0] || 'Find the hidden sticker!';

  const h2 = document.getElementById('landmark-hint-2');
  const h3 = document.getElementById('landmark-hint-3');
  if (h2) { h2.textContent = hints[1] || ''; h2.style.display = hints[1] ? 'block' : 'none'; }
  if (h3) { h3.textContent = hints[2] || ''; h3.style.display = hints[2] ? 'block' : 'none'; }

  // Hint photo
  const photoWrap = document.getElementById('landmark-hint-photo-wrap');
  const photoImg  = document.getElementById('landmark-hint-photo');
  if (photoWrap && photoImg) {
    if (hunt.hint_photo_url) {
      photoImg.src = hunt.hint_photo_url;
      photoWrap.style.display = 'block';
    } else {
      photoWrap.style.display = 'none';
    }
  }

  if (isMobile()) {
    fab.style.display   = 'flex';
    panel.style.display = 'none';
  } else {
    fab.style.display   = 'none';
    panel.style.display = 'block';
  }
}

function showAdminActivePhase() {
  const cf = document.getElementById('lsh-create-form');
  const af = document.getElementById('lsh-active-form');
  if (cf) cf.style.display = 'none';
  if (af) af.style.display = 'block';
}

// ── FOUND MODAL ───────────────────────────────────────
const LANDMARK_SUBMIT_RADIUS_M = 100;

function openFoundModal() {
  if (!activeLandmarkHunt) {
    alert('No active Sticker Hunt found.');
    return;
  }
  if (!navigator.geolocation) {
    alert('GPS not available on this device.');
    return;
  }

  const btn = document.getElementById('btn-lsh-found');
  if (btn) { btn.disabled = true; btn.textContent = '📡 Checking GPS…'; }

  navigator.geolocation.getCurrentPosition(pos => {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 I think I found it!'; }

    const R = 6371000;
    const dLat = (activeLandmarkHunt.lat - pos.coords.latitude) * Math.PI / 180;
    const dLng = (activeLandmarkHunt.lng - pos.coords.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
      Math.cos(pos.coords.latitude * Math.PI/180) * Math.cos(activeLandmarkHunt.lat * Math.PI/180) * Math.sin(dLng/2)**2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    if (dist > LANDMARK_SUBMIT_RADIUS_M) {
      alert(`❌ You are ${Math.round(dist)} m away. Get within ${LANDMARK_SUBMIT_RADIUS_M} m of the sticker to submit.`);
      return;
    }

    foundPhotoFile    = null;
    foundPhotoDataUrl = null;
    document.getElementById('lsh-photo-preview-wrap').style.display = 'none';
    document.getElementById('btn-lsh-submit').disabled               = true;
    document.getElementById('lsh-submit-status').textContent         = '';
    document.getElementById('lsh-found-modal').style.display         = 'flex';
    document.getElementById('map-overlay').classList.add('active');
  }, err => {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 I think I found it!'; }
    alert('GPS error: ' + err.message);
  }, { enableHighAccuracy: true, timeout: 10000 });
}

function closeFoundModal() {
  document.getElementById('lsh-found-modal').style.display = 'none';
  document.getElementById('map-overlay').classList.remove('active');
}

async function submitFound() {
  const lobby    = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  const username = lobby?.username;
  if (!username) { alert('No username found. Please rejoin the lobby.'); return; }
  if (!foundPhotoFile) { alert('Please take or upload a photo first.'); return; }

  const btn = document.getElementById('btn-lsh-submit');
  btn.disabled    = true;
  btn.textContent = '⏳ Submitting…';
  document.getElementById('lsh-submit-status').textContent = '📡 Getting your GPS location…';

  navigator.geolocation.getCurrentPosition(async pos => {
    let photoUrl = null;

    const lobbyFolder = lobby.name.replace(/\s+/g, '_').toLowerCase();
    const fileName    = `${lobbyFolder}/lsh_${Date.now()}_${foundPhotoFile.name.replace(/\s/g, '_')}`;
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(fileName, foundPhotoFile, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      btn.disabled    = false;
      btn.textContent = 'Submit 🚀';
      document.getElementById('lsh-submit-status').textContent = 'Upload error: ' + uploadError.message;
      return;
    }
    const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
    photoUrl = urlData.publicUrl;

    const { error } = await supabase.from('landmark_submissions').insert([{
      hunt_id:   activeLandmarkHunt.id,
      lobby:     lobby.name,
      username,
      lat:       pos.coords.latitude,
      lng:       pos.coords.longitude,
      photo_url: photoUrl,
      status:    'pending',
    }]);

    btn.disabled    = false;
    btn.textContent = 'Submit 🚀';

    if (error) {
      document.getElementById('lsh-submit-status').textContent = 'Error: ' + error.message;
      return;
    }

    closeFoundModal();
    alert('✅ Submitted! Waiting for admin to review your find.');
  }, err => {
    btn.disabled    = false;
    btn.textContent = 'Submit 🚀';
    document.getElementById('lsh-submit-status').textContent = 'GPS error: ' + err.message;
  });
}
