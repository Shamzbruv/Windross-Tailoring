document.addEventListener('DOMContentLoaded', () => {
    const mobileToggle = document.querySelector('.site-mobile-toggle');
    const mobileOverlay = document.querySelector('.site-mobile-overlay');
    const mobileLinks = document.querySelectorAll('.site-mobile-link');

    if (mobileToggle && mobileOverlay) {
        mobileToggle.addEventListener('click', () => {
            const isActive = mobileOverlay.classList.contains('active');
            
            if (isActive) {
                mobileOverlay.classList.remove('active');
                mobileToggle.innerHTML = '<i data-lucide="menu" width="28" height="28"></i>';
            } else {
                mobileOverlay.classList.add('active');
                mobileToggle.innerHTML = '<i data-lucide="x" width="28" height="28"></i>';
            }
            
            if (window.lucide && typeof lucide.createIcons === 'function') {
                lucide.createIcons();
            }
        });

        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileOverlay.classList.remove('active');
                mobileToggle.innerHTML = '<i data-lucide="menu" width="28" height="28"></i>';
                if (window.lucide && typeof lucide.createIcons === 'function') {
                    lucide.createIcons();
                }
            });
        });
    }
});
