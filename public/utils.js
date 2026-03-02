/**
 * Utilities for Service App frontend
 * Toast notifications, export functions, helpers
 */

// Toast notifications system
class Toast {
  static create(message, type = 'info', duration = 3000) {
    const container = this.getContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  static getContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      document.body.appendChild(container);
    }
    return container;
  }

  static success(msg, duration = 3000) { this.create(msg, 'success', duration); }
  static error(msg, duration = 5000) { this.create(msg, 'error', duration); }
  static info(msg, duration = 3000) { this.create(msg, 'info', duration); }
  static warning(msg, duration = 4000) { this.create(msg, 'warning', duration); }
}

// CSV Export helper
function exportToCSV(data, filename = 'export.csv') {
  if (!Array.isArray(data) || data.length === 0) {
    Toast.warning('Brak danych do eksportu');
    return;
  }

  const keys = Object.keys(data[0]);
  const csv = [
    keys.map(k => `"${k}"`).join(','),
    ...data.map(row => keys.map(k => {
      const val = row[k];
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.setAttribute('href', URL.createObjectURL(blob));
  link.setAttribute('download', filename);
  link.click();
  URL.revokeObjectURL(link.href);
  Toast.success('Plik CSV pobrany');
}

// JSON Export helper
function exportToJSON(data, filename = 'export.json') {
  if (!data) {
    Toast.warning('Brak danych do eksportu');
    return;
  }
  
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  link.setAttribute('href', URL.createObjectURL(blob));
  link.setAttribute('download', filename);
  link.click();
  URL.revokeObjectURL(link.href);
  Toast.success('Plik JSON pobrany');
}

// Format date and time in Polish
function formatDate(dateStr, includeTime = false) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const formatted = date.toLocaleDateString('pl-PL', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric'
  });
  if (includeTime) {
    const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    return `${formatted} ${time}`;
  }
  return formatted;
}

// Format duration from seconds to readable string
function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '-';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Debounce function for input events
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Show field error
function showFieldError(fieldName, message) {
  const errorEl = document.querySelector(`[data-for="${fieldName}"]`);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

// Clear field error
function clearFieldError(fieldName) {
  const errorEl = document.querySelector(`[data-for="${fieldName}"]`);
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }
}

// Clear all field errors
function clearAllFieldErrors() {
  document.querySelectorAll('[data-for]').forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
}

// SafeFetch with error handling
async function safeFetch(url, options = {}) {
  try {
    const headers = options.headers || {};
    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    Toast.error(error.message || 'Błąd połączenia');
    throw error;
  }
}

// Check if user is authenticated
function isAuthenticated() {
  return !!localStorage.getItem('token');
}

// Get auth headers
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// Logout user
function logout() {
  localStorage.removeItem('token');
  window.location.href = '/login.html';
}

// Format task status with emoji
function getStatusEmoji(status) {
  const emojis = {
    'utworzony': '🆕',
    'w trakcie': '⏳',
    'zakończony': '✓',
    'feedback': '⚠️',
    'archived': '📦'
  };
  return emojis[status] || '❓';
}

// Calculate task progress
function getTaskProgress(task) {
  if (task.status === 'zakończony') return 100;
  if (task.status === 'w trakcie') return 50;
  if (task.status === 'feedback') return 75;
  return 0;
}

// Mobile detection
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Get geolocation with timeout
async function getLocation(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    
    const timer = setTimeout(() => {
      reject(new Error('Geolocation timeout'));
    }, timeout);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// Compress image before upload
async function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round(height * maxWidth / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round(width * maxHeight / height);
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
}

// Build query string from object
function buildQueryString(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}
