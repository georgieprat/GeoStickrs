// ── 1. SUPABASE CONFIG ──────────────────────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://bbornsnrwpqeugnmhmxb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qPM6-sPV3CvI3dl34_161A_Jfny2BC7';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 2. LEAFLET MAP ───────────────────────────────────
const map = L.map('map').setView([20, 0], 2);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap © CARTO'
}).addTo(map);

// ── 3. LOCATION DETECTION ────────────────────────────
let selectedLat = null;
let selectedLng = null;
let locationMarker = null;

document.getElementById('locate-btn').addEventListener('click', () => {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      selectedLat = pos.coords.latitude;
      selectedLng = pos.coords.longitude;
      updateLocationDisplay();
      map.setView([selectedLat, selectedLng], 10);
      placePreviewMarker(selectedLat, selectedLng);
    },
    () => alert('Could not get your location. Try clicking on the map instead.')
  );
});

// Allow clicking map to set location manually
map.on('click', (e) => {
  selectedLat = e.latlng.lat;
  selectedLng = e.latlng.lng;
  updateLocationDisplay();
  placePreviewMarker(selectedLat, selectedLng);
});

function updateLocationDisplay() {
  document.getElementById('location-display').textContent =
    `📍 Lat: ${selectedLat.toFixed(4)}, Lng: ${selectedLng.toFixed(4)}`;
}

function placePreviewMarker(lat, lng) {
  if (locationMarker) map.removeLayer(locationMarker);
  locationMarker = L.marker([lat, lng]).addTo(map)
    .bindPopup('Your sticker location').openPopup();
}

// ── 4. SCORING FUNCTION ──────────────────────────────
// Home base: change these to your sticker's actual origin city!
const HOME_LAT = 48.2082; // Vienna, Austria
const HOME_LNG = 16.3738;

async function calculateScore(lat, lng) {
  let score = 0;
  const breakdown = [];

  // Distance bonus: 1 point per 100 km, max 50 pts
  const distKm = getDistanceKm(lat, lng, HOME_LAT, HOME_LNG);
  const distScore = Math.min(Math.round(distKm / 100), 50);
  score += distScore;
  breakdown.push(`Distance: +${distScore} pts (${Math.round(distKm)} km from home)`);

  // Altitude bonus: 1 point per 100m elevation, max 30 pts
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`
    );
    const data = await res.json();
    const elevation = Math.max(0, data.elevation[0]);
    const altScore = Math.min(Math.round(elevation / 100), 30);
    score += altScore;
    breakdown.push(`Altitude: +${altScore} pts (${Math.round(elevation)}m elevation)`);
  } catch (e) {
    console.warn('Elevation fetch failed:', e);
    breakdown.push('Altitude: could not fetch');
  }

  // Remoteness bonus: extra 10 pts if more than 1000 km from home
  if (distKm > 1000) {
    score += 10;
    breakdown.push('Remoteness bonus: +10 pts (over 1000 km away!)');
  }

  console.log('Score breakdown:', breakdown.join(' | '));
  return { score, breakdown };
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── 5. SUBMIT HANDLER ────────────────────────────────
document.getElementById('submit-btn').addEventListener('click', async () => {
  const username    = document.getElementById('username').value.trim();
  const description = document.getElementById('description').value.trim();
  const photoFile   = document.getElementById('photo').files[0];
  const statusMsg   = document.getElementById('status-msg');

  if (!username)    return alert('Please enter a username');
  if (!selectedLat) return alert('Please set a location first (use button or click map)');
  if (!photoFile)   return alert('Please upload a photo');

  statusMsg.textContent = '⏳ Uploading photo...';
  statusMsg.style.color = '#888';

  try {
    // Upload photo to Supabase Storage
    const fileName = `${Date.now()}_${photoFile.name.replace(/\s/g, '_')}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('photos')
      .upload(fileName, photoFile, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('photos')
      .getPublicUrl(fileName);
    const photoURL = urlData.publicUrl;

    statusMsg.textContent = '⏳ Calculating score...';

    // Calculate score
    const { score, breakdown } = await calculateScore(selectedLat, selectedLng);

    // Save to Supabase database
    const { error: insertError } = await supabase
      .from('stickers')
      .insert([{
        username,
        description,
        lat: selectedLat,
        lng: selectedLng,
        photo_url: photoURL,
        score
      }]);

    if (insertError) throw insertError;

    statusMsg.textContent = `✅ Submitted! Score: ${score} pts`;
    statusMsg.style.color = 'green';

    // Reset form
    document.getElementById('username').value = '';
    document.getElementById('description').value = '';
    document.getElementById('photo').value = '';
    document.getElementById('location-display').textContent = 'No location set yet';
    selectedLat = null;
    selectedLng = null;
    if (locationMarker) { map.removeLayer(locationMarker); locationMarker = null; }

    // Reload all markers
    loadAllStickers();

  } catch (err) {
    console.error(err);
    statusMsg.textContent = `❌ Error: ${err.message}`;
    statusMsg.style.color = 'red';
  }
});

// ── 6. LOAD & DISPLAY ALL STICKERS ───────────────────
async function loadAllStickers() {
  const { data: stickers, error } = await supabase
    .from('stickers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { console.error('Error loading stickers:', error); return; }

  stickers.forEach(addMarkerToMap);
}

function addMarkerToMap(s) {
  const marker = L.marker([s.lat, s.lng]).addTo(map);
  marker.bindPopup(`
    <div style="font-family:sans-serif;font-size:13px;max-width:180px;">
      <strong>${s.username}</strong><br>
      ${s.description ? `<em>${s.description}</em><br>` : ''}
      🏆 Score: <strong>${s.score} pts</strong><br>
      ${s.photo_url
        ? `<img src="${s.photo_url}"
            style="max-width:160px;margin-top:6px;border-radius:6px;">`
        : ''}
    </div>
  `);
}

// Load stickers on page start
loadAllStickers();
