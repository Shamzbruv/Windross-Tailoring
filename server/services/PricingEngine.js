const fs = require('fs');
const path = require('path');

/**
 * Normalize size aliases to canonical form.
 * 2X → XXL, 3X → XXXL, 4X → XXXXL
 */
function normalizeSize(size) {
    if (!size || typeof size !== 'string') return null;
    const upper = size.trim().toUpperCase();
    const aliases = {
        '2X': 'XXL',
        '3X': 'XXXL',
        '4X': 'XXXXL'
    };
    return aliases[upper] || upper;
}

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

        // --- SIZE RESOLUTION ---
        // Priority: selection.size → selection.sizeEstimate → measurements.size_estimate → computed from measurements
        const style = this.config.styles[styleId];
        let suggestedSize = 'M';
        const hasMeasurements = measurements && (measurements.chest || measurements.bust || measurements.pant_waist || measurements.torso_waist);
        if (hasMeasurements) {
            suggestedSize = this._computeSuggestedSize(measurements);
        }

        const resolvedSize = normalizeSize(
            selection.size ||
            selection.sizeEstimate ||
            (measurements && measurements.size_estimate) ||
            suggestedSize
        );

        // --- 1. BASE PRICE (SIZE-BASED LOOKUP) ---
        if (style && style.sizePricesJMD) {
            // Style has exact size-price table — use it
            const exactBasePrice = style.sizePricesJMD[resolvedSize];

            if (!Number.isFinite(exactBasePrice)) {
                // Size not in the table — return quote-required result
                return {
                    unavailable: true,
                    quoteRequired: true,
                    selectedSize: resolvedSize,
                    styleId: styleId,
                    styleName: style.name || styleId,
                    message: 'Pricing for this size requires a custom quote. Please contact Windross Tailoring.'
                };
            }

            basePriceJMD = exactBasePrice;
        } else if (style) {
            // Style without sizePricesJMD (e.g. tuxedo) — use old basePriceJMD
            basePriceJMD = style.basePriceJMD || 0;
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
            pants_only: 2.0,
            vest_only: 1.25
        };
        
        let packageStyle = 'suit_2_piece';
        if (this.config.sizing && this.config.sizing.yardageMatrix && this.config.sizing.yardageMatrix[styleId]) {
            packageStyle = styleId;
        }

        let yardsNeeded = provisionalYards[packageStyle] || 4.0;
        
        // Use the yardage matrix with the resolved size for fabric cost
        if (this.config.sizing && this.config.sizing.yardageMatrix && this.config.sizing.yardageMatrix[packageStyle]) {
            // Try normalized size first, then original aliases for yardage matrix compatibility
            const yardageForSize = this.config.sizing.yardageMatrix[packageStyle][resolvedSize]
                || this.config.sizing.yardageMatrix[packageStyle][selection.size || selection.sizeEstimate || (measurements && measurements.size_estimate) || suggestedSize];
            if (yardageForSize) {
                yardsNeeded = yardageForSize;
            }
        }

        const fabricPriceJMD = yardsNeeded * fabricPricePerYardJMD;
        sizeSurchargeJMD = 0; // Integrated into the size-based base price now

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
            resolvedSize,
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
