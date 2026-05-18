const { Resend } = require('resend');
const fs = require('fs');
const https = require('https');
const http = require('http');

function fetchImageBuffer(url) {
    return new Promise((resolve, reject) => {
        const fetcher = url.startsWith('https') ? https : http;
        fetcher.get(url, (res) => {
            if (res.statusCode !== 200) {
                return resolve(null); // Return null quietly to not block email
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', (err) => resolve(null)); // Resolve null on error
    });
}

function getResendClient() {
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
        return null;
    }

    return new Resend(resendApiKey);
}

async function sendOrderConfirmation(order, items, pdfPath) {
    // 1. Setup Resend
    // In production, use real credentials from process.env
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (!resendApiKey) {
        console.warn("No RESEND_API_KEY configured. Email would have been sent to:", order.customer_email);
        console.warn("Attachment path:", pdfPath);
        return;
    }

    const resend = new Resend(resendApiKey);

    // 2. Prepare PDF Attachment
    let pdfBase64;
    try {
        const fileData = fs.readFileSync(pdfPath);
        pdfBase64 = fileData.toString('base64');
    } catch (e) {
        console.error("Error reading PDF attachment for email:", e);
        return;
    }

    // 3. Extract item images from _config
    const ccEmail = process.env.ADMIN_EMAIL || '876david@gmail.com';
    let imageAttachments = [];
    
    if (items && Array.isArray(items)) {
        for (const item of items) {
            try {
                const measures = JSON.parse(item.measurements || '{}');
                if (measures._config) {
                    for (const [key, val] of Object.entries(measures._config)) {
                        if (val && val.img) {
                            const ext = val.img.split('.').pop().split('?')[0] || 'jpg';
                            const buffer = await fetchImageBuffer(val.img);
                            if (buffer) {
                                imageAttachments.push({
                                    filename: `${key}_selection.${ext}`,
                                    content: buffer.toString('base64')
                                });
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("Error parsing item measurements for images:", e);
            }
        }
    }

    // 4. Send Email
    try {
        const data = await resend.emails.send({
            from: 'Windross Tailoring <orders@windrosstailoringanddesign.com>',
            to: [order.customer_email],
            cc: [ccEmail],
            subject: `Order Confirmation #${order.id} - Windross Tailoring`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #020B13;">
                    <h1 style="color: #DAA520;">Thank you for your order, ${order.customer_name}</h1>
                    <p>We have received your measurements and order totaling <strong>${order.currency === 'GBP' ? '£' : (order.currency === 'JMD' ? 'J$ ' : '$')}${order.total_amount}</strong>.</p>
                    <p>Attached is your order specification and luxury invoice. If you purchased a custom suit, images of your selected fabrics and options are also attached for your records.</p>
                    <br>
                    <p>Warm regards,<br><strong>Windross Tailoring Team</strong></p>
                </div>
            `,
            attachments: [
                {
                    filename: `Windross_Invoice_${order.id}.pdf`,
                    content: pdfBase64
                },
                ...imageAttachments
            ]
        });
        console.log(`Email sent via Resend to ${order.customer_email} (CC: ${ccEmail}), ID: ${data.id}`);
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

    const ccEmail = process.env.ADMIN_EMAIL || '876david@gmail.com';

    // 3. Send Email
    try {
        const data = await resend.emails.send({
            from: 'Windross Tailoring <appointments@windrosstailoringanddesign.com>',
            to: [booking.email],
            cc: [ccEmail],
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
                    
                    ${data.bookingDate && data.bookingTime ? `
                    <h4 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top:20px;">Fitting Appointment</h4>
                    <p><strong>Date:</strong> ${data.bookingDate}</p>
                    <p><strong>Time:</strong> ${data.bookingTime}</p>
                    ` : ''}

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

async function sendBookingCancellationEmail(booking, adminReason) {
    const resend = getResendClient();

    if (!resend) {
        console.warn("No RESEND_API_KEY configured. Cancellation email would have been sent to:", booking.email);
        return;
    }

    let displayDate = booking.booking_date;
    try {
        const d = new Date(booking.booking_date + 'T00:00:00');
        displayDate = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {}

    let displayTime = booking.booking_time;
    try {
        const [h, m] = booking.booking_time.split(':');
        const hour = parseInt(h, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        displayTime = `${hour12}:${m} ${ampm}`;
    } catch (e) {}

    const firstName = booking.name ? booking.name.split(' ')[0] : 'Valued Client';

    try {
        await resend.emails.send({
            from: 'Windross Tailoring <appointments@windrosstailoringanddesign.com>',
            to: [booking.email],
            subject: `Appointment Update — Windross Tailoring`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #e8e8e8;">

                    <!-- Header -->
                    <div style="background: #050505; padding: 32px 36px; text-align: center;">
                        <h1 style="color: #D4AF37; font-family: Georgia, serif; letter-spacing: 3px; margin: 0; font-size: 20px; font-weight: normal;">WINDROSS TAILORING</h1>
                        <p style="color: #86868B; font-size: 11px; letter-spacing: 2px; margin: 6px 0 0; text-transform: uppercase;">& Design Studio</p>
                    </div>

                    <!-- Body -->
                    <div style="padding: 40px 36px; background: #fff;">
                        <p style="font-size: 15px; color: #333; margin-bottom: 6px;">Dear ${firstName},</p>

                        <p style="font-size: 15px; color: #333; line-height: 1.7; margin-top: 0;">
                            We sincerely apologise for the inconvenience. Your upcoming appointment with Windross Tailoring has had to be 
                            <strong style="color: #1a1a1a;">cancelled by our team</strong> due to an unforeseen scheduling conflict.
                        </p>

                        <!-- Appointment Box -->
                        <div style="background: #f9f9f9; border-left: 3px solid #D4AF37; padding: 18px 22px; margin: 24px 0; border-radius: 2px;">
                            <p style="margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: #86868B;">Cancelled Appointment</p>
                            <p style="margin: 4px 0; font-size: 15px; color: #1a1a1a;"><strong>Date:</strong> ${displayDate}</p>
                            <p style="margin: 4px 0; font-size: 15px; color: #1a1a1a;"><strong>Time:</strong> ${displayTime}</p>
                        </div>

                        ${adminReason ? `
                        <div style="background: #fffcf0; border: 1px solid #f0e08a; padding: 14px 18px; border-radius: 4px; margin-bottom: 24px;">
                            <p style="margin: 0; font-size: 14px; color: #7a6500;"><strong>Note from our team:</strong> ${adminReason}</p>
                        </div>` : ''}

                        <p style="font-size: 15px; color: #333; line-height: 1.7;">
                            We would love to reschedule your fitting at your earliest convenience. Please visit our website to select a new date and time that works best for you.
                        </p>

                        <div style="text-align: center; margin: 32px 0;">
                            <a href="https://windrosstailoringanddesign.com/book.html" 
                               style="background: #D4AF37; color: #050505; padding: 13px 30px; text-decoration: none; font-weight: bold; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; border-radius: 3px; display: inline-block;">
                                Book a New Appointment
                            </a>
                        </div>

                        <p style="font-size: 14px; color: #555; line-height: 1.7;">
                            We truly value your trust and look forward to serving you. If you have any questions, please reply to this email or contact us directly via WhatsApp.
                        </p>

                        <p style="font-size: 14px; color: #333; margin-top: 28px;">
                            Warm regards,<br>
                            <strong style="color: #1a1a1a;">The Windross Tailoring Team</strong>
                        </p>
                    </div>

                    <!-- Footer -->
                    <div style="background: #050505; padding: 20px 36px; text-align: center;">
                        <p style="color: #555; font-size: 11px; margin: 0; letter-spacing: 1px;">WINDROSS TAILORING & DESIGN · KINGSTON, JAMAICA</p>
                        <p style="color: #444; font-size: 11px; margin: 6px 0 0;">windrosstailoringanddesign.com</p>
                    </div>
                </div>
            `
        });
        console.log(`Cancellation email sent to ${booking.email}`);
    } catch (error) {
        console.error("Error sending cancellation email via Resend:", error);
    }
}

async function sendCustomInvoiceEmail({ toEmail, invoice, pdfPath, publicUrl }) {
    const resend = getResendClient();

    if (!resend) {
        throw new Error('Email delivery is not configured on this server.');
    }

    const attachmentBuffer = fs.readFileSync(pdfPath);
    const ccEmail = process.env.ADMIN_EMAIL || '876david@gmail.com';
    const dueDate = invoice.dueDate || 'upon receipt';
    const paidDisplay = invoice.amountPaidDisplay || invoice.totalDisplay;
    const balanceDisplay = invoice.balanceDueDisplay || invoice.totalDisplay;
    const depositDisplay = invoice.depositPercentage > 0
        ? `${Number(invoice.depositPercentage || 0).toFixed(2)}% (${invoice.depositAmountDisplay || ''})`
        : 'Not set';

    await resend.emails.send({
        from: 'Windross Tailoring <orders@windrosstailoringanddesign.com>',
        to: [toEmail],
        cc: ccEmail ? [ccEmail] : undefined,
        subject: `Invoice ${invoice.invoiceNumber} from Windross Tailoring`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 620px; margin: 0 auto; padding: 32px; border: 1px solid #e7e1d1;">
                <h1 style="margin: 0 0 12px; font-family: Georgia, serif; color: #b88a28; font-weight: normal;">Windross Tailoring</h1>
                <p style="margin: 0 0 18px; line-height: 1.6;">Hello ${invoice.customerName || 'Valued Client'}, your invoice is ready.</p>
                <div style="background: #faf7ef; border: 1px solid #eadfbe; border-radius: 8px; padding: 16px 18px; margin-bottom: 20px;">
                    <p style="margin: 4px 0;"><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
                    <p style="margin: 4px 0;"><strong>Project Total:</strong> ${invoice.totalDisplay}</p>
                    <p style="margin: 4px 0;"><strong>Paid So Far:</strong> ${paidDisplay}</p>
                    <p style="margin: 4px 0;"><strong>Outstanding Balance:</strong> ${balanceDisplay}</p>
                    <p style="margin: 4px 0;"><strong>Required Deposit:</strong> ${depositDisplay}</p>
                    <p style="margin: 4px 0;"><strong>Due Date:</strong> ${dueDate}</p>
                </div>
                <div style="background: linear-gradient(135deg, #18140b 0%, #2b2212 100%); border: 1px solid #c9a64a; border-radius: 10px; padding: 16px 18px; margin-bottom: 20px;">
                    <p style="margin: 0 0 6px; color: #d7b257; font-size: 12px; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase;">Exchange Policy</p>
                    <p style="margin: 0; color: #fff2cf; font-size: 18px; font-weight: bold;">No refund, only exchange.</p>
                </div>
                <p style="margin: 0 0 14px; line-height: 1.6;">A PDF copy is attached for your records.</p>
                <p style="margin: 0 0 18px; line-height: 1.6;"><a href="${publicUrl}" style="color: #b88a28;">View the invoice online</a></p>
                <p style="margin: 0; line-height: 1.6;">If you have any questions, please reply to this email or contact us on WhatsApp.</p>
            </div>
        `,
        attachments: [
            {
                filename: `${invoice.invoiceNumber}.pdf`,
                content: attachmentBuffer.toString('base64')
            }
        ]
    });
}

module.exports = {
    sendOrderConfirmation,
    sendBookingConfirmation,
    sendDesignInquiryEmail,
    sendBookingCancellationEmail,
    sendCustomInvoiceEmail
};
