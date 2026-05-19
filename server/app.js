require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const db = require('./database');
const firebaseSync = require('./services/firebase-sync');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for simplicity in dev, enable in prod
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve Static Files (Frontend)
app.use(express.static(path.join(__dirname, '../')));

// API Routes
app.use('/api', require('./routes/api'));

// Fallback to index.html for SPA-like navigation (if needed)
app.get('*', (req, res) => {
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
