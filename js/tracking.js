// --- CONFIGURATION ---
window.WINDROSS_CONFIG = window.WINDROSS_CONFIG || {
    // [REPLACE_BEFORE_LAUNCH: Add real Meta Pixel ID here, e.g., '123456789012345']
    metaPixelId: "",
    // [REPLACE_BEFORE_LAUNCH: Add real TikTok Pixel ID here, e.g., 'C123ABCXYZ']
    tiktokPixelId: ""
};

// --- PIXEL INITIALIZATION ---
(function initPixels() {
    // 1. Meta Pixel
    if (window.WINDROSS_CONFIG.metaPixelId) {
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', window.WINDROSS_CONFIG.metaPixelId);
        fbq('track', 'PageView');
    }

    // 2. TikTok Pixel
    if (window.WINDROSS_CONFIG.tiktokPixelId) {
        !function (w, d, t) {
            w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
            ttq.load(window.WINDROSS_CONFIG.tiktokPixelId);
            ttq.page();
        }(window, document, 'ttq');
    }
})();

window.wtTrack = function(eventName, data = {}) {
    try {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            event: eventName,
            ...data
        });

        const standardEvents = ['ViewContent', 'InitiateCheckout', 'Purchase', 'Lead', 'Contact'];

        if (typeof fbq === 'function') {
            if (standardEvents.includes(eventName)) {
                fbq('track', eventName, data);
            } else {
                fbq('trackCustom', eventName, data);
            }
        }

        if (typeof ttq === 'function') {
            if (standardEvents.includes(eventName)) {
                ttq.track(eventName, data);
            }
        }

        console.log('[WT Track]', eventName, data);
    } catch (err) {
        console.warn('Tracking failed:', err);
    }
};

window.TrackingSystem = {
    saveLead: async function(leadData) {
        try {
            const response = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(leadData)
            });
            const data = await response.json();
            return data.success;
        } catch (err) {
            console.error('Failed to save lead:', err);
            return false;
        }
    },

    captureInteraction: async function(type, details) {
        const leadData = {
            leadType: type,
            sourcePage: window.location.pathname,
            ...details
        };
        await this.saveLead(leadData);
    },

    showLeadModal: function(title, onComplete) {
        const existing = document.getElementById('wt-lead-modal');
        if (existing) existing.remove();

        // Ensure lead-modal.css is loaded
        if (!document.querySelector('link[href*="lead-modal.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'css/lead-modal.css?v=5.1';
            document.head.appendChild(link);
        }

        const modalHtml = `
            <div id="wt-lead-modal" class="wt-lead-modal-overlay">
                <div class="wt-lead-card">
                    <h2>${title}</h2>
                    <p>Please provide your details so Windross can assist you promptly.</p>
                    
                    <form id="wt-lead-form" class="wt-lead-form">
                        <div class="wt-lead-form-group">
                            <label class="wt-lead-label">Full Name *</label>
                            <input type="text" id="wt-lead-name" class="wt-lead-input" required>
                        </div>
                        <div class="wt-lead-form-group">
                            <label class="wt-lead-label">Phone / WhatsApp *</label>
                            <input type="tel" id="wt-lead-phone" class="wt-lead-input" required>
                        </div>
                        <div class="wt-lead-form-group">
                            <label class="wt-lead-label">Email (Optional)</label>
                            <input type="email" id="wt-lead-email" class="wt-lead-input">
                        </div>
                        <div class="wt-lead-form-group">
                            <label class="wt-lead-label">Occasion / Reason</label>
                            <input type="text" id="wt-lead-occasion" class="wt-lead-input" placeholder="e.g. Wedding, Business Suit, Inquiry">
                        </div>
                        <div class="wt-lead-form-group">
                            <label class="wt-lead-label">Preferred Contact Method</label>
                            <select id="wt-lead-method" class="wt-lead-select">
                                <option value="whatsapp">WhatsApp</option>
                                <option value="phone">Phone Call</option>
                                <option value="email">Email</option>
                            </select>
                        </div>
                        
                        <div class="wt-lead-actions">
                            <button type="submit" class="btn-whatsapp btn-full">
                                <i data-lucide="message-circle" width="16" height="16" style="vertical-align:middle;margin-right:8px;"></i> Continue
                            </button>
                            <button type="button" id="wt-lead-cancel" class="btn-ghost btn-full">Skip & Continue</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (window.lucide) window.lucide.createIcons();
        
        const modal = document.getElementById('wt-lead-modal');
        const form = document.getElementById('wt-lead-form');
        const cancelBtn = document.getElementById('wt-lead-cancel');

        const complete = (data) => {
            modal.remove();
            if (onComplete) onComplete(data);
        };

        form.onsubmit = (e) => {
            e.preventDefault();
            complete({
                fullName: document.getElementById('wt-lead-name').value,
                phone: document.getElementById('wt-lead-phone').value,
                email: document.getElementById('wt-lead-email').value,
                occasion: document.getElementById('wt-lead-occasion').value,
                preferredContactMethod: document.getElementById('wt-lead-method').value
            });
        };

        cancelBtn.onclick = () => {
            complete({ fullName: 'Guest User', phone: '', email: '', occasion: '', preferredContactMethod: 'whatsapp' });
        };
    }
};

window.handleGlobalWhatsAppClick = function(message, customLeadType = 'whatsapp_float_click', customSourceSection = 'floating_button') {
    if (window.TrackingSystem && window.WhatsAppHelper) {
        window.TrackingSystem.showLeadModal('Contact Windross', (lead) => {
            window.WhatsAppHelper.captureAndRedirect(
                {
                    leadType: customLeadType,
                    sourceSection: customSourceSection,
                    ...lead
                },
                '18765986434',
                message
            );
        });
    } else {
        window.open('https://wa.me/18765986434?text=' + encodeURIComponent(message), '_blank');
    }
};
