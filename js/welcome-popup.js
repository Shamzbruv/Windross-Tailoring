/**
 * Windross Welcome Popup
 * —————————————————————————————————————————
 * Shows a stylish assistant popup on index.html under two conditions:
 *  1. The visitor is on index.html for the very first time (ever).
 *  2. Every day after that (based on a midnight-reset timestamp).
 *
 * International visitors see two options (Submit Design / Custom Suit).
 * Jamaican visitors see an additional option  (Book an Appointment).
 *
 * The popup is non-intrusive: it slides in from the bottom-right with a
 * short delay and can be dismissed at any time.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'wt_popup_last_shown';
    const HOMEPAGE_KEY = 'wt_visited_home';

    /* ── Helpers ─────────────────────────────────────────────── */

    /** Returns today's date as "YYYY-MM-DD" in the user's local timezone. */
    function todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    /** Returns true if the popup should be shown right now. */
    function shouldShow() {
        try {
            const lastShown = localStorage.getItem(STORAGE_KEY);
            const visitedHome = localStorage.getItem(HOMEPAGE_KEY);

            // Always show on a fresh homepage visit (first ever)
            if (!visitedHome) return true;

            // Show once per calendar day
            if (!lastShown || lastShown !== todayStr()) return true;

            return false;
        } catch (e) {
            return true; // If storage is blocked, just show it
        }
    }

    /** Stamps the "shown today" marker so it won't repeat until tomorrow. */
    function markShown() {
        try {
            localStorage.setItem(STORAGE_KEY, todayStr());
            localStorage.setItem(HOMEPAGE_KEY, '1');
        } catch (e) { /* silently skip */ }
    }

    /** Detect if the visitor is local (Jamaican). Falls back to region.js if available. */
    function isLocalVisitor() {
        try {
            if (window.Region && typeof window.Region.isJamaica === 'function') {
                return window.Region.isJamaica();
            }
        } catch (e) { /* ignore */ }
        return false; // safe default → treat as international
    }

    /* ── Build HTML ──────────────────────────────────────────── */

    function buildPopup(isJM) {
        const popup = document.createElement('div');
        popup.id = 'wt-welcome-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-label', 'Welcome assistant');
        popup.setAttribute('aria-modal', 'false');

        const bookingOption = isJM ? `
            <a href="book.html" id="wt-popup-book" class="wt-popup-option" aria-label="Book an appointment">
                <span class="wt-popup-option-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" stroke-width="1.5"
                        stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                </span>
                <span class="wt-popup-option-body">
                    <strong>Arrange a Booking</strong>
                    <small>Visit us in Kingston — schedule your in-person consultation</small>
                </span>
                <span class="wt-popup-option-arrow">→</span>
            </a>` : '';

        popup.innerHTML = `
            <div id="wt-welcome-inner">
                <button id="wt-popup-close" aria-label="Close welcome assistant">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>

                <div class="wt-popup-greeting">
                    <span class="wt-popup-badge">Welcome to Windross</span>
                    <h2 class="wt-popup-heading">How may we assist<br>you today?</h2>
                    <p class="wt-popup-sub">Choose where you'd like to begin your bespoke journey.</p>
                </div>

                <div class="wt-popup-options">
                    ${bookingOption}

                    <a href="submit-style.html" id="wt-popup-submit" class="wt-popup-option" aria-label="Submit a design">
                        <span class="wt-popup-option-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="1.5"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </span>
                        <span class="wt-popup-option-body">
                            <strong>Submit a Design</strong>
                            <small>Send us your vision — we'll turn it into a masterpiece</small>
                        </span>
                        <span class="wt-popup-option-arrow">→</span>
                    </a>

                    <a href="customize.html" id="wt-popup-custom" class="wt-popup-option" aria-label="Design a custom suit">
                        <span class="wt-popup-option-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="1.5"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                                <path d="M2 17l10 5 10-5"></path>
                                <path d="M2 12l10 5 10-5"></path>
                            </svg>
                        </span>
                        <span class="wt-popup-option-body">
                            <strong>Custom Suit from Scratch</strong>
                            <small>Build your bespoke suit piece by piece with our configurator</small>
                        </span>
                        <span class="wt-popup-option-arrow">→</span>
                    </a>
                </div>

                <div class="wt-popup-footer">
                    <button id="wt-popup-dismiss" type="button">Maybe later</button>
                </div>
            </div>
        `;

        return popup;
    }

    /* ── Show / Dismiss ──────────────────────────────────────── */

    function closePopup() {
        const popup = document.getElementById('wt-welcome-popup');
        if (!popup) return;
        popup.classList.remove('wt-popup-visible');
        popup.classList.add('wt-popup-leaving');
        setTimeout(() => popup.remove(), 500);
    }

    function showPopup() {
        if (document.getElementById('wt-welcome-popup')) return; // Already mounted

        const isJM = isLocalVisitor();
        const popup = buildPopup(isJM);
        document.body.appendChild(popup);

        // Force a reflow before adding the active class so the CSS transition fires
        requestAnimationFrame(() => {
            requestAnimationFrame(() => popup.classList.add('wt-popup-visible'));
        });

        // Wire up close buttons
        document.getElementById('wt-popup-close').addEventListener('click', closePopup);
        document.getElementById('wt-popup-dismiss').addEventListener('click', closePopup);

        // Mark as shown for today
        markShown();
    }

    /* ── Inject CSS ──────────────────────────────────────────── */

    function injectStyles() {
        if (document.getElementById('wt-popup-styles')) return;
        const style = document.createElement('style');
        style.id = 'wt-popup-styles';
        style.textContent = `
/* ======================================================
   WINDROSS WELCOME POPUP
   ====================================================== */

#wt-welcome-popup {
    position: fixed;
    bottom: 32px;
    right: 32px;
    z-index: 9999;
    width: 360px;
    max-width: calc(100vw - 32px);

    /* Entry state (invisible + shifted down) */
    opacity: 0;
    transform: translateY(24px) scale(0.97);
    transition: opacity 0.55s cubic-bezier(0.25, 1, 0.5, 1),
                transform 0.55s cubic-bezier(0.25, 1, 0.5, 1);
    pointer-events: none;
}

#wt-welcome-popup.wt-popup-visible {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: all;
}

#wt-welcome-popup.wt-popup-leaving {
    opacity: 0;
    transform: translateY(16px) scale(0.96);
    pointer-events: none;
}

#wt-welcome-inner {
    position: relative;
    background: rgba(10, 10, 10, 0.92);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 16px;
    padding: 28px;
    box-shadow:
        0 30px 80px rgba(0, 0, 0, 0.7),
        0 0 0 0.5px rgba(212, 175, 55, 0.10),
        inset 0 1px 0 rgba(255,255,255,0.05);
    overflow: hidden;
}

/* Subtle gold ambient glow in the corner */
#wt-welcome-inner::before {
    content: '';
    position: absolute;
    top: -60px;
    right: -40px;
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, rgba(212, 175, 55, 0.12) 0%, transparent 70%);
    pointer-events: none;
}

/* ── Close Button ───────────────────────────────── */
#wt-popup-close {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 28px;
    height: 28px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 50%;
    color: rgba(255,255,255,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
    flex-shrink: 0;
    padding: 0;
}

#wt-popup-close:hover {
    background: rgba(255,255,255,0.12);
    color: #fff;
    border-color: rgba(255,255,255,0.18);
}

/* ── Greeting Area ──────────────────────────────── */
.wt-popup-greeting {
    margin-bottom: 20px;
    padding-right: 24px; /* avoid overlap with close btn */
}

.wt-popup-badge {
    display: inline-block;
    font-size: 0.68rem;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: #D4AF37;
    background: rgba(212, 175, 55, 0.1);
    border: 1px solid rgba(212, 175, 55, 0.25);
    border-radius: 100px;
    padding: 3px 10px;
    margin-bottom: 12px;
}

.wt-popup-heading {
    font-family: 'Playfair Display', serif;
    font-size: 1.35rem !important;
    font-weight: 600 !important;
    color: #F5F5F7 !important;
    line-height: 1.3;
    margin: 0 0 8px 0 !important;
    /* Override any parent h2 resets */
    background: none !important;
    -webkit-background-clip: initial !important;
    -webkit-text-fill-color: #F5F5F7 !important;
    background-clip: initial !important;
}

.wt-popup-sub {
    font-size: 0.82rem;
    color: rgba(255,255,255,0.38);
    line-height: 1.5;
    margin: 0;
}

/* ── Option Buttons ─────────────────────────────── */
.wt-popup-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
}

.wt-popup-option {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 13px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    text-decoration: none !important;
    color: inherit !important;
    cursor: pointer;
    transition:
        background 0.25s,
        border-color 0.25s,
        transform 0.2s cubic-bezier(0.25, 1, 0.5, 1);
    position: relative;
    overflow: hidden;
}

.wt-popup-option::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, rgba(212,175,55,0.07), transparent);
    opacity: 0;
    transition: opacity 0.25s;
}

.wt-popup-option:hover {
    border-color: rgba(212, 175, 55, 0.35);
    background: rgba(212, 175, 55, 0.07);
    transform: translateX(3px);
    color: inherit !important;
}

.wt-popup-option:hover::before {
    opacity: 1;
}

.wt-popup-option-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: rgba(212, 175, 55, 0.1);
    border: 1px solid rgba(212, 175, 55, 0.2);
    color: #D4AF37;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.2s, box-shadow 0.2s;
}

.wt-popup-option:hover .wt-popup-option-icon {
    background: rgba(212, 175, 55, 0.18);
    box-shadow: 0 0 14px rgba(212, 175, 55, 0.2);
}

.wt-popup-option-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.wt-popup-option-body strong {
    font-size: 0.88rem;
    font-weight: 600;
    color: #F5F5F7;
    letter-spacing: 0.1px;
}

.wt-popup-option-body small {
    font-size: 0.74rem;
    color: rgba(255,255,255,0.35);
    line-height: 1.4;
}

.wt-popup-option-arrow {
    font-size: 0.85rem;
    color: rgba(212, 175, 55, 0.4);
    transition: color 0.2s, transform 0.2s;
    flex-shrink: 0;
}

.wt-popup-option:hover .wt-popup-option-arrow {
    color: #D4AF37;
    transform: translateX(3px);
}

/* ── Footer ─────────────────────────────────────── */
.wt-popup-footer {
    text-align: center;
    padding-top: 4px;
}

#wt-popup-dismiss {
    background: none;
    border: none;
    color: rgba(255,255,255,0.28);
    font-size: 0.78rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.2s;
    font-family: inherit;
}

#wt-popup-dismiss:hover {
    color: rgba(255,255,255,0.55);
}

/* ── Mobile ─────────────────────────────────────── */
@media (max-width: 480px) {
    #wt-welcome-popup {
        bottom: 16px;
        right: 0;
        left: 0;
        width: 100%;
        max-width: 100%;
        padding: 0 12px;
        box-sizing: border-box;
    }

    #wt-welcome-inner {
        border-radius: 14px;
    }
}
        `;
        document.head.appendChild(style);
    }

    /* ── Entry Point ─────────────────────────────────────────── */

    function init() {
        // Only run on the homepage
        const path = window.location.pathname;
        const isHomePage = path === '/' ||
                           path === '/index.html' ||
                           path.endsWith('/index.html') ||
                           path === '';

        if (!isHomePage) return;

        if (!shouldShow()) return;

        injectStyles();

        // Small delay so the page itself can settle before the popup appears
        setTimeout(showPopup, 1200);
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
