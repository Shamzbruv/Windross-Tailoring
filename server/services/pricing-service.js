const fs = require('fs');
const path = require('path');
const PricingEngine = require('./PricingEngine');

const CONFIG_PATH = path.join(__dirname, '../data/pricing_config.json');
const REGION_JM = 'JM';
const REGION_INTL = 'INTL';

function loadConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function normalizeRegion(region) {
    const value = String(region || '').trim().toUpperCase();
    if (['JM', 'JA', 'JAMAICA'].includes(value)) return REGION_JM;
    if (['INTL', 'INTERNATIONAL', 'GLOBAL', 'OVERSEAS', 'ABROAD'].includes(value)) return REGION_INTL;
    return REGION_INTL;
}

function normalizeSku(value) {
    return String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function getExchangeRate(config = loadConfig()) {
    const rate = Number(config.exchangeRate_USD_to_JMD);
    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('USD to JMD pricing exchange-rate configuration is missing.');
    }
    return rate;
}

function getCatalogEntries(config = loadConfig()) {
    return Object.entries(config.catalog || {}).map(([productName, data]) => ({
        sku: normalizeSku(productName),
        productName,
        priceUSD: Number(data.priceUSD || 0),
        gender: data.gender || 'male',
        image: data.image || 'images/logo.png'
    }));
}

function getCatalogItem(identifier, config = loadConfig()) {
    const lookup = normalizeSku(identifier);
    return getCatalogEntries(config).find((entry) => entry.sku === lookup) || null;
}

function buildDisplay(amount, currency) {
    return {
        amount: Number(amount.toFixed(currency === 'JMD' ? 0 : 2)),
        amountMinor: Math.round(amount * 100),
        currency,
        locale: currency === 'JMD' ? 'en-JM' : 'en-US'
    };
}

function getCatalogQuote(identifier, region = REGION_INTL, size = 'M') {
    const config = loadConfig();
    const item = getCatalogItem(identifier, config);

    if (!item || !item.priceUSD) {
        const err = new Error(`Unknown catalog SKU: ${identifier}`);
        err.statusCode = 404;
        throw err;
    }

    const regionCode = normalizeRegion(region);
    const exchangeRate = getExchangeRate(config);
    const baseAmountJMD = Math.round(item.priceUSD * exchangeRate);
    const display = regionCode === REGION_JM
        ? buildDisplay(baseAmountJMD, 'JMD')
        : buildDisplay(item.priceUSD, 'USD');

    return {
        type: 'catalog',
        sku: item.sku,
        productName: item.productName,
        gender: item.gender,
        image: item.image,
        size: size || 'M',
        region: regionCode,
        exchangeRateUSDToJMD: exchangeRate,
        baseAmountJMD,
        subtotalJMD: baseAmountJMD,
        regionAdjustedSubtotalJMD: baseAmountJMD,
        appliedMarkupPercent: 0,
        display,
        pricingVersion: config.version,
        priceBasis: 'catalog-fixed-usd'
    };
}

function quoteCustomSuit(selection, region = REGION_INTL) {
    const regionCode = normalizeRegion(region);
    const quote = PricingEngine.calculatePrice(selection, regionCode);

    if (!quote) {
        const err = new Error('Unable to calculate custom suit pricing.');
        err.statusCode = 400;
        throw err;
    }

    // Block checkout for sizes that require a custom quote
    if (quote.quoteRequired || quote.unavailable) {
        const err = new Error(
            quote.message ||
            `Pricing for size "${quote.selectedSize || 'unknown'}" requires a custom quote. Please contact Windross Tailoring.`
        );
        err.statusCode = 400;
        err.quoteRequired = true;
        err.selectedSize = quote.selectedSize;
        throw err;
    }

    const config = loadConfig();
    const exchangeRate = getExchangeRate(config);
    const display = regionCode === REGION_JM
        ? buildDisplay(quote.regionAdjustedSubtotalJMD, 'JMD')
        : buildDisplay(quote.regionAdjustedSubtotalJMD / exchangeRate, 'USD');

    return {
        ...quote,
        type: 'custom',
        region: regionCode,
        exchangeRateUSDToJMD: exchangeRate,
        display
    };
}

function formatMoney(display) {
    if (!display || !display.currency) return '';

    return new Intl.NumberFormat(display.locale || (display.currency === 'JMD' ? 'en-JM' : 'en-US'), {
        style: 'currency',
        currency: display.currency,
        minimumFractionDigits: display.currency === 'JMD' ? 0 : 2,
        maximumFractionDigits: display.currency === 'JMD' ? 0 : 2
    }).format(display.amount);
}

module.exports = {
    REGION_JM,
    REGION_INTL,
    loadConfig,
    normalizeRegion,
    normalizeSku,
    getExchangeRate,
    getCatalogEntries,
    getCatalogItem,
    getCatalogQuote,
    quoteCustomSuit,
    formatMoney
};
