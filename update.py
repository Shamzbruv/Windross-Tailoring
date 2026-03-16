import re

with open('customize.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace CSS
css_addon = '''        .nav-links {
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
        }
'''
if '.nav-links {' not in content:
    content = content.replace('        /* --- GENDER MODAL --- */', css_addon + '\n        /* --- GENDER MODAL --- */')

# HTML replace:
html_pattern = re.compile(r'<div style=\"display: flex; gap: 20px; align-items: center;\">\s*<div class=\"mobile-menu-overlay\">.*?</div>\s*<button class=\"action-btn\"[^\>]*>Exit</button>\s*</div>', re.DOTALL)
new_html = '''<div style="display: flex; gap: 30px; align-items: center;">
            <div class="nav-links">
                <a href="ready-to-wear.html">Made to Measure</a>
                <a href="gallery.html">Gallery</a>
            </div>
            <button class="action-btn" onclick="window.location.href='index.html'">Exit</button>
        </div>'''
content = html_pattern.sub(new_html, content)

with open('customize.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
