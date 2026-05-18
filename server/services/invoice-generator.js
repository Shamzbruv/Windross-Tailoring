const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function formatDisplayDate(dateStr) {
    if (!dateStr) return '—';
    const [year, month, day] = String(dateStr).split('-');
    if (!year || !month || !day) return String(dateStr);
    const utcDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return utcDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    });
}

function formatCurrency(amount, currency = 'JMD') {
    const numeric = Number(amount || 0);
    const symbolMap = {
        JMD: 'J$ ',
        USD: 'US$ ',
        GBP: '£'
    };

    return `${symbolMap[currency] || `${currency} `}${numeric.toFixed(2)}`;
}

function drawDivider(doc, y) {
    doc
        .strokeColor('#D8C48D')
        .lineWidth(2)
        .moveTo(40, y)
        .lineTo(555, y)
        .stroke();
}

function drawLabelValue(doc, label, value, x, y, width) {
    doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#B88A28')
        .text(label, x, y, { width });

    doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#4F4F4F')
        .text(value || '—', x, y + 14, { width, lineGap: 2 });
}

async function generateCustomInvoicePDF(invoice) {
    const tempDir = path.join(__dirname, '../../temp/invoices');
    const fileName = `${invoice.invoiceNumber}.pdf`;
    const filePath = path.join(tempDir, fileName);

    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    await new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 40
        });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        doc.fillColor('#B88A28')
            .font('Times-Bold')
            .fontSize(28)
            .text('Windross Tailoring', 40, 42);

        doc.fillColor('#5F5F5F')
            .font('Helvetica')
            .fontSize(11)
            .text('Designer suits, shirts, ladies suits, vests and more.', 40, 78);

        doc.fillColor('#111111')
            .font('Times-Bold')
            .fontSize(24)
            .text('Invoice', 395, 42, { width: 160, align: 'right' });

        doc.font('Helvetica')
            .fontSize(11)
            .fillColor('#5F5F5F')
            .text(`Invoice #: ${invoice.invoiceNumber}`, 355, 78, { width: 200, align: 'right' })
            .text(`Issue Date: ${formatDisplayDate(invoice.issueDate)}`, 355, 94, { width: 200, align: 'right' })
            .text(`Due Date: ${formatDisplayDate(invoice.dueDate)}`, 355, 110, { width: 200, align: 'right' });

        drawDivider(doc, 138);

        doc.roundedRect(40, 156, 248, 108, 10).fillAndStroke('#F8F4EA', '#DED7C6');
        doc.roundedRect(307, 156, 248, 108, 10).fillAndStroke('#F8F4EA', '#DED7C6');

        drawLabelValue(doc, 'FROM', 'Windross Tailoring & Design\n68 Hagley Park Road (Mancare Plaza)\nKingston 10, Jamaica\nPhone / WhatsApp: (876) 598-6434\nEmail: 876david@gmail.com', 56, 172, 216);
        drawLabelValue(doc, 'BILL TO', `${invoice.customerName}\n${invoice.customerEmail || '—'}\n${invoice.customerPhone || '—'}\n${invoice.customerAddress || '—'}`, 323, 172, 216);

        const tableTop = 290;
        const colX = {
            description: 42,
            qty: 350,
            price: 420,
            amount: 492
        };

        doc.roundedRect(40, tableTop, 515, 28, 6).fill('#111111');
        doc.fillColor('#FFFFFF')
            .font('Helvetica-Bold')
            .fontSize(10)
            .text('Description', colX.description, tableTop + 9, { width: 240 })
            .text('Qty', colX.qty, tableTop + 9, { width: 40, align: 'right' })
            .text('Unit Price', colX.price, tableTop + 9, { width: 60, align: 'right' })
            .text('Amount', colX.amount, tableTop + 9, { width: 55, align: 'right' });

        let currentY = tableTop + 40;

        invoice.lineItems.forEach((item, index) => {
            const rowHeight = 34;
            if (index % 2 === 0) {
                doc.roundedRect(40, currentY - 6, 515, rowHeight, 4).fill('#FCFBF7');
            }

            doc.fillColor('#111111')
                .font('Helvetica-Bold')
                .fontSize(11)
                .text(item.description, colX.description, currentY, { width: 255 });

            doc.fillColor('#5F5F5F')
                .font('Helvetica')
                .fontSize(10)
                .text(String(item.quantity), colX.qty, currentY, { width: 40, align: 'right' })
                .text(formatCurrency(item.unitPrice, invoice.currency), colX.price, currentY, { width: 60, align: 'right' })
                .text(formatCurrency(item.amount, invoice.currency), colX.amount, currentY, { width: 55, align: 'right' });

            currentY += rowHeight;
        });

        const totalsBoxY = currentY + 16;
        doc.roundedRect(342, totalsBoxY, 213, invoice.taxAmount > 0 ? 102 : 72, 10).fillAndStroke('#F8F4EA', '#DED7C6');

        let totalsY = totalsBoxY + 18;
        doc.fillColor('#5F5F5F')
            .font('Helvetica-Bold')
            .fontSize(10)
            .text('Subtotal', 360, totalsY, { width: 90 })
            .text(formatCurrency(invoice.subtotalAmount, invoice.currency), 430, totalsY, { width: 105, align: 'right' });

        totalsY += 20;
        if (Number(invoice.taxAmount || 0) > 0) {
            doc.text('Tax / Extra Fee', 360, totalsY, { width: 110 })
                .text(formatCurrency(invoice.taxAmount, invoice.currency), 430, totalsY, { width: 105, align: 'right' });
            totalsY += 24;
        }

        doc
            .moveTo(360, totalsY)
            .lineTo(535, totalsY)
            .strokeColor('#DED7C6')
            .lineWidth(1)
            .stroke();

        totalsY += 10;
        doc.fillColor('#111111')
            .font('Times-Bold')
            .fontSize(16)
            .text('Total Due', 360, totalsY, { width: 90 })
            .fillColor('#B88A28')
            .text(formatCurrency(invoice.totalAmount, invoice.currency), 420, totalsY - 2, { width: 115, align: 'right' });

        let notesY = totalsBoxY + (invoice.taxAmount > 0 ? 122 : 92);
        if (invoice.notes) {
            doc.roundedRect(40, notesY, 515, 76, 10).fillAndStroke('#FFFFFF', '#DED7C6');
            doc.fillColor('#B88A28')
                .font('Helvetica-Bold')
                .fontSize(10)
                .text('Notes', 56, notesY + 14);

            doc.fillColor('#5F5F5F')
                .font('Helvetica')
                .fontSize(10)
                .text(invoice.notes, 56, notesY + 30, { width: 483, lineGap: 3 });

            notesY += 96;
        }

        drawDivider(doc, notesY + 8);

        doc.fillColor('#5F5F5F')
            .font('Helvetica')
            .fontSize(10)
            .text('Thank you for choosing Windross Tailoring.', 40, notesY + 20, { width: 515, align: 'center' })
            .text('Please reply to this invoice email or contact us on WhatsApp if you need anything adjusted.', 40, notesY + 36, { width: 515, align: 'center' });

        doc.end();

        stream.on('finish', resolve);
        stream.on('error', reject);
        doc.on('error', reject);
    });

    return {
        filePath,
        publicUrl: `/temp/invoices/${fileName}`
    };
}

module.exports = {
    formatCurrency,
    formatDisplayDate,
    generateCustomInvoicePDF
};
