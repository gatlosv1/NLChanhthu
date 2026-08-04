// Chuyển hướng trang ban đầu tới trang mục tiêu nếu có data-redirect.
document.addEventListener('DOMContentLoaded', () => {
  const target = document.querySelector('[data-redirect]');
  if (target) {
    window.location.replace(target.getAttribute('data-redirect'));
  }
});
