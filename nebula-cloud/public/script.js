// ============================================
//  NEBULA CLOUD - Self-Hosted (Local PC)
// ============================================

let allFiles = [];
let currentView = 'all';
let currentFilter = null;
let currentSearch = '';

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// ─────────────────────────────────────────────
// Load files from backend
// ─────────────────────────────────────────────
async function loadFiles(view = 'all') {
  currentView = view;

  const grid = document.getElementById('fileGrid');
  if (grid) {
    grid.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">⏳ Loading files...</div>';
  }

  try {
    const res = await fetch(`/api/files?view=${encodeURIComponent(view)}`);
    const data = await res.json();

    allFiles = Array.isArray(data) ? data : [];
    applyFilterAndRender();
    updateCounts();
    await loadStats();
  } catch (err) {
    console.error('Load error:', err);
    if (grid) {
      grid.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--danger);">❌ Could not load files. Is the server running?</div>';
    }
  }
}

// ─────────────────────────────────────────────
// Refresh
// ─────────────────────────────────────────────
function refreshFiles() {
  loadFiles(currentView);
  loadActivity();
}

// ─────────────────────────────────────────────
// Switch view
// ─────────────────────────────────────────────
function switchView(view) {
  currentFilter = null;
  currentSearch = '';

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  setActiveSidebarItem(view);
  setActiveTab('all');

  loadFiles(view);
}

// ─────────────────────────────────────────────
// Set active sidebar item
// ─────────────────────────────────────────────
function setActiveSidebarItem(view) {
  const items = document.querySelectorAll('.nav-item');
  items.forEach(item => item.classList.remove('active'));

  items.forEach(item => {
    const text = item.textContent.toLowerCase();

    if (view === 'all' && text.includes('my files')) {
      item.classList.add('active');
    } else if (view === 'starred' && text.includes('starred')) {
      item.classList.add('active');
    } else if (view === 'trash' && text.includes('trash')) {
      item.classList.add('active');
    }
  });
}

// ─────────────────────────────────────────────
// Filter by type
// ─────────────────────────────────────────────
function filterByType(type) {
  currentFilter = type;
  setActiveTab(type);
  applyFilterAndRender();
}

// ─────────────────────────────────────────────
// Set active tab
// ─────────────────────────────────────────────
function setActiveTab(type) {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => tab.classList.remove('active'));

  tabs.forEach(tab => {
    const text = tab.textContent.toLowerCase();

    if (type === 'all' && text.includes('all files')) {
      tab.classList.add('active');
    } else if (type === 'documents' && text.includes('documents')) {
      tab.classList.add('active');
    } else if (type === 'media' && text.includes('media')) {
      tab.classList.add('active');
    } else if (type === 'archives' && text.includes('archives')) {
      tab.classList.add('active');
    }
  });
}

// ─────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────
function searchFiles(query) {
  currentSearch = (query || '').trim().toLowerCase();
  applyFilterAndRender();
}

// ─────────────────────────────────────────────
// Apply filters and render
// ─────────────────────────────────────────────
function applyFilterAndRender() {
  let files = [...allFiles];

  // Type filter
  if (currentFilter === 'documents') {
    files = files.filter(file => {
      const ext = getExtension(file.name);
      return ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'].includes(ext);
    });
  } else if (currentFilter === 'media') {
    files = files.filter(file => {
      const ext = getExtension(file.name);
      return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mp3', 'wav', 'mov'].includes(ext);
    });
  } else if (currentFilter === 'archives') {
    files = files.filter(file => {
      const ext = getExtension(file.name);
      return ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext);
    });
  }

  // Search filter
  if (currentSearch) {
    files = files.filter(file =>
      (file.name || '').toLowerCase().includes(currentSearch)
    );
  }

  renderFiles(files);
}

// ─────────────────────────────────────────────
// Render files
// ─────────────────────────────────────────────
function renderFiles(files) {
  const grid = document.getElementById('fileGrid');
  if (!grid) return;

  if (!files || files.length === 0) {
    grid.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">No files found</div>';
    return;
  }

  grid.innerHTML = files.map(file => {
    const isFolder = file.kind === 'folder';
    const icon = getFileIcon(file);
    const sizeText = isFolder ? 'Folder' : formatBytes(file.size || 0);
    const dateText = formatDate(file.created_at);

    return `
      <div class="file-card">
        <span class="file-icon">${icon}</span>
        <div class="file-name">${escapeHtml(file.name || 'Untitled')}</div>

        <div class="file-meta">
          <span>${sizeText}</span>
          <span>${dateText}</span>
        </div>

        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
          ${!isFolder && file.url ? `<a href="${file.url}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}
          ${file.trashed === 1
            ? `<button onclick="restoreFile(${file.id})" style="background:var(--success);">Restore</button>`
            : `<button onclick="trashFile(${file.id})">Trash</button>`
          }
          <button onclick="deleteFile(${file.id})" style="background:var(--danger);">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

// ─────────────────────────────────────────────
// Upload files
// ─────────────────────────────────────────────
async function uploadFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const formData = new FormData();
  for (const file of fileList) {
    formData.append('files', file);
  }

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Upload failed');
    }

    const input = document.getElementById('fileUpload');
    if (input) input.value = '';

    await loadFiles(currentView);
    await loadActivity();
  } catch (err) {
    console.error('Upload error:', err);
    alert('Upload failed: ' + err.message);
  }
}

// ─────────────────────────────────────────────
// Create folder
// ─────────────────────────────────────────────
async function createFolder() {
  const name = prompt('Enter folder name:');
  if (!name || !name.trim()) return;

  try {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Folder creation failed');
    }

    await loadFiles(currentView);
    await loadActivity();
  } catch (err) {
    console.error('Create folder error:', err);
    alert('Could not create folder: ' + err.message);
  }
}

// ─────────────────────────────────────────────
// Move to trash
// ─────────────────────────────────────────────
async function trashFile(id) {
  try {
    const res = await fetch(`/api/files/${id}/trash`, {
      method: 'PATCH'
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Trash failed');

    await loadFiles(currentView);
    await loadActivity();
  } catch (err) {
    console.error('Trash error:', err);
    alert('Could not move file to trash: ' + err.message);
  }
}

// ─────────────────────────────────────────────
// Restore from trash
// ─────────────────────────────────────────────
async function restoreFile(id) {
  try {
    const res = await fetch(`/api/files/${id}/restore`, {
      method: 'PATCH'
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Restore failed');

    await loadFiles(currentView);
    await loadActivity();
  } catch (err) {
    console.error('Restore error:', err);
    alert('Could not restore file: ' + err.message);
  }
}

// ─────────────────────────────────────────────
// Permanently delete
// ─────────────────────────────────────────────
async function deleteFile(id) {
  if (!confirm('Are you sure you want to permanently delete this item?')) return;

  try {
    const res = await fetch(`/api/files/${id}`, {
      method: 'DELETE'
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Delete failed');

    await loadFiles(currentView);
    await loadActivity();
  } catch (err) {
    console.error('Delete error:', err);
    alert('Could not delete file: ' + err.message);
  }
}

// ─────────────────────────────────────────────
// Load activity
// ─────────────────────────────────────────────
async function loadActivity() {
  const list = document.getElementById('activityList');
  if (!list) return;

  try {
    const res = await fetch('/api/activity');
    const data = await res.json();
    const activities = Array.isArray(data) ? data : [];

    if (activities.length === 0) {
      list.innerHTML = `
        <div class="activity-item">
          <div class="a-icon">👋</div>
          <div class="a-info">
            <div class="a-title">Welcome to Nebula Cloud!</div>
            <div class="a-sub">Upload your first file</div>
          </div>
          <div class="a-time">now</div>
        </div>
      `;
      return;
    }

    list.innerHTML = activities.map(item => `
      <div class="activity-item">
        <div class="a-icon">${getActivityIcon(item.type)}</div>
        <div class="a-info">
          <div class="a-title">${escapeHtml(item.title || '')}</div>
          <div class="a-sub">${escapeHtml(item.subtitle || '')}</div>
        </div>
        <div class="a-time">${formatRelativeTime(item.timestamp)}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Activity load error:', err);
  }
}

// ─────────────────────────────────────────────
// Load stats
// ─────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();

    const usedBytes = Number(stats.usedBytes || 0);
    const totalBytes = Number(stats.totalBytes || (200 * 1024 * 1024 * 1024));
    const totalFiles = Number(stats.totalFiles || 0);

    const usagePercent = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;

    setText('fileCount', totalFiles);
    setText('trashCount', allFiles.filter(f => f.trashed === 1).length);
    setText('localCount', totalFiles);

    setText('usagePercent', `${usagePercent.toFixed(0)}%`);
    setText('usedStorage', formatBytes(usedBytes));
    setText('totalStorage', formatBytes(totalBytes));
    setText('statTotalFiles', String(totalFiles));
    setText('statStorageUsed', formatBytes(usedBytes));
    setText('statUploaded', String(totalFiles));

    const fill = document.getElementById('usageFill');
    if (fill) fill.style.width = `${usagePercent}%`;
  } catch (err) {
    console.error('Stats load error:', err);
  }
}

// ─────────────────────────────────────────────
// Counts
// ─────────────────────────────────────────────
function updateCounts() {
  const totalFiles = allFiles.filter(file => file.kind !== 'folder' || file.trashed !== 1).length;
  const trashCount = allFiles.filter(file => file.trashed === 1).length;

  setText('fileCount', String(totalFiles));
  setText('trashCount', String(trashCount));
  setText('localCount', String(totalFiles));
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getExtension(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function getFileIcon(file) {
  if (!file) return '📄';
  if (file.kind === 'folder') return '📁';

  const ext = getExtension(file.name);
  const map = {
    pdf: '📄',
    doc: '📝',
    docx: '📝',
    txt: '📃',
    md: '📝',
    rtf: '📝',
    xls: '📊',
    xlsx: '📊',
    csv: '📈',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    webp: '🖼️',
    mp4: '🎥',
    mov: '🎥',
    mp3: '🎵',
    wav: '🎵',
    zip: '📦',
    rar: '📦',
    '7z': '📦',
    tar: '📦',
    gz: '📦',
    html: '🌐',
    css: '🎨',
    js: '💻'
  };

  return map[ext] || '📄';
}

function getActivityIcon(type) {
  const map = {
    upload: '📤',
    create_folder: '📁',
    delete: '🗑️',
    restore: '♻️',
    login: '👤'
  };

  return map[type] || '⚡';
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(dateString) {
  if (!dateString) return 'just now';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'just now';

  return date.toLocaleString();
}

function formatRelativeTime(dateString) {
  if (!dateString) return 'now';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'now';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setActiveSidebarItem('all');
  setActiveTab('all');
  await loadFiles('all');
  await loadActivity();
});
