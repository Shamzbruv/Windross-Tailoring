const fs = require('fs');
let content = fs.readFileSync('customize.html', 'utf8');

const css_addon = `        .nav-links {
            display: flex;
            gap: 30px;
        }

        .nav-links a {
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-muted);
            font-weight: 500;
            position: relative;
            text-decoration: none;
            transition: 0.3s;
        }

        .nav-links a:hover {
            color: white;
        }

        @media (max-width: 768px) {
            .nav-links {
                display: none;
            }
        }`;

if (!content.includes('.nav-links {')) {
    content = content.replace('        /* --- GENDER MODAL --- */', css_addon + '\n        /* --- GENDER MODAL --- */');
}

const htmlRegex = /<div style=\"display: flex; gap: 20px; align-items: center;\">[\s\S]*?<div class=\"mobile-menu-overlay\">[\s\S]*?<\/div>[\s\S]*?<button class=\"action-btn\"[^>]*>Exit<\/button>[\s\S]*?<\/div>/;

const new_html = `<div style="display: flex; gap: 30px; align-items: center;">
            <div class="nav-links">
                <a href="ready-to-wear.html">Made to Measure</a>
                <a href="gallery.html">Gallery</a>
            </div>
            <button class="action-btn" onclick="window.location.href='index.html'">Exit</button>
        </div>`;

content = content.replace(htmlRegex, new_html);

fs.writeFileSync('customize.html', content);
console.log('Success HTML replace');
