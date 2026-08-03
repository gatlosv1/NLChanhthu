document.addEventListener('DOMContentLoaded', () => {
  const target = document.querySelector('[data-redirect]');
  if (target) {
    window.location.replace(target.getAttribute('data-redirect'));
  }
});
