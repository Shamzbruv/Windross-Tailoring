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

        // Apply page-loading immediately to prevent FOUC
        document.body.classList.add('page-loading');

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
            document.body.classList.remove('page-loading');
        } else {
            console.log("REGION MANAGER: Showing banner.");
            this.autoDetectRegion().then((code) => {
                this.state.recommendedRegion = code;
                this.showOverlay();
                document.body.classList.remove('page-loading');
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
            /* --- REGION BANNER --- */
            .region-overlay {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(150%);
                width: 90%;
                max-width: 600px;
                z-index: 2147483647;
                display: flex !important;
                flex-direction: row;
                background: rgba(10, 10, 10, 0.95);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(212, 175, 55, 0.3);
                border-radius: 12px;
                padding: 15px 20px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
                transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.6s ease;
                opacity: 0;
                pointer-events: all;
                align-items: center;
                gap: 20px;
            }
            .region-overlay.visible {
                transform: translateX(-50%) translateY(0) !important;
                opacity: 1;
            }
            .region-overlay.closing {
                transform: translateX(-50%) translateY(150%) !important;
                opacity: 0;
                pointer-events: none;
            }
            
            .region-welcome-layer {
                display: none;
            }

            .region-banner-info {
                flex: 1;
            }
            .region-banner-info h3 {
                color: #fff;
                font-family: 'Playfair Display', serif;
                font-size: 1.2rem;
                margin: 0 0 5px 0;
            }
            .region-banner-info p {
                color: rgba(255, 255, 255, 0.7);
                font-size: 0.85rem;
                margin: 0;
            }

            .region-banner-actions {
                display: flex;
                gap: 10px;
            }

            .region-panel {
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                padding: 8px 15px;
                cursor: pointer;
                transition: all 0.3s ease;
                color: #fff;
                font-size: 0.9rem;
                font-family: 'Inter', sans-serif;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .region-panel:hover, .region-panel.recommended {
                border-color: #D4AF37;
                background: rgba(212, 175, 55, 0.1);
                color: #D4AF37;
            }
            
            @media (max-width: 600px) {
                .region-overlay {
                    flex-direction: column;
                    text-align: center;
                    padding: 20px;
                }
                .region-banner-actions {
                    width: 100%;
                    flex-direction: column;
                }
                .region-panel {
                    justify-content: center;
                    width: 100%;
                    padding: 12px;
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
        // No longer blocking body scroll
        
        let overlay = document.getElementById('region-selector-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'region-selector-overlay';
            overlay.className = 'region-overlay';

            overlay.innerHTML = `
                <div class="region-banner-info">
                    <h3>Select Shopping Region</h3>
                    <p>Prices and delivery options vary by region.</p>
                </div>
                <div class="region-banner-actions">
                    <button class="region-panel jm" data-region-choice="JM">
                        <span>🇯🇲</span> Jamaica (JMD)
                    </button>
                    <button class="region-panel intl" data-region-choice="INTL">
                        <span>🌍</span> Global (USD)
                    </button>
                </div>
            `;
            document.body.appendChild(overlay);

            // Bind clicks
            overlay.querySelectorAll('.region-panel').forEach(panel => {
                panel.addEventListener('click', () => {
                    const chosen = panel.getAttribute('data-region-choice');
                    this.setRegion(chosen, true);
                    overlay.classList.add('closing');
                    overlay.classList.remove('visible');
                    setTimeout(() => { overlay.remove(); }, 600);
                });
            });
        }

        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            overlay.classList.remove('closing');
            
            // Highlight recommendation
            overlay.querySelectorAll('.region-panel').forEach(p => p.classList.remove('recommended'));
            if (this.state.recommendedRegion) {
                const bestPanel = overlay.querySelector(`.region-panel[data-region-choice="${this.state.recommendedRegion}"]`);
                if (bestPanel) bestPanel.classList.add('recommended');
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
        // We no longer hide Book links or block access to book.html for INTL users.
        // Instead, book.html handles displaying the proper fallback message internally.
        const nav = document.querySelector('nav');
        if (nav) nav.style.display = '';
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
