const express = require('express');
const router = express.Router();
const db = require('../database');
const { firebaseSync, admin } = require('../services/firebase-sync');
const pricingService = require('../services/pricing-service');
const shippingService = require('../services/shipping-service');
const jwt = require('jsonwebtoken');
const { generateOrderPDF } = require('../services/pdf-generator');
const { generateCustomInvoicePDF, formatCurrency } = require('../services/invoice-generator');
const {
    sendOrderConfirmation,
    sendBookingConfirmation,
    sendBookingCancellationEmail,
    sendCustomInvoiceEmail,
    sendLeadNotificationEmail
} = require('../services/email');
const fs = require('fs');
const path = require('path');

const bookingStreamClients = new Set();

function sanitizeText(value, maxLength = 250) {
    if (value === null || value === undefined) return '';
    return String(value).substring(0, maxLength).replace(/[<>]/g, '').trim();
}

function sanitizeEmail(value) {
    const cleaned = sanitizeText(value, 160).toLowerCase();
    return cleaned || '';
}

function sanitizePhone(value) {
    return sanitizeText(value, 40);
}

function normalizeWhatsappPhone(value) {
    const raw = sanitizePhone(value);
    if (!raw) return '';

    const trimmed = raw.replace(/\s+/g, '');
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return '';

    if (trimmed.startsWith('+')) {
        return digits.length >= 8 && digits.length <= 15 ? digits : '';
    }

    if (digits.length === 7) {
        return `1876${digits}`;
    }

    if (digits.length === 10 && digits.startsWith('876')) {
        return `1${digits}`;
    }

    if (digits.length === 11 && digits.startsWith('1')) {
        return digits;
    }

    return digits.length >= 8 && digits.length <= 15 ? digits : '';
}

function getPublicBaseUrl(req) {
    return req.headers.origin || `${req.protocol}://${req.get('host')}`;
}

function createInvoiceNumber() {
    const now = new Date();
    const shortDate = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const shortTime = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const randomSuffix = Math.floor(Math.random() * 900 + 100);
    return `WT-INV-${shortDate}-${shortTime}-${randomSuffix}`;
}

function queueDataBackup(reason) {
    firebaseSync.syncAll(db, reason).catch((error) => {
        console.error(`Firebase sync failed after ${reason}:`, error.message || error);
    });
}

function parseJsonObject(value) {
    if (!value || typeof value !== 'string') return {};

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
        return {};
    }
}

function getPricingAmountFromItem(item) {
    const measurements = parseJsonObject(item.measurements);
    const pricing = measurements._pricing;
    const amount = Number(pricing && pricing.regionAdjustedSubtotalJMD);

    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    return {
        amountJMD: amount,
        pricing,
        suitName: item.suit_name
    };
}

async function getAuthoritativePayable(sessionId, clientShippingJMD = 0) {
    const order = await db.getAsync(`SELECT * FROM orders WHERE session_id = ?`, [sessionId]);
    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    const items = await db.allAsync(`SELECT * FROM order_items WHERE order_id=?`, [order.id]);
    const pricedItems = items.map(getPricingAmountFromItem).filter(Boolean);

    if (!pricedItems.length) {
        const err = new Error('Order is missing authoritative pricing. Please restart checkout.');
        err.statusCode = 409;
        throw err;
    }

    const subtotalJMD = pricedItems.reduce((sum, item) => sum + item.amountJMD, 0);
    let shippingJMD = Number(order.shipping_amount_jmd || 0);
    const fallbackShipping = Number(clientShippingJMD || 0);

    if (!shippingJMD && fallbackShipping > 0 && process.env.NODE_ENV !== 'production') {
        shippingJMD = fallbackShipping;
    }

    if (!shippingJMD && order.country && order.country !== 'Jamaica' && process.env.NODE_ENV === 'production') {
        const err = new Error('Shipping has not been confirmed for this order.');
        err.statusCode = 409;
        throw err;
    }

    const totalJMD = roundMoney(subtotalJMD + shippingJMD);
    const snapshot = {
        pricingVersion: pricedItems[0]?.pricing?.pricingVersion || null,
        items: pricedItems,
        subtotalJMD: roundMoney(subtotalJMD),
        shippingJMD: roundMoney(shippingJMD),
        totalJMD
    };

    return { order, items, subtotalJMD, shippingJMD, totalJMD, snapshot };
}

function sanitizeDate(value) {
    const cleaned = sanitizeText(value, 20);
    return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : '';
}

function clampNumber(value, min, max) {
    const numeric = Number.isFinite(value) ? value : min;
    return Math.min(Math.max(numeric, min), max);
}

function roundMoney(value) {
    return Number((Number(value || 0)).toFixed(2));
}

function roundPercent(value) {
    return Number((Number(value || 0)).toFixed(2));
}

function parseInvoiceLineItems(lineItemsValue) {
    if (Array.isArray(lineItemsValue)) {
        return lineItemsValue;
    }

    if (typeof lineItemsValue !== 'string' || !lineItemsValue.trim()) {
        return [];
    }

    try {
        const parsed = JSON.parse(lineItemsValue);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

function normalizeInvoiceLineItems(rawItems) {
    const baseItems = Array.isArray(rawItems) ? rawItems : [];
    const normalizedItems = baseItems
        .map((item, index) => {
            const description = sanitizeText(item?.description, 180) || `Tailoring service${baseItems.length > 1 ? ` ${index + 1}` : ''}`;
            const quantity = Math.max(1, Math.round(Number(item?.quantity || 1)));
            const unitPrice = Number(item?.unitPrice || 0);

            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                return null;
            }

            return {
                description,
                quantity,
                unitPrice: roundMoney(unitPrice),
                amount: roundMoney(quantity * unitPrice)
            };
        })
        .filter(Boolean);

    return normalizedItems.length
        ? normalizedItems
        : [{
            description: 'Tailoring service',
            quantity: 1,
            unitPrice: 0,
            amount: 0
        }];
}

function buildInvoicePayload(body = {}, existingInvoiceNumber = '') {
    const today = getJmTimeStr().split('T')[0];
    const lineItems = normalizeInvoiceLineItems(body.lineItems);
    const subtotalAmount = roundMoney(lineItems.reduce((sum, item) => sum + item.amount, 0));
    const rawTaxAmount = Number(body.taxAmount || 0);
    const taxAmount = roundMoney(Number.isFinite(rawTaxAmount) && rawTaxAmount > 0 ? rawTaxAmount : 0);
    const totalAmount = roundMoney(subtotalAmount + taxAmount);
    const rawDepositPercentage = Number(body.depositPercentage || 0);
    const depositPercentage = roundPercent(clampNumber(Number.isFinite(rawDepositPercentage) ? rawDepositPercentage : 0, 0, 100));
    const rawAmountPaid = Number(body.amountPaid || 0);
    const rawAmountPaidPercentage = Number(body.amountPaidPercentage);

    let amountPaid = Number.isFinite(rawAmountPaid) && rawAmountPaid > 0 ? rawAmountPaid : 0;
    if (amountPaid <= 0 && Number.isFinite(rawAmountPaidPercentage) && rawAmountPaidPercentage > 0 && totalAmount > 0) {
        amountPaid = totalAmount * clampNumber(rawAmountPaidPercentage, 0, 100) / 100;
    }

    amountPaid = roundMoney(clampNumber(amountPaid, 0, totalAmount));
    const amountPaidPercentage = totalAmount > 0 ? roundPercent((amountPaid / totalAmount) * 100) : 0;
    const depositAmount = roundMoney(totalAmount * (depositPercentage / 100));
    const balanceDue = roundMoney(Math.max(totalAmount - amountPaid, 0));
    const paymentStatus = balanceDue <= 0 && totalAmount > 0
        ? 'paid'
        : amountPaid > 0
            ? 'partial'
            : 'unpaid';

    return {
        invoiceNumber: existingInvoiceNumber || createInvoiceNumber(),
        customerName: sanitizeText(body.customerName, 120) || 'Valued Client',
        customerEmail: sanitizeEmail(body.customerEmail),
        customerPhone: sanitizePhone(body.customerPhone),
        whatsappPhone: sanitizePhone(body.whatsappPhone || body.customerPhone),
        customerAddress: sanitizeText(body.customerAddress, 250),
        issueDate: sanitizeDate(body.issueDate) || today,
        dueDate: sanitizeDate(body.dueDate),
        currency: ['JMD', 'USD', 'GBP'].includes(body.currency) ? body.currency : 'JMD',
        notes: sanitizeText(body.notes, 1200),
        lineItems,
        subtotalAmount,
        taxAmount,
        totalAmount,
        depositPercentage,
        depositAmount,
        amountPaid,
        amountPaidPercentage,
        balanceDue,
        paymentStatus
    };
}

function buildInvoiceWhatsappShare(invoice, baseUrl) {
    const targetPhone = normalizeWhatsappPhone(invoice.whatsappPhone || invoice.customerPhone);
    if (!targetPhone) return null;

    const invoiceUrl = `${baseUrl}/temp/invoices/${path.basename(invoice.pdfPath)}`;
    const balanceLine = invoice.balanceDue > 0
        ? `Balance outstanding: ${formatCurrency(invoice.balanceDue, invoice.currency)}.`
        : 'This invoice is now fully paid.';
    const depositLine = invoice.depositPercentage > 0
        ? `Required deposit: ${invoice.depositPercentage}% (${formatCurrency(invoice.depositAmount, invoice.currency)}).`
        : '';
    const paidLine = `Paid so far: ${formatCurrency(invoice.amountPaid, invoice.currency)} (${invoice.amountPaidPercentage}%).`;
    const dueLine = invoice.dueDate ? `Due date: ${invoice.dueDate}.` : '';
    const message = `Hello ${invoice.customerName || 'Valued Client'}, your Windross Tailoring invoice ${invoice.invoiceNumber} is ready. Project total: ${formatCurrency(invoice.totalAmount, invoice.currency)}. ${depositLine} ${paidLine} ${balanceLine} ${dueLine} View it here: ${invoiceUrl}`.replace(/\s+/g, ' ').trim();

    return {
        phone: targetPhone,
        message,
        universalUrl: `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(message)}`,
        webUrl: `https://web.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(message)}`,
        appUrl: `whatsapp://send?phone=${targetPhone}&text=${encodeURIComponent(message)}`
    };
}

function mapInvoiceRow(row, baseUrl) {
    if (!row) return null;

    const invoice = buildInvoicePayload({
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        customerPhone: row.customer_phone,
        whatsappPhone: row.whatsapp_phone,
        customerAddress: row.customer_address,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        currency: row.currency,
        notes: row.notes,
        lineItems: parseInvoiceLineItems(row.line_items),
        taxAmount: row.tax_amount,
        depositPercentage: row.deposit_percentage,
        amountPaid: row.amount_paid
    }, row.invoice_number);

    invoice.id = row.id;
    invoice.pdfPath = row.pdf_path;
    invoice.createdAt = row.created_at;
    invoice.updatedAt = row.updated_at || row.created_at;
    invoice.lastSentAt = row.last_sent_at || null;
    invoice.lastSentTo = row.last_sent_to || '';
    invoice.depositOutstanding = roundMoney(Math.max(invoice.depositAmount - invoice.amountPaid, 0));
    invoice.totalDisplay = formatCurrency(invoice.totalAmount, invoice.currency);
    invoice.amountPaidDisplay = formatCurrency(invoice.amountPaid, invoice.currency);
    invoice.balanceDueDisplay = formatCurrency(invoice.balanceDue, invoice.currency);
    invoice.depositAmountDisplay = formatCurrency(invoice.depositAmount, invoice.currency);
    invoice.depositOutstandingDisplay = formatCurrency(invoice.depositOutstanding, invoice.currency);
    invoice.statusLabel = invoice.paymentStatus === 'paid' ? 'Paid in full' : invoice.paymentStatus === 'partial' ? 'Partially paid' : 'Awaiting payment';
    invoice.pdfUrl = row.pdf_path ? `${baseUrl}/temp/invoices/${path.basename(row.pdf_path)}` : null;
    const whatsappShare = row.pdf_path ? buildInvoiceWhatsappShare(invoice, baseUrl) : null;
    invoice.whatsappPhoneE164 = whatsappShare?.phone || '';
    invoice.whatsappMessage = whatsappShare?.message || '';
    invoice.whatsappUrl = whatsappShare?.universalUrl || null;
    invoice.whatsappWebUrl = whatsappShare?.webUrl || null;
    invoice.whatsappAppUrl = whatsappShare?.appUrl || null;

    return invoice;
}

async function saveInvoiceRecord(req, invoiceData, existingRow = null) {
    const { filePath } = await generateCustomInvoicePDF(invoiceData);

    if (existingRow) {
        await db.runAsync(
            `UPDATE custom_invoices
             SET customer_name = ?, customer_email = ?, customer_phone = ?, whatsapp_phone = ?,
                 customer_address = ?, issue_date = ?, due_date = ?, currency = ?, line_items = ?,
                 subtotal_amount = ?, tax_amount = ?, total_amount = ?, deposit_percentage = ?,
                 deposit_amount = ?, amount_paid = ?, amount_paid_percentage = ?, balance_due = ?,
                 payment_status = ?, notes = ?, pdf_path = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                invoiceData.customerName,
                invoiceData.customerEmail || null,
                invoiceData.customerPhone || null,
                invoiceData.whatsappPhone || null,
                invoiceData.customerAddress || null,
                invoiceData.issueDate,
                invoiceData.dueDate || null,
                invoiceData.currency,
                JSON.stringify(invoiceData.lineItems),
                invoiceData.subtotalAmount,
                invoiceData.taxAmount,
                invoiceData.totalAmount,
                invoiceData.depositPercentage,
                invoiceData.depositAmount,
                invoiceData.amountPaid,
                invoiceData.amountPaidPercentage,
                invoiceData.balanceDue,
                invoiceData.paymentStatus,
                invoiceData.notes || null,
                filePath,
                existingRow.id
            ]
        );

        return existingRow.id;
    }

    const insertResult = await db.runAsync(
        `INSERT INTO custom_invoices (
            invoice_number, customer_name, customer_email, customer_phone, whatsapp_phone,
            customer_address, issue_date, due_date, currency, line_items,
            subtotal_amount, tax_amount, total_amount, deposit_percentage, deposit_amount,
            amount_paid, amount_paid_percentage, balance_due, payment_status,
            notes, pdf_path, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            invoiceData.invoiceNumber,
            invoiceData.customerName,
            invoiceData.customerEmail || null,
            invoiceData.customerPhone || null,
            invoiceData.whatsappPhone || null,
            invoiceData.customerAddress || null,
            invoiceData.issueDate,
            invoiceData.dueDate || null,
            invoiceData.currency,
            JSON.stringify(invoiceData.lineItems),
            invoiceData.subtotalAmount,
            invoiceData.taxAmount,
            invoiceData.totalAmount,
            invoiceData.depositPercentage,
            invoiceData.depositAmount,
            invoiceData.amountPaid,
            invoiceData.amountPaidPercentage,
            invoiceData.balanceDue,
            invoiceData.paymentStatus,
            invoiceData.notes || null,
            filePath
        ]
    );

    return insertResult.lastID;
}

function broadcastBookingCreated(booking) {
    const payload = JSON.stringify({ booking });

    for (const client of Array.from(bookingStreamClients)) {
        try {
            client.res.write(`event: booking-created\n`);
            client.res.write(`data: ${payload}\n\n`);
        } catch (err) {
            clearInterval(client.keepAlive);
            bookingStreamClients.delete(client);
        }
    }
}

// --- Authentication & Availability ---

const ALLOWED_ADMIN_EMAILS = [
    'admin@windrosstailoring.com',
    'windross2019@gmail.com', // Usually the default email used
    '8fedora@gmail.com',
    '876david@gmail.com',
    process.env.FIREBASE_CLIENT_EMAIL || ''
];

router.post('/auth/login', async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Missing ID Token' });

    try {
        if (!admin.apps.length) {
            return res.status(500).json({ error: 'Firebase Admin not configured on server.' });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const email = decodedToken.email;

        if (!email) {
            return res.status(401).json({ error: 'Token missing email payload.' });
        }

        // Validate email against whitelist
        const adminEmailsConfig = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : ALLOWED_ADMIN_EMAILS;
        const isAllowed = adminEmailsConfig.some(e => e.trim().toLowerCase() === email.toLowerCase());

        if (!isAllowed) {
            console.warn(`Unauthorized Firebase login attempt from: ${email}`);
            return res.status(403).json({ error: 'Email not authorized for admin access.' });
        }

        const sessionSecret = process.env.SESSION_SECRET || 'fallback-secret-for-dev';

        const jwtToken = jwt.sign(
            { email, role: 'admin' },
            sessionSecret,
            { expiresIn: '30d' }
        );

        res.cookie('admin_token', jwtToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });

        res.json({ success: true, message: 'Logged in successfully', email });
    } catch (error) {
        console.error('Firebase Auth Verification Error:', error);
        res.status(401).json({ error: 'Invalid or expired authentication token' });
    }
});

router.post('/auth/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ success: true });
});

const requireAdmin = (req, res, next) => {
    // Exclude availability endpoint from auth
    if (req.path === '/bookings/availability' || req.path === '/bookings/availability/') {
        return next();
    }
    const token = req.cookies.admin_token;
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized. Please login.' });
    }

    try {
        const sessionSecret = process.env.SESSION_SECRET || 'fallback-secret-for-dev';
        const decoded = jwt.verify(token, sessionSecret);
        if (decoded && decoded.role === 'admin') {
            req.admin = decoded;
            return next();
        }
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
    }
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
};

router.use('/admin', requireAdmin);

// 0. Expose Public Safe Pricing Configuration
router.get('/pricing', (req, res) => {
    try {
        const fullConfig = pricingService.loadConfig();
        // Return only safe public catalog data
        const safeData = {
            version: fullConfig.version,
            baseCurrency: fullConfig.baseCurrency,
            internationalMarkupMultiplier: fullConfig.internationalMarkupMultiplier,
            exchangeRate_USD_to_JMD: fullConfig.exchangeRate_USD_to_JMD,
            shippingRates: fullConfig.shippingRates,
            designSubmission: { jamaicaDepositJMD: fullConfig.designSubmission?.jamaicaDepositJMD },
            tiers: fullConfig.tiers,
            styles: fullConfig.styles,
            fabricGrades: fullConfig.fabricGrades,
            construction: fullConfig.construction,
            options: fullConfig.options,
            catalog: fullConfig.catalog
        };
        res.json(safeData);
    } catch (err) {
        console.error("Error loading public pricing config:", err);
        res.status(500).json({ error: 'Failed to load pricing configuration' });
    }
});

router.get('/pricing/catalog/:sku', (req, res) => {
    try {
        const quote = pricingService.getCatalogQuote(req.params.sku, req.query.region, req.query.size || 'M');
        res.json(quote);
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to quote catalog item' });
    }
});

router.post('/pricing/quote', (req, res) => {
    try {
        const quote = pricingService.quoteCustomSuit(req.body.selection, req.body.region);
        res.json(quote);
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to calculate quote' });
    }
});

// 1. Create Draft Order (Measurements Step)
router.post('/orders/draft', async (req, res) => {
    const { suitId, gender, measurements, measurementMethod, measurementStatus, region, pricingEngineSelection } = req.body;
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const regionCode = pricingService.normalizeRegion(region);
    const measurementsData = measurements || {};

    // Authoritative Pricing Calculation
    let authPricing = null;
    try {
        if (pricingEngineSelection) {
            authPricing = pricingService.quoteCustomSuit(pricingEngineSelection, regionCode);
            measurementsData._pricingSelection = pricingEngineSelection;
        } else {
            authPricing = pricingService.getCatalogQuote(suitId, regionCode, measurementsData.suggestedSize || 'M');
        }
    } catch (err) {
        console.error('Authoritative pricing failed:', err.message || err);
        return res.status(err.statusCode || 400).json({ error: err.message || 'Failed to calculate authoritative pricing' });
    }

    if (!authPricing || !Number.isFinite(Number(authPricing.regionAdjustedSubtotalJMD))) {
        return res.status(400).json({ error: 'Failed to calculate authoritative pricing' });
    }

    // Determine initial order status based on measurement preferences
    let initialStatus = 'draft';
    if (measurementStatus === 'provided') {
        initialStatus = 'draft';
    } else if (measurementMethod === 'in_person') {
        initialStatus = 'fitting_required';
    } else if (measurementMethod === 'whatsapp_later') {
        initialStatus = 'whatsapp_followup_required';
    } else if (measurementMethod === 'after_checkout') {
        initialStatus = 'measurement_pending';
    } else if (measurementMethod === 'guide_me') {
        initialStatus = 'measurement_guide_required';
    } else if (measurementStatus === 'pending_entry') {
        initialStatus = 'measurement_entry_required';
    }

    // Attach preferences to measurements JSON so they aren't lost
    measurementsData._pricing = authPricing;
    measurementsData._preference = {
        method: measurementMethod || 'pending',
        status: measurementStatus || 'pending'
    };

    const snapshot = {
        pricingVersion: authPricing.pricingVersion,
        items: [{ suitName: authPricing.productName || suitId, pricing: authPricing }],
        subtotalJMD: authPricing.regionAdjustedSubtotalJMD
    };

    try {
        const insertResult = await db.runAsync(
            `INSERT INTO orders (session_id, status, currency, region_code, pricing_version, pricing_snapshot)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [sessionId, initialStatus, 'JMD', regionCode, authPricing.pricingVersion || null, JSON.stringify(snapshot)]
        );
        const orderId = insertResult.lastID;

        await db.runAsync(
            `INSERT INTO order_items (order_id, suit_name, gender, measurements, price) VALUES (?, ?, ?, ?, ?)`,
            [
                orderId,
                authPricing.productName || suitId,
                authPricing.gender || gender,
                JSON.stringify(measurementsData),
                authPricing.regionAdjustedSubtotalJMD
            ]
        );

        queueDataBackup('order_draft_created');
        res.json({ sessionId, orderId, status: initialStatus, pricing: authPricing });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// 2. Update Draft with Shipping Info
router.post('/orders/shipping', (req, res) => {
    const { sessionId, shipping } = req.body;
    const { name, email, phone, address, city, country } = shipping || {};

    console.log("Updating shipping for session:", sessionId);

    db.run(
        `UPDATE orders
         SET customer_name=?, customer_email=?, customer_phone=?, shipping_address=?, city=?, country=?, shipping_details=?
         WHERE session_id=?`,
        [name, email, phone, address, city, country, JSON.stringify(shipping || {}), sessionId],
        function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to update shipping' });
            }
            queueDataBackup('order_shipping_updated');
            res.json({ success: true });
        }
    );
});

// 3. Calculate Shipping via DHL API
router.post('/shipping/calculate', async (req, res) => {
    const { country, city, zip, sessionId } = req.body;

    try {
        const quote = await shippingService.calculateDhlQuote({
            country,
            city,
            zip,
            shipmentType: req.body.shipmentType || 'large',
            weight: req.body.weight
        });

        if (sessionId) {
            await db.runAsync(
                `UPDATE orders SET shipping_amount_jmd=?, shipping_service=? WHERE session_id=?`,
                [roundMoney(quote.cost), quote.service || 'DHL Express', sessionId]
            );
        }

        return res.json({
            cost: quote.cost,
            currency: quote.currency,
            service: quote.service
        });
    } catch (err) {
        console.error("DHL API Error:", err.response?.data?.detail || err.message);
        return res.status(err.statusCode || 502).json({ error: 'Failed to retrieve rates from DHL API: ' + (err.response?.data?.detail || err.message) });
    }
});

// 4. Initiate Payment (Live WiPay Integration) - Bypass for Bank Transfer
router.post('/payment/wipay/create', async (req, res) => {
    const { sessionId, returnUrl, shippingJMD } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
    }

    try {
        const payable = await getAuthoritativePayable(sessionId, shippingJMD);

        await db.runAsync(
            `UPDATE orders SET total_amount=?, currency=?, pricing_snapshot=? WHERE session_id=?`,
            [payable.totalJMD, 'JMD', JSON.stringify(payable.snapshot), sessionId]
        );
        queueDataBackup('order_payment_prepared');

        const wipayAccountNumber = process.env.WIPAY_ACCOUNT_NUMBER || '1234567890';
        const wipayEnvironment = process.env.WIPAY_ENVIRONMENT || 'sandbox';

        // Base URL strictly from the frontend origin
        const baseUrl = req.headers.origin || (req.protocol + '://' + req.get('host'));
        const responseUrl = returnUrl ? `${baseUrl}/${returnUrl}` : `${baseUrl}/purchase-flow.html`;

        res.json({
            actionUrl: wipayEnvironment === 'live'
                ? 'https://jm.wipayfinancial.com/plugins/payments/request'
                : 'https://jm.wipayfinancial.com/plugins/payments/request', // JM endpoint is same for sandbox, account number triggers it
            params: {
                account_number: wipayAccountNumber,
                country_code: 'JM',
                currency: 'JMD',
                environment: wipayEnvironment,
                fee_structure: 'customer_pay',
                method: 'credit_card',
                order_id: sessionId, // WiPay will return this to us precisely
                origin: 'Windross_Tailoring',
                response_url: responseUrl,
                total: payable.totalJMD.toFixed(2) // WiPay explicitly requires two decimal formatting
            }
        });
    } catch (err) {
        console.error('Payment preparation failed:', err.message || err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to prepare payment' });
    }
});

// 4.5. Initiate Bank Transfer
router.post('/payment/bank-transfer', async (req, res) => {
    const { sessionId, shippingJMD } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
    }

    try {
        const payable = await getAuthoritativePayable(sessionId, shippingJMD);

        await db.runAsync(
            `UPDATE orders SET total_amount=?, currency=?, pricing_snapshot=?, status='pending_transfer' WHERE session_id=?`,
            [payable.totalJMD, 'JMD', JSON.stringify(payable.snapshot), sessionId]
        );
        queueDataBackup('bank_transfer_marked_pending');

        const order = await db.getAsync(`SELECT * FROM orders WHERE session_id = ?`, [sessionId]);
        const items = await db.allAsync(`SELECT * FROM order_items WHERE order_id=?`, [order.id]);

        try {
            generateOrderPDF(order, items, (pdfPath) => {
                sendOrderConfirmation(order, items, pdfPath).catch(console.error);
            });
        } catch (pdfErr) {
            console.error("PDF generation error skipped:", pdfErr);
        }

        res.json({ success: true, orderId: order.id });
    } catch (err) {
        console.error('Bank transfer preparation failed:', err.message || err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to prepare bank transfer' });
    }
});

// 5. Payment Callback / Verification
router.post('/payment/verify', (req, res) => {
    const { sessionId, txnId, hash } = req.body;

    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

    // 1. Mark Order as Paid
    db.get(`SELECT * FROM orders WHERE session_id = ?`, [sessionId], (err, order) => {
        if (err || !order) return res.status(404).json({ error: 'Order not found' });

        // --- ENFORCE WIPAY HASH VERIFICATION ---
        const apiKey = process.env.WIPAY_API_KEY;
        const total = parseFloat(order.total_amount).toFixed(2);
        
        let validHash = false;
        if (hash && apiKey) {
            const crypto = require('crypto');
            // WiPay standard hash combinations for the response payload
            const expectedHash1 = crypto.createHash('md5').update(txnId + total + apiKey).digest('hex');
            const expectedHash2 = crypto.createHash('md5').update(sessionId + txnId + apiKey).digest('hex');
            const expectedHash3 = crypto.createHash('md5').update(txnId + apiKey).digest('hex');
            const expectedHash4 = crypto.createHash('md5').update(sessionId + total + apiKey).digest('hex');

            if (hash === expectedHash1 || hash === expectedHash2 || hash === expectedHash3 || hash === expectedHash4) {
                validHash = true;
            }
        }
        
        // Block fraudulent requests
        if (!validHash) {
            console.error(`Invalid payment verification attempt for session ${sessionId}. Hash mismatch.`);
            return res.status(403).json({ error: 'Payment verification failed: Invalid transaction hash.' });
        }
        // ----------------------------------------

        db.run(`UPDATE orders SET status='paid', payment_ref=? WHERE id=?`, [txnId, order.id], (err) => {
            if (err) console.error(err);
            queueDataBackup('order_paid');

            // 2. Post-Purchase Automation
            db.all(`SELECT * FROM order_items WHERE order_id=?`, [order.id], (err, items) => {
                // Generate PDF
                try {
                    generateOrderPDF(order, items, (pdfPath) => {
                        // Send Email
                        sendOrderConfirmation(order, items, pdfPath).catch(console.error);
                    });
                } catch (pdfErr) {
                    console.error("PDF generation error skipped:", pdfErr);
                }
            });

            res.json({ success: true, orderId: order.id });
        });
    });
});

// Helper for Jamaica time comparison and arithmetic
function getJmTimeStr(addMinutes = 0, addDays = 0) {
    const now = new Date();
    if (addMinutes) now.setMinutes(now.getMinutes() + addMinutes);
    if (addDays) now.setDate(now.getDate() + addDays);

    const jmString = now.toLocaleString("en-US", { timeZone: "America/Jamaica" });
    const jmDate = new Date(jmString);
    const yyyy = jmDate.getFullYear();
    const mm = String(jmDate.getMonth() + 1).padStart(2, '0');
    const dd = String(jmDate.getDate()).padStart(2, '0');
    const hh = String(jmDate.getHours()).padStart(2, '0');
    const min = String(jmDate.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

// Business Rules
const BOOKING_START_TIME_MINUTES = 12 * 60; // 12:00 PM
const BOOKING_END_TIME_MINUTES = 18 * 60; // 6:00 PM
const BOOKING_SLOT_INTERVAL_MINUTES = 60; // 1-hour appointments
const MIN_BOOKING_BUFFER_MINUTES = 60; // Reject slots less than 1 hour away
const MIN_BOOKING_LEAD_DAYS = 1; // No same-day bookings
const MAX_BOOKING_DAYS_AHEAD = 30; // Prevent booking > 1 month out

function buildBookingSlots() {
    const slots = [];
    for (let current = BOOKING_START_TIME_MINUTES; current <= BOOKING_END_TIME_MINUTES; current += BOOKING_SLOT_INTERVAL_MINUTES) {
        const hours = Math.floor(current / 60);
        const mins = current % 60;
        const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const label = `${hour12}:${mins.toString().padStart(2, '0')} ${ampm}`;

        slots.push({ time: timeStr, label, available: true });
    }

    return slots;
}

const BOOKING_SLOT_TIMES = buildBookingSlots().map((slot) => slot.time);
const BOOKING_SLOT_TIME_SET = new Set(BOOKING_SLOT_TIMES);
const MAX_BOOKINGS_PER_DAY = BOOKING_SLOT_TIMES.length;

function getBookingAvailability(date, options, callback) {
    const { allowSameDay = false } = options || {};
    const maxDateStr = getJmTimeStr(0, MAX_BOOKING_DAYS_AHEAD).split('T')[0];
    const currentDateStr = getJmTimeStr().split('T')[0];
    const earliestPublicDateStr = getJmTimeStr(0, MIN_BOOKING_LEAD_DAYS).split('T')[0];

    if (date > maxDateStr || date < currentDateStr) {
        return callback(null, {
            date,
            slots: [],
            minDate: earliestPublicDateStr,
            maxDate: maxDateStr
        });
    }

    if (!allowSameDay && date < earliestPublicDateStr) {
        return callback(null, {
            date,
            slots: [],
            minDate: earliestPublicDateStr,
            maxDate: maxDateStr,
            sameDayBlocked: date === currentDateStr
        });
    }

    const slots = buildBookingSlots();
    const bufferedCurrentJmTimeStr = getJmTimeStr(MIN_BOOKING_BUFFER_MINUTES);

    slots.forEach(slot => {
        const slotDateTimeStr = `${date}T${slot.time}`;
        if (slotDateTimeStr < bufferedCurrentJmTimeStr) {
            slot.available = false;
            slot.reason = 'PAST'; // Too close or in the past
        }
    });

    // Check admin-blocked slots first
    db.all(
        `SELECT block_type, block_time, reason FROM unavailable_slots WHERE block_date = ?`,
        [date],
        (err, adminBlocks) => {
            if (err) { adminBlocks = []; }

            const isDayBlocked = adminBlocks.some(b => b.block_type === 'day');
            const dayBlockReason = isDayBlocked ? (adminBlocks.find(b => b.block_type === 'day')?.reason || 'ADMIN') : null;
            // Build a map of slot-level blocks with their reasons
            const slotBlockMap = {};
            adminBlocks
                .filter(b => b.block_type === 'slot')
                .forEach(b => { slotBlockMap[b.block_time] = b.reason || null; });

            if (isDayBlocked) {
                slots.forEach(slot => {
                    slot.available = false;
                    if (!slot.reason) slot.reason = 'UNAVAILABLE';
                    if (dayBlockReason && dayBlockReason !== 'ADMIN') slot.adminReason = dayBlockReason;
                });
                return callback(null, {
                    date,
                    slots,
                    dayBlocked: true,
                    dayBlockReason,
                    minDate: earliestPublicDateStr,
                    maxDate: maxDateStr
                });
            }

            slots.forEach(slot => {
                if (slot.available && slotBlockMap.hasOwnProperty(slot.time)) {
                    slot.available = false;
                    slot.reason = 'UNAVAILABLE';
                    if (slotBlockMap[slot.time]) slot.adminReason = slotBlockMap[slot.time];
                }
            });

            // DB Check for booked slots
            db.all(`SELECT booking_time FROM bookings WHERE booking_date = ? AND status = 'confirmed'`, [date], (err, rows) => {
                if (err) {
                    console.error(err);
                    return callback(err);
                }

                if (rows.length >= MAX_BOOKINGS_PER_DAY) {
                    // Day is fully booked
                    slots.forEach(slot => {
                        slot.available = false;
                        if (!slot.reason) slot.reason = 'FULLY_BOOKED';
                    });
                    return callback(null, {
                        date,
                        slots,
                        minDate: earliestPublicDateStr,
                        maxDate: maxDateStr
                    });
                }

                const bookedTimes = rows.map(r => r.booking_time);
                slots.forEach(slot => {
                    if (slot.available && bookedTimes.includes(slot.time)) {
                        slot.available = false;
                        slot.reason = 'BOOKED';
                    }
                });

                callback(null, {
                    date,
                    slots,
                    minDate: earliestPublicDateStr,
                    maxDate: maxDateStr
                });
            });
        }
    );
}

router.get('/bookings/availability', (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    getBookingAvailability(date, { allowSameDay: false }, (err, payload) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch availability' });
        }

        res.json(payload);
    });
});

router.get('/admin/bookings/availability', (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    getBookingAvailability(date, { allowSameDay: true }, (err, payload) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch availability' });
        }

        res.json(payload);
    });
});


router.post('/bookings/create', async (req, res) => {
    const { name, email, phone, date, time, notes, region } = req.body;

    if (region !== 'Jamaica' && region !== 'Virtual') {
        return res.status(403).json({ error: 'In-person appointments are available for Jamaica only.' });
    }

    if (!date || !time || !name || !email || !phone) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Strict input validation
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        return res.status(400).json({ error: 'Invalid date format.' });
    }

    const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
        return res.status(400).json({ error: 'Invalid time format.' });
    }

    // Sanitize notes input
    const sanitizedNotes = notes ? notes.substring(0, 500).replace(/[<>&"']/g, '') : '';

    if (!BOOKING_SLOT_TIME_SET.has(time)) {
        return res.status(400).json({ error: 'Appointments are available on the hour only between 12:00 PM and 6:00 PM.' });
    }

    // Validate MAX_BOOKING_DAYS_AHEAD
    const maxDateStr = getJmTimeStr(0, MAX_BOOKING_DAYS_AHEAD).split('T')[0];
    const currentDateStr = getJmTimeStr().split('T')[0];
    const earliestBookingDateStr = getJmTimeStr(0, MIN_BOOKING_LEAD_DAYS).split('T')[0];

    if (date === currentDateStr) {
        return res.status(400).json({ error: `Same-day appointments are not available. Please choose ${earliestBookingDateStr} or later.` });
    }

    if (date < currentDateStr) {
        return res.status(400).json({ error: `Please choose ${earliestBookingDateStr} or later.` });
    }

    if (date > maxDateStr) {
        return res.status(400).json({ error: 'Cannot book that far in advance.' });
    }

    // Validate Buffer and Past time
    const bufferedCurrentJmTimeStr = getJmTimeStr(MIN_BOOKING_BUFFER_MINUTES);
    const slotDateTimeStr = `${date}T${time}`;

    if (slotDateTimeStr < bufferedCurrentJmTimeStr) {
        return res.status(400).json({ error: 'This time has already passed or is too close to the current time.' });
    }

    try {
        const newId = await db.withTransaction(async (tx) => {
            const row = await tx.getAsync(
                `SELECT COUNT(*) as count FROM bookings WHERE booking_date = ? AND status = 'confirmed'`,
                [date]
            );

            if (Number(row?.count || 0) >= MAX_BOOKINGS_PER_DAY) {
                const capacityError = new Error('This day is fully booked. Please choose another day.');
                capacityError.statusCode = 409;
                throw capacityError;
            }

            const insertResult = await tx.runAsync(
                `INSERT INTO bookings (name, email, phone, booking_date, booking_time, notes, region) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [name, email, phone, date, time, sanitizedNotes, region]
            );

            return insertResult.lastID;
        });

        sendBookingConfirmation({
            name, email, phone, date, time, region, id: newId
        });
        queueDataBackup('booking_created');

        broadcastBookingCreated({
            id: newId,
            name,
            email,
            phone,
            booking_date: date,
            booking_time: time,
            region,
            status: 'confirmed',
            created_at: new Date().toISOString()
        });

        res.json({ success: true, bookingId: newId, date, time });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ error: err.message });
        }

        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'This time has already been booked. Please choose another time.' });
        }

        console.error(err);
        return res.status(500).json({ error: 'Failed to create booking. Please try again.' });
    }
});

// Admin Endpoint
router.get('/bookings/list', (req, res) => {
    const { date } = req.query;

    // In a real application, proper authentication middleware should exist here.

    let query = `SELECT * FROM bookings ORDER BY booking_date DESC, booking_time DESC`;
    let params = [];

    if (date) {
        query = `SELECT * FROM bookings WHERE booking_date = ? ORDER BY booking_time ASC`;
        params = [date];
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch bookings' });
        }
        res.json({ bookings: rows });
    });
});

// 7a. Initiate Design Deposit Payment (configured fixed JMD deposit)
router.post('/payment/deposit/create', (req, res) => {
    const { customerName, customerEmail, customerPhone, designData } = req.body;

    if (!customerName || !customerEmail) {
        return res.status(400).json({ error: 'Customer name and email are required.' });
    }

    const depositId = `dep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const amount = Number(pricingService.loadConfig().designSubmission?.jamaicaDepositJMD);
    if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(500).json({ error: 'Deposit pricing configuration is missing.' });
    }
    const currency = 'JMD';

    db.run(
        `INSERT INTO deposit_sessions (deposit_id, customer_name, customer_email, customer_phone, design_data, amount, currency)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [depositId, customerName, customerEmail, customerPhone || '', JSON.stringify(designData || {}), amount, currency],
        function (err) {
            if (err) {
                console.error('Deposit session creation error:', err);
                return res.status(500).json({ error: 'Failed to initiate deposit session.' });
            }
            queueDataBackup('deposit_session_created');

            const wipayAccountNumber = process.env.WIPAY_ACCOUNT_NUMBER || '1234567890';
            const wipayEnvironment = process.env.WIPAY_ENVIRONMENT || 'sandbox';

            const baseUrl = req.headers.origin || (req.protocol + '://' + req.get('host'));
            // Return back to the submit-style page so we can complete the booking post-payment
            const responseUrl = `${baseUrl}/submit-style.html`;

            res.json({
                depositId,
                actionUrl: 'https://jm.wipayfinancial.com/plugins/payments/request',
                params: {
                    account_number: wipayAccountNumber,
                    country_code: 'JM',
                    currency: currency,
                    environment: wipayEnvironment,
                    fee_structure: 'customer_pay',
                    method: 'credit_card',
                    order_id: depositId,
                    origin: 'Windross_Tailoring_Deposit',
                    response_url: responseUrl,
                    total: parseFloat(amount).toFixed(2)
                }
            });
        }
    );
});

// 7b. Verify Design Deposit Payment (WiPay callback)
router.post('/payment/deposit/verify', (req, res) => {
    const { depositId, transactionId, hash } = req.body;

    if (!depositId) {
        return res.status(400).json({ error: 'depositId is required.' });
    }

    db.get(`SELECT * FROM deposit_sessions WHERE deposit_id = ?`, [depositId], (err, session) => {
        if (err || !session) {
            return res.status(404).json({ error: 'Deposit session not found.' });
        }

        if (session.status === 'paid') {
            return res.json({ success: true, alreadyPaid: true, session });
        }

        // --- ENFORCE WIPAY HASH VERIFICATION ---
        const apiKey = process.env.WIPAY_API_KEY;
        const total = parseFloat(session.amount).toFixed(2);
        
        let validHash = false;
        if (hash && apiKey) {
            const crypto = require('crypto');
            const expectedHash1 = crypto.createHash('md5').update(transactionId + total + apiKey).digest('hex');
            const expectedHash2 = crypto.createHash('md5').update(depositId + transactionId + apiKey).digest('hex');
            const expectedHash3 = crypto.createHash('md5').update(transactionId + apiKey).digest('hex');
            const expectedHash4 = crypto.createHash('md5').update(depositId + total + apiKey).digest('hex');

            if (hash === expectedHash1 || hash === expectedHash2 || hash === expectedHash3 || hash === expectedHash4) {
                validHash = true;
            }
        }
        
        // Block fraudulent requests
        if (!validHash) {
            console.error(`Invalid payment verification attempt for deposit ${depositId}. Hash mismatch.`);
            return res.status(403).json({ error: 'Deposit verification failed: Invalid transaction hash.' });
        }
        // ----------------------------------------

        db.run(
            `UPDATE deposit_sessions SET status = 'paid', payment_ref = ? WHERE deposit_id = ?`,
            [transactionId || 'verified', depositId],
            function (err) {
                if (err) {
                    console.error('Deposit verify update error:', err);
                    return res.status(500).json({ error: 'Failed to mark deposit as paid.' });
                }
                queueDataBackup('deposit_session_paid');
                res.json({ success: true, session });
            }
        );
    });
});

// 7c. International Full Design Payment (configured base USD + server-calculated shipping)
router.post('/payment/design-full/create', async (req, res) => {
    const { customerName, customerEmail, customerPhone, designData } = req.body;

    if (!customerName || !customerEmail) {
        return res.status(400).json({ error: 'Customer name and email are required.' });
    }

    const depositId = `dsn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const config = pricingService.loadConfig();
    const baseUSD = Number(config.designSubmission?.intlBaseUSD);
    if (!Number.isFinite(baseUSD) || baseUSD <= 0) {
        return res.status(500).json({ error: 'Design pricing configuration is missing.' });
    }
    const exchangeRate = pricingService.getExchangeRate(config);
    let shippingQuote;
    let totalUSD;

    try {
        const shipping = designData?.shipping || {};
        shippingQuote = await shippingService.calculateDhlQuote({
            country: shipping.country,
            city: shipping.city,
            zip: shipping.zip,
            shipmentType: 'large'
        });
        const shippingUSD = Number(shippingQuote.cost || 0) / exchangeRate;
        totalUSD = roundMoney(baseUSD + shippingUSD);
    } catch (err) {
        console.error('Design full payment shipping calculation failed:', err.response?.data?.detail || err.message);
        return res.status(err.statusCode || 502).json({ error: 'Failed to calculate authoritative shipping for design payment.' });
    }

    const paymentData = {
        ...(designData || {}),
        authoritativePricing: {
            baseUSD,
            shippingJMD: roundMoney(shippingQuote.cost),
            shippingUSD: roundMoney(Number(shippingQuote.cost || 0) / exchangeRate),
            totalUSD,
            exchangeRateUSDToJMD: exchangeRate,
            shippingService: shippingQuote.service || 'DHL Express',
            pricingVersion: config.version
        }
    };

    const totalJMD = roundMoney(totalUSD * exchangeRate);

    db.run(
        `INSERT INTO deposit_sessions (deposit_id, customer_name, customer_email, customer_phone, design_data, amount, currency)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [depositId, customerName, customerEmail, customerPhone || '', JSON.stringify(paymentData), totalJMD, 'JMD'],
        function (err) {
            if (err) {
                console.error('Design full payment session error:', err);
                return res.status(500).json({ error: 'Failed to initiate payment session.' });
            }
            queueDataBackup('design_full_payment_created');

            const wipayAccountNumber = process.env.WIPAY_ACCOUNT_NUMBER || '1234567890';
            const wipayEnvironment = process.env.WIPAY_ENVIRONMENT || 'sandbox';
            const baseUrl = req.headers.origin || (req.protocol + '://' + req.get('host'));
            const responseUrl = `${baseUrl}/submit-style.html`;

            res.json({
                depositId,
                totalUSD,
                shippingUSD: paymentData.authoritativePricing.shippingUSD,
                shippingJMD: paymentData.authoritativePricing.shippingJMD,
                actionUrl: 'https://jm.wipayfinancial.com/plugins/payments/request',
                params: {
                    account_number: wipayAccountNumber,
                    country_code: 'JM',
                    currency: 'JMD',
                    environment: wipayEnvironment,
                    fee_structure: 'customer_pay',
                    method: 'credit_card',
                    order_id: depositId,
                    origin: 'Windross_Tailoring_Design',
                    response_url: responseUrl,
                    total: totalJMD.toFixed(2)
                }
            });
        }
    );
});

// 7. Custom Design Submission
router.post('/design/submit', (req, res) => {
    const data = req.body;
    
    // Basic validation
    if (!data.customerName || !data.customerEmail || !data.designName || !data.description) {
        return res.status(400).json({ error: 'Missing core design details.' });
    }

    // Save to DB for admin portal tracking
    db.run(
        `INSERT INTO design_inquiries 
         (customer_name, customer_email, customer_phone, design_name, gender, fabric, target_date, description, booking_date, booking_time, has_photo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.customerName,
            data.customerEmail,
            data.customerPhone || null,
            data.designName || null,
            data.gender || null,
            data.fabric || null,
            data.targetDate || null,
            data.description || null,
            data.bookingDate || null,
            data.bookingTime || null,
            data.photoBase64 ? 1 : 0
        ],
        function(dbErr) {
            if (dbErr) console.error('Failed to save design inquiry to DB:', dbErr);
            if (!dbErr) queueDataBackup('design_inquiry_created');
        }
    );

    try {
        const { sendDesignInquiryEmail } = require('../services/email');
        sendDesignInquiryEmail(data);
        res.json({ success: true });
    } catch (err) {
        console.error("Error dispatching design email:", err);
        res.status(500).json({ error: 'Failed to submit design.' });
    }
});


// =============================================
// ADMIN: Availability Management (No Auth - Private URL only)
// =============================================

// GET all unavailability blocks
router.get('/admin/unavailable', (req, res) => {
    db.all(`SELECT * FROM unavailable_slots ORDER BY block_date ASC, block_time ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch blocks' });
        res.json({ blocks: rows });
    });
});

// GET unavailability blocks for a specific month (for calendar colouring)
router.get('/admin/unavailable/month', (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });
    const paddedMonth = String(month).padStart(2, '0');
    const prefix = `${year}-${paddedMonth}`;
    db.all(
        `SELECT * FROM unavailable_slots WHERE block_date LIKE ? ORDER BY block_date ASC, block_time ASC`,
        [`${prefix}%`],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch blocks' });
            res.json({ blocks: rows });
        }
    );
});

// POST create a new unavailability block
router.post('/admin/unavailable', (req, res) => {
    const { block_type, block_date, block_time, reason } = req.body;

    if (!block_type || !block_date) {
        return res.status(400).json({ error: 'block_type and block_date are required.' });
    }
    if (!['day', 'slot'].includes(block_type)) {
        return res.status(400).json({ error: 'block_type must be "day" or "slot".' });
    }
    if (block_type === 'slot' && !block_time) {
        return res.status(400).json({ error: 'block_time is required for slot blocks.' });
    }
    if (block_type === 'slot' && !BOOKING_SLOT_TIME_SET.has(block_time)) {
        return res.status(400).json({ error: 'Slot blocks must use a valid one-hour appointment time.' });
    }

    const sanitizedReason = reason ? reason.substring(0, 200).replace(/[<>&"']/g, '') : null;
    const timeVal = block_type === 'day' ? null : block_time;

    db.run(
        `INSERT INTO unavailable_slots (block_type, block_date, block_time, reason) VALUES (?, ?, ?, ?)`,
        [block_type, block_date, timeVal, sanitizedReason],
        function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(409).json({ error: 'This date/slot is already blocked.' });
                }
                return res.status(500).json({ error: 'Failed to create block.' });
            }
            queueDataBackup('availability_block_created');
            res.json({ success: true, id: this.lastID });
        }
    );
});

// DELETE a specific block by ID
router.delete('/admin/unavailable/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM unavailable_slots WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to delete block.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Block not found.' });
        queueDataBackup('availability_block_deleted');
        res.json({ success: true });
    });
});

// SSE stream for live booking alerts in admin
router.get('/admin/bookings/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }

    res.write('retry: 5000\n\n');

    const client = {
        res,
        keepAlive: setInterval(() => {
            try {
                res.write(': keep-alive\n\n');
            } catch (err) {
                clearInterval(client.keepAlive);
                bookingStreamClients.delete(client);
            }
        }, 25000)
    };

    bookingStreamClients.add(client);

    req.on('close', () => {
        clearInterval(client.keepAlive);
        bookingStreamClients.delete(client);
    });
});

// =============================================
// ADMIN: Dashboard — Bookings & Design Inquiries
// =============================================

router.post('/admin/invoices', async (req, res) => {
    try {
        const invoiceData = buildInvoicePayload(req.body);
        const invoiceId = await saveInvoiceRecord(req, invoiceData);
        const savedRow = await db.getAsync(`SELECT * FROM custom_invoices WHERE id = ?`, [invoiceId]);
        queueDataBackup('invoice_created');

        res.json({
            success: true,
            invoice: mapInvoiceRow(savedRow, getPublicBaseUrl(req))
        });
    } catch (err) {
        console.error('Invoice generation failed:', err);
        res.status(500).json({ error: err.message || 'Failed to generate invoice PDF.' });
    }
});

router.get('/admin/invoices', async (req, res) => {
    const search = sanitizeText(req.query.search, 120);

    try {
        let query = `SELECT * FROM custom_invoices`;
        const params = [];

        if (search) {
            query += ` WHERE invoice_number LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?`;
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        query += ` ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC`;
        const rows = await db.allAsync(query, params);

        res.json({
            success: true,
            invoices: rows.map((row) => mapInvoiceRow(row, getPublicBaseUrl(req)))
        });
    } catch (err) {
        console.error('Invoice history load failed:', err);
        res.status(500).json({ error: 'Failed to load invoice history.' });
    }
});

router.get('/admin/invoices/:id', async (req, res) => {
    const invoiceId = Number(req.params.id);
    if (!invoiceId) {
        return res.status(400).json({ error: 'Valid invoice id is required.' });
    }

    try {
        const row = await db.getAsync(`SELECT * FROM custom_invoices WHERE id = ?`, [invoiceId]);
        if (!row) {
            return res.status(404).json({ error: 'Invoice not found.' });
        }

        res.json({
            success: true,
            invoice: mapInvoiceRow(row, getPublicBaseUrl(req))
        });
    } catch (err) {
        console.error('Invoice load failed:', err);
        res.status(500).json({ error: 'Failed to load invoice.' });
    }
});

router.patch('/admin/invoices/:id', async (req, res) => {
    const invoiceId = Number(req.params.id);
    if (!invoiceId) {
        return res.status(400).json({ error: 'Valid invoice id is required.' });
    }

    try {
        const existingRow = await db.getAsync(`SELECT * FROM custom_invoices WHERE id = ?`, [invoiceId]);
        if (!existingRow) {
            return res.status(404).json({ error: 'Invoice not found.' });
        }

        const invoiceData = buildInvoicePayload(req.body, existingRow.invoice_number);
        await saveInvoiceRecord(req, invoiceData, existingRow);
        const updatedRow = await db.getAsync(`SELECT * FROM custom_invoices WHERE id = ?`, [invoiceId]);
        queueDataBackup('invoice_updated');

        res.json({
            success: true,
            invoice: mapInvoiceRow(updatedRow, getPublicBaseUrl(req))
        });
    } catch (err) {
        console.error('Invoice update failed:', err);
        res.status(500).json({ error: err.message || 'Failed to update invoice.' });
    }
});

router.delete('/admin/invoices/:id', async (req, res) => {
    const invoiceId = Number(req.params.id);
    if (!invoiceId) {
        return res.status(400).json({ error: 'Valid invoice id is required.' });
    }

    try {
        const existingRow = await db.getAsync(`SELECT * FROM custom_invoices WHERE id = ?`, [invoiceId]);
        if (!existingRow) {
            return res.status(404).json({ error: 'Invoice not found.' });
        }

        await db.runAsync(`DELETE FROM custom_invoices WHERE id = ?`, [invoiceId]);

        if (existingRow.pdf_path) {
            try {
                await fs.promises.unlink(existingRow.pdf_path);
            } catch (fileErr) {
                if (fileErr.code !== 'ENOENT') {
                    console.error(`Failed to delete invoice PDF for ${existingRow.invoice_number}:`, fileErr);
                }
            }
        }

        queueDataBackup('invoice_deleted');
        res.json({ success: true });
    } catch (err) {
        console.error('Invoice delete failed:', err);
        res.status(500).json({ error: 'Failed to delete invoice.' });
    }
});

router.post('/admin/invoices/:id/send-email', async (req, res) => {
    const invoiceId = Number(req.params.id);
    const targetEmail = sanitizeEmail(req.body.email);

    if (!invoiceId) {
        return res.status(400).json({ error: 'Valid invoice id is required.' });
    }

    if (!targetEmail) {
        return res.status(400).json({ error: 'Recipient email is required.' });
    }

    try {
        const row = await db.getAsync(`SELECT * FROM custom_invoices WHERE id = ?`, [invoiceId]);
        if (!row) {
            return res.status(404).json({ error: 'Invoice not found.' });
        }

        const baseUrl = getPublicBaseUrl(req);
        const invoice = mapInvoiceRow(row, baseUrl);
        await sendCustomInvoiceEmail({
            toEmail: targetEmail,
            pdfPath: row.pdf_path,
            publicUrl: `${baseUrl}/temp/invoices/${path.basename(row.pdf_path)}`,
            invoice
        });

        await db.runAsync(
            `UPDATE custom_invoices SET last_sent_at = CURRENT_TIMESTAMP, last_sent_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [targetEmail, invoiceId]
        );
        queueDataBackup('invoice_emailed');

        res.json({ success: true });
    } catch (sendErr) {
        console.error('Invoice email failed:', sendErr);
        res.status(500).json({ error: sendErr.message || 'Failed to send invoice email.' });
    }
});

// GET all bookings (with optional search/filter)
router.get('/admin/bookings', (req, res) => {
    const { search, date, status } = req.query;
    let query = `SELECT * FROM bookings`;
    const params = [];
    const conditions = [];

    if (date) {
        conditions.push(`booking_date = ?`);
        params.push(date);
    }
    if (status) {
        conditions.push(`status = ?`);
        params.push(status);
    }
    if (search) {
        conditions.push(`(name LIKE ? OR email LIKE ? OR phone LIKE ?)`);
        const term = `%${search}%`;
        params.push(term, term, term);
    }
    if (conditions.length) query += ` WHERE ` + conditions.join(' AND ');
    query += ` ORDER BY booking_date DESC, booking_time DESC`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch bookings' });
        res.json({ bookings: rows, total: rows.length });
    });
});

// GET single booking detail
router.get('/admin/bookings/:id', (req, res) => {
    db.get(`SELECT * FROM bookings WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch booking' });
        if (!row) return res.status(404).json({ error: 'Booking not found' });
        res.json({ booking: row });
    });
});

// PATCH booking status (confirmed / cancelled)
router.patch('/admin/bookings/:id/status', (req, res) => {
    const { status } = req.body;
    if (!['confirmed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }
    db.run(`UPDATE bookings SET status = ? WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to update status.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Booking not found.' });
        queueDataBackup('booking_status_updated');
        res.json({ success: true });
    });
});

// POST cancel a booking and send apology email to customer
router.post('/admin/bookings/:id/cancel', (req, res) => {
    const { reason } = req.body; // Optional admin reason — included in the email
    db.get(`SELECT * FROM bookings WHERE id = ?`, [req.params.id], (err, booking) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch booking.' });
        if (!booking) return res.status(404).json({ error: 'Booking not found.' });
        if (booking.status === 'cancelled') return res.status(400).json({ error: 'Booking is already cancelled.' });

        db.run(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [req.params.id], function(updateErr) {
            if (updateErr) return res.status(500).json({ error: 'Failed to cancel booking.' });

            // Fire the cancellation email asynchronously (don't block response)
            try {
                sendBookingCancellationEmail(booking, reason || null);
            } catch (emailErr) {
                console.error('Failed to send cancellation email:', emailErr);
            }

            queueDataBackup('booking_cancelled');
            res.json({ success: true });
        });
    });
});

// GET all design inquiries
router.get('/admin/designs', (req, res) => {
    const { search, status } = req.query;
    let query = `SELECT * FROM design_inquiries`;
    const params = [];
    const conditions = [];

    if (status) {
        conditions.push(`status = ?`);
        params.push(status);
    }
    if (search) {
        conditions.push(`(customer_name LIKE ? OR customer_email LIKE ? OR design_name LIKE ?)`);
        const term = `%${search}%`;
        params.push(term, term, term);
    }
    if (conditions.length) query += ` WHERE ` + conditions.join(' AND ');
    query += ` ORDER BY created_at DESC`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch design inquiries' });
        res.json({ designs: rows, total: rows.length });
    });
});

// GET single design inquiry
router.get('/admin/designs/:id', (req, res) => {
    db.get(`SELECT * FROM design_inquiries WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch inquiry' });
        if (!row) return res.status(404).json({ error: 'Design inquiry not found' });
        res.json({ design: row });
    });
});

// PATCH design inquiry status
router.patch('/admin/designs/:id/status', (req, res) => {
    const { status } = req.body;
    if (!['new', 'reviewed', 'in_progress', 'completed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }
    db.run(`UPDATE design_inquiries SET status = ? WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to update status.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Inquiry not found.' });
        queueDataBackup('design_status_updated');
        res.json({ success: true });
    });
});

// GET dashboard summary counts
router.get('/admin/summary', (req, res) => {
    const results = {};
    db.get(`SELECT COUNT(*) as total FROM bookings WHERE status='confirmed'`, [], (err, r) => {
        results.confirmedBookings = r?.total || 0;
        db.get(`SELECT COUNT(*) as total FROM bookings WHERE status='cancelled'`, [], (err, r2) => {
            results.cancelledBookings = r2?.total || 0;
            db.get(`SELECT COUNT(*) as total FROM design_inquiries WHERE status='new'`, [], (err, r3) => {
                results.newDesigns = r3?.total || 0;
                db.get(`SELECT COUNT(*) as total FROM design_inquiries`, [], (err, r4) => {
                    results.totalDesigns = r4?.total || 0;
                    db.get(`SELECT COUNT(*) as total FROM unavailable_slots`, [], (err, r5) => {
                        results.activeBlocks = r5?.total || 0;
                        res.json(results);
                    });
                });
            });
        });
    });
});

// POST /api/leads
router.post('/leads', (req, res) => {
    const {
        fullName,
        email,
        phone,
        location,
        occasion,
        eventDate,
        budgetRange,
        interestedService,
        message,
        sourcePage,
        sourceSection,
        leadType,
        whatsappMessage,
        preferredContactMethod
    } = req.body;

    if (!fullName) {
        return res.status(400).json({ error: 'Full name is required.' });
    }

    const safeEmail = sanitizeEmail(email);
    const safePhone = sanitizePhone(phone);

    const query = `
        INSERT INTO leads (
            full_name, email, phone, location, occasion, event_date, budget_range,
            interested_service, message, source_page, source_section, lead_type,
            whatsapp_message, preferred_contact_method
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
        sanitizeText(fullName), safeEmail, safePhone, sanitizeText(location),
        sanitizeText(occasion), sanitizeText(eventDate), sanitizeText(budgetRange),
        sanitizeText(interestedService), sanitizeText(message, 1000),
        sanitizeText(sourcePage), sanitizeText(sourceSection), sanitizeText(leadType),
        sanitizeText(whatsappMessage, 500), sanitizeText(preferredContactMethod)
    ];

    db.run(query, params, function(err) {
        if (err) {
            console.error('Failed to save lead:', err);
            return res.status(500).json({ error: 'Failed to submit lead.' });
        }

        const leadData = {
            id: this.lastID,
            full_name: sanitizeText(fullName),
            email: safeEmail,
            phone: safePhone,
            location: sanitizeText(location),
            occasion: sanitizeText(occasion),
            event_date: sanitizeText(eventDate),
            budget_range: sanitizeText(budgetRange),
            interested_service: sanitizeText(interestedService),
            message: sanitizeText(message, 1000),
            source_page: sanitizeText(sourcePage),
            source_section: sanitizeText(sourceSection),
            lead_type: sanitizeText(leadType),
            whatsapp_message: sanitizeText(whatsappMessage, 500),
            preferred_contact_method: sanitizeText(preferredContactMethod)
        };

        try {
            sendLeadNotificationEmail(leadData);
        } catch (emailErr) {
            console.error('Failed to send lead email:', emailErr);
        }

        res.json({ success: true, leadId: this.lastID });
    });
});

// GET /api/leads/export
router.get('/leads/export', (req, res) => {
    const exportKey = process.env.ADMIN_EXPORT_KEY;

    if (!exportKey) {
        return res.status(503).json({
            error: 'Lead export is not configured.'
        });
    }

    const providedKey = req.query.key || req.headers['x-admin-key'];

    if (!providedKey || providedKey !== exportKey) {
        return res.status(403).json({
            error: 'Unauthorized.'
        });
    }

    db.all(`SELECT * FROM leads ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch leads.' });

        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'No leads found.' });
        }

        const headers = Object.keys(rows[0]).join(',');
        const csv = [headers];

        rows.forEach(row => {
            const rowValues = Object.values(row).map(value => {
                if (value === null || value === undefined) return '';
                const stringValue = String(value);
                return stringValue.includes(',') || stringValue.includes('\\n') || stringValue.includes('"') 
                    ? '"' + stringValue.replace(/"/g, '""') + '"' 
                    : stringValue;
            });
            csv.push(rowValues.join(','));
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=windross-leads.csv');
        res.send(csv.join('\\n'));
    });
});

// GET /api/testimonials
router.get('/testimonials', (req, res) => {
    db.all(`SELECT id, name, location, comment, rating, created_at FROM testimonials WHERE is_approved = 1 ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch testimonials.' });
        res.json({ success: true, testimonials: rows || [] });
    });
});

// POST /api/testimonials
router.post('/testimonials', (req, res) => {
    const { name, location, comment, rating } = req.body;
    
    if (!name || !comment) {
        return res.status(400).json({ error: 'Name and comment are required.' });
    }

    const safeName = sanitizeText(name, 100);
    const safeLocation = sanitizeText(location, 100);
    const safeComment = sanitizeText(comment, 1000);
    const safeRating = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : 5;

    if (!safeName || !safeComment) {
        return res.status(400).json({ error: 'Invalid name or comment.' });
    }

    db.run(
        `INSERT INTO testimonials (name, location, comment, rating, is_approved) VALUES (?, ?, ?, ?, 1)`,
        [safeName, safeLocation, safeComment, safeRating],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to save testimonial.' });
            
            queueDataBackup('new_testimonial');
            res.json({ success: true, testimonialId: this.lastID });
        }
    );
});

module.exports = router;
