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
            'USD': 1 / 157.05  // Synchronized directly with DHL's internal exchange rate
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

    async loadLiveRates() {
        try {
            // Fetch the live global Bank Exchange Rate for USD to JMD dynamically
            const res = await fetch('https://open.er-api.com/v6/latest/USD');
            const data = await res.json();
            if (data && data.rates && data.rates.JMD) {
                this.state.rates['USD'] = 1 / data.rates.JMD;
                console.log(`[Currency] Live Exchange Rate synced dynamically: 1 USD = ${data.rates.JMD} JMD`);
                this.updateDOM(); // Refresh all prices on screen with live exact math
            }
        } catch (e) {
            console.warn("[Currency] Failed to load live exchange rate, falling back safely to hardcoded default (157.05)", e);
        }
    },

    init() {
        // Kick off live rate fetching instantly in the background without slowing down the site
        this.loadLiveRates();

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
        const symbol = this.state.symbols[this.state.currency];

        // JMD usually doesn't show cents for high values
        const fractionDigits = (this.state.currency === 'JMD' && val > 100) ? 0 : 2;

        // Force nice formatting
        return symbol + val.toLocaleString(this.state.locales[this.state.currency], {
            minimumFractionDigits: showCents ? fractionDigits : 0,
            maximumFractionDigits: fractionDigits
        });
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

        const elementsGBP = document.querySelectorAll('[data-price-gbp]');
        elementsGBP.forEach(el => {
            const basePriceGBP = parseFloat(el.getAttribute('data-price-gbp'));
            if (!isNaN(basePriceGBP)) {
                // Convert old GBP to standard JMD assuming old rate 230
                const estimatedJMD = basePriceGBP * 230;
                const currentText = el.textContent;
                const prefix = currentText.toLowerCase().includes('from') ? 'From ' : '';
                el.textContent = prefix + this.format(estimatedJMD);
            }
        });
    }
};

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
    CurrencyManager.init();
});

// Expose global
window.CurrencyManager = CurrencyManager;
