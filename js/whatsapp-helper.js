window.WhatsAppHelper = {
    generateLink: function(phoneNumber, message) {
        return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    },
    
    openChat: function(phoneNumber, message) {
        window.open(this.generateLink(phoneNumber, message), '_blank');
    },

    captureAndRedirect: async function(leadData, phoneNumber, whatsappMessage) {
        leadData.whatsappMessage = whatsappMessage;
        leadData.preferredContactMethod = 'whatsapp';
        
        if (window.TrackingSystem) {
            await window.TrackingSystem.saveLead(leadData);
        }
        
        this.openChat(phoneNumber, whatsappMessage);
    }
};
