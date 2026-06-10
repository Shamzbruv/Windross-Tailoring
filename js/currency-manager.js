/**
 * Currency Manager
 * Handles currency state, conversion, and formatting.
 * 
 * Default Base: JMD (J$)
 * Supported: USD ($), JMD (J$)
 */

const CurrencyManager = {
    state: {
        currency: 'JMD', // Default fallback
        rates: {
            'JMD': 1,
            'USD': 1
        },
        locales: {
            'USD': 'en-US',
            'JMD': 'en-JM'
        },
        symbols: {
            'USD': 'US$',
            'JMD': 'J$'
        }
    },

    init() {
        this.syncBusinessRate();

        // 1. Check URL override
        const params = new URLSearchParams(window.location.search);
        if (params.has('currency')) {
            const c = params.get('currency').toUpperCase();
            if (this.state.rates[c]) {
                console.log(`[Currency] Override via URL: ${c}`);
                this.setCurrency(c);
                return;
            }
        }

        // 2. Check explicitly set Region first to prevent desync
        try {
            const savedRegion = window.Region.getRegion();
            if (savedRegion === window.Region.INTL) {
                console.log('[Currency] Override via Region: USD');
                this.setCurrency('USD');
                return;
            } else if (savedRegion === window.Region.JM) {
                console.log('[Currency] Override via Region: JMD');
                this.setCurrency('JMD');
                return;
            }
        } catch (e) { }

        // 3. Check LocalStorage (Safe)
        try {
            const cached = localStorage.getItem('windross_currency');
            if (cached && this.state.rates[cached]) {
                console.log(`[Currency] Loaded from cache: ${cached}`);
                this.setCurrency(cached);
                return;
            }
        } catch (e) {
            console.warn("[Currency] LocalStorage access failed", e);
        }

        // 4. Detect Location
        // Check if running on file protocol which often blocks API calls
        if (window.location.protocol === 'file:') {
            console.warn("[Currency] Running on file:// protocol. Automatic detection may fail due to CORS. Use ?currency=XXX to test.");
        }
        this.detectLocation();
    },

    syncBusinessRate() {
        const applyRate = (config) => {
            const usdToJmd = Number(config && config.exchangeRate_USD_to_JMD);
            if (Number.isFinite(usdToJmd) && usdToJmd > 0) {
                this.state.rates.USD = 1 / usdToJmd;
            }
        };

        if (window.BACKEND_PRICING_CONFIG) {
            applyRate(window.BACKEND_PRICING_CONFIG);
            return;
        }

        if (window.Pricing && typeof window.Pricing.loadConfig === 'function') {
            window.Pricing.loadConfig()
                .then((config) => {
                    applyRate(config);
                    this.updateDOM();
                    window.dispatchEvent(new CustomEvent('currency-change', { detail: { currency: this.state.currency } }));
                })
                .catch((err) => console.warn('[Currency] Failed to load configured exchange rate', err));
        }
    },

    detectLocation() {
        console.log('[Currency] Checking region before defaulting...');

        try {
            // NEVER override a user selection: Since window.Region normalizes and defaults to INTL if empty,
            // we should technically just follow it. However, if the canonical normalized state happens
            // to literally be missing from localStorage (first time visitor), Region defaults to INTL.
            const savedRegion = window.Region.getRegion();
            if (savedRegion === window.Region.INTL) {
                console.log('[Currency] Found INTL region, setting USD');
                this.setCurrency('USD');
                return;
            }
        } catch (e) { }

        console.log('[Currency] Defaulting to JMD');
        this.setCurrency('JMD');
    },

    setCurrency(code) {
        if (!this.state.rates[code]) return;

        this.state.currency = code;
        try {
            localStorage.setItem('windross_currency', code);
        } catch (e) {
            console.warn("Could not save currency to localStorage", e);
        }

        document.documentElement.setAttribute('data-currency', code);

        this.updateDOM();
        window.dispatchEvent(new CustomEvent('currency-change', { detail: { currency: code } }));
    },

    getRate() {
        return this.state.rates[this.state.currency];
    },

    convert(amountInJMD) {
        // Assume amountInJMD already has regional markups applied by the Pricing Engine / calculateDisplayPrice
        return amountInJMD * this.getRate();
    },

    format(amountInJMD, showCents = false) {
        const val = this.convert(amountInJMD);
        const currency = this.state.currency;
        const fractionDigits = currency === 'JMD' && !showCents ? 0 : 2;

        return new Intl.NumberFormat(this.state.locales[currency], {
            style: 'currency',
            currency,
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits
        }).format(val);
    },

    updateDOM() {
        // Find elements with base JMD prices or fallback to old GBP logic for backwards compat
        const elementsJMD = document.querySelectorAll('[data-price-jmd]');
        elementsJMD.forEach(el => {
            const basePrice = parseFloat(el.getAttribute('data-price-jmd'));
            if (!isNaN(basePrice)) {
                const currentText = el.textContent;
                const prefix = currentText.toLowerCase().includes('from') ? 'From ' : '';
                el.textContent = prefix + this.format(basePrice);
            }
        });

        document.querySelectorAll('[data-price-gbp]').forEach(el => {
            el.removeAttribute('data-price-gbp');
            console.warn('[Currency] Ignored legacy data-price-gbp value. Use data-price-jmd or window.Pricing.');
        });
    }
};

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
    CurrencyManager.init();
});

// Expose global
window.CurrencyManager = CurrencyManager;
