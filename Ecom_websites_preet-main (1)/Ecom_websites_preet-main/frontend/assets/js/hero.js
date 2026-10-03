// assets/js/hero.js
// FIX: Controls opacity via inline styles (not CSS classes)
// This prevents the layout-jump auto-scroll bug
document.addEventListener('DOMContentLoaded', () => {
  const images = document.querySelectorAll('.image-rotator img');
  if (!images.length) return;

  let current = 0;

  // Force all images to be absolutely positioned so they don't stack vertically
  images.forEach(img => {
    img.style.position   = 'absolute';
    img.style.top        = '0';
    img.style.left       = '0';
    img.style.width      = '100%';
    img.style.height     = '100%';
    img.style.objectFit  = 'cover';
    img.style.opacity    = '0';
    img.style.transition = 'opacity 1s ease';
  });

  // Show first image immediately (no scroll trigger)
  images[0].style.opacity = '1';

  function nextImage() {
    images[current].style.opacity = '0';
    current = (current + 1) % images.length;
    images[current].style.opacity = '1';
  }

  setInterval(nextImage, 4000);
});
