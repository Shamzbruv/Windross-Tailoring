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
        const tierId = selection.tierId || 'mtm';
        const quantity = Number(selection.quantity || 1);
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
        const fabricGradeValue = fabricGrade;
        let fabricPricePerYardJMD = 0;
        
        if (fabricGradeValue && this.config.fabricGrades[fabricGradeValue]) {
            fabricPricePerYardJMD = this.config.fabricGrades[fabricGradeValue].pricePerYardJMD || 1800;
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

        // Apply 15% waste allowance if it hasn't been pre-calculated.
        // As per the user's instructions, we use the rough yardage table.
        // We'll use the table values exactly as provided since the user's example
        // ("4 * 1800 = 7200") used the raw table value without extra 15%.

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

        const subtotalJMD = (basePriceJMD + fabricPriceJMD + constructionPriceJMD + optionsPriceJMD + sizeSurchargeJMD + tierAdjustmentJMD) * quantity;

        // Apply Region Markup
        let appliedMarkupPercent = 0;
        let regionAdjustedSubtotalJMD = subtotalJMD;

        if (region === 'INTL') {
            let multiplier = this.config.internationalMarkupMultiplier;
            if (this.config.styles[packageStyle] && this.config.styles[packageStyle].intlMultiplier) {
                multiplier = this.config.styles[packageStyle].intlMultiplier;
            }
            regionAdjustedSubtotalJMD = Math.round(subtotalJMD * multiplier);
            appliedMarkupPercent = (multiplier - 1) * 100;
        }

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
            quantity,
            fabricPricePerYardJMD,
            yardsNeeded,
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

    _computeSuggestedSize(measurements) {
        let chestVal = measurements.chest || measurements.bust;
        let chest = parseFloat(chestVal);
        if (measurements.inputUnit === 'cm') chest = chest / 2.54;

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
        if (waist && measurements.inputUnit === 'cm') waist = waist / 2.54;

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
}

module.exports = new PricingEngine();
