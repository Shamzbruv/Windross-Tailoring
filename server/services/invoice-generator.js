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

    const formatted = numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbolMap[currency] || `${currency} `}${formatted}`;
}

function formatPercent(value) {
    const numeric = Number(value || 0);
    return `${numeric.toFixed(2)}%`;
}

function formatPaymentStatus(status) {
    if (status === 'paid') return 'Paid in Full';
    if (status === 'partial') return 'Partially Paid';
    return 'Awaiting Payment';
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

function drawExchangePolicy(doc, y) {
    doc.roundedRect(40, y, 515, 66, 12).fillAndStroke('#111111', '#D8C48D');

    doc.fillColor('#D8C48D')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Exchange Policy', 56, y + 14, { width: 200 });

    doc.fillColor('#F6E8BF')
        .font('Helvetica-Bold')
        .fontSize(15)
        .text('No refund, only exchange.', 56, y + 31, { width: 320 });

    doc.fillColor('#D6D0C1')
        .font('Helvetica')
        .fontSize(9)
        .text('Please keep this invoice for reference if an exchange is needed.', 56, y + 50, { width: 360 });
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
        drawLabelValue(doc, 'BILL TO', `${invoice.customerName || 'Valued Client'}\n${invoice.customerEmail || '—'}\n${invoice.customerPhone || '—'}\n${invoice.customerAddress || '—'}`, 323, 172, 216);

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
        const hasDepositPlan = Number(invoice.depositPercentage || 0) > 0;
        const depositOutstanding = Math.max(Number(invoice.depositAmount || 0) - Number(invoice.amountPaid || 0), 0);
        const paymentBoxHeight = hasDepositPlan ? 146 : 110;
        const totalsBoxHeight = invoice.taxAmount > 0 ? 96 : 76;

        doc.roundedRect(40, totalsBoxY, 285, paymentBoxHeight, 10).fillAndStroke('#F8F4EA', '#DED7C6');
        doc.roundedRect(342, totalsBoxY, 213, totalsBoxHeight, 10).fillAndStroke('#F8F4EA', '#DED7C6');

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
            .fontSize(15)
            .text('Project Total', 360, totalsY, { width: 100 })
            .fillColor('#B88A28')
            .text(formatCurrency(invoice.totalAmount, invoice.currency), 420, totalsY - 2, { width: 115, align: 'right' });

        let paymentY = totalsBoxY + 14;
        doc.fillColor('#B88A28')
            .font('Helvetica-Bold')
            .fontSize(10)
            .text('Payment Snapshot', 56, paymentY);

        paymentY += 18;
        doc.fillColor('#5F5F5F')
            .font('Helvetica-Bold')
            .fontSize(10)
            .text('Status', 56, paymentY, { width: 120 })
            .fillColor(invoice.paymentStatus === 'paid' ? '#1F9D55' : invoice.paymentStatus === 'partial' ? '#B88A28' : '#8A8A8A')
            .text(formatPaymentStatus(invoice.paymentStatus), 185, paymentY, { width: 120, align: 'right' });

        paymentY += 20;
        doc.fillColor('#5F5F5F')
            .text('Paid So Far', 56, paymentY, { width: 120 })
            .text(formatCurrency(invoice.amountPaid, invoice.currency), 185, paymentY, { width: 120, align: 'right' });

        paymentY += 20;
        doc.text('Paid Percentage', 56, paymentY, { width: 120 })
            .text(formatPercent(invoice.amountPaidPercentage), 185, paymentY, { width: 120, align: 'right' });

        paymentY += 20;
        doc.text('Balance Due', 56, paymentY, { width: 120 })
            .fillColor('#B88A28')
            .text(formatCurrency(invoice.balanceDue, invoice.currency), 185, paymentY, { width: 120, align: 'right' });

        if (hasDepositPlan) {
            paymentY += 22;
            doc.fillColor('#5F5F5F')
                .text(`Deposit Required (${formatPercent(invoice.depositPercentage)})`, 56, paymentY, { width: 160 })
                .text(formatCurrency(invoice.depositAmount, invoice.currency), 185, paymentY, { width: 120, align: 'right' });

            paymentY += 20;
            doc.text('Deposit Still Outstanding', 56, paymentY, { width: 160 })
                .text(formatCurrency(depositOutstanding, invoice.currency), 185, paymentY, { width: 120, align: 'right' });
        }

        let notesY = totalsBoxY + Math.max(paymentBoxHeight, totalsBoxHeight) + 18;
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

        drawExchangePolicy(doc, notesY);
        notesY += 82;

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
