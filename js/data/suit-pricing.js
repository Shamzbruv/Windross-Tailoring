/**
 * Made-to-Measure Suit Pricing & Sizing Rules (JMD Base)
 */

window.SUIT_PRICING_JMD = {
    'The Kensington': { min: 38000, max: 44000, allowedSizes: ['S', 'M', 'L'] },
    'The Oxford': { min: 62000, max: 74000, allowedSizes: ['S', 'M', 'L', 'XL', 'XXL'] },
    'The Windsor': { min: 54000, max: 64000, allowedSizes: ['S', 'M', 'L', 'XL', 'XXL'] },
    'The Mayfair': { min: 42000, max: 52000, allowedSizes: ['S', 'M', 'L', 'XL'] },
    'The Bond': { min: 58000, max: 68000, allowedSizes: ['S', 'M', 'L', 'XL', 'XXL'] },
    'The Chelsea': { min: 44000, max: 54000, allowedSizes: ['S', 'M', 'L'] },
    'The Ascott': { min: 56000, max: 68000, allowedSizes: ['S', 'M', 'L'] },
    'The Victoria': { min: 38000, max: 42000, allowedSizes: ['S', 'M', 'L', 'XL'] },
    'The Belgravia': { min: 48000, max: 58000, allowedSizes: ['S', 'M', 'L'] },
    'The Cambridge': { min: 58000, max: 68000, allowedSizes: ['S', 'M', 'L', 'XL', 'XXL'] },
    'The Sovereign': { min: 29000, max: 38000, allowedSizes: ['S', 'M', 'L', 'XL'] },
    'The Regent': { min: 38000, max: 52000, allowedSizes: ['S', 'M', 'L', 'XL'] },
    'The Grosvenor': { min: 46000, max: 56000, allowedSizes: ['S', 'M', 'L', 'XL'] },
    'The Savile': { min: 58000, max: 68000, allowedSizes: ['S', 'M', 'L', 'XL', 'XXL'] },
    'The Westminster': { min: 29000, max: 38000, allowedSizes: ['S', 'M', 'L'] },
    'The Knightsbridge': { min: 48000, max: 58000, allowedSizes: ['S', 'M', 'L', 'XL'] },
    'The Piccadilly': { min: 42000, max: 52000, allowedSizes: ['S', 'M', 'L'] },
    'The St. James': { min: 52000, max: 64000, allowedSizes: ['S', 'M', 'L'] }
};

// Map alternate size notations to standard for interpolation lookup
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

/**
 * Calculates the interpolated base price for a given suit and size.
 */
window.calculateSuitPriceBase = function (suitName, size) {
    const suit = window.SUIT_PRICING_JMD[suitName];
    if (!suit) return null; // Not found

    const standardSize = SIZE_MAPPING[size];
    if (!standardSize) return null; // Invalid size

    const allowed = suit.allowedSizes;
    const sizeIndex = allowed.indexOf(standardSize);

    if (sizeIndex === -1) {
        return null; // Size not available for this suit
    }

    if (allowed.length === 1) {
        return suit.min;
    }

    // Interpolate: even steps from min to max
    const steps = allowed.length - 1;
    const range = suit.max - suit.min;
    const stepSize = range / steps;

    return Math.round(suit.min + (stepSize * sizeIndex));
};

/**
 * Applies the 85% regional markup if the user is INTL.
 */
window.calculateDisplayPrice = function (basePriceJMD) {
    if (typeof basePriceJMD !== 'number') return basePriceJMD;

    // Check global region manager
    const isIntl = window.RegionManager ? window.RegionManager.state.region === 'INTL' : false;

    if (isIntl) {
        return Math.round(basePriceJMD * 1.85);
    }
    return basePriceJMD;
};

/**
 * Formats JMD properly or USD if region is INTL
 */
window.formatJMDWithRegion = function (priceJMD) {
    if (window.CurrencyManager) {
        const rateJMD = window.CurrencyManager.state.rates['JMD'] || 230;
        const priceGBP = priceJMD / rateJMD;
        return window.CurrencyManager.format(priceGBP, true);
    }

    const formatted = priceJMD.toLocaleString('en-JM', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return `J$${formatted}`;
};

/**
 * Gets the starting price for display on cards.
 * Returns the marked-up price if INTL.
 */
window.getSuitStartingPrice = function (suitName) {
    const suit = window.SUIT_PRICING_JMD[suitName];
    if (!suit) return null;

    const baseMin = suit.min;
    return window.calculateDisplayPrice(baseMin);
};
