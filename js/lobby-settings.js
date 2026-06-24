import { supabase } from './supabase.js';

// ── STATE ────────────────────────────────────────────
let map             = null;
let homePickerActive = false;

// ── INIT ─────────────────────────────────────────────
export function initLobbySettings(mapInstance) {
  map = mapInstance;
}

export const isHomePickerActive = () => homePickerActive;

// ── RENAME ───────────────────────────────────────────
export async function renameLobby() {
  const newName = document.getElementById('settings-lobby-name').value.trim();
  if (!newName) { alert('Please enter a new name.'); return; }

  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;
  if (!confirm(`Rename lobby to "${newName}"?`)) return;

  const oldName = lobby.name;

  const { error } = await supabase.from('lobbies').update({ name: newName }).eq('id', lobby.id);
  if (error) { alert('Error: ' + error.message); return; }

  // Cascade rename to all related tables
  await supabase.from('stickers')       .update({ lobby: newName }).eq('lobby', oldName);
  await supabase.from('manhunts')       .update({ lobby: newName }).eq('lobby', oldName);
  await supabase.from('treasure_hunts') .update({ lobby: newName }).eq('lobby', oldName);

  lobby.name = newName;
  sessionStorage.setItem('geostickrs_lobby', JSON.stringify(lobby));
  document.getElementById('lobby-badge-name').textContent = `🏠 ${newName}`;
  alert(`✅ Lobby renamed to "${newName}". All other players need to rejoin with the new name.`);
}

// ── CHANGE PASSWORD ──────────────────────────────────
export async function changeLobbyPassword() {
  const newPassword = document.getElementById('settings-lobby-password').value.trim();
  if (!newPassword) { alert('Please enter a new password.'); return; }

  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;
  if (!confirm('Change lobby password?')) return;

  const { error } = await supabase.from('lobbies').update({ password: newPassword }).eq('id', lobby.id);
  if (error) { alert('Error: ' + error.message); return; }

  lobby.password = newPassword;
  sessionStorage.setItem('geostickrs_lobby', JSON.stringify(lobby));
  document.getElementById('settings-lobby-password').value = '';
  alert('✅ Password changed.');
}

// ── CHANGE HOME LOCATION ─────────────────────────────
export function startHomePicker() {
  if (!map) return;
  homePickerActive = true;

  document.getElementById('admin-panel').style.display = 'none';

  const hint        = document.getElementById('location-hint');
  const instruction = document.getElementById('location-instruction');
  if (hint)        hint.style.display = 'flex';
  if (instruction) instruction.textContent = '🏠 Click on the map to set the new home location.';

  document.getElementById('btn-location-next').style.display = 'none';
  document.getElementById('btn-location-back').textContent   = '✕ Cancel';

  const cancelHandler = () => {
    homePickerActive = false;
    hint.style.display = 'none';
    document.getElementById('btn-location-next').style.display = '';
    document.getElementById('btn-location-back').textContent   = '← Back';
    document.getElementById('btn-location-back').removeEventListener('click', cancelHandler);
  };
  document.getElementById('btn-location-back').addEventListener('click', cancelHandler);
}

export async function saveNewHomeLocation(lat, lng) {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;

  const { error } = await supabase.from('lobbies').update({ home_lat: lat, home_lng: lng }).eq('id', lobby.id);
  if (error) { alert('Error: ' + error.message); return; }

  lobby.home_lat = lat;
  lobby.home_lng = lng;
  sessionStorage.setItem('geostickrs_lobby', JSON.stringify(lobby));

  document.getElementById('location-hint').style.display          = 'none';
  document.getElementById('btn-location-next').style.display      = '';
  document.getElementById('btn-location-back').textContent        = '← Back';
  homePickerActive = false;

  alert(`✅ Home location updated to ${lat.toFixed(4)}, ${lng.toFixed(4)}.`);
}

// ── DELETE LOBBY ─────────────────────────────────────
export async function deleteLobby() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;
  if (!confirm(`Delete lobby "${lobby.name}"? This cannot be undone.`)) return;
  if (!confirm('Are you sure? All stickers and game data will be lost.')) return;

  const { error } = await supabase.from('lobbies').delete().eq('id', lobby.id);
  if (error) { alert('Error: ' + error.message); return; }

  sessionStorage.removeItem('geostickrs_lobby');
  alert('Lobby deleted.');
  window.location.reload();
}
