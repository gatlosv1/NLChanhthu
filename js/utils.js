export function showLoading() {
  const overlay = document.createElement('div');
  overlay.id = 'loadingOverlay';
  overlay.className = 'loading-overlay';
  overlay.innerHTML = '<div class="spinner"></div>';
  document.body.appendChild(overlay);
}

export function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.remove();
}

export function showToast(message, type = 'info') {
  const stack = document.getElementById('toastStack') || createToastStack();
  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.textContent = message;
  stack.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3200);
}

function createToastStack() {
  const stack = document.createElement('div');
  stack.id = 'toastStack';
  stack.className = 'toast-stack';
  document.body.appendChild(stack);
  return stack;
}

export function getCurrentPageName() {
  return window.location.pathname.split('/').pop() || 'index.html';
}
