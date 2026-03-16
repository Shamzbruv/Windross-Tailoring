/**
 * Region Manager
 * Handles first-visit region selection overlay, region state,
 * and regional capability rules.
 */

const APP_VERSION = "WINDROSS_V1.0.0"; // Increment this to force all users to see the overlay again

const RegionManager = {
    state: {
        region: null, // 'JM' or 'INTL'
        recommendedRegion: null,
    },

    init() {
        console.log("REGION MANAGER INIT STARTED");
        this.injectStyles();

        // 0. Version Checking: Force re-selection if app version changes
        const storedVersion = localStorage.getItem('wt_app_version');
        if (storedVersion !== APP_VERSION) {
            console.log(`[RegionManager] Version upgrade from ${storedVersion} to ${APP_VERSION}. Clearing region config.`);
            localStorage.removeItem('wt_region');
            localStorage.setItem('wt_app_version', APP_VERSION);
        }

        // 1. Check if region intentionally saved by reading raw localStorage, not the fallback normalizer
        const rawSavedRegion = localStorage.getItem('wt_region');
        let savedRegion = null;
        if (rawSavedRegion === window.Region.JM || rawSavedRegion === window.Region.INTL) {
            savedRegion = rawSavedRegion;
        }

        // Overrides: Force overlay on index.html if it's a REFRESH or FIRST VISIT
        let isIndexPage = false;
        try {
            const currentPath = window.location.pathname;
            isIndexPage = currentPath.endsWith('index.html') || currentPath === '/' || currentPath === '';
        } catch (e) { }

        let isRefresh = false;
        try {
            const perfEntries = performance.getEntriesByType("navigation");
            if (perfEntries.length > 0 && perfEntries[0].type === "reload") {
                isRefresh = true;
            } else if (window.performance && window.performance.navigation && window.performance.navigation.type === 1) {
                isRefresh = true;
            }
        } catch (e) { }

        // OVERRIDE: If we are on index.html, AND the user just refreshed the page, ALWAYS show the overlay.
        const forceShow = isIndexPage && (!savedRegion || isRefresh);

        if (savedRegion && !forceShow) {
            console.log("REGION MANAGER: Silently loading", savedRegion);
            this.setRegion(savedRegion, false); // Initialize silently
            this.enforceRegionalCapabilities();
        } else {
            console.log("REGION MANAGER: Showing overlay.");
            // Need to show overlay
            this.autoDetectRegion().then((code) => {
                this.state.recommendedRegion = code;
                this.showOverlay();
            });
        }

        // Listeners for manual override (e.g. footer button)
        document.addEventListener('click', (e) => {
            if (e.target && (e.target.id === 'change-region-btn' || e.target.classList.contains('change-region-btn'))) {
                e.preventDefault();
                this.showOverlay();
            }
        });
    },

    injectStyles() {
        if (document.getElementById('region-manager-styles')) return;
        const style = document.createElement('style');
        style.id = 'region-manager-styles';
        style.textContent = `
            /* --- REGION SELECTOR OVERLAY --- */
            .region-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                height: 100dvh; /* Dynamic viewport height for mobile browsers */
                z-index: 2147483647;
                display: flex !important;
                flex-direction: row;
                overflow: hidden;
                overscroll-behavior: none; /* Prevent scroll chaining to background */
                background: #050505 !important; /* Solid background prevents mobile clipping/glitching */
                transition: visibility 1s, opacity 1s cubic-bezier(0.25, 1, 0.5, 1);
                opacity: 1;
                pointer-events: all;
                transform: none !important;
                touch-action: none; /* Strictly disable browser gestures inside overlay container */
            }
            .region-overlay.closing {
                opacity: 0 !important;
                pointer-events: none !important;
                transform: scale(1.02) !important;
                transition: opacity 1.2s cubic-bezier(0.25, 1, 0.5, 1), transform 1.2s cubic-bezier(0.25, 1, 0.5, 1) !important;
            }
            
            /* Welcome Layer */
            .region-welcome-layer {
                position: absolute;
                top: 15%;
                left: 50%;
                transform: translateX(-50%);
                z-index: 10;
                text-align: center;
                pointer-events: none;
                transition: opacity 0.6s ease, top 0.8s cubic-bezier(0.25, 1, 0.5, 1), transform 0.8s cubic-bezier(0.25, 1, 0.5, 1);
                width: 90%;
            }
            /* When selecting, only hide the subtext, move the welcome to center */
            .region-overlay.selecting .region-welcome-sub {
                opacity: 0;
            }
            .region-overlay.selecting .region-welcome-layer {
                top: 40%;
                transform: translate(-50%, -50px) scale(1.1);
            }
            .region-overlay.closing .region-welcome-layer {
                opacity: 0;
                transform: translate(-50%, -70px) scale(1.1);
            }
            .region-logo {
                width: 180px;
                margin-bottom: 20px;
                filter: drop-shadow(0px 4px 10px rgba(0,0,0,0.5));
            }
            .region-welcome-text {
                color: #fff;
                font-family: 'Playfair Display', serif;
                font-size: 2.5rem;
                margin-bottom: 10px;
                text-shadow: 0px 2px 10px rgba(0,0,0,0.8);
            }
            .region-welcome-sub {
                color: #D4AF37;
                font-family: 'Inter', sans-serif;
                font-size: 1.1rem;
                letter-spacing: 2px;
                text-transform: uppercase;
                text-shadow: 0px 2px 8px rgba(0,0,0,0.8);
                transition: opacity 0.4s ease;
            }

            /* Base Panel Styles */
            .region-panel {
                flex: 1;
                position: relative;
                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                align-items: center;
                text-align: center;
                cursor: pointer;
                overflow: hidden;
                pointer-events: all;
                padding-bottom: 10%;
                transition: transform 1s cubic-bezier(0.77, 0, 0.175, 1), filter 0.8s ease, opacity 0.8s ease;
            }
            
            /* When ANY panel is selected, hide BOTH panels entirely so only logo remains */
            .region-overlay.selecting .region-panel {
                opacity: 0 !important;
                pointer-events: none;
                transform: translateY(30px);
            }
            
            /* Jamaica Panel (Left) */
            .region-panel.jm {
                background: linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.9)), url('images/jamaica-bg-placeholder.jpg') center/cover;
                background-color: #111;
                border-right: 1px solid rgba(255,255,255,0.05);
                transform: translateX(-100%);
                animation: slideInLeft 1s cubic-bezier(0.23, 1, 0.32, 1) forwards;
            }
            /* INTL Panel (Right) */
            .region-panel.intl {
                background: linear-gradient(rgba(20,20,20,0.5), rgba(10,10,10,0.95)), url('images/intl-bg-placeholder.jpg') center/cover;
                background-color: #050505;
                border-left: 1px solid rgba(255,255,255,0.05);
                transform: translateX(100%);
                animation: slideInRight 1s cubic-bezier(0.23, 1, 0.32, 1) forwards;
            }
            
            @keyframes slideInLeft { to { transform: translateX(0); } }
            @keyframes slideInRight { to { transform: translateX(0); } }
            
            /* Luxury Selection States */
            .region-panel.selected {
                z-index: 20;
            }
            .region-panel.selected::before {
                background: rgba(212, 175, 55, 0.15) !important; 
            }
            .region-panel.selected .region-panel-content {
                transform: scale(1.04);
                border-color: rgba(212, 175, 55, 0.8);
                box-shadow: 0 15px 40px rgba(212, 175, 55, 0.25);
                background: rgba(15, 12, 5, 0.85); /* Richer dark gold background */
            }
            
            .region-panel.unselected {
                opacity: 0 !important;
                filter: grayscale(100%) blur(8px) !important;
                pointer-events: none;
            }
            .region-panel.unselected .region-panel-content {
                transform: scale(0.95);
            }

            /* Hover Effects */
            .region-panel::before {
                content: '';
                position: absolute;
                inset: 0;
                background: rgba(212, 175, 55, 0); 
                transition: background 0.6s ease;
                z-index: 1;
            }
            .region-panel:hover::before {
                background: rgba(212, 175, 55, 0.1); /* Tint */
            }
            .region-panel-content {
                position: relative;
                z-index: 2;
                padding: 2rem;
                transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), border-color 0.4s ease, box-shadow 0.4s ease, background 0.4s ease;
                background: rgba(0,0,0,0.4);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 12px;
                width: 80%;
                max-width: 400px;
            }
            .region-panel:hover .region-panel-content {
                transform: scale(1.02);
                border-color: rgba(212,175,55,0.5);
            }
            .region-panel h2 {
                color: white;
                font-family: 'Playfair Display', serif;
                font-size: 2rem;
                margin-bottom: 0.5rem;
            }
            .region-panel p {
                color: rgba(255,255,255,0.7);
                font-size: 0.95rem;
                margin: 0 auto 1.5rem;
                line-height: 1.5;
            }
            .region-flag {
                font-size: 2.5rem;
                display: block;
                margin-bottom: 0.5rem;
            }
            .region-btn {
                background: transparent;
                border: 1px solid rgba(212, 175, 55, 0.5);
                color: #D4AF37;
                padding: 12px 30px;
                font-family: 'Inter', sans-serif;
                font-size: 0.9rem;
                letter-spacing: 2px;
                text-transform: uppercase;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            .region-panel:hover .region-btn {
                background: rgba(212, 175, 55, 0.1);
                border-color: #D4AF37;
            }
            .region-btn:active {
                transform: scale(0.96);
                background: rgba(212, 175, 55, 0.3);
            }
            .recommended-badge {
                position: absolute;
                top: -15px;
                left: 50%;
                transform: translateX(-50%) translateY(-10px);
                background: #D4AF37;
                color: #000;
                padding: 6px 16px;
                font-size: 0.75rem;
                font-weight: 600;
                letter-spacing: 1px;
                text-transform: uppercase;
                opacity: 0;
                transition: all 0.6s cubic-bezier(0.25, 1, 0.5, 1);
                z-index: 3;
                border-radius: 20px;
                white-space: nowrap;
            }
            .region-panel.recommended .recommended-badge {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            
            @media (max-width: 768px) {
                .region-overlay { 
                    flex-direction: column; 
                    justify-content: flex-start; /* Stop pushing elements off the top */
                    padding: 15px;
                    gap: 15px; /* Smaller gaps for small screens */
                    padding-bottom: 25px;
                    overflow-y: auto; /* Allow scrolling on extremely small devices */
                    align-items: center;
                }
                .region-welcome-layer { 
                    position: relative;
                    top: auto;
                    left: auto;
                    transform: none;
                    width: 100%;
                    margin-top: 5vh; /* Reduced top margin to save space */
                    margin-bottom: 5vh; /* Natural spacing to panels */
                    transition: all 0.8s cubic-bezier(0.25, 1, 0.5, 1);
                }
                
                /* On select, move logo/welcome down beautifully centered on mobile screen */
                .region-overlay.selecting .region-welcome-layer {
                    transform: translateY(2vh) scale(1.05); /* Calibrated dead center */
                }
                .region-overlay.closing .region-welcome-layer {
                    transform: translateY(0vh) scale(1.05);
                    opacity: 0;
                }
                .region-logo { width: 110px; margin-bottom: 10px; } /* Smaller logo for mobile */
                .region-welcome-text { font-size: 1.8rem; margin-bottom: 5px; } /* Improved fitting */
                .region-welcome-sub { font-size: 0.85rem; line-height: 1.2; }
                
                .region-panel { 
                    flex: none; 
                    justify-content: center; 
                    padding: 0;
                    border-radius: 12px;
                    min-height: auto;
                    border: 1px solid rgba(255,255,255,0.1);
                    width: 100%;
                }
                .region-panel.jm { transform: translateY(100%); animation: slideInBottom 1s cubic-bezier(0.23, 1, 0.32, 1) forwards; animation-delay: 0.1s; }
                .region-panel.intl { transform: translateY(100%); animation: slideInBottom 1s cubic-bezier(0.23, 1, 0.32, 1) forwards; }
                
                @keyframes slideInBottom { to { transform: translateY(0); } }
                
                .region-panel-content { 
                    width: 100%; 
                    padding: 1.25rem; 
                    background: transparent;
                    border: none;
                }
                .region-panel h2 { font-size: 1.4rem; margin-bottom: 0px; }
                .region-panel p { font-size: 0.8rem; margin-bottom: 10px; margin-top: 5px; }
                .region-flag { font-size: 1.5rem; margin-bottom: 0px; }
                .region-btn { width: 100%; padding: 10px 15px; font-size: 0.85rem; }
                
                /* Keep the badge un-clipped entirely by placing it inside flow */
                .recommended-badge {
                    position: relative;
                    display: inline-block;
                    top: 0;
                    left: auto;
                    transform: none !important; /* Override absolute positioning */
                    margin-bottom: 15px;
                    font-size: 0.65rem;
                    padding: 4px 12px;
                }
                .region-panel.recommended .recommended-badge {
                    transform: none !important; /* Keep it static */
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    },

    async autoDetectRegion() {
        try {
            // Check if currency manager saved something
            const cachedCurrency = localStorage.getItem('windross_currency');
            if (cachedCurrency) {
                return cachedCurrency === 'JMD' ? 'JM' : 'INTL';
            }

            // basic IP check fallback
            const res = await fetch('https://ipapi.co/json/');
            const data = await res.json();
            return data.country_code === 'JM' ? 'JM' : 'INTL';
        } catch (e) {
            console.warn('[RegionManager] Auto-detect failed, defaulting to INTL layout hint');
            return 'INTL'; // Default to INTL for highlight if fetch fails
        }
    },

    showOverlay() {
        // Aggressively prevent background scrolling
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overscrollBehavior = 'none';
        document.documentElement.style.overscrollBehavior = 'none';

        // Check if exists
        let overlay = document.getElementById('region-selector-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'region-selector-overlay';
            overlay.className = 'region-overlay';

            overlay.innerHTML = `
                <div class="region-welcome-layer">
                    <img src="https://i.postimg.cc/NFHdd4bL/Windross-Logo.png" alt="Windross Logo" class="region-logo">
                    <h1 class="region-welcome-text">Welcome to Windross Tailoring</h1>
                    <p class="region-welcome-sub">Please select your shopping destination</p>
                </div>
                <div class="region-panel jm" data-region-choice="JM">
                    <div class="region-panel-content">
                        <div class="recommended-badge">Recommended for You</div>
                        <span class="region-flag">🇯🇲</span>
                        <h2>Jamaica</h2>
                        <p>Prices in JMD. Access to in-person tailoring appointments and local delivery.</p>
                        <button class="region-btn">Continue in Jamaica</button>
                    </div>
                </div>
                <div class="region-panel intl" data-region-choice="INTL">
                    <div class="region-panel-content">
                        <div class="recommended-badge">Recommended for You</div>
                        <span class="region-flag">🌍</span>
                        <h2>Overseas</h2>
                        <p>Global pricing. DHL Express Worldwide Shipping directly to your door.</p>
                        <button class="region-btn">Continue Overseas</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            // Bind clicks
            overlay.querySelectorAll('.region-panel').forEach(panel => {
                panel.addEventListener('click', () => {
                    // Prevent multiple clicks
                    if (overlay.classList.contains('closing') || overlay.classList.contains('selecting')) {
                        return;
                    }

                    const chosen = panel.getAttribute('data-region-choice');
                    this.setRegion(chosen, true);

                    // Luxury click animation Phase 1: Hide panels, center logo & welcome text
                    overlay.classList.add('selecting');
                    panel.classList.add('selected');

                    // If we want the welcoming message to explicitly change upon click
                    const welcomeMsg = overlay.querySelector('.region-welcome-text');
                    const regionName = chosen === 'JM' ? 'Jamaica' : 'Global Shopping';

                    // Small fade transition for the text change if desired:
                    welcomeMsg.style.opacity = '0';
                    setTimeout(() => {
                        welcomeMsg.innerHTML = `Welcome to<br>${regionName}`;
                        welcomeMsg.style.opacity = '1';
                        // Add some luxurious glow
                        welcomeMsg.style.textShadow = '0px 0px 20px rgba(212, 175, 55, 0.6)';
                    }, 300);

                    // Wait for the centered welcoming screen to be admired, then fade to main page
                    setTimeout(() => {
                        // Phase 2: Fade the entire overlay to transparent
                        overlay.classList.add('closing');

                        setTimeout(() => {
                            overlay.style.display = 'none';
                            // Restore scrolling gracefully
                            document.body.style.overflow = ''; 
                            document.documentElement.style.overflow = '';
                            document.body.style.overscrollBehavior = '';
                            document.documentElement.style.overscrollBehavior = '';

                            // Destroy DOM to prevent lingering elements and z-index issues
                            overlay.remove();
                        }, 1200); // Overlay completely gone
                    }, 1800); // Enjoy the centered logo for 1.8 seconds
                });
            });
        }

        overlay.style.display = 'none'; // reset
        requestAnimationFrame(() => {
            overlay.style.display = 'flex';
            overlay.style.setProperty('display', 'flex', 'important');
            overlay.style.opacity = '1';
            overlay.style.pointerEvents = 'all';
            overlay.style.zIndex = '2147483647';
            overlay.classList.remove('closing');

            // Apply recommended highlight
            overlay.querySelectorAll('.region-panel').forEach(p => p.classList.remove('recommended'));
            if (this.state.recommendedRegion) {
                const bestPanel = overlay.querySelector(`.region-panel[data-region-choice="${this.state.recommendedRegion}"]`);
                if (bestPanel) {
                    bestPanel.classList.add('recommended');
                }
            }
        });
    },

    setRegion(code, save = true) {
        this.state.region = code;
        document.body.setAttribute('data-region', code);

        if (save) {
            window.Region.setRegion(code);
            localStorage.setItem('wt_region_set_at', new Date().toISOString());
        }

        console.log(`[RegionManager] Region set to: ${code}`);

        // Sync Currency Manager visually to JMD or USD
        if (window.CurrencyManager && save) {
            window.CurrencyManager.setCurrency(code === 'INTL' ? 'USD' : 'JMD');
        }

        this.enforceRegionalCapabilities();

        // Dispatch event for other components to re-render
        window.dispatchEvent(new CustomEvent('region-change', { detail: { region: code } }));
    },

    enforceRegionalCapabilities() {
        const isIntl = !window.Region.isJamaica();

        // 1. Hide Elements linking to book.html
        document.querySelectorAll('a[href*="book.html"]').forEach(link => {
            if (isIntl) {
                link.style.display = 'none';
            } else {
                link.style.display = ''; // restore
            }
        });

        // 2. Page Guard
        if (window.location.pathname.includes('book.html') && isIntl) {
            alert('In-person measurement booking is only available in Jamaica.');
            window.location.href = 'index.html';
        }
    }
};

// Auto-init
function runInit() {
    if (document.body) {
        RegionManager.init();
    } else {
        requestAnimationFrame(runInit);
    }
}
document.addEventListener('DOMContentLoaded', runInit);

// Expose
window.RegionManager = RegionManager;
