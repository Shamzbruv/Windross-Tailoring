/**
 * Pricing Engine (Frontend)
 * Fetches config from backend and calculates live estimates.
 */

const PricingEngine = {
    config: null,
    isLoaded: false,

    async init() {
        try {
            const res = await fetch('/api/pricing');
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

    async _loadFallback() {
        console.warn("[PricingEngine] Pricing API unavailable. Attempting to load static config...");
        try {
            const fallbackRes = await fetch('server/data/pricing_config.json');
            if (fallbackRes.ok) {
                this.config = await fallbackRes.json();
                this.isLoaded = true;
                window.BACKEND_PRICING_CONFIG = this.config;
                console.log("[PricingEngine] Static config loaded successfully.");
            }
        } catch (err) {
            console.error("[PricingEngine] Both API and static config failed to load.", err);
            this.config = window.BACKEND_PRICING_CONFIG || null;
            this.isLoaded = !!this.config;
        }
        window.dispatchEvent(new CustomEvent('pricing-engine-ready'));
    },

    /**
     * Estimates pricing based on current selections.
     * @param {Object} selection - { styleId, fabricId, constructionType, options: [id1, id2], measurements: { chest, waist, hips, height, inputUnit } }
     */
    calculateEstimate(selection) {
        if (!this.isLoaded || !this.config) return null;

        const { styleId, fabricId, constructionType, options, measurements } = selection;
        const tierId = selection.tierId || 'mtm';
        
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

        // 2. Fabric & Size Surcharge (Yardage-based calculation)
        const fabricGrade = selection.fabricGrade;
        let fabricPricePerYardJMD = 0;
        
        if (fabricGrade && this.config.fabricGrades[fabricGrade]) {
            fabricPricePerYardJMD = this.config.fabricGrades[fabricGrade].pricePerYardJMD || 1800;
        }

        // Determine provisional yardage based on package type
        const provisionalYards = {
            suit_2_piece: 4.0,
            suit_3_piece: 5.0,
            tuxedo: 4.0,
            jacket_only: 2.5,
            pants_only: 2.0
        };
        
        let packageStyle = 'suit_2_piece';
        if (this.config.sizing && this.config.sizing.yardageMatrix && this.config.sizing.yardageMatrix[styleId]) {
            packageStyle = styleId;
        }

        let yardsNeeded = provisionalYards[packageStyle] || 4.0;
        let suggestedSize = 'M';
        
        // Only use the yardage matrix if the user has actually entered measurements
        const hasMeasurements = measurements && (measurements.chest || measurements.bust || measurements.pant_waist || measurements.torso_waist);
        if (hasMeasurements) {
            suggestedSize = this._computeSuggestedSize(measurements);
            if (this.config.sizing && this.config.sizing.yardageMatrix && this.config.sizing.yardageMatrix[packageStyle]) {
                if (this.config.sizing.yardageMatrix[packageStyle][suggestedSize]) {
                    yardsNeeded = this.config.sizing.yardageMatrix[packageStyle][suggestedSize];
                }
            }
        }

        const fabricPriceJMD = yardsNeeded * fabricPricePerYardJMD;
        sizeSurchargeJMD = 0; // Integrated into the yardage cost natively now

        // 3. Construction
        if (constructionType && this.config.construction[constructionType]) {
            constructionPriceJMD = this.config.construction[constructionType].priceJMD || 0;
        }

        // 4. Options
        if (options && Array.isArray(options)) {
            options.forEach(optId => {
                if (this.config.options[optId]) {
                    optionsPriceJMD += this.config.options[optId].priceJMD || 0;
                }
            });
        }

        // 6. Tier Adjustment
        let tierAdjustmentJMD = 0;
        if (this.config.tiers && this.config.tiers[tierId]) {
            tierAdjustmentJMD = this.config.tiers[tierId].baseAdjustmentJMD || 0;
        }

        let subtotalJMD = basePriceJMD + fabricPriceJMD + constructionPriceJMD + optionsPriceJMD + sizeSurchargeJMD + tierAdjustmentJMD;

        let quantity = selection.quantity || 1;
        subtotalJMD = subtotalJMD * quantity;

        // Apply Region Markup
        let appliedMarkupPercent = 0;
        let regionAdjustedSubtotalJMD = subtotalJMD;

        try {
            const regionCode = window.Pricing ? window.Pricing.getRegionCode() : (window.Region && window.Region.isJamaica() ? 'JM' : 'INTL');
            if (regionCode === 'INTL') {
                let multiplier = this.config.internationalMarkupMultiplier;
                if (this.config.styles[packageStyle] && this.config.styles[packageStyle].intlMultiplier) {
                    multiplier = this.config.styles[packageStyle].intlMultiplier;
                }
                regionAdjustedSubtotalJMD = Math.round(subtotalJMD * multiplier);
                appliedMarkupPercent = (multiplier - 1) * 100;
            }
        } catch (e) { }

        return {
            basePriceJMD,
            fabricPriceJMD,
            constructionPriceJMD,
            optionsPriceJMD,
            sizeSurchargeJMD,
            tierAdjustmentJMD,
            subtotalJMD,
            regionAdjustedSubtotalJMD,
            suggestedSize,
            appliedMarkupPercent,
            fabricPricePerYardJMD,
            yardsNeeded,
            finalDisplay: window.Pricing && typeof window.Pricing.formatJMD === 'function' ? window.Pricing.formatJMD(subtotalJMD) : (window.CurrencyManager ? window.CurrencyManager.format(regionAdjustedSubtotalJMD) : `J$ ${regionAdjustedSubtotalJMD}`)
        };
    },

    _computeSuggestedSize(measurements) {
        // Simple heuristic (Convert to inches if necessary)
        const isMetric = measurements.inputUnit === 'cm';

        let chest = parseFloat(measurements.chest || measurements.bust);
        if (chest && isMetric) chest = chest / 2.54;

        if (chest && !isNaN(chest)) {
            if (chest < 36) return 'XS';
            if (chest < 38) return 'S';
            if (chest <= 40) return 'M';
            if (chest <= 44) return 'L';
            if (chest <= 48) return 'XL';
            if (chest <= 52) return '2X';
            if (chest <= 56) return '3X';
            return '4X';
        }

        let waist = parseFloat(measurements.pant_waist || measurements.torso_waist);
        if (waist && isMetric) waist = waist / 2.54;

        if (waist && !isNaN(waist)) {
            if (waist < 29) return 'XS';
            if (waist < 32) return 'S';
            if (waist <= 35) return 'M';
            if (waist <= 37) return 'L';
            if (waist <= 41) return 'XL';
            if (waist <= 44) return '2X';
            if (waist <= 48) return '3X';
            return '4X';
        }

        return 'M';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    PricingEngine.init();
});

window.PricingEngine = PricingEngine;
