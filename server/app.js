require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./database');
const { firebaseSync } = require('./services/firebase-sync');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for simplicity in dev, enable in prod
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Protect Admin HTML pages
app.use((req, res, next) => {
    if (req.path.startsWith('/admin-') && req.path.endsWith('.html') && req.path !== '/admin-login.html') {
        const token = req.cookies.admin_token;
        if (!token) {
            return res.redirect('/admin-login.html');
        }
        
        try {
            // First try to verify as JWT (the new secure method)
            const sessionSecret = process.env.SESSION_SECRET || 'fallback-secret-for-dev';
            const decoded = jwt.verify(token, sessionSecret);
            if (decoded && decoded.role === 'admin') {
                return next();
            }
        } catch (err) {
            return res.redirect('/admin-login.html');
        }
        
        return res.redirect('/admin-login.html');
    }
    next();
});

// Block access to sensitive files and directories before serving static files
app.use((req, res, next) => {
    // Allow public invoice PDFs (shared with customers via WhatsApp/email)
    if (/^\/temp\/invoices\/[^/]+\.pdf$/i.test(req.path)) {
        return next();
    }

    const sensitivePatterns = [
        /^\/server\//i,
        /^\/scripts\//i,
        /^\/\.env/i,
        /\.db$/i,
        /\.sqlite/i,
        /package\.json/i,
        /package-lock\.json/i,
        /\.sh$/i,
        /\.pdf$/i,
        /\.zip$/i,
        /^\/\.git\//i,
        /^\/\.vscode\//i
    ];
    
    if (sensitivePatterns.some(pattern => pattern.test(req.path))) {
        return res.status(403).send('Forbidden');
    }
    next();
});

// Serve Static Files (Frontend)
app.use(express.static(path.join(__dirname, '../')));

// API Routes
app.use('/api', require('./routes/api'));

// Redirect old-style direct PDF invoice links to the invoice viewer page
// If express.static served the file, this route is never reached.
// If the PDF doesn't exist on disk, redirect to the HTML viewer instead.
app.get('/temp/invoices/:filename', (req, res) => {
    const match = req.params.filename.match(/^(WT-INV-\d{6}-\d{6}-\d{3})\.pdf$/i);
    if (match) {
        return res.redirect(302, `/invoice-viewer.html?inv=${encodeURIComponent(match[1])}`);
    }
    res.status(404).send('Not found');
});

// Fallback to index.html for SPA-like navigation (if needed)
app.get('*', (req, res) => {
    // If the request has a file extension (e.g. .pdf, .js, .css) and express.static
    // didn't serve it, the file truly doesn't exist — return a proper 404
    if (path.extname(req.path)) {
        return res.status(404).send('Not found');
    }
    if (req.accepts('html')) {
        res.sendFile(path.join(__dirname, '../index.html'));
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

// Start Server after DB is ready
db.ready
    .then(async () => {
        try {
            await firebaseSync.bootstrap(db);
        } catch (firebaseErr) {
            console.error('Firebase bootstrap skipped:', firebaseErr.message || firebaseErr);
        }

        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log(`- Made to Measure Flow: http://localhost:${PORT}/purchase-flow.html`);
            console.log(`- Database Engine: ${db.engine}`);
        });
    })
    .catch((err) => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });
