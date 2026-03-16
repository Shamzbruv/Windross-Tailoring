/**
 * back-to-top.js
 * Adds a "Back to Top" button that appears when the user scrolls past 50% of the page height.
 * 
 * Features:
 * - Dynamic injection of HTML/CSS (no manual HTML editing required)
 * - "Midnight Gold" theme styling
 * - Smooth scroll to top
 * - Progress indicator (optional border) or just simple fade
 */

(function () {
    // 1. Create Styles
    const style = document.createElement('style');
    style.innerHTML = `
        .back-to-top-btn {
            position: fixed;
            bottom: 30px;
            left: 30px; 
            width: 50px;
            height: 50px;
            background: rgba(10, 10, 10, 0.8);
            border: 1px solid rgba(212, 175, 55, 0.3);
            border-radius: 50%;
            color: #D4AF37;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 9000; /* High z-index to sit above most things */
            opacity: 0;
            transform: translateY(20px);
            pointer-events: none;
            transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
        }

        .back-to-top-btn.visible {
            opacity: 1;
            transform: translateY(0);
            pointer-events: all;
        }

        .back-to-top-btn:hover {
            background: rgba(212, 175, 55, 0.1);
            border-color: #D4AF37;
            box-shadow: 0 0 20px rgba(212, 175, 55, 0.3);
            transform: translateY(-3px);
            color: #FFF;
        }

        /* Mobile Adjustment: Ensure it doesn't overlap with WhatsApp button (Right side)
           Since WhatsApp is usually Bottom-Right, let's put this Bottom-Left or adjust.
           User didn't specify, but "Left" is safer if WhatsApp is Right.
           Current CSS puts it at LEFT: 30px. 
        */
    `;
    document.head.appendChild(style);

    // 2. Create Button
    const btn = document.createElement('div');
    btn.className = 'back-to-top-btn';
    btn.innerHTML = `<i data-lucide="arrow-up" width="24" height="24"></i>`;
    btn.setAttribute('aria-label', 'Back to Top');
    document.body.appendChild(btn);

    // 3. Logic
    function updateVisibility() {
        // Calculate 50% of the page height
        // We use scrollHeight - clientHeight to get the scrollable distance, 
        // or just strict body height. "Half way through the page" usually implies scroll depth.

        const scrollTotal = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrollCurrent = window.scrollY;

        // Validation: If page is short, don't show
        if (scrollTotal <= 0) return;

        // "Half way" threshold
        const threshold = scrollTotal / 2;

        if (scrollCurrent > threshold) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    }

    // Throttle scroll event for performance
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                updateVisibility();
                ticking = false;
            });
            ticking = true;
        }
    });

    // Click to scroll
    btn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // Re-init icons if Lucide is present
    if (window.lucide) {
        window.lucide.createIcons();
    }
})();
