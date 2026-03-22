/**
 * Pricing Engine (Frontend)
 * Fetches config from backend and calculates live estimates.
 */

const PricingEngine = {
    config: null,
    isLoaded: false,

    async init() {
        try {
            const res = await fetch('/api/config/pricing');
            if (res.ok) {
                this.config = await res.json();
                this.isLoaded = true;
                console.log("[PricingEngine] Config loaded.");
                window.dispatchEvent(new CustomEvent('pricing-engine-ready'));
            } else {
                console.error("[PricingEngine] Failed to load config");
                this._loadFallback();
            }
        } catch (e) {
            console.error("[PricingEngine] Error fetching config", e);
            this._loadFallback();
        }
    },

    _loadFallback() {
        console.warn("[PricingEngine] Using fallback hardcoded configuration.");
        this.config = {
            "version": "1.0.0",
            "baseCurrency": "JMD",
            "internationalMarkupMultiplier": 1.85,
            "exchangeRate_USD_to_JMD": 155,
            "styles": {
                "suit_2_piece": { "basePriceJMD": 38000 },
                "suit_3_piece": { "basePriceJMD": 58000 },
                "tuxedo": { "basePriceJMD": 42000 },
                "jacket_only": { "basePriceJMD": 39000 },
                "pants_only": { "basePriceJMD": 15500 }
            },
            "fabricGrades": {
                "cool-wool": { "multiplier": 1.00, "costPerMeterJMD": 6000, "priceJMD": 1800 },
                "king-wool": { "multiplier": 1.00, "costPerMeterJMD": 6000, "priceJMD": 1600 },
                "2020-material": { "multiplier": 1.00, "costPerMeterJMD": 6000, "priceJMD": 1400 },
                "termal-wool": { "multiplier": 1.00, "costPerMeterJMD": 6000, "priceJMD": 5600 }
            },
            "construction": {
                "half_canvas": { "priceJMD": 0 },
                "full_canvas": { "priceJMD": 15000 }
            },
            "options": {
                "j-single-2": { "priceJMD": 0 },
                "j-single-1": { "priceJMD": 0 },
                "j-3-roll-2": { "priceJMD": 4600 },
                "j-double-6": { "priceJMD": 11500 },
                "j-mandarin": { "priceJMD": 18400 },
                "l-notch": { "priceJMD": 0 },
                "l-wide-notch": { "priceJMD": 3450 },
                "l-slim-notch": { "priceJMD": 2300 },
                "l-peak": { "priceJMD": 4600 },
                "l-shawl": { "priceJMD": 6900 },
                "l-ulster": { "priceJMD": 9200 },
                "l-gorge": { "priceJMD": 2300 },
                "p-no-pleat": { "priceJMD": 0 },
                "p-pleat": { "priceJMD": 3450 },
                "p-cuff": { "priceJMD": 2300 },
                "v-none": { "priceJMD": 0 },
                "v-add": { "priceJMD": 20000 }
            },
            "sizing": {
                "wasteFactor": 0.15,
                "baselineMeters": 4.15,
                "tiers": {
                    "XS": { "metersNeeded": 3.5, "laborScalerJMD": 0 },
                    "S": { "metersNeeded": 3.7, "laborScalerJMD": 0 },
                    "M": { "metersNeeded": 4.15, "laborScalerJMD": 0 },
                    "L": { "metersNeeded": 4.6, "laborScalerJMD": 1500 },
                    "XL": { "metersNeeded": 5.0, "laborScalerJMD": 2500 },
                    "2X": { "metersNeeded": 5.5, "laborScalerJMD": 4500 },
                    "3X": { "metersNeeded": 6.0, "laborScalerJMD": 6500 },
                    "4X": { "metersNeeded": 6.5, "laborScalerJMD": 8000 }
                }
            }
        };
        this.isLoaded = true;
        window.dispatchEvent(new CustomEvent('pricing-engine-ready'));
    },

    /**
     * Estimates pricing based on current selections.
     * @param {Object} selection - { styleId, fabricId, constructionType, options: [id1, id2], measurements: { chest, waist, hips, height, inputUnit } }
     */
    calculateEstimate(selection) {
        if (!this.isLoaded || !this.config) return null;

        const { styleId, fabricId, constructionType, options, measurements } = selection;
        let basePriceJMD = 0;
        let fabricMultiplier = 1.0;
        let fabricCostPerMeterJMD = 6000;
        let constructionPriceJMD = 0;
        let optionsPriceJMD = 0;
        let sizeSurchargeJMD = 0;

        // 1. Base Price
        if (this.config.styles[styleId]) {
            basePriceJMD = this.config.styles[styleId].basePriceJMD;
        }

        // 2. Fabric
        // Assume fabricId corresponds directly to a grade (e.g. 'A', 'B', 'C') for now
        // Real implementation would lookup fabricId -> grade mapping. Let's assume selection passes fabricGrade.
        const fabricGrade = selection.fabricGrade || 'cool-wool';
        let fabricFlatAddJMD = 0;
        if (this.config.fabricGrades[fabricGrade]) {
            fabricMultiplier = this.config.fabricGrades[fabricGrade].multiplier || 1.0;
            fabricCostPerMeterJMD = this.config.fabricGrades[fabricGrade].costPerMeterJMD || 6000;
            if (this.config.fabricGrades[fabricGrade].priceJMD !== undefined) {
                fabricFlatAddJMD = this.config.fabricGrades[fabricGrade].priceJMD;
            }
        }

        const fabricPriceJMD = (basePriceJMD * (fabricMultiplier - 1)) + fabricFlatAddJMD; // Extra cost of fabric

        // 3. Construction
        if (constructionType && this.config.construction[constructionType]) {
            constructionPriceJMD = this.config.construction[constructionType].priceJMD;
        }

        // 4. Options
        if (options && Array.isArray(options)) {
            options.forEach(optId => {
                if (this.config.options[optId]) {
                    optionsPriceJMD += this.config.options[optId].priceJMD;
                }
            });
        }

        // 5. Size Surcharge
        let suggestedSize = 'M';
        if (measurements && measurements.chest) {
            suggestedSize = this._computeSuggestedSize(measurements);
        }

        const sizeTier = this.config.sizing.tiers[suggestedSize];
        if (sizeTier) {
            const extraMeters = Math.max(0, sizeTier.metersNeeded - this.config.sizing.baselineMeters);
            const extraFabricCost = extraMeters * fabricCostPerMeterJMD;
            const wasteAdd = extraFabricCost * this.config.sizing.wasteFactor;
            sizeSurchargeJMD = Math.round(extraFabricCost + wasteAdd + sizeTier.laborScalerJMD);
        }

        let subtotalJMD = basePriceJMD + fabricPriceJMD + constructionPriceJMD + optionsPriceJMD + sizeSurchargeJMD;

        // Hard cap ALL custom suits to 65,000 JMD as per client request
        if (subtotalJMD > 65000) {
            subtotalJMD = 65000;
        }

        let quantity = selection.quantity || 1;
        subtotalJMD = subtotalJMD * quantity;

        // Apply Region Markup
        let appliedMarkupPercent = 0;
        let regionAdjustedSubtotalJMD = subtotalJMD;

        try {
            if (!window.Region.isJamaica()) {
                regionAdjustedSubtotalJMD = Math.round(subtotalJMD * this.config.internationalMarkupMultiplier);
                appliedMarkupPercent = (this.config.internationalMarkupMultiplier - 1) * 100;
            }
        } catch (e) { }

        return {
            basePriceJMD,
            fabricPriceJMD,
            constructionPriceJMD,
            optionsPriceJMD,
            sizeSurchargeJMD,
            subtotalJMD,
            regionAdjustedSubtotalJMD,
            suggestedSize,
            appliedMarkupPercent,
            finalDisplay: window.CurrencyManager ? window.CurrencyManager.format(regionAdjustedSubtotalJMD) : `J$ ${regionAdjustedSubtotalJMD}`
        };
    },

    _computeSuggestedSize(measurements) {
        // Simple heuristic (Convert to inches if necessary)
        let chest = parseFloat(measurements.chest);
        if (measurements.inputUnit === 'cm') chest = chest / 2.54;

        if (!chest || isNaN(chest)) return 'M';

        if (chest < 36) return 'XS';
        if (chest < 38) return 'S';
        if (chest <= 40) return 'M';
        if (chest <= 44) return 'L';
        if (chest <= 48) return 'XL';
        if (chest <= 52) return '2X';
        if (chest <= 56) return '3X';
        return '4X';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    PricingEngine.init();
});

window.PricingEngine = PricingEngine;
