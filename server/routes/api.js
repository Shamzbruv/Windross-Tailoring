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

    // Fallback Mock Logic
    const fallbackCost = () => {
        let cost = 80;
        if (country === 'Jamaica') cost = 20;
        if (country === 'USA') cost = 60;
        return { cost, currency: 'GBP', service: 'Standard Shipping (Fallback)' };
    }

    if (!apiKey || !apiSecret || !accountNumber) {
        console.warn("DHL credentials missing. Falling back to mock pricing.");
        return res.json(fallbackCost());
    }

    // Map Frontend Country to ISO 2-letter Country Code
    const countryMap = {
        'Jamaica': 'JM',
        'USA': 'US',
        'UK': 'GB',
        'Canada': 'CA'
    };
    const destCountryCode = countryMap[country] || 'GB';

    try {
        const axios = require('axios');
        const today = new Date().toISOString().split('T')[0];

        const params = new URLSearchParams({
            accountNumber: accountNumber,
            originCountryCode: process.env.DHL_ORIGIN_COUNTRY_CODE || 'JM',
            originCityName: process.env.DHL_ORIGIN_CITY_NAME || 'Kingston',
            destinationCountryCode: destCountryCode,
            destinationCityName: city || 'Unknown',
            weight: 5,
            length: 50,
            width: 40,
            height: 10,
            plannedShippingDate: today,
            isCustomsDeclarable: 'true',
            unitOfMeasurement: 'metric'
        });

        if (zip && zip.trim() !== '') {
            params.append('destinationPostalCode', zip.trim());
        }

        const response = await axios.get(`https://express.api.dhl.com/mydhlapi/rates?${params.toString()}`, {
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
        return res.json(fallbackCost());
    }
});

// 4. Initiate Payment (Mock WiPay)
router.post('/payment/wipay/create', (req, res) => {
    const { sessionId, total, currency } = req.body;

    // Update total in DB
    db.run(`UPDATE orders SET total_amount=?, currency=? WHERE session_id=?`, [total, currency, sessionId]);

    // WiPay would return a redirect URL here
    const txnId = `txn_${Date.now()}`;

    // In production, the redirectURL would be passed to WiPay to send the user back to us
    res.json({
        redirectUrl: `/purchase-flow.html?payment_success=true&session_id=${sessionId}&txn=${txnId}`,
        transactionId: txnId
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
