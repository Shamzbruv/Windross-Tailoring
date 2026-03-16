/**
 * Global Region Manager (Centralized Source of Truth)
 * Handles normalization, retrieval, and setting of the user's preferred shopping region.
 */

window.Region = (function () {
    // Canonical Values
    const REGION_JM = 'JM';
    const REGION_INTL = 'INTL';
    const REGION_KEY = 'wt_region';

    function normalizeRegion() {
        try {
            const raw = localStorage.getItem(REGION_KEY);
            if (!raw) return null; // Let the RegionManager overlay handle the initial detection

            const val = raw.toLowerCase().trim();
            const jmMatch = ['jamaica', 'jm', 'ja'];
            const intlMatch = ['international', 'intl', 'overseas'];

            let canonical = null;

            if (jmMatch.includes(val)) {
                canonical = REGION_JM;
            } else if (intlMatch.includes(val)) {
                canonical = REGION_INTL;
            }

            if (canonical && raw !== canonical) {
                // Fix legacy values silently
                localStorage.setItem(REGION_KEY, canonical);
                console.log(`[REGION CORE] Normalized legacy value '${raw}' to '${canonical}'`);
                return canonical;
            }

            // Return whatever is there if it couldn't be normalized (it might already be JM/INTL)
            return raw === REGION_JM || raw === REGION_INTL ? raw : null;

        } catch (e) {
            console.error('[REGION CORE] Failed to read/normalize region', e);
            return null;
        }
    }

    function getRegion() {
        const normalized = normalizeRegion();
        return normalized || REGION_INTL; // Default fallback if utterly missing or garbage
    }

    function setRegion(value) {
        if (value !== REGION_JM && value !== REGION_INTL) {
            console.error(`[REGION CORE] Invalid region attempt: ${value}. Must be 'JM' or 'INTL'`);
            return;
        }
        try {
            localStorage.setItem(REGION_KEY, value);
            console.log(`[REGION CORE] Saved canonical region: ${value}`);
        } catch (e) {
            console.error('[REGION CORE] Failed to save region', e);
        }
    }

    function isJamaica() {
        return getRegion() === REGION_JM;
    }

    function requireRegionSelection() {
        // Triggers the visual region-manager if needed
        if (window.RegionManager && typeof window.RegionManager.showOverlay === 'function') {
            window.RegionManager.showOverlay();
        } else {
            console.warn('[REGION CORE] RegionManager UI module not found to require selection.');
        }
    }

    // Run normalizer immediately on script load
    normalizeRegion();

    return {
        getRegion,
        setRegion,
        isJamaica,
        requireRegionSelection,
        JM: REGION_JM,
        INTL: REGION_INTL
    };
})();
