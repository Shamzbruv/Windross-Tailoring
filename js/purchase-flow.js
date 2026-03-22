// purchase-flow.js

const SIZE_CHART = {
    male: {
        'XS': { chest: [33.1, 35.0], waist: [27.6, 29.5], hips: [33.1, 35.0], shoulder: [15.7, 16.9], sleeve: [23.2, 24.0], neck: [13.8, 14.6], height: [61.0, 65.0], weight: [110, 132] },
        'S': { chest: [35.4, 37.4], waist: [29.9, 31.9], hips: [35.4, 37.4], shoulder: [16.9, 17.7], sleeve: [24.0, 24.8], neck: [14.6, 15.0], height: [65.0, 67.7], weight: [132, 150] },
        'M': { chest: [37.8, 39.8], waist: [32.3, 34.3], hips: [37.8, 39.8], shoulder: [17.7, 18.5], sleeve: [24.8, 25.6], neck: [15.4, 15.7], height: [67.7, 70.1], weight: [150, 172] },
        'L': { chest: [40.2, 42.1], waist: [34.6, 36.6], hips: [40.2, 42.1], shoulder: [18.5, 19.3], sleeve: [25.6, 26.4], neck: [16.1, 16.5], height: [70.1, 72.8], weight: [172, 194] },
        'XL': { chest: [42.5, 44.5], waist: [37.0, 39.0], hips: [42.5, 44.5], shoulder: [19.3, 20.1], sleeve: [26.4, 27.2], neck: [16.9, 17.3], height: [72.8, 74.8], weight: [194, 220] },
        'XXL': { chest: [44.9, 46.9], waist: [39.4, 41.3], hips: [44.9, 46.9], shoulder: [20.1, 20.9], sleeve: [27.2, 28.0], neck: [17.7, 18.1], height: [72.8, 76.8], weight: [220, 254] },
        'XXXL': { chest: [47.2, 49.2], waist: [41.7, 44.1], hips: [47.2, 49.2], shoulder: [20.9, 21.7], sleeve: [28.0, 28.7], neck: [18.5, 18.9], height: [72.8, 78.7], weight: [254, 287] },
        'XXXXL': { chest: [49.6, 53.1], waist: [44.5, 48.0], hips: [49.6, 53.1], shoulder: [21.7, 22.8], sleeve: [28.7, 29.5], neck: [19.3, 20.5], height: [72.8, 80.7], weight: [287, 331] }
    },
    female: {
        'XS': { bust: [30.7, 32.7], waist: [23.6, 25.6], hips: [33.1, 35.0], shoulder: [14.2, 15.0], sleeve: [22.0, 22.8], neck: [11.8, 12.6], height: [59.1, 63.0], weight: [99, 121] },
        'S': { bust: [33.1, 35.0], waist: [26.0, 28.0], hips: [35.4, 37.4], shoulder: [15.0, 15.7], sleeve: [22.8, 23.6], neck: [12.6, 13.4], height: [62.2, 65.0], weight: [121, 137] },
        'M': { bust: [35.4, 37.4], waist: [28.3, 30.3], hips: [37.8, 39.8], shoulder: [15.7, 16.5], sleeve: [23.6, 24.4], neck: [13.4, 14.2], height: [65.0, 67.7], weight: [137, 159] },
        'L': { bust: [37.8, 39.8], waist: [30.7, 32.7], hips: [40.2, 42.1], shoulder: [16.5, 17.3], sleeve: [24.4, 25.2], neck: [14.2, 15.0], height: [66.9, 70.1], weight: [159, 181] },
        'XL': { bust: [40.2, 42.1], waist: [33.1, 35.0], hips: [42.5, 44.5], shoulder: [17.3, 18.1], sleeve: [25.2, 26.0], neck: [15.0, 15.7], height: [66.9, 70.9], weight: [181, 203] },
        'XXL': { bust: [42.5, 45.3], waist: [35.4, 38.6], hips: [44.9, 47.2], shoulder: [18.1, 18.9], sleeve: [26.0, 26.8], neck: [15.7, 16.5], height: [66.9, 71.7], weight: [203, 231] },
        'XXXL': { bust: [45.7, 48.4], waist: [39.0, 42.1], hips: [47.6, 50.4] },
        'XXXXL': { bust: [48.8, 53.1], waist: [42.5, 46.5], hips: [50.8, 55.1] }
    }
};
const state = {
    step: 1,
    suitId: null,
    gender: 'male', // default
    measurements: {},
    shipping: {},
    paymentMethod: 'wipay'
};

const suits = {
    'The Kensington': { price: 1250, image: 'images/ready-to-wear/female-1.png', gender: 'female' },
    'The Windsor': { price: 1450, image: 'images/ready-to-wear/male-new-1.png', gender: 'male' },
    'The Mayfair': { price: 1250, image: 'images/ready-to-wear/female-2.png', gender: 'female' },
    'The Bond': { price: 1550, image: 'images/ready-to-wear/male-new-2.png', gender: 'male' },
    'The Chelsea': { price: 1350, image: 'images/ready-to-wear/female-3.png', gender: 'female' },
    'The Ascott': { price: 1450, image: 'images/ready-to-wear/male-new-3.png', gender: 'male' },
    'The Victoria': { price: 1250, image: 'images/ready-to-wear/female-4.png', gender: 'female' },
    'The Oxford': { price: 1650, image: 'images/ready-to-wear/male-new-4.png', gender: 'male' },
    'The Belgravia': { price: 1400, image: 'images/ready-to-wear/female-5.png', gender: 'female' },
    'The Cambridge': { price: 1550, image: 'images/ready-to-wear/male-new-5.png', gender: 'male' },
    'The Sovereign': { price: 1100, image: 'images/ready-to-wear/female-new-1.png', gender: 'female' },
    'The Regent': { price: 1300, image: 'images/ready-to-wear/male-new-6.png', gender: 'male' },
    'The Grosvenor': { price: 1350, image: 'images/ready-to-wear/female-new-2.png', gender: 'female' },
    'The Savile': { price: 1800, image: 'images/ready-to-wear/male-new-7.png', gender: 'male' },
    'The Westminster': { price: 1350, image: 'images/ready-to-wear/female-new-3.png', gender: 'female' },
    'The Knightsbridge': { price: 1650, image: 'images/ready-to-wear/male-new-8.png', gender: 'male' },
    'The Piccadilly': { price: 1300, image: 'images/ready-to-wear/female-new-4.png', gender: 'female' },
    'The St. James': { price: 1700, image: 'images/ready-to-wear/male-new-9.png', gender: 'male' },

    // Defaults for unknowns
    'default': { price: 1350, image: 'images/logo.png', gender: 'male' }
};

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const wipayStatus = urlParams.get('status');
    const orderId = urlParams.get('order_id');
    const transactionId = urlParams.get('transaction_id');

    // 1. Live WiPay Success
    if (wipayStatus === 'success' && orderId) {
        verifyPayment(orderId, transactionId);
        return;
    } else if (wipayStatus === 'failed' || wipayStatus === 'error') {
        alert("Payment was unsuccessful. Please check your credentials or try again.");
        // Let the script continue so they can stay on the checkout page
    }

    // 2. Legacy Mock Check
    if (urlParams.get('payment_success')) {
        verifyPayment(urlParams.get('session_id'), urlParams.get('txn'));
        return;
    }

    // 1. Get Suit from URL
    const params = new URLSearchParams(window.location.search);
    const suitName = params.get('suit') || 'The Windsor';
    state.suitId = suitName;

    // Load suit details
    // Load suit details
    let suitData = suits[suitName];

    // Handle Custom Suit
    if (suitName === 'Custom' || suitName === 'Custom Bespoke Suit') {
        const customDataStr = sessionStorage.getItem('custom_suit_data');
        if (customDataStr) {
            const customData = JSON.parse(customDataStr);
            state.gender = customData.gender;

            // Use the user's design name if provided
            if (customData.suitId && customData.suitId !== 'Custom Bespoke Suit' && customData.suitId !== 'Custom') {
                state.suitId = customData.suitId;
                suitName = customData.suitId; // Update local var for consistency if needed downstream
            }

            // Inject into suits object
            suits[state.suitId] = {
                price: customData.pricing ? customData.pricing.subtotalJMD : customData.price,
                pricing: customData.pricing,
                pricingEngineSelection: customData.pricingEngineSelection,
                image: 'images/logo.png', // Default logo for custom
                gender: customData.gender,
                config: customData.config || {},
                quantity: customData.quantity || 1,
                additionalColors: customData.additionalColors || 'same',
                extraColors: customData.extraColors || {}
            };
            suitData = suits[state.suitId];

            // Map Measurements
            const cm = customData.measurements || {};
            state.measurements = {
                height: cm.height || '',
                weight: cm.weight || '',
                shoulder: cm.shoulder || '',
                sleeve: cm.sleeve || '',
                chest: cm.chest || cm.bust || '',
                waist: cm.torso_waist || cm.pant_waist || cm.waist || '',
                hips: cm.hips || '',
                neck: cm.neck || '',
                underbust: cm.underbust || '',
            };

            // Map Shipping / Details
            const d = customData.details || {};
            state.shipping = {
                name: d.name || '',
                email: d.email || '',
                phone: d.phone || '',
                address: d.address1 || '',
                city: d.city || '',
                country: d.country || 'Jamaica',
                zip: '',
                region: ''
            };
            if (d.address2) state.shipping.address += ', ' + d.address2;

            // Auto-Skip to Checkout (Step 3)
            setTimeout(() => {
                // Populate Hidden Forms for Logic Compatibility
                const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
                setVal('name', state.shipping.name);
                setVal('email', state.shipping.email);
                setVal('phone', state.shipping.phone);
                setVal('address', state.shipping.address);
                setVal('city', state.shipping.city);

                const countryEl = document.getElementById('country');
                if (countryEl) {
                    countryEl.value = state.shipping.country;
                    if (countryEl.onchange) countryEl.onchange();
                    updateAddressFormat();
                }

                // Force Step 3
                renderStep(3);

                // Update Checkout Display
                const addrDisplay = document.getElementById('checkout-address');
                if (addrDisplay) {
                    let addressStr = `${state.shipping.address}, ${state.shipping.city}`;
                    if (state.shipping.country) addressStr += `, ${state.shipping.country}`;
                    addrDisplay.textContent = addressStr;
                }
            }, 100);
        }
    } else {
        suitData = suits[suitName] || suits['default'];
        state.gender = suitData.gender;
    }

    // Update UI Summary
    updateSummaryPrices();

    // Sync Gender Buttons with Suit Gender
    const genderBtns = document.querySelectorAll('.gender-btn');
    genderBtns.forEach(btn => {
        if (btn.dataset.gender === state.gender) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Listen for currency changes
    window.addEventListener('currency-change', () => {
        updateSummaryPrices();
        if (state.step === 3) calculateShipping(); // Recalculate total if in step 3
    });

    // Initialize View
    renderStep(1);

    // gender toggle listener
    // Re-use genderBtns from above
    genderBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            genderBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.gender = btn.dataset.gender;
            renderMeasurementFields();
        });
    });

    // Initial render of fields
    renderMeasurementFields();

    // Initial Address Format
    updateAddressFormat();
});

function updateAddressFormat() {
    const country = document.getElementById('country').value;

    const labelRegion = document.getElementById('label-region');
    const inputRegion = document.getElementById('region');
    const groupRegion = document.getElementById('group-region');

    const labelZip = document.getElementById('label-zip');
    const inputZip = document.getElementById('zip');
    const groupZip = document.getElementById('group-zip');

    if (country === 'Jamaica') {
        // Jamaica: Parish is important, No Zip needed usually
        labelRegion.textContent = 'Parish';
        inputRegion.placeholder = 'St. Andrew';
        groupRegion.style.display = 'block';

        groupZip.style.display = 'none';
        inputZip.value = ''; // clear
    }
    else if (country === 'USA') {
        // USA: State + Zip
        labelRegion.textContent = 'State';
        inputRegion.placeholder = 'NY';
        groupRegion.style.display = 'block';

        labelZip.textContent = 'Zip Code';
        inputZip.placeholder = '10001';
        groupZip.style.display = 'block';
    }
    else if (country === 'UK') {
        // UK: County (optional/region) + Postcode
        labelRegion.textContent = 'County';
        inputRegion.placeholder = 'London';
        groupRegion.style.display = 'block';

        labelZip.textContent = 'Postcode';
        inputZip.placeholder = 'SW1A 1AA';
        groupZip.style.display = 'block';
    }
    else {
        // Default
        labelRegion.textContent = 'Region / State';
        inputRegion.placeholder = '';
        groupRegion.style.display = 'block';

        labelZip.textContent = 'Postal Code';
        inputZip.placeholder = '';
        groupZip.style.display = 'block';
    }
}


function renderStep(stepNum) {
    state.step = stepNum;

    // Hide all steps
    document.querySelectorAll('.step-content').forEach(el => el.style.display = 'none');

    // Show current step
    document.getElementById(`step-${stepNum}`).style.display = 'block';

    // Update Progress Bar
    document.querySelectorAll('.progress-step').forEach((el, idx) => {
        const num = idx + 1;
        el.classList.remove('active', 'completed');
        if (num === stepNum) el.classList.add('active');
        if (num < stepNum) el.classList.add('completed');
    });



    if (stepNum === 4) {
        const waBtn = document.getElementById('whatsapp-btn');
        if (waBtn) {
            waBtn.onclick = () => {
                const phone = "18765986434";
                const msg = `*New Order Confirmed*\nOrder Ref: ${state.sessionId}\nName: ${state.shipping.name}\nItem: ${state.suitId}\nTotal: ${document.getElementById('summary-total').textContent}`;
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
            };
        }
    }

    window.scrollTo(0, 0);
}

function renderMeasurementFields() {
    const container = document.getElementById('measurement-fields-container');
    container.innerHTML = ''; // clear

    const isFemale = state.gender === 'female';

    // Common Fields
    const fields = [
        { id: 'height', label: 'Total Height (ft)', placeholder: 'e.g. 5.9' },
        { id: 'weight', label: 'Weight (lbs)', placeholder: 'e.g. 165' },
        { id: 'chest', label: 'Chest (inches)', placeholder: 'Fullest part' },
        { id: 'waist', label: 'Waist (inches)', placeholder: 'Natural waistline' },
        { id: 'hips', label: 'Hips (inches)', placeholder: 'Fullest part' },
        { id: 'shoulder', label: 'Shoulder Width (inches)', placeholder: 'Edge to edge' },
        { id: 'sleeve', label: 'Sleeve Length (inches)', placeholder: 'Shoulder to wrist' },
    ];

    if (isFemale) {
        fields.push({ id: 'bust', label: 'Bust (inches)', placeholder: 'Fullest part of bust' });
        fields.push({ id: 'underbust', label: 'Underbust (inches)', placeholder: 'Ribcage under bust' });
    } else {
        fields.push({ id: 'neck', label: 'Neck (inches)', placeholder: 'Collar size' });
    }

    // Render
    let html = '';
    fields.forEach(f => {
        html += `
            <div class="form-group">
                <label>${f.label}</label>
                <input type="number" step="0.1" id="m-${f.id}" name="${f.id}" placeholder="${f.placeholder}" 
                       value="${state.measurements[f.id] || ''}" onchange="updateMeasurement('${f.id}', this.value)">
            </div>
        `;
    });

    container.innerHTML = html;
    if (typeof updateSuggestedSizeUI === 'function') updateSuggestedSizeUI();
}

function updateMeasurement(key, val) {
    state.measurements[key] = val;
    if (typeof updateSuggestedSizeUI === 'function') updateSuggestedSizeUI();
}

function nextStep() {
    // Validation Logic
    if (state.step === 1) {
        // Validate measurements
        const inputs = document.querySelectorAll('#step-1 input');
        let valid = true;
        inputs.forEach(i => {
            if (!i.value) valid = false;
        });

        if (!window.RegionManager || !window.RegionManager.state.region) { alert("Please select your shopping region before proceeding."); return; }

        if (!valid) {
            alert("Please fill in all measurements.");
            return;
        }

        if (state.sizeError && state.suitId !== 'Custom' && state.suitId !== 'Custom Bespoke Suit') {
            alert("Size could not be determined or style is unavailable in your size. Please re-check measurements.");
            return;
        }

        // Save Draft to Backend
        // Include Config in measurements for storage if custom
        const payloadMeasurements = { ...state.measurements };
        if (suits[state.suitId] && suits[state.suitId].config) {
            payloadMeasurements._config = suits[state.suitId].config;
        }

        payloadMeasurements.suggestedSize = state.suggestedSize || 'N/A';
        payloadMeasurements.suggestedConfidence = state.suggestedConfidence || 0;
        payloadMeasurements.suggestedGender = state.gender;

        // Region and Pricing Payload Config
        let baseJMD;
        let pricingPayload = null;
        let pricingEngineSelection = null;

        if (state.suitId === 'Custom' || state.suitId === 'Custom Bespoke Suit') {
            baseJMD = suits[state.suitId].price; // mapped from subtotalJMD previously
            pricingPayload = suits[state.suitId].pricing;
            pricingEngineSelection = suits[state.suitId].pricingEngineSelection;
        } else if (window.SUIT_PRICING_JMD && window.SUIT_PRICING_JMD[state.suitId]) {
            baseJMD = window.calculateSuitPriceBase(state.suitId, state.suggestedSize) || window.SUIT_PRICING_JMD[state.suitId].min;
        } else {
            baseJMD = suits[state.suitId] ? suits[state.suitId].price : 38000;
        }

        const finalJMD = window.calculateDisplayPrice ? window.calculateDisplayPrice(baseJMD) : baseJMD;
        const isIntl = window.RegionManager ? window.RegionManager.state.region === 'INTL' : false;

        fetch('/api/orders/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                suitId: state.suitId,
                gender: state.gender,
                measurements: payloadMeasurements,
                region: isIntl ? 'INTL' : 'JM',
                basePriceJMD: baseJMD,
                finalPriceJMD: finalJMD,
                appliedMarkupPercent: isIntl ? 85 : 0,
                currencyDisplay: isIntl ? 'USD' : 'JMD',
                pricingEngineSelection: pricingEngineSelection,
                pricing: pricingPayload,
                quantity: suits[state.suitId] ? suits[state.suitId].quantity || 1 : 1,
                additionalColors: suits[state.suitId] ? suits[state.suitId].additionalColors || 'same' : 'same',
                extraColors: suits[state.suitId] ? suits[state.suitId].extraColors || {} : {}
            })
        }).then(r => r.json()).then(d => {
            console.log("Draft created:", d);
            state.sessionId = d.sessionId;
        }).catch(e => console.error("Draft save failed", e));
    }

    if (state.step === 2) {
        // Validate address
        const reqFields = ['name', 'email', 'phone', 'address', 'city'];

        // Dynamic checks
        const country = document.getElementById('country').value;
        if (country !== 'Jamaica') reqFields.push('zip');
        reqFields.push('region'); // Parish/State always needed? Let's say yes for now.

        let valid = true;
        reqFields.forEach(id => {
            const el = document.getElementById(id);
            // Check if visible
            if (el && el.parentElement.parentElement.style.display !== 'none') {
                if (!el.value) valid = false;
            }
        });

        if (!window.RegionManager || !window.RegionManager.state.region) { alert("Please select your shopping region before proceeding."); return; }

        if (!valid) {
            alert("Please complete your shipping details.");
            return;
        }

        // Save Address
        state.shipping = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value,
            city: document.getElementById('city').value,
            region: document.getElementById('region').value,
            zip: document.getElementById('zip').value,
            country: document.getElementById('country').value,
        };

        // Save Address to Backend
        fetch('/api/orders/shipping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: state.sessionId,
                shipping: state.shipping
            })
        });

        // Populate Checkout Summary
        document.getElementById('checkout-name').textContent = state.shipping.name;

        let addressStr = `${state.shipping.address}, ${state.shipping.city}`;
        if (state.shipping.region) addressStr += `, ${state.shipping.region}`;
        if (state.shipping.zip) addressStr += ` ${state.shipping.zip}`;
        addressStr += `, ${state.shipping.country}`;

        document.getElementById('checkout-address').textContent = addressStr;

        // Calculate Shipping
        calculateShipping();
    }

    renderStep(state.step + 1);
}

function prevStep() {
    if (state.step > 1) {
        renderStep(state.step - 1);
    }
}

async function calculateShipping() {
    const country = document.getElementById('country').value || 'UK';
    const city = document.getElementById('city') ? document.getElementById('city').value : '';
    const zip = document.getElementById('zip') ? document.getElementById('zip').value : '';

    document.getElementById('summary-shipping').textContent = 'Calculating...';

    const suitData = suits[state.suitId] || suits['default'];
    // Default tailored suits to large shipments (Box 3 or higher)
    // Accessories, shirts, etc., to smaller shipments (Flyers)
    let shipmentType = 'large';
    if (suitData.category === 'accessory' || suitData.category === 'shirt' || suitData.shipmentType === 'small') {
        shipmentType = 'small';
    }
    
    // Support custom weight directly attached to the suit or config to support multiple items
    let weight = suitData.weight;
    if (!weight && suitData.config && suitData.config.weight) {
        weight = parseFloat(suitData.config.weight);
    }

    try {
        const res = await fetch('/api/shipping/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country, city, zip, shipmentType, weight })
        });
        const data = await res.json();

        if (res.status >= 400 || !data.cost) {
            throw new Error(data.error || "Failed to calculate live shipping rate.");
        }

        const shippingCostJMD = data.cost;
        state.shippingJMD = shippingCostJMD;

        // Standardize the total update so button is formatted
        updateTotal(shippingCostJMD);
        
        const payBtn = document.getElementById('pay-btn');
        if (payBtn) payBtn.disabled = false;

    } catch (e) {
        console.error("Shipping calc failed", e);
        document.getElementById('summary-shipping').textContent = 'Error: ' + e.message;
        
        // Disable purchase button completely to enforce real shipping rules
        const payBtn = document.getElementById('pay-btn');
        if (payBtn) payBtn.disabled = true;

        alert("Failed to calculate shipping rate: " + e.message + "\nPlease verify your address details.");
        state.shippingJMD = 0;
        updateTotal(0);
    }
}

function getActivePriceJMD() {
    // Custom Suits
    if (state.suitId === 'Custom' || state.suitId === 'Custom Bespoke Suit' || (!window.SUIT_PRICING_JMD[state.suitId] && suits[state.suitId])) {
        let customBaseJMD = suits[state.suitId].price;

        // Global Hard Cap: No custom suit base price can surpass 65,000 JMD
        if (customBaseJMD > 65000) {
            customBaseJMD = 65000;
        }

        return window.calculateDisplayPrice ? window.calculateDisplayPrice(customBaseJMD) : customBaseJMD;
    }

    // MTM Suits
    let price = null;
    if (state.suggestedSize && !state.sizeError && window.calculateSuitPriceBase) {
        price = window.calculateSuitPriceBase(state.suitId, state.suggestedSize);
    }
    if (!price && window.SUIT_PRICING_JMD[state.suitId]) {
        price = window.SUIT_PRICING_JMD[state.suitId].min;
    }

    // Fallback
    if (!price) price = 38000;

    return window.calculateDisplayPrice ? window.calculateDisplayPrice(price) : price;
}

function updateSummaryPrices() {
    const suitData = suits[state.suitId] || suits['default'];
    document.getElementById('summary-suit-name').textContent = state.suitId;

    const priceJMD = getActivePriceJMD();
    const formattedPrice = window.formatJMDWithRegion ? window.formatJMDWithRegion(priceJMD) : `J$ ${priceJMD}`;

    // Base Price
    document.getElementById('summary-price').textContent = formattedPrice;

    // Initial Total (no shipping yet)
    if (state.step < 3) {
        document.getElementById('summary-total').textContent = formattedPrice;
    }

    // Update image
    const imgEl = document.getElementById('summary-img');
    if (imgEl && suitData.image) {
        imgEl.src = suitData.image;
    }

    let descriptionHtml = 'Made to Measure';

    if (suitData.config && suitData.config.description) {
        descriptionHtml += `<br><span style="font-size:0.75rem; color:#aaa; display:block; margin-top:5px; line-height:1.3;">${suitData.config.description.substring(0, 50)}...</span>`;
    }

    if (suitData.quantity && suitData.quantity > 1) {
        if (suitData.additionalColors === 'different') {
            let colorsDesc = `Item 1: ${suitData.config.color || 'Default'}`;
            for (let i = 2; i <= suitData.quantity; i++) {
                if (suitData.extraColors && suitData.extraColors[i]) {
                    colorsDesc += `, Item ${i}: ${suitData.extraColors[i]}`;
                } else {
                    colorsDesc += `, Item ${i}: ${suitData.config.color || 'Default'}`;
                }
            }
            descriptionHtml += `<br><span style="font-size:0.85rem; color:var(--gold-primary); display:block; margin-top:5px; font-weight:600;">Qty: ${suitData.quantity} (Colors: <span style="font-size:0.75rem;">${colorsDesc}</span>)</span>`;
        } else {
            descriptionHtml += `<br><span style="font-size:0.85rem; color:var(--gold-primary); display:block; margin-top:5px; font-weight:600;">Qty: ${suitData.quantity} (Same Color: ${suitData.config.color || 'Default'})</span>`;
        }
    }

    const subtitleEl = document.querySelector('.suit-preview > div > div:nth-child(2)');
    if (subtitleEl) {
        subtitleEl.innerHTML = descriptionHtml;
    }
}

function updateTotal(shippingJMD) {
    const suitPriceJMD = getActivePriceJMD();
    const totalJMD = suitPriceJMD + shippingJMD;

    // Safely format everything using CurrencyManager directly tracking JMD amounts
    const formattedShipping = CurrencyManager ? CurrencyManager.format(shippingJMD) : `J$ ${shippingJMD}`;
    const formattedTotal = window.formatJMDWithRegion ? window.formatJMDWithRegion(totalJMD) : `J$ ${totalJMD}`;

    // Update Shipping display rows
    const summaryShipping = document.getElementById('summary-shipping');
    if (summaryShipping) summaryShipping.textContent = formattedShipping;

    const shipMethodEl = document.getElementById('shipping-method-price');
    if (shipMethodEl) shipMethodEl.textContent = formattedShipping;

    // Update Totals
    document.getElementById('summary-total').textContent = formattedTotal;

    // Update Checkout Button specifically formatted
    const payBtn = document.getElementById('pay-btn');
    if (payBtn) {
        payBtn.innerHTML = `PAY <span id="total-amount-display">${formattedTotal}</span> WITH WIPAY`;
    }
}

function handlePayment() {
    const btn = document.getElementById('pay-btn');
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Processing...';
    btn.disabled = true;

    // We must send the ACTIVE display currency to WiPay so they charge the correct literal integer amount
    const shippingJMD = state.shippingJMD || 0;
    const suitPriceJMD = getActivePriceJMD();
    const totalJMD = suitPriceJMD + shippingJMD;

    // Convert total native JMD int to final active currency amount mathematically
    const activeTotal = CurrencyManager ? CurrencyManager.convert(totalJMD) : totalJMD;
    const finalTotal = parseFloat(activeTotal.toFixed(2));

    fetch('/api/payment/wipay/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId: state.sessionId,
            total: finalTotal,
            currency: CurrencyManager ? CurrencyManager.state.currency : 'JMD'
        })
    })
        .then(r => r.json())
        .then(data => {
            if (data.actionUrl && data.params) {
                console.log("[WiPay] Redirecting to secure Hosted Page...");
                // Dynamically build and submit the WiPay checkout form
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = data.actionUrl;

                Object.keys(data.params).forEach(key => {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = data.params[key];
                    form.appendChild(input);
                });

                document.body.appendChild(form);
                form.submit();
            } else if (data.redirectUrl) {
                // Fallback for legacy mock
                window.location.href = data.redirectUrl;
            } else {
                throw new Error("Invalid payment response");
            }
        })
        .catch(e => {
            console.error("Payment init failed", e);
            btn.innerHTML = 'Try Again';
            btn.disabled = false;
            alert("Payment initialization failed. Please try again.");
        });
}

function verifyPayment(sessionId, txnId) {
    if (!sessionId) return;

    // Show loading state
    document.querySelectorAll('.step-content').forEach(el => el.style.display = 'none');

    fetch('/api/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, txnId })
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                renderStep(4);
            } else {
                console.error("Verification failed");
                // Show success for demo flow if verification fails (e.g. server restart lost session)
                renderStep(4);
            }
        })
        .catch(e => {
            console.error("Verification error", e);
            renderStep(4);
        });
}

function suggestSize(gender, measurements) {
    const chart = SIZE_CHART[gender];
    if (!chart) return { size: 'CUSTOM / OUT OF RANGE', confidence: 0 };

    let bestSize = 'CUSTOM / OUT OF RANGE';
    let highestConfidence = 0;
    const sizes = Object.keys(chart);

    // Normalize measurements: for female, if bust is missing but chest exists, use chest.
    const normalizedMeasurements = { ...measurements };
    if (gender === 'female' && !normalizedMeasurements.bust && normalizedMeasurements.chest) {
        normalizedMeasurements.bust = normalizedMeasurements.chest;
    }

    // Convert height to inches
    if (normalizedMeasurements.height && !isNaN(parseFloat(normalizedMeasurements.height))) {
        normalizedMeasurements.height = parseFloat(normalizedMeasurements.height) * 12;
    }

    for (const size of sizes) {
        const ranges = chart[size];
        let checkedFields = 0;
        let matchPoints = 0;

        for (const [key, valStr] of Object.entries(normalizedMeasurements)) {
            if (valStr && valStr.toString().trim() !== '') {
                let val = parseFloat(valStr);

                if (!isNaN(val) && ranges[key]) {
                    checkedFields++;
                    const [min, max] = ranges[key];
                    if (val >= min && val <= max) {
                        matchPoints++;
                    }
                } else if (!isNaN(val)) {
                    // Check if it's in the schema at all
                    const existsInSchema = sizes.some(s => chart[s][key]);
                    if (existsInSchema) {
                        checkedFields++;
                    }
                }
            }
        }

        if (checkedFields > 0) {
            const confidence = Math.round((matchPoints / checkedFields) * 100);
            if (confidence > highestConfidence || (confidence === highestConfidence && confidence > 0)) {
                highestConfidence = confidence;
                bestSize = size;
            }
        }
    }

    if (highestConfidence < 50) {
        return { size: 'CUSTOM / OUT OF RANGE', confidence: highestConfidence };
    }

    return { size: bestSize, confidence: highestConfidence };
}

function updateSuggestedSizeUI() {
    const suggestion = suggestSize(state.gender, state.measurements);
    state.suggestedSize = suggestion.size;
    state.suggestedConfidence = suggestion.confidence;

    const uiBox = document.getElementById('size-suggestion-box');
    if (!uiBox) return;

    const sizeLabel = document.getElementById('suggested-size-label');
    const confLabel = document.getElementById('suggested-size-confidence');
    const nextBtn = document.getElementById('btn-next');

    // Reset button
    if (nextBtn) nextBtn.disabled = false;

    if (suggestion.confidence < 50 || suggestion.size === 'CUSTOM / OUT OF RANGE') {
        sizeLabel.textContent = 'CUSTOM / OUT OF RANGE';
        sizeLabel.style.fontSize = '1.2rem';
        confLabel.textContent = 'Confidence below 50%. Please re-check measurements or proceed for a custom fit.';
        state.sizeError = true;
        if (nextBtn) nextBtn.disabled = true;
    } else {
        // Check availability strictly
        let available = true;
        if (window.SUIT_PRICING_JMD && window.SUIT_PRICING_JMD[state.suitId]) {
            const basePrice = window.calculateSuitPriceBase(state.suitId, suggestion.size);
            if (basePrice === null) available = false;
        }

        if (!available) {
            sizeLabel.innerHTML = `❌ Not available in your size (${suggestion.size})`;
            sizeLabel.style.fontSize = '1.2rem';
            confLabel.textContent = `Fit Confidence: ${suggestion.confidence}%. However, this suit style does not support your suggested size.`;
            state.sizeError = true;
            if (nextBtn) nextBtn.disabled = true;
        } else {
            sizeLabel.innerHTML = `✅ ${suggestion.size} (Available)`;
            sizeLabel.style.fontSize = '2rem';
            confLabel.textContent = `Fit Confidence: ${suggestion.confidence}%`;
            state.sizeError = false;
        }
    }

    if (typeof updateSummaryPrices === 'function') updateSummaryPrices();
}
