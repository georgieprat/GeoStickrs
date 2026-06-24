import { supabase } from './supabase.js';
import { loadLeaderboard } from './submission.js';
import {
  postLandmarkSticker, endLandmarkHunt,
  loadLandmarkSubmissions, approveLandmarkSubmission, rejectLandmarkSubmission,
} from './landmark.js';
import { createManhuntDraft, startManhunt, endManhunt } from './manhunt.js';
import {
  renameLobby, changeLobbyPassword, startHomePicker, deleteLobby,
} from './lobby-settings.js';

const GLOBAL_ADMIN_PASSWORD = 'LBS_Admin';

// ── HELPERS ───────────────────────────────────────────
/**
 * Toggle a sub-panel: show it if hidden, hide it if visible.
 * Returns true if the panel is now visible.
 */
function togglePanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return false;
  const isVisible = panel.style.display !== 'none' && panel.style.display !== '';
  panel.style.display = isVisible ? 'none' : 'block';
  return !isVisible;
}

// ── RULES OVERLAY ─────────────────────────────────────
function initRulesOverlay() {
  const rulesSection = document.getElementById('RulesAndLegal');
  if (!rulesSection) return;

  // Build overlay wrapper around the existing RulesAndLegal div
  const overlay = document.createElement('div');
  overlay.id = 'rules-overlay';
  overlay.style.cssText = [
    'display:none',
    'position:fixed',
    'inset:0',
    'z-index:9999',
    'background:rgba(0,0,0,0.6)',
    'overflow-y:auto',
    'padding:24px 16px',
    'box-sizing:border-box',
  ].join(';');

  const modal = document.createElement('div');
  modal.style.cssText = [
    'position:relative',
    'background:#fff',
    'border-radius:12px',
    'max-width:680px',
    'margin:0 auto',
    'padding:32px 28px 28px',
    'font-size:14px',
    'line-height:1.6',
    'color:#18181b',
  ].join(';');

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Close rules');
  closeBtn.style.cssText = [
    'position:absolute',
    'top:12px',
    'right:14px',
    'background:none',
    'border:none',
    'font-size:26px',
    'line-height:1',
    'cursor:pointer',
    'color:#52525b',
    'padding:0 4px',
  ].join(';');

  // Move the RulesAndLegal content into the modal
  rulesSection.style.display = 'block'; // make it visible inside the modal
  modal.appendChild(closeBtn);
  modal.appendChild(rulesSection);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on X button
  closeBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.style.display = 'none';
  });

  // Expose open function
  overlay.open = () => { overlay.style.display = 'block'; };

  return overlay;
}

// ── ADMIN PANEL ──────────────────────────────────────
function initAdminPanel() {
  const adminButton = document.getElementById('btn-admin-panel');
  const adminPanel  = document.getElementById('admin-panel');
  const closeButton = document.getElementById('btn-admin-close');
  if (!adminButton || !adminPanel || !closeButton) return;

  const rulesOverlay = initRulesOverlay();

  adminButton.addEventListener('click', () => {
    const lobby      = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
    const localToken = localStorage.getItem(`geostickrs_admin_${lobby.name}`);

    if (localToken && lobby.admin_token && localToken === lobby.admin_token) {
      adminPanel.style.display = 'flex';
      return;
    }
    document.getElementById('admin-login-modal').style.display = 'flex';
  });

  closeButton.addEventListener('click', () => { adminPanel.style.display = 'none'; });

  adminPanel.addEventListener('click', (e) => {
    if (e.target === adminPanel) adminPanel.style.display = 'none';
  });

  // ── Landmark Sticker Hunt ─────────────────────────
  document.getElementById('btn-admin-treasure')?.addEventListener('click', () => {
    togglePanel('treasure-panel');
  });
  document.getElementById('btn-treasure-back')?.addEventListener('click', () => {
    document.getElementById('treasure-panel').style.display = 'none';
  });
  document.getElementById('btn-lsh-post')?.addEventListener('click', postLandmarkSticker);
  document.getElementById('btn-lsh-stop')?.addEventListener('click', endLandmarkHunt);
  document.getElementById('btn-lsh-review-submissions')?.addEventListener('click', () => {
    document.getElementById('lsh-review-panel').style.display = 'block';
    loadLandmarkSubmissions();
  });
  document.getElementById('btn-lsh-review-close')?.addEventListener('click', () => {
    document.getElementById('lsh-review-panel').style.display = 'none';
  });

  // ── Manhunt ──────────────────────────────────────
  document.getElementById('btn-admin-manhunt')?.addEventListener('click', () => {
    togglePanel('manhunt-admin-panel');
  });
  document.getElementById('btn-manhunt-create')?.addEventListener('click', createManhuntDraft);
  document.getElementById('btn-manhunt-start')?.addEventListener('click',  startManhunt);
  document.getElementById('btn-manhunt-stop')?.addEventListener('click',   endManhunt);
  document.getElementById('btn-manhunt-back')?.addEventListener('click', () => {
    document.getElementById('manhunt-admin-panel').style.display = 'none';
  });

  // ── Moderation ───────────────────────────────────
  document.getElementById('btn-admin-review')?.addEventListener('click', () => {
    const nowVisible = togglePanel('review-panel');
    if (nowVisible) loadReviewPanel();
  });
  document.getElementById('btn-review-close')?.addEventListener('click', () => {
    document.getElementById('review-panel').style.display = 'none';
  });

  // ── Lobby Settings ───────────────────────────────
  document.getElementById('btn-admin-settings')?.addEventListener('click', () => {
    const panel = document.getElementById('lobby-settings-panel');
    if (!panel) return;
    const isVisible = panel.style.display !== 'none' && panel.style.display !== '';
    if (isVisible) {
      panel.style.display = 'none';
      return;
    }
    const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
    document.getElementById('settings-lobby-name').value     = lobby?.name ?? '';
    document.getElementById('settings-lobby-password').value = '';
    panel.style.display = 'block';
  });
  document.getElementById('btn-settings-back')?.addEventListener('click', () => {
    document.getElementById('lobby-settings-panel').style.display = 'none';
  });
  document.getElementById('btn-settings-rename')?.addEventListener('click',   renameLobby);
  document.getElementById('btn-settings-password')?.addEventListener('click', changeLobbyPassword);
  document.getElementById('btn-settings-home')?.addEventListener('click',     startHomePicker);
  document.getElementById('btn-settings-delete')?.addEventListener('click',   deleteLobby);

  // ── Placeholders ─────────────────────────────────
  document.getElementById('btn-admin-capture')?.addEventListener('click', () => {
    alert('Capture The Sticker coming soon.');
  });
  document.getElementById('btn-admin-rules')?.addEventListener('click', () => {
    rulesOverlay?.open();
  });
}

// ── ADMIN LOGIN MODAL ────────────────────────────────
function initAdminLoginModal() {
  const modal       = document.getElementById('admin-login-modal');
  const input       = document.getElementById('admin-token-input');
  const loginButton = document.getElementById('btn-admin-login');
  const closeButton = document.getElementById('btn-admin-login-close');
  const adminPanel  = document.getElementById('admin-panel');
  if (!modal || !input || !loginButton || !closeButton || !adminPanel) return;

  closeButton.addEventListener('click', () => { modal.style.display = 'none'; input.value = ''; });

  loginButton.addEventListener('click', () => {
    const lobby        = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
    const enteredToken = input.value.trim();

    if (!enteredToken) { alert('Please enter an admin code.'); return; }

    if (
      (lobby?.admin_token && enteredToken === lobby.admin_token) ||
      enteredToken === GLOBAL_ADMIN_PASSWORD
    ) {
      localStorage.setItem(`geostickrs_admin_${lobby.name}`, lobby.admin_token);
      modal.style.display      = 'none';
      input.value              = '';
      adminPanel.style.display = 'flex';
      return;
    }

    alert('Wrong admin code.');
  });
}

// ── REVIEW PANEL ─────────────────────────────────────
async function loadReviewPanel() {
  const lobby = JSON.parse(sessionStorage.getItem('geostickrs_lobby'));
  if (!lobby) return;

  const reviewList = document.getElementById('review-list');
  reviewList.innerHTML = 'Loading...';

  const { data, error } = await supabase
    .from('stickers')
    .select('*')
    .eq('lobby', lobby.name)
    .order('created_at', { ascending: false });

  if (error) { reviewList.innerHTML = 'Failed to load stickers.'; return; }

  reviewList.innerHTML = data.map(s => `
    <div class="review-card">
      <strong>${s.username}</strong><br>
      🏆 ${s.score} pts<br>
      ${s.photo_url
        ? `<img src="${s.photo_url}" style="width:100%;max-width:200px;border-radius:8px;margin-top:8px;">`
        : '<em>No photo</em>'}
      <br>
      <button class="delete-sticker-btn" data-id="${s.id}">🗑 Delete</button>
      <br><br>
    </div>
  `).join('');
}

document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('delete-sticker-btn')) {
    const stickerId = e.target.dataset.id;
    if (!confirm('Delete this sticker?')) return;
    const { error } = await supabase.from('stickers').delete().eq('id', stickerId);
    if (error) { alert('Failed to delete sticker.'); return; }
    alert('Sticker deleted.');
    loadReviewPanel();
    loadLeaderboard();
    return;
  }

  if (e.target.classList.contains('lsh-approve-btn')) {
    const id = e.target.dataset.id;
    if (!confirm('Approve this submission?')) return;
    await approveLandmarkSubmission(id);
    return;
  }

  if (e.target.classList.contains('lsh-reject-btn')) {
    const id = e.target.dataset.id;
    if (!confirm('Reject this submission?')) return;
    await rejectLandmarkSubmission(id);
    return;
  }
});

// ── BOOT ─────────────────────────────────────────────
window.addEventListener('load', () => {
  initAdminPanel();
  initAdminLoginModal();
});
