const { Resend } = require('resend');
const fs = require('fs');

async function sendOrderConfirmation(order, pdfPath) {
    // 1. Setup Resend
    // In production, use real credentials from process.env
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (!resendApiKey) {
        console.warn("No RESEND_API_KEY configured. Email would have been sent to:", order.customer_email);
        console.warn("Attachment path:", pdfPath);
        return;
    }

    const resend = new Resend(resendApiKey);

    // 2. Prepare Attachment
    let attachmentBase64;
    try {
        const fileData = fs.readFileSync(pdfPath);
        attachmentBase64 = fileData.toString('base64');
    } catch (e) {
        console.error("Error reading PDF attachment for email:", e);
        return;
    }

    // 3. Send Email
    try {
        const data = await resend.emails.send({
            from: 'Windross Tailoring <orders@windrosstailoringanddesign.com>',
            to: [order.customer_email],
            subject: `Order Confirmation #${order.id} - Windross Tailoring`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #020B13;">
                    <h1 style="color: #DAA520;">Thank you for your order, ${order.customer_name}</h1>
                    <p>We have received your measurements and payment of <strong>${order.currency === 'GBP' ? '£' : (order.currency === 'JMD' ? 'J$ ' : '$')}${order.total_amount}</strong>.</p>
                    <p>Attached is your order specification and luxury invoice.</p>
                    <br>
                    <p>Warm regards,<br><strong>Windross Tailoring Team</strong></p>
                </div>
            `,
            attachments: [
                {
                    filename: `Windross_Invoice_${order.id}.pdf`,
                    content: attachmentBase64
                }
            ]
        });
        console.log(`Email sent via Resend to ${order.customer_email}, ID: ${data.id}`);
    } catch (error) {
        console.error("Error sending email via Resend:", error);
    }
}

async function sendBookingConfirmation(booking) {
    // 1. Setup Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (!resendApiKey) {
        console.warn("No RESEND_API_KEY configured. Booking email would have been sent to:", booking.email);
        return;
    }

    const resend = new Resend(resendApiKey);

    // 2. Format Date/Time for display
    let displayDate = booking.date;
    try {
        const d = new Date(booking.date + 'T00:00:00');
        displayDate = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) { }

    let displayTime = booking.time;
    try {
        const [h, m] = booking.time.split(':');
        const hour = parseInt(h, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        displayTime = `${hour12}:${m} ${ampm}`;
    } catch(e) {}

    // 3. Send Email
    try {
        const data = await resend.emails.send({
            from: 'Windross Tailoring <appointments@windrosstailoringanddesign.com>',
            to: [booking.email],
            subject: `Appointment Confirmed - Windross Tailoring`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #020B13; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #DAA520; letter-spacing: 2px;">WINDROSS TAILORING & DESIGN</h2>
                    </div>
                    
                    <h1 style="font-size: 20px;">Your Appointment is Confirmed, ${booking.name.split(' ')[0]}</h1>
                    <p>Thank you for choosing Windross Tailoring. This email confirms your upcoming fitting appointment.</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #DAA520; margin: 25px 0;">
                        <p style="margin: 5px 0;"><strong>Date:</strong> ${displayDate}</p>
                        <p style="margin: 5px 0;"><strong>Time:</strong> ${displayTime}</p>
                        <p style="margin: 5px 0;"><strong>Type:</strong> In-Person Fitting (${booking.region})</p>
                    </div>

                    <p>If you need to reschedule or cancel, please reply directly to this email or contact us via WhatsApp.</p>
                    
                    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #666;">
                        <p>Windross Tailoring & Design</p>
                        <p>Kingston, Jamaica</p>
                    </div>
                </div>
            `
        });
        console.log(`Booking confirmation sent via Resend to ${booking.email}, ID: ${data.id}`);
    } catch (error) {
        console.error("Error sending booking confirmation via Resend:", error);
    }
}

async function sendDesignInquiryEmail(data) {
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (!resendApiKey) {
        console.warn("No RESEND_API_KEY configured. Design Inquiry from:", data.customerEmail);
        return;
    }

    const { Resend } = require('resend');
    const resend = new Resend(resendApiKey);

    const attachments = [];
    if (data.photoBase64) {
        attachments.push({
            filename: data.photoName || 'design-inspiration.jpg',
            content: data.photoBase64
        });
    }

    try {
        const adminEmail = process.env.ADMIN_EMAIL || '876david@gmail.com';
        
        const responseData = await resend.emails.send({
            from: 'Windross Tailoring <inquiries@windrosstailoringanddesign.com>',
            to: [adminEmail],
            subject: `New Custom Design Inquiry: ${data.designName}`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #020B13; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #DAA520; letter-spacing: 2px;">WINDROSS TAILORING & DESIGN</h2>
                        <h3 style="margin-top:0;">New Design Inquiry</h3>
                    </div>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #DAA520; margin: 25px 0;">
                        <p style="margin: 5px 0;"><strong>Client Name:</strong> ${data.customerName}</p>
                        <p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${data.customerEmail}">${data.customerEmail}</a></p>
                        <p style="margin: 5px 0;"><strong>Phone:</strong> ${data.customerPhone || 'Not provided'}</p>
                    </div>

                    <h4 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Design Specifications</h4>
                    <p><strong>Design Name:</strong> ${data.designName}</p>
                    <p><strong>Target Demographic:</strong> ${data.gender === 'male' ? 'Men' : 'Women'}</p>
                    <p><strong>Fabric Preference:</strong> ${data.fabric || 'Not provided'}</p>
                    <p><strong>Target Date:</strong> ${data.targetDate || 'Not provided'}</p>
                    
                    <h4 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top:20px;">Description</h4>
                    <p style="white-space: pre-wrap;">${data.description}</p>
                    
                    ${attachments.length > 0 ? `<p style="margin-top: 20px; color: #DAA520;"><strong><em>* Inspiration photo is attached to this email.</em></strong></p>` : ''}
                </div>
            `,
            attachments: attachments.length > 0 ? attachments : undefined
        });
        console.log(`Design inquiry sent via Resend, ID: ${responseData.id}`);
    } catch (error) {
        console.error("Error sending design inquiry via Resend:", error);
    }
}

module.exports = { sendOrderConfirmation, sendBookingConfirmation, sendDesignInquiryEmail };
