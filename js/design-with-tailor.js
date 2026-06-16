
const guideMeStepsData = [
    {
        id: 'gender',
        question: 'Who is this suit being designed for?',
        subtext: 'Select a collection to begin your bespoke journey.',
        options: [
            { id: 'male', label: 'Men', icon: 'user' },
            { id: 'female', label: 'Women', icon: 'gem' }
        ]
    },
    {
        id: 'occasion',
        question: 'What is the occasion?',
        subtext: 'Every event demands a specific presence.',
        options: [
            { id: 'wedding', label: 'Wedding', icon: 'heart' },
            { id: 'groom', label: 'Groom / Groomsmen', icon: 'users' },
            { id: 'business', label: 'Business / Executive', icon: 'briefcase' },
            { id: 'formal', label: 'Church / Formal', icon: 'book' },
            { id: 'graduation', label: 'Graduation', icon: 'award' },
            { id: 'gala', label: 'Dinner / Gala', icon: 'glass-water' },
            { id: 'photoshoot', label: 'Photoshoot', icon: 'camera' },
            { id: 'other', label: 'Other', icon: 'star' }
        ]
    },
    {
        id: 'date',
        question: 'When do you need it?',
        subtext: 'Select your event date so we can guide you appropriately and recommend the best production timeline.',
        type: 'date' // custom rendering
    },
    {
        id: 'style',
        question: 'What style feels most like you?',
        subtext: 'Don\'t worry if you aren\'t sure—we can help refine this during consultation.',
        options: [
            { id: 'classic', label: 'Classic and Timeless', icon: 'shield' },
            { id: 'modern', label: 'Modern and Slim', icon: 'zap' },
            { id: 'bold', label: 'Bold and Statement', icon: 'flame' },
            { id: 'elegant', label: 'Elegant and Formal', icon: 'gem' },
            { id: 'unsure', label: 'Not Sure — Recommend for Me', icon: 'help-circle' }
        ]
    },
    {
        id: 'color',
        question: 'What colour family are you considering?',
        subtext: 'This is just a starting point. Final fabrics will be selected later.',
        options: [
            { id: 'core', label: 'Black / Navy / Grey', icon: 'circle' },
            { id: 'light', label: 'White / Cream', icon: 'sun' },
            { id: 'red', label: 'Burgundy / Red', icon: 'wine' },
            { id: 'earth', label: 'Green / Earth tones', icon: 'leaf' },
            { id: 'custom', label: 'Bold custom colour', icon: 'palette' },
            { id: 'unsure', label: 'Not sure yet', icon: 'help-circle' }
        ]
    },
    {
        id: 'tier',
        question: 'Choose your tailoring experience',
        subtext: 'Select the level of craftsmanship and customization you require.',
        options: [
            { id: 'mtm', label: 'Made-to-Measure', desc: 'Customized standard patterns.', icon: 'scissors' },
            { id: 'signature', label: 'Signature Bespoke', desc: 'Fully drafted custom pattern with premium fabrics.', icon: 'star' },
            { id: 'executive', label: 'Executive Bespoke', desc: 'The pinnacle of luxury. Hand-finished details.', icon: 'crown' }
        ]
    },
    {
        id: 'measurements_pref',
        question: 'How would you like to handle measurements?',
        subtext: 'You don\'t need to enter them right now to reserve your slot.',
        options: [
            { id: 'in_person', label: 'Windross will measure me', desc: 'Book an in-person fitting in Jamaica.', icon: 'map-pin' },
            { id: 'self_known', label: 'I already know my measurements', desc: 'Enter them manually.', icon: 'edit-3' },
            { id: 'guide_me', label: 'Send me a measurement guide', desc: 'Learn how to measure yourself at home.', icon: 'book-open' },
            { id: 'whatsapp_later', label: 'I will send them through WhatsApp later', desc: 'Connect with us to provide them.', icon: 'message-circle' },
            { id: 'after_checkout', label: 'I will provide them after checkout', desc: 'Reserve slot now, measure later.', icon: 'clock' }
        ]
    }
];

let dwtState = {
    path: null, // 'guide', 'advanced'
    currentStep: 0,
    answers: {}
};

function saveDWTState() {
    try {
        localStorage.setItem('windross_dwt_state', JSON.stringify(dwtState));
    } catch (e) { console.error('Error saving DWT state', e); }
}

function loadDWTState() {
    try {
        const saved = localStorage.getItem('windross_dwt_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Optionally resume if they were deep in a flow, but for now we just load answers
            if (parsed.answers) {
                dwtState.answers = parsed.answers;
            }
        }
    } catch (e) { console.error('Error loading DWT state', e); }
}

function initDWT() {
    const landing = document.getElementById('dwt-landing');
    const app = document.getElementById('app');
    const footer = document.querySelector('.wizard-footer');
    
    // Hide native app first, use null checks
    if (app) app.classList.add('hidden-initial');
    if (footer) footer.classList.add('hidden-initial');

    // Ensure landing is visible (it should be by default now)
    if (landing) landing.style.display = 'block';
    
    loadDWTState();

    // Initialize tracking safely
    safeTrack('wt_page_view', { page: 'design_with_tailor' });
}

function safeTrack(eventName, data = {}) {
    if (window.wtTrack) {
        try {
            window.wtTrack(eventName, data);
        } catch (err) {
            console.warn('[DWT Tracking skipped]', eventName, err);
        }
    }
}

function startPath(pathName) {
    dwtState.path = pathName;
    safeTrack('wt_entry_path_selected', { path: pathName });
    
    if (pathName === 'whatsapp') {
        safeTrack('wt_whatsapp_click', { source: 'landing_path' });
        
        if (window.TrackingSystem && window.WhatsAppHelper) {
            window.TrackingSystem.showLeadModal('Speak With Windross', (lead) => {
                window.WhatsAppHelper.captureAndRedirect(
                    {
                        leadType: 'consultation_request',
                        sourceSection: 'dwt_landing',
                        ...lead
                    },
                    '18765986434',
                    'Hello Windross, I would like a professional consultation before starting my design.'
                );
            });
        } else {
            if (window.handleGlobalWhatsAppClick) {
                window.handleGlobalWhatsAppClick('Hello Windross, I would like a professional consultation before starting my design.', 'consultation_request', 'dwt_landing_whatsapp');
            } else {
                window.open('https://wa.me/18765986434?text=Hello%20Windross,%20I%20would%20like%20a%20professional%20consultation%20before%20starting%20my%20design.', '_blank');
            }
        }
        return;
    }
    
    document.getElementById('dwt-landing').style.display = 'none';
    
    if (pathName === 'guide' || pathName === 'advanced') {
        if (pathName === 'guide') {
            safeTrack('wt_guided_customizer_started', {});
        } else {
            safeTrack('wt_advanced_customizer_started', {});
        }
        renderGuideStep(0);
    }
}

function renderGuideStep(stepIndex) {
    dwtState.currentStep = stepIndex;
    const container = document.getElementById('dwt-wizard-container');
    container.innerHTML = '';
    container.style.display = 'block';
    
    // If we've reached the end of the guide me flow
    if (stepIndex >= guideMeStepsData.length) {
        showRecommendation();
        return;
    }
    
    const step = guideMeStepsData[stepIndex];
    
    let html = `
        <div class="gm-step">
            <div class="gm-question">
                <h2>${step.question}</h2>
                <p>${step.subtext}</p>
            </div>
    `;
    
    if (step.type === 'date') {
        html += `
            <div style="max-width:760px; margin: 0 auto; display: flex; flex-direction: column; align-items: center;">
                <div style="width: 100%; max-width: 400px;">
                    <input type="date" id="gm-date" class="gm-date-input" />
                    <button class="gm-btn-primary" onclick="handleGuideOption('${step.id}', document.getElementById('gm-date').value)">Continue</button>
                </div>
                <div class="dwt-timeline-note">
                    <div class="dwt-timeline-note-icon">
                        <i data-lucide="clock"></i>
                    </div>
                    <div>
                        <h4>Production Timeline</h4>
                        <p>Most bespoke suits require approximately <strong>3 to 4 weeks</strong> for completion, depending on fabric selection, fitting adjustments, and finishing details.</p>
                        <p style="margin-top: 8px;">If your event date is approaching sooner, speak with Windross first before placing your deposit so the best next step can be recommended.</p>
                    </div>
                </div>
            </div>
        `;
    } else {
        html += `<div class="gm-options">`;
        step.options.forEach(opt => {
            const descHtml = opt.desc ? `<span style="display:block; font-size:0.85rem; color:var(--text-muted);">${opt.desc}</span>` : '';
            html += `
                <button class="gm-option-btn" onclick="handleGuideOption('${step.id}', '${opt.id}', '${opt.label}')">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <i data-lucide="${opt.icon}"></i>
                        <div>
                            <div>${opt.label}</div>
                            ${descHtml}
                        </div>
                    </div>
                    <i data-lucide="chevron-right"></i>
                </button>
            `;
        });
        html += `</div>`;
    }
    
    html += `</div>`; // gm-step
    container.innerHTML = html;
    
    if (window.lucide) window.lucide.createIcons();
}

function handleGuideOption(stepId, optionId, optionLabel) {
    if (stepId === 'date' && !optionId) {
        let errDiv = document.getElementById('guide-date-error');
        if (!errDiv) {
            errDiv = document.createElement('div');
            errDiv.id = 'guide-date-error';
            errDiv.style.cssText = 'background:rgba(255,0,0,0.1); border:1px solid rgba(255,0,0,0.3); border-radius:6px; padding:12px; margin-top:15px; color:#ff6b6b; font-size:0.9rem; text-align:center; animation: slideUp 0.3s ease; width:100%; max-width:400px;';
            const container = document.querySelector('.gm-date-input').parentNode;
            container.appendChild(errDiv);
        }
        errDiv.innerHTML = "<strong>Please select your event date to continue.</strong>";
        return;
    }
    
    const errDiv = document.getElementById('guide-date-error');
    if (errDiv) errDiv.remove();
    
    dwtState.answers[stepId] = optionId;
    
    // Tracking
    if (stepId === 'gender') {
        safeTrack('wt_gender_selected', { gender: optionId });
        // If advanced path, we only needed gender.
        if (dwtState.path === 'advanced') {
            document.getElementById('dwt-wizard-container').style.display = 'none';
            // Start original configurator
            if (window.selectGender) {
                window.selectGender(optionId);
            }
            return;
        }
    } else if (stepId === 'occasion') {
        safeTrack('wt_occasion_selected', { occasion: optionId });
    } else if (stepId === 'tier') {
        safeTrack('wt_tier_selected', { tier: optionId });
    } else if (stepId === 'measurements_pref') {
        safeTrack('wt_measurement_method_selected', { method: optionId });
        
        // Pass this to the global selections so the checkout system knows
        if (window.selections) {
            window.selections.measurementMethod = optionId;
            if (optionId === 'self_known') {
                window.selections.measurementStatus = 'pending_entry';
            } else {
                window.selections.measurementStatus = 'pending';
            }
        }
    } else {
        safeTrack('wt_guided_question_answered', { step: stepId, answer: optionId });
    }
    
    saveDWTState();
    renderGuideStep(dwtState.currentStep + 1);
}

function applyGuidedSelectionsToCustomizer() {
    if (!window.selections) return;
    
    window.selections.gender = dwtState.answers.gender;
    window.selections.occasion = dwtState.answers.occasion;
    window.selections.styleProfile = dwtState.answers.style;
    window.selections.tier = dwtState.answers.tier;
    
    // Measurement status defaults
    window.selections.measurementMethod = dwtState.answers.measurements_pref;
    if (dwtState.answers.measurements_pref === 'self_known') {
        window.selections.measurementStatus = 'pending_entry';
    } else {
        window.selections.measurementStatus = 'pending';
    }
    
    // Required base defaults for checkout to not fail
    window.selections.package = window.selections.package || { id: 'pkg-full', name: 'Full Suit' };
    
    if (dwtState.answers.tier === 'signature' || dwtState.answers.tier === 'executive') {
        window.selections.texture = window.selections.texture || { id: '2020-material', name: 'Premium Material' };
    } else {
        window.selections.texture = window.selections.texture || { id: 'king-wool', name: 'King Wool' };
    }
    
    window.selections.color = window.selections.color || { id: dwtState.answers.color, name: dwtState.answers.color };
    window.selections.jacket = window.selections.jacket || { id: 'j-single-2', name: 'Single Breasted (2 Button)' };
    window.selections.lapels = window.selections.lapels || { id: 'l-notch', name: 'Notch Lapel' };
    window.selections.pants = window.selections.pants || { id: 'p-no-pleat', name: 'Flat Front' };
    window.selections.vest = window.selections.vest || { id: 'v-none', name: 'No Vest' };
    window.selections.quantity = window.selections.quantity || 1;
    
    if (window.render) window.render();
}

async function showRecommendation() {
    safeTrack('wt_recommendation_shown', dwtState.answers);
    const container = document.getElementById('dwt-wizard-container');
    
    let formattedEstimate = 'Calculating...';
    try {
        const quoteSelection = {
            styleId: 'suit_2_piece',
            tierId: dwtState.answers.tier || 'mtm',
            quantity: 1,
            fabricGrade: (dwtState.answers.tier === 'signature' || dwtState.answers.tier === 'executive') ? 'king-wool' : 'cool-wool',
            constructionType: 'half_canvas',
            options: ['j-single-2', 'l-notch', 'p-no-pleat', 'v-none'],
            measurements: {}
        };
        const quote = window.Pricing ? await window.Pricing.quoteCustom(quoteSelection) : null;
        if (quote && quote.display && window.Pricing) {
            formattedEstimate = window.Pricing.format(quote.display);
        }
    } catch (err) {
        console.warn('Failed to calculate guided estimate from pricing service.', err);
        const fallbackJMD = dwtState.answers.tier === 'executive' ? 120000 : (dwtState.answers.tier === 'signature' ? 85000 : 65000);
        formattedEstimate = window.formatJMDWithRegion ? window.formatJMDWithRegion(fallbackJMD) : `J$${fallbackJMD.toLocaleString('en-JM')}`;
    }
    
    applyGuidedSelectionsToCustomizer();
    
    const wMsg = encodeURIComponent(`Hello Windross, I completed the guided suit builder for a ${dwtState.answers.occasion} and need some help finalizing my design. My estimated tier is ${dwtState.answers.tier}.`);
    
    const html = `
        <div class="gm-recommendation">
            <h2>Your Bespoke Blueprint</h2>
            <p style="color:var(--text-muted); margin-bottom:30px;">Based on your occasion and style, here is our recommendation to begin your tailoring journey.</p>
            
            <div class="gm-rec-grid">
                <div class="gm-rec-item">
                    <span>Tailoring Experience</span>
                    <strong>${dwtState.answers.tier === 'executive' ? 'Executive Bespoke' : (dwtState.answers.tier === 'signature' ? 'Signature Bespoke' : 'Made-to-Measure')}</strong>
                </div>
                <div class="gm-rec-item">
                    <span>Style Direction</span>
                    <strong style="text-transform:capitalize;">${dwtState.answers.style.replace('-', ' ')}</strong>
                </div>
                <div class="gm-rec-item">
                    <span>Colour Family</span>
                    <strong style="text-transform:capitalize;">${dwtState.answers.color}</strong>
                </div>
                <div class="gm-rec-item">
                    <span>Measurements</span>
                    <strong>${formatMeasurementMethod(dwtState.answers.measurements_pref)}</strong>
                </div>
            </div>
            
            <div style="font-family:'Playfair Display', serif; font-size:2rem; color:white; margin-bottom:40px;">
                <span style="font-size:1rem; color:var(--text-muted); display:block; font-family:'Inter', sans-serif; text-transform:uppercase; letter-spacing:1px; margin-bottom:5px;">Starting Estimate</span>
                ${formattedEstimate} ${dwtState.answers.tier === 'executive' ? '+' : ''}
            </div>
            
            <div class="checkout-action-row" style="flex-direction: column;">
                <button class="btn-primary btn-full btn-large" onclick="continueToCheckout()">
                    Continue With This Recommendation
                </button>
                <button class="btn-secondary btn-full" onclick="refineInCustomizer()">
                    Refine My Design
                </button>
                <button class="btn-whatsapp btn-full" onclick="handleRecommendationWhatsapp('${wMsg}')">
                    Speak With the Tailor First
                </button>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

function handleRecommendationWhatsapp(wMsg) {
    if (window.TrackingSystem && window.WhatsAppHelper) {
        window.TrackingSystem.showLeadModal('Speak With Windross', (lead) => {
            window.WhatsAppHelper.captureAndRedirect(
                {
                    leadType: 'consultation_request_post_guide',
                    sourceSection: 'dwt_recommendation',
                    occasion: dwtState.answers.occasion || '',
                    interestedService: dwtState.answers.tier || '',
                    ...lead
                },
                '18765986434',
                decodeURIComponent(wMsg)
            );
        });
    } else {
        if (window.handleGlobalWhatsAppClick) {
            window.handleGlobalWhatsAppClick(decodeURIComponent(wMsg), 'dwt_tailor_handoff', 'dwt_recommendation');
        } else {
            window.open('https://wa.me/18765986434?text=' + encodeURIComponent(wMsg), '_blank');
        }
    }
}

function formatMeasurementMethod(val) {
    const map = {
        'in_person': 'Windross In-Person',
        'self_known': 'Will provide now',
        'guide_me': 'Needs Guide',
        'whatsapp_later': 'WhatsApp Later',
        'after_checkout': 'Provide After Checkout'
    };
    return map[val] || val;
}

function refineInCustomizer() {
    safeTrack('wt_advanced_customizer_started', { source: 'guide_me_refine' });
    document.getElementById('dwt-wizard-container').style.display = 'none';
    if (window.selectGender) {
        window.selectGender(dwtState.answers.gender);
    }
}

function continueToCheckout() {
    safeTrack('begin_checkout', { source: 'guide_me' });
    
    document.getElementById('dwt-wizard-container').style.display = 'none';
    if (window.selectGender) window.selectGender(dwtState.answers.gender);

    if (dwtState.answers.measurements_pref === 'self_known') {
        if (window.goToStepById) {
            window.goToStepById('measurements');
        } else {
            // Fallback: show an in-page message instead of alert
            showFallbackMessage('You selected that you already know your measurements. Please scroll through the design steps and enter your measurements before proceeding to checkout.');
        }
    } else {
        // Route to the details/contact step so the customer fills in name, email, phone etc.
        if (window.goToStepById) {
            window.goToStepById('details');
        } else {
            showFallbackMessage('Please continue through to the final step to enter your contact details before checkout.');
        }
    }
}

function showFallbackMessage(msg) {
    const app = document.getElementById('app');
    if (!app) return;
    const banner = document.createElement('div');
    banner.style.cssText = 'background:rgba(212,175,55,0.15); border:1px solid rgba(212,175,55,0.4); border-radius:12px; padding:20px; margin:20px 0; color:#D4AF37; font-size:0.95rem; text-align:center; line-height:1.6;';
    banner.textContent = msg;
    app.prepend(banner);
}
