/**
 * Canonical browser pricing helper.
 * Product display uses server config as the data source; payment remains server-authoritative.
 */

(function () {
    const REGION_JM = 'JM';
    const REGION_INTL = 'INTL';

    let configPromise = null;

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

    function getRegionCode() {
        try {
            if (window.Region && typeof window.Region.getRegion === 'function') {
                return normalizeRegion(window.Region.getRegion());
            }
        } catch (e) { }

        return REGION_INTL;
    }

    async function loadConfig() {
        if (window.BACKEND_PRICING_CONFIG) return window.BACKEND_PRICING_CONFIG;

        if (!configPromise) {
            configPromise = fetch('/api/pricing')
                .then((res) => {
                    if (!res.ok) throw new Error('API not available');
                    return res.json();
                })
                .catch(() => {
                    // Fallback for static servers (e.g. Live Server without backend)
                    return fetch('server/data/pricing_config.json').then(res => res.json());
                })
                .then((config) => {
                    window.BACKEND_PRICING_CONFIG = config;
                    return config;
                })
                .catch((err) => {
                    console.error("Pricing config failed to load:", err);
                    throw err;
                });
        }

        return configPromise;
    }

    function getExchangeRate(config) {
        const rate = Number((config || window.BACKEND_PRICING_CONFIG || {}).exchangeRate_USD_to_JMD);
        if (!Number.isFinite(rate) || rate <= 0) {
            throw new Error('USD to JMD pricing exchange-rate configuration is missing.');
        }
        return rate;
    }

    function getCatalogItem(config, identifier) {
        const lookup = normalizeSku(identifier);
        const entries = Object.entries((config && config.catalog) || {});
        const match = entries.find(([productName]) => normalizeSku(productName) === lookup);

        if (!match) return null;

        return {
            sku: normalizeSku(match[0]),
            productName: match[0],
            ...match[1]
        };
    }

    function buildDisplay(amount, currency) {
        return {
            amount: Number(amount.toFixed(currency === 'JMD' ? 0 : 2)),
            amountMinor: Math.round(amount * 100),
            currency,
            locale: currency === 'JMD' ? 'en-JM' : 'en-US'
        };
    }

    async function getCatalogPrice(identifier, size = 'M') {
        const config = await loadConfig();
        const item = getCatalogItem(config, identifier);

        if (!item) {
            throw new Error(`Unknown catalog SKU: ${identifier}`);
        }

        const region = getRegionCode();
        const exchangeRate = getExchangeRate(config);
        
        // Priority Fix 2 & 5: Derive base JMD from the local restored table, NOT priceUSD.
        let baseAmountJMD = window.calculateSuitPriceBase ? window.calculateSuitPriceBase(item.productName, size) : null;
        if (!baseAmountJMD) {
            throw new Error(`Unknown base price for SKU: ${identifier}`);
        }

        const isIntl = region === REGION_INTL;
        const multiplier = Number(config.internationalMarkupMultiplier || 1.85);
        const overseasBaseJMD = Math.round(baseAmountJMD * multiplier);

        const display = isIntl
            ? buildDisplay(overseasBaseJMD / exchangeRate, 'USD')
            : buildDisplay(baseAmountJMD, 'JMD');

        return {
            type: 'catalog',
            sku: item.sku,
            productName: item.productName,
            gender: item.gender || 'male',
            image: item.image || 'images/logo.png',
            size,
            region,
            exchangeRateUSDToJMD: exchangeRate,
            baseAmountJMD,
            subtotalJMD: baseAmountJMD,
            regionAdjustedSubtotalJMD: isIntl ? overseasBaseJMD : baseAmountJMD,
            appliedMarkupPercent: isIntl ? Math.round((multiplier - 1) * 100) : 0,
            display,
            pricingVersion: config.version,
            priceBasis: 'local-jmd-table'
        };
    }

    async function quoteCustom(selection) {
        const region = getRegionCode();

        try {
            const res = await fetch('/api/pricing/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selection, region })
            });
            if (res.ok) return res.json();
        } catch (e) { }

        if (window.PricingEngine && window.PricingEngine.calculateEstimate) {
            if (!window.PricingEngine.isLoaded && typeof window.PricingEngine.init === 'function') {
                await window.PricingEngine.init();
            }
            const estimate = window.PricingEngine.calculateEstimate(selection);
            if (estimate) {
                const config = await loadConfig();
                const exchangeRate = getExchangeRate(config);
                return {
                    ...estimate,
                    type: 'custom',
                    region,
                    display: region === REGION_JM
                        ? buildDisplay(estimate.regionAdjustedSubtotalJMD, 'JMD')
                        : buildDisplay(estimate.regionAdjustedSubtotalJMD / exchangeRate, 'USD')
                };
            }
        }

        throw new Error('Failed to calculate custom quote');
    }

    function format(displayOrQuote) {
        const display = displayOrQuote && displayOrQuote.display ? displayOrQuote.display : displayOrQuote;
        if (!display || !display.currency) return '';

        const amount = Number(display.amount || 0);
        
        if (display.currency === 'JMD') {
            return `J$${amount.toLocaleString('en-JM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        } else {
            return `US$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    }

    function formatJMD(amountJMD, showCents = false) {
        const region = getRegionCode();
        const config = window.BACKEND_PRICING_CONFIG || {};
        const exchangeRate = getExchangeRate(config);
        const currency = region === REGION_JM ? 'JMD' : 'USD';
        
        // For overseas, ensure we apply markup before formatting JMD to USD
        const multiplier = Number(config.internationalMarkupMultiplier || 1.85);
        const base = Number(amountJMD || 0);
        const finalAmount = currency === 'JMD' ? base : (base * multiplier) / exchangeRate;

        if (currency === 'JMD') {
            return `J$${finalAmount.toLocaleString('en-JM', { minimumFractionDigits: showCents ? 2 : 0, maximumFractionDigits: showCents ? 2 : 0 })}`;
        } else {
            return `US$${finalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    }

    window.Pricing = {
        JM: REGION_JM,
        INTL: REGION_INTL,
        normalizeRegion,
        normalizeSku,
        getRegionCode,
        loadConfig,
        getExchangeRate,
        getCatalogItem,
        getCatalogPrice,
        quoteCustom,
        format,
        formatJMD
    };
})();
