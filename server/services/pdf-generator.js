const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function generateOrderPDF(order, items, callback) {
    const filename = `Order_${order.id}_${Date.now()}.pdf`;
    const tempDir = path.join(__dirname, '../../temp');
    const filePath = path.join(tempDir, filename);

    // Ensure temp dir exists
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Read the template
    const templatePath = path.join(__dirname, '../templates/invoice.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    // Prepare Items HTML
    let itemsHtml = '';
    items.forEach(item => {
        let detailsHtml = '';
        try {
            const measures = JSON.parse(item.measurements);
            if (measures.suggestedSize && measures.suggestedSize !== 'N/A') {
                detailsHtml += `Suggested Size: ${measures.suggestedSize}<br>`;
            }

            Object.entries(measures).forEach(([key, val]) => {
                const ignoredKeys = ['suggestedSize', 'suggestedConfidence', 'suggestedGender', '_config', '_pricing'];
                if (!ignoredKeys.includes(key) && typeof val !== 'object') {
                    detailsHtml += `${key}: ${val}<br>`;
                }
            });

            // Set authoritative total if available
            if (measures._pricing) {
                const p = measures._pricing;
                order._authTotalJMD = (order._authTotalJMD || 0) + p.regionAdjustedSubtotalJMD;
            }
        } catch (e) {
            console.error("PDF Parsing error:", e);
        }

        itemsHtml += `
            <tr>
                <td>
                    <div class="item-title">${item.suit_name} (${item.gender})</div>
                    <div class="item-specs">
                        ${detailsHtml}
                    </div>
                </td>
                <td class="text-right">Included in Total</td>
            </tr>
        `;
    });

    // Subtotal HTML if applicable
    let subtotalsHtml = '';
    if (order._authTotalJMD) {
        subtotalsHtml = `
            <tr>
                <td>Auth Garments Subtotal:</td>
                <td>$${order._authTotalJMD} JMD</td>
            </tr>
        `;
    }

    // Format currency symbol
    const currencyStr = order.currency || 'JMD';
    const symbol = currencyStr === 'GBP' ? '£' : (currencyStr === 'JMD' ? 'J$ ' : '$');
    const totalAmountStr = `${symbol}${order.total_amount} ${currencyStr}`;

    const printDate = new Date().toLocaleDateString('en-GB', { 
        day: 'numeric', month: 'short', year: 'numeric' 
    });

    // Replace Placeholders
    html = html.replace('{{ORDER_ID}}', order.id)
               .replace('{{ORDER_DATE}}', printDate)
               .replace('{{CUSTOMER_NAME}}', order.customer_name || 'Valued Customer')
               .replace('{{CUSTOMER_EMAIL}}', order.customer_email || '')
               .replace('{{CUSTOMER_ADDRESS}}', order.shipping_address ? `<p>${order.shipping_address}</p><p>${order.city || ''}, ${order.country || ''}</p>` : '')
               .replace('{{ITEMS_HTML}}', itemsHtml)
               .replace('{{SUBTOTALS_HTML}}', subtotalsHtml)
               .replace('{{TOTAL_AMOUNT}}', totalAmountStr);

    try {
        const browser = await puppeteer.launch({ 
            // Add options for running in headless, constrained environments
            headless: 'new',
            pipe: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            timeout: 60000
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        await page.pdf({
            path: filePath,
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0px',
                right: '0px',
                bottom: '0px',
                left: '0px'
            }
        });

        await browser.close();
        callback(filePath);
    } catch (err) {
        console.error("Error generating PDF with Puppeteer:", err);
    }
}

module.exports = { generateOrderPDF };
