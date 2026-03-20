const express = require('express');
const router = express.Router();
const db = require('../database');
const { generateOrderPDF } = require('../services/pdf-generator');
const { sendOrderConfirmation, sendBookingConfirmation } = require('../services/email');
const fs = require('fs');
const path = require('path');

// 0. Expose Pricing Configuration
router.get('/config/pricing', (req, res) => {
    try {
        const configPath = path.join(__dirname, '../data/pricing_config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        res.json(JSON.parse(configData));
    } catch (err) {
        console.error("Error loading pricing config:", err);
        res.status(500).json({ error: 'Failed to load pricing configuration' });
    }
});

// 1. Create Draft Order (Measurements Step)
router.post('/orders/draft', (req, res) => {
    const { suitId, gender, measurements, region, pricingEngineSelection } = req.body;
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Authoritative Pricing Calculation
    let authPricing = null;
    if (pricingEngineSelection) {
        const PricingEngine = require('../services/PricingEngine');
        authPricing = PricingEngine.calculatePrice(pricingEngineSelection, region);

        // Embed the authoritative calculation into the order payload
        if (measurements) {
            measurements._pricing = authPricing;
        }
    }

    db.run(
        `INSERT INTO orders (session_id, status) VALUES (?, ?)`,
        [sessionId, 'draft'],
        function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to create session' });
            }
            const orderId = this.lastID;

            // Store items
            db.run(
                `INSERT INTO order_items (order_id, suit_name, gender, measurements) VALUES (?, ?, ?, ?)`,
                [orderId, suitId, gender, JSON.stringify(measurements)],
                (err) => {
                    if (err) console.error(err);
                    res.json({ sessionId, orderId });
                }
            );
        }
    );
});

// 2. Update Draft with Shipping Info
router.post('/orders/shipping', (req, res) => {
    const { sessionId, shipping } = req.body;
    const { name, email, phone, address, city, country } = shipping;

    console.log("Updating shipping for session:", sessionId);

    db.run(
        `UPDATE orders SET customer_name=?, customer_email=?, customer_phone=?, shipping_address=?, city=?, country=? WHERE session_id=?`,
        [name, email, phone, address, city, country, sessionId],
        function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to update shipping' });
            }
            res.json({ success: true });
        }
    );
});

// 3. Calculate Shipping via DHL API
router.post('/shipping/calculate', async (req, res) => {
    const { country, city, zip } = req.body;

    const apiKey = process.env.DHL_API_KEY;
    const apiSecret = process.env.DHL_API_SECRET;
    const accountNumber = process.env.DHL_ACCOUNT_NUMBER;

    if (!apiKey || !apiSecret || !accountNumber) {
        console.error("DHL credentials missing in environment variables.");
        return res.status(500).json({ error: 'DHL credentials missing. Cannot calculate live shipping rate.' });
    }

    // Map Frontend Country to ISO 2-letter Country Code
    const countryMap = {
        'Jamaica': 'JM',
        'USA': 'US',
        'UK': 'GB',
        'Canada': 'CA'
    };
    const destCountryCode = countryMap[country] || 'GB';

    // DHL Package Configuration
    const dhlPackages = {
        'Box 3': { dimensions: { length: 33, width: 33, height: 10 }, maxWeight: 2 },
        'Box 4': { dimensions: { length: 33, width: 32, height: 18 }, maxWeight: 5 },
        'Box 5': { dimensions: { length: 33, width: 32, height: 34 }, maxWeight: 10 },
        'Box 6': { dimensions: { length: 41, width: 35, height: 36 }, maxWeight: 15 },
        'Box 7': { dimensions: { length: 48, width: 40, height: 38 }, maxWeight: 20 },
        'Box 8': { dimensions: { length: 54, width: 44, height: 4 }, maxWeight: 25 },
        'Box 2 Shoe': { dimensions: { length: 33, width: 18, height: 10 }, maxWeight: 1 },
        'Tube Large': { dimensions: { length: 97, width: 17, height: 15 }, maxWeight: 5 },
        'Envelopes': { dimensions: { length: 35, width: 27, height: 1 }, maxWeight: 0.5 },
        'Flyer Standard': { dimensions: { length: 40, width: 30, height: 1 }, maxWeight: 2 },
        'Flyer Large': { dimensions: { length: 47, width: 38, height: 1 }, maxWeight: 4 }
    };

    // Determine Package Type and Weight
    const shipmentType = req.body.shipmentType || 'large';
    
    // Parse raw weight from frontend, defaulting to 1.05kg for a general suit, or 0.35kg for small items
    const rawWeight = parseFloat(req.body.weight) || (shipmentType === 'small' ? 0.35 : 1.05);
    
    // Per Requirements: "Every weight that you see right here should be round up to the nearest whole number"
    const finalWeight = Math.ceil(rawWeight);

    let selectedPackage = 'Box 3';

    if (shipmentType === 'small') {
        selectedPackage = finalWeight <= 2 ? 'Flyer Standard' : 'Flyer Large';
    } else {
        // Box 3 is standard for 1 suit (up to 2kg rounded)
        // Box 4 is used for > 1 suit (3kg to 5kg rounded)
        if (finalWeight <= 2) {
            selectedPackage = 'Box 3';
        } else if (finalWeight <= 5) {
            selectedPackage = 'Box 4';
        } else if (finalWeight <= 10) {
            selectedPackage = 'Box 5';
        } else {
            selectedPackage = 'Box 6';
        }
    }

    const packageInfo = dhlPackages[selectedPackage];

    try {
        const axios = require('axios');
        const today = new Date().toISOString().split('T')[0];

        const params = new URLSearchParams({
            accountNumber: accountNumber,
            originCountryCode: process.env.DHL_ORIGIN_COUNTRY_CODE || 'JM',
            originCityName: process.env.DHL_ORIGIN_CITY_NAME || 'Kingston',
            destinationCountryCode: destCountryCode,
            destinationCityName: city || 'Unknown',
            weight: finalWeight,
            length: packageInfo.dimensions.length,
            width: packageInfo.dimensions.width,
            height: packageInfo.dimensions.height,
            plannedShippingDate: today,
            isCustomsDeclarable: 'true',
            unitOfMeasurement: 'metric'
        });

        if (zip && zip.trim() !== '') {
            params.append('destinationPostalCode', zip.trim());
        }

        const dhlEnv = process.env.DHL_ENVIRONMENT || 'sandbox';
        const dhlBaseUrl = dhlEnv === 'production' 
            ? 'https://express.api.dhl.com/mydhlapi/rates' 
            : 'https://express.api.dhl.com/mydhlapi/test/rates';

        const response = await axios.get(`${dhlBaseUrl}?${params.toString()}`, {
            headers: {
                'Authorization': `Basic ${Buffer.from(apiKey + ':' + apiSecret).toString('base64')}`
            }
        });

        const products = response.data?.products || [];
        if (products.length === 0) throw new Error("No shipping products found for this route");

        // Prefer DHL Express Worldwide or take first available
        const product = products.find(p => p.productName?.includes('Express Worldwide')) || products[0];
        const totalPriceInfo = product.totalPrice[0];

        if (totalPriceInfo && totalPriceInfo.price) {
            let rawCost = parseFloat(totalPriceInfo.price);
            let currency = totalPriceInfo.priceCurrency;

            // The frontend normally expects GBP base costs. DHL usually returns rating based on billing account currency (e.g., JMD or USD)
            if (currency === 'JMD') {
                rawCost = rawCost / 230; // Rough conversion for frontend GBP base pipeline
                currency = 'GBP';
            } else if (currency === 'USD') {
                rawCost = rawCost * 0.79; // Rough conversion to GBP
                currency = 'GBP';
            }

            return res.json({
                cost: rawCost,
                currency: currency,
                service: product.productName || 'DHL Express'
            });
        } else {
            throw new Error("Price missing in DHL response");
        }

    } catch (err) {
        console.error("DHL API Error:", err.response?.data?.detail || err.message);
        return res.status(502).json({ error: 'Failed to retrieve rates from DHL API: ' + (err.response?.data?.detail || err.message) });
    }
});

// 4. Initiate Payment (Live WiPay Integration)
router.post('/payment/wipay/create', (req, res) => {
    const { sessionId, total, currency } = req.body;

    // Update total in DB
    db.run(`UPDATE orders SET total_amount=?, currency=? WHERE session_id=?`, [total, currency, sessionId], function(err) {
        if (err) return res.status(500).json({ error: 'DB error updating order' });

        const wipayAccountNumber = process.env.WIPAY_ACCOUNT_NUMBER || '1234567890';
        const wipayEnvironment = process.env.WIPAY_ENVIRONMENT || 'sandbox';

        // Base URL strictly from the frontend origin
        const baseUrl = req.headers.origin || (req.protocol + '://' + req.get('host'));
        const responseUrl = `${baseUrl}/purchase-flow.html`;

        res.json({
            actionUrl: wipayEnvironment === 'live' 
                ? 'https://jm.wipayfinancial.com/plugins/payments/request' 
                : 'https://jm.wipayfinancial.com/plugins/payments/request', // JM endpoint is same for sandbox, account number triggers it
            params: {
                account_number: wipayAccountNumber,
                country_code: 'JM',
                currency: currency,
                environment: wipayEnvironment,
                fee_structure: 'customer_pay',
                method: 'credit_card',
                order_id: sessionId, // WiPay will return this to us precisely
                origin: 'Windross_Tailoring',
                response_url: responseUrl,
                total: parseFloat(total).toFixed(2) // WiPay explicitly requires two decimal formatting
            }
        });
    });
});

// 5. Payment Callback / Verification
router.post('/payment/verify', (req, res) => {
    const { sessionId, txnId } = req.body;

    // 1. Mark Order as Paid
    db.get(`SELECT * FROM orders WHERE session_id = ?`, [sessionId], (err, order) => {
        if (err || !order) return res.status(404).json({ error: 'Order not found' });

        db.run(`UPDATE orders SET status='paid', payment_ref=? WHERE id=?`, [txnId, order.id], (err) => {
            if (err) console.error(err);

            // 2. Post-Purchase Automation
            db.all(`SELECT * FROM order_items WHERE order_id=?`, [order.id], (err, items) => {
                // Generate PDF
                generateOrderPDF(order, items, (pdfPath) => {
                    // Send Email
                    sendOrderConfirmation(order, pdfPath);
                });
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
const MIN_BOOKING_BUFFER_MINUTES = 60; // Reject slots less than 1 hour away
const MAX_BOOKINGS_PER_DAY = 14;
const MAX_BOOKING_DAYS_AHEAD = 30; // Prevent booking > 1 month out

// 6. Booking Endpoints
router.get('/bookings/availability', (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    const maxDateStr = getJmTimeStr(0, MAX_BOOKING_DAYS_AHEAD).split('T')[0];
    const currentDateStr = getJmTimeStr().split('T')[0];

    // Force limit how far out they can query (or past)
    if (date > maxDateStr || date < currentDateStr) {
        return res.json({ date, slots: [] }); // return empty if invalid bound
    }

    // Generate 30-min slots from 12:00 to 18:30
    const slots = [];
    const startTime = 12 * 60; // 12:00
    const endTime = 18.5 * 60; // 18:30
    for (let current = startTime; current <= endTime; current += 30) {
        const hours = Math.floor(current / 60);
        const mins = current % 60;
        const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

        // Format label for UI
        const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const label = `${hour12}:${mins.toString().padStart(2, '0')} ${ampm}`;

        slots.push({ time: timeStr, label, available: true });
    }

    // Explicit buffer check
    const bufferedCurrentJmTimeStr = getJmTimeStr(MIN_BOOKING_BUFFER_MINUTES);

    slots.forEach(slot => {
        const slotDateTimeStr = `${date}T${slot.time}`;
        if (slotDateTimeStr < bufferedCurrentJmTimeStr) {
            slot.available = false;
            slot.reason = 'PAST'; // Too close or in the past
        }
    });

    // DB Check for booked slots
    db.all(`SELECT booking_time FROM bookings WHERE booking_date = ? AND status = 'confirmed'`, [date], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch availability' });
        }

        if (rows.length >= MAX_BOOKINGS_PER_DAY) {
            // Day is fully booked
            slots.forEach(slot => {
                slot.available = false;
                if (!slot.reason) slot.reason = 'FULLY_BOOKED';
            });
            return res.json({ date, slots });
        }

        const bookedTimes = rows.map(r => r.booking_time);
        slots.forEach(slot => {
            if (slot.available && bookedTimes.includes(slot.time)) {
                slot.available = false;
                slot.reason = 'BOOKED';
            }
        });

        res.json({ date, slots });
    });
});

router.post('/bookings/create', (req, res) => {
    const { name, email, phone, date, time, notes, region } = req.body;

    if (region !== 'Jamaica') {
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

    // Validate 12:00 - 18:30 bounds strictly
    const [h, m] = time.split(':').map(Number);
    const timeMins = h * 60 + m;
    if (timeMins < 12 * 60 || timeMins > 18.5 * 60) {
        return res.status(400).json({ error: 'Time must be between 12:00 and 18:30.' });
    }

    // Validate MAX_BOOKING_DAYS_AHEAD
    const maxDateStr = getJmTimeStr(0, MAX_BOOKING_DAYS_AHEAD).split('T')[0];
    if (date > maxDateStr) {
        return res.status(400).json({ error: 'Cannot book that far in advance.' });
    }

    // Validate Buffer and Past time
    const bufferedCurrentJmTimeStr = getJmTimeStr(MIN_BOOKING_BUFFER_MINUTES);
    const slotDateTimeStr = `${date}T${time}`;

    if (slotDateTimeStr < bufferedCurrentJmTimeStr) {
        return res.status(400).json({ error: 'This time has already passed or is too close to the current time.' });
    }

    // Wrap in DB transaction logic to prevent race conditions on capacity
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.get(`SELECT COUNT(*) as count FROM bookings WHERE booking_date = ? AND status = 'confirmed'`, [date], (err, row) => {
            if (err) {
                db.run('ROLLBACK');
                console.error(err);
                return res.status(500).json({ error: 'Server error during booking validation.' });
            }

            if (row.count >= MAX_BOOKINGS_PER_DAY) {
                db.run('ROLLBACK');
                return res.status(409).json({ error: 'This day is fully booked. Please choose another day.' });
            }

            db.run(
                `INSERT INTO bookings (name, email, phone, booking_date, booking_time, notes, region) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [name, email, phone, date, time, sanitizedNotes, region],
                function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        if (err.code === 'SQLITE_CONSTRAINT') {
                            return res.status(409).json({ error: 'This time has already been booked. Please choose another time.' });
                        }
                        console.error(err);
                        return res.status(500).json({ error: 'Failed to create booking. Please try again.' });
                    }

                    const newId = this.lastID;
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to commit booking.' });
                        }
                        
                        // Async: Dispatch confirmation email
                        sendBookingConfirmation({
                            name, email, phone, date, time, region, id: newId
                        });

                        res.json({ success: true, bookingId: newId, date, time });
                    });
                }
            );
        });
    });
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

module.exports = router;
