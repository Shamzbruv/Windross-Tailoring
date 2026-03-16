const fs = require('fs');
const path = require('path');

class PricingEngine {
    constructor() {
        const configPath = path.join(__dirname, '../data/pricing_config.json');
        this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    /**
     * Re-calculates pricing authoritatively on the backend
     */
    calculatePrice(selection, region) {
        if (!selection) return null;

        const { styleId, fabricId, constructionType, options, measurements, fabricGrade } = selection;
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
        const grade = fabricGrade || 'cool-wool';
        let fabricFlatAddJMD = 0;
        if (this.config.fabricGrades[grade]) {
            fabricMultiplier = this.config.fabricGrades[grade].multiplier || 1.0;
            fabricCostPerMeterJMD = this.config.fabricGrades[grade].costPerMeterJMD || 6000;
            if (this.config.fabricGrades[grade].priceJMD !== undefined) {
                fabricFlatAddJMD = this.config.fabricGrades[grade].priceJMD;
            }
        }

        const fabricPriceJMD = (basePriceJMD * (fabricMultiplier - 1)) + fabricFlatAddJMD;

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
        if (measurements && (measurements.chest || measurements.bust)) {
            suggestedSize = this._computeSuggestedSize(measurements);
        }

        const sizeTier = this.config.sizing.tiers[suggestedSize];
        if (sizeTier) {
            const extraMeters = Math.max(0, sizeTier.metersNeeded - this.config.sizing.baselineMeters);
            const extraFabricCost = extraMeters * fabricCostPerMeterJMD;
            const wasteAdd = extraFabricCost * this.config.sizing.wasteFactor;
            sizeSurchargeJMD = Math.round(extraFabricCost + wasteAdd + sizeTier.laborScalerJMD);
        }

        const subtotalJMD = basePriceJMD + fabricPriceJMD + constructionPriceJMD + optionsPriceJMD + sizeSurchargeJMD;

        // Apply Region Markup
        let appliedMarkupPercent = 0;
        let regionAdjustedSubtotalJMD = subtotalJMD;

        if (region === 'INTL') {
            regionAdjustedSubtotalJMD = Math.round(subtotalJMD * this.config.internationalMarkupMultiplier);
            appliedMarkupPercent = (this.config.internationalMarkupMultiplier - 1) * 100;
        }

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
            pricingVersion: this.config.version
        };
    }

    _computeSuggestedSize(measurements) {
        let chestVal = measurements.chest || measurements.bust;
        let chest = parseFloat(chestVal);
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
}

module.exports = new PricingEngine();
