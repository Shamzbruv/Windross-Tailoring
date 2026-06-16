/**
 * Legacy compatibility layer for older pages.
 * New code should prefer window.Pricing directly.
 */

window.SUIT_PRICING_JMD = {};
window.BACKEND_PRICING_CONFIG = window.BACKEND_PRICING_CONFIG || null;

const SIZE_MAPPING = {
    'XS': 'XS',
    'S': 'S',
    'M': 'M',
    'L': 'L',
    'XL': 'XL',
    'XXL': 'XXL',
    '2X': 'XXL',
    'XXXL': 'XXXL',
    '3X': 'XXXL',
    'XXXXL': 'XXXXL',
    '4X': 'XXXXL'
};

const DEFAULT_ALLOWED_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

window.dispatchEvent(new Event('pricing-loaded'));

function getSuitRecord(suitName) {
    if (!suitName) return null;

    if (window.BACKEND_PRICING_CONFIG && window.BACKEND_PRICING_CONFIG.catalog) {
        const cat = window.BACKEND_PRICING_CONFIG.catalog;
        
        let sku = suitName;
        if (window.Pricing) {
            sku = window.Pricing.normalizeSku(suitName);
        } else {
            sku = suitName.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '');
        }

        if (cat[sku] && cat[sku].priceJMD) {
            return {
                priceJMD: cat[sku].priceJMD,
                priceUSD: cat[sku].priceUSD,
                allowedSizes: cat[sku].allowedSizes
            };
        }
    }

    if (window.SUIT_PRICING_JMD[suitName]) return window.SUIT_PRICING_JMD[suitName];

    if (window.Pricing) {
        const sku = window.Pricing.normalizeSku(suitName);
        if (window.SUIT_PRICING_JMD[sku]) return window.SUIT_PRICING_JMD[sku];
    }

    return null;
}

window.calculateSuitPriceBase = function (suitName, size) {
    const suit = getSuitRecord(suitName);
    if (!suit) return null;

    if (suit.priceJMD) return suit.priceJMD;

    // Fallback logic for legacy hardcoded window.SUIT_PRICING_JMD
    // Base pricing only, surcharges handled by notes
    return suit.min || 0;
};

window.calculateDisplayPrice = function (basePriceJMD) {
    if (typeof basePriceJMD !== 'number') return basePriceJMD;

    const config = window.BACKEND_PRICING_CONFIG || {};
    const multiplier = Number(config.internationalMarkupMultiplier || 1);
    const isIntl = window.Pricing
        ? window.Pricing.getRegionCode() === window.Pricing.INTL
        : !(window.Region && window.Region.isJamaica && window.Region.isJamaica());

    return isIntl ? Math.round(basePriceJMD * multiplier) : basePriceJMD;
};

window.formatJMDWithRegion = function (priceJMD, showCents = false) {
    if (window.Pricing && typeof window.Pricing.formatJMD === 'function') {
        try {
            return window.Pricing.formatJMD(priceJMD, showCents);
        } catch (err) {
            console.warn('[Pricing] Falling back to plain JMD formatting:', err.message || err);
        }
    }

    if (window.CurrencyManager) {
        return window.CurrencyManager.format(priceJMD, showCents);
    }

    return `J$${Number(priceJMD || 0).toLocaleString('en-JM')}`;
};

window.getSuitStartingPrice = function (suitName) {
    const suit = getSuitRecord(suitName);
    return suit ? suit.min : null;
};

window.getSuitStartingQuote = async function (suitName, size = 'M') {
    if (!window.Pricing) return null;
    return window.Pricing.getCatalogPrice(suitName, size);
};
