// Single source of truth for the admin session (JWT) signing secret.
//
// A hardcoded fallback secret used to be duplicated in three places
// (server/app.js and server/routes/api.js). If SESSION_SECRET was ever left
// unset in production, anyone could read that fallback string from this
// public source code and mint their own "admin" JWT — full access to every
// customer record, invoice, and booking. This module keeps one fallback
// (dev-only) and refuses to run with it in production.
const FALLBACK_DEV_SECRET = 'fallback-secret-for-dev';

function getSessionSecret() {
    const configured = process.env.SESSION_SECRET;
    if (configured) return configured;

    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            'SESSION_SECRET is not set. Refusing to sign/verify admin sessions with the ' +
            'public fallback secret in production. Set SESSION_SECRET in the environment.'
        );
    }

    return FALLBACK_DEV_SECRET;
}

module.exports = { getSessionSecret };
