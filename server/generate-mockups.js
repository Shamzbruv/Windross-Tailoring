const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function generateMockups() {
    console.log("Starting mock generation...");
    
    // Create output dir
    const outDir = path.join(__dirname, '../Windross Images/invoices');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const templatePath = path.join(__dirname, 'templates/invoice.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    // Mock Data
    const printDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const itemsHtml = `
            <tr>
                <td>
                    <div class="item-title">Bespoke 3-Piece Suit (Male)</div>
                    <div class="item-specs">
                        Suggested Size: 42R<br>
                        Fabric: Midnight Blue Wool (Italian)<br>
                        Lining: Gold Paisley<br>
                        Monogram: "VW"<br>
                    </div>
                </td>
                <td class="text-right">Included in Total</td>
            </tr>
    `;

    const subtotalsHtml = `
            <tr>
                <td>Auth Garments Subtotal:</td>
                <td>$124000.00 JMD</td>
            </tr>
            <tr>
                <td>Shipping (Standard UK):</td>
                <td>£45.00 GBP</td>
            </tr>
    `;

    html = html.replace('{{ORDER_ID}}', 'WTD-7842')
               .replace('{{ORDER_DATE}}', printDate)
               .replace('{{CUSTOMER_NAME}}', 'Victor Wellington')
               .replace('{{CUSTOMER_EMAIL}}', 'vwellington@example.com')
               .replace('{{CUSTOMER_ADDRESS}}', '<p>12 High Street</p><p>Kensington, London, UK</p>')
               .replace('{{ITEMS_HTML}}', itemsHtml)
               .replace('{{SUBTOTALS_HTML}}', subtotalsHtml)
               .replace('{{TOTAL_AMOUNT}}', '£576.00 GBP');

    // Generate
    const browser = await puppeteer.launch({ 
        headless: 'new',
        pipe: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        timeout: 60000 
    });
    const page = await browser.newPage();
    
    // Set a good viewport so PNG is high-res
    await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 2 });
    
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // 1. PDF export (A4, 300dpi eq, printBackground)
    const pdfPath = path.join(outDir, 'Windross_Tailoring_Invoice.pdf');
    await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });
    console.log(`Saved PDF to ${pdfPath}`);

    // 2. PNG export
    const pngPath = path.join(outDir, 'Windross_Tailoring_Invoice.png');
    await page.screenshot({
        path: pngPath,
        fullPage: true
    });
    console.log(`Saved PNG to ${pngPath}`);

    await browser.close();
    console.log("Mockups generated successfully.");
}

generateMockups();
