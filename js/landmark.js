import { supabase } from './supabase.js';
import { showToast, addMarkerToMap } from './submission.js';

// ── STATE ─────────────────────────────────────────────
let map                = null;
let activeLandmarkHunt = null;
let foundPhotoFile     = null;
let foundPhotoDataUrl  = null;

// ── INIT ──────────────────────────────────────────────
export function initLandmark(mapInstance) {
  map = mapInstance;

  document.getElementById('btn-lsh-found')?.addEventListener('click', openFoundModal);
  document.getElementById('btn-lsh-found-cancel')?.addEventListener('click', closeFoundModal);

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
    const { data, error } = await supabase.from('landmark_hunts').insert([{
      lobby:  lobby.name,
      active: true,
      lat:    pos.coords.latitude,
      lng:    pos.coords.longitude,
      hints,
    }]).select().single();

    btn.disabled    = false;
    btn.textContent = '📍 Post Hidden Sticker';

    if (error) { alert('Error: ' + error.message); return; }

    activeLandmarkHunt = data;
    showAdminActivePhase();
    showPlayerPanel(data);
    alert('✅ Landmark Sticker Hunt posted! Players can now search.');
  }, err => {
    btn.disabled    = false;
    btn.textContent = '📍 Post Hidden Sticker';
    alert('GPS error: ' + err.message);
  });
}

// ── ADMIN: End Hunt ───────────────────────────────────
export async function endLandmarkHunt() {
  if (!activeLandmarkHunt) return;
  if (!confirm('End the Landmark Sticker Hunt?')) return;

  const { error } = await supabase
    .from('landmark_hunts')
    .update({ active: false })
    .eq('id', activeLandmarkHunt.id);

  if (error) { alert('Error: ' + error.message); return; }

  activeLandmarkHunt = null;
  document.getElementById('landmark-panel').style.display = 'none';
  document.getElementById('lsh-create-form').style.display  = 'block';
  document.getElementById('lsh-active-form').style.display  = 'none';
  [1, 2, 3].forEach(i => {
    const el = document.getElementById(`lsh-hint-${i}`);
    if (el) el.value = '';
  });
  alert('Landmark Sticker Hunt ended.');
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

export async function approveLandmarkSubmission(id) {
  await supabase.from('landmark_submissions').update({ status: 'approved' }).eq('id', id);

  const { data: sub } = await supabase
    .from('landmark_submissions').select('*').eq('id', id).single();

  if (sub) {
    // score: 0 — scoring is handled by another team member
    const { data: newSticker } = await supabase.from('stickers').insert([{
      username:  sub.username,
      lat:       sub.lat,
      lng:       sub.lng,
      photo_url: sub.photo_url,
      score:     0,
      lobby:     sub.lobby,
      mode:      'landmark',
    }]).select().single();

    if (newSticker) addMarkerToMap(newSticker);
  }

  alert('✅ Submission approved!');
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
        showToast('✅ Dein Landmark-Fund wurde bestätigt! Sticker posted.');
      } else if (row.status === 'rejected') {
        showToast('❌ Dein Landmark-Fund wurde leider abgelehnt.');
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
  if (!data) return;

  activeLandmarkHunt = data;
  showPlayerPanel(data);
  showAdminActivePhase();
  subscribeToSubmissionUpdates();
}

// ── UI HELPERS ────────────────────────────────────────
function showPlayerPanel(hunt) {
  const panel = document.getElementById('landmark-panel');
  if (!panel || !hunt) return;
  panel.style.display = 'block';

  const hints = Array.isArray(hunt.hints) ? hunt.hints : [];
  document.getElementById('landmark-current-hint').textContent = hints[0] || 'Find the hidden sticker!';

  const h2 = document.getElementById('landmark-hint-2');
  const h3 = document.getElementById('landmark-hint-3');
  if (h2) { h2.textContent = hints[1] || ''; h2.style.display = hints[1] ? 'block' : 'none'; }
  if (h3) { h3.textContent = hints[2] || ''; h3.style.display = hints[2] ? 'block' : 'none'; }
}

function showAdminActivePhase() {
  const cf = document.getElementById('lsh-create-form');
  const af = document.getElementById('lsh-active-form');
  if (cf) cf.style.display = 'none';
  if (af) af.style.display = 'block';
}

// ── FOUND MODAL ───────────────────────────────────────
function openFoundModal() {
  if (!activeLandmarkHunt) {
    alert('No active Landmark Sticker Hunt found.');
    return;
  }
  foundPhotoFile    = null;
  foundPhotoDataUrl = null;
  document.getElementById('lsh-photo-preview-wrap').style.display = 'none';
  document.getElementById('btn-lsh-submit').disabled               = true;
  document.getElementById('lsh-submit-status').textContent         = '';
  document.getElementById('lsh-found-modal').style.display         = 'flex';
  document.getElementById('map-overlay').classList.add('active');
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
