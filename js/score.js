// ── SCORING ──────────────────────────────────────────
// Calculates a score for a sticker based on distance from
// the lobby's home point and the location's elevation.

export async function calculateScore(lat, lng, homeLat, homeLng) {
  let score = 0;

  // Distance bonus: 1 pt per 100 km, max 50 pts
  const distKm = getDistanceKm(lat, lng, homeLat, homeLng);
  score += Math.min(Math.round(distKm / 100), 50);

  // Remoteness bonus: +10 pts if over 1000 km from home
  if (distKm > 1000) score += 10;

  // Altitude bonus: 1 pt per 100 m elevation, max 30 pts
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`
    );
    const data = await res.json();
    score += Math.min(Math.round(Math.max(0, data.elevation[0]) / 100), 30);
  } catch (e) { /* elevation is optional */ }

  return { score };
}

export function getDistanceKm(lat1, lng1, lat2, lng2) {
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
