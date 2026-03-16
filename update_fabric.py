import re

filename = 'customize.html'
with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update fabricData Cool Wool
content = content.replace(
    "'cool-wool': {\n                name: 'Cool Wool',\n                desc: 'A lightweight, breathable fabric with a smooth, matte finish. Perfect for tropical climates, it offers excellent air circulation while maintaining a crisp, tailored look.',\n                colors: ['Black', 'Blue', 'Navy Blue', 'Royal Blue', 'Cream', 'White', 'Grey', 'Dark Grey', 'Red', 'Olive Green', 'Pink', 'Dark Pink', 'Light Pink']\n            ",
    "'cool-wool': {\n                name: 'Cool Wool',\n                desc: 'A lightweight, breathable fabric with a smooth, matte finish. Perfect for tropical climates, it offers excellent air circulation while maintaining a crisp, tailored look.',\n                img: 'https://i.postimg.cc/rs8s21xV/Chat-GPT-Image-Feb-21-2026-03-50-51-PM.png',\n                colors: ['Black', 'Blue', 'Navy Blue', 'Royal Blue', 'Cream', 'White', 'Grey', 'Dark Grey', 'Red', 'Olive Green', 'Pink', 'Dark Pink', 'Light Pink']\n            "
)

# 2. Add CSS
css_to_add = '''
        .fabric-preview-btn {
            margin-top: 15px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-glass);
            color: var(--text-main);
            padding: 8px 15px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.85rem;
            transition: 0.3s;
            width: fit-content;
            font-family: inherit;
        }

        .fabric-preview-btn:hover {
            background: rgba(212, 175, 55, 0.1);
            border-color: var(--gold-primary);
            color: var(--gold-primary);
        }
'''
if '.fabric-preview-btn' not in content:
    content = content.replace('        /* --- WIZARD CONTAINER --- */', css_to_add + '\n        /* --- WIZARD CONTAINER --- */')

# 3. Add HTML Modal
modal_html = '''        <!-- Image Preview Modal -->
        <div id="image-modal" class="gender-modal-overlay" onclick="closeImageModal()">
            <div class="gender-modal-content" onclick="event.stopPropagation()" style="padding: 20px; text-align: left; max-width: 500px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 id="image-modal-title" style="margin: 0; font-size: 1.5rem; color: var(--gold-primary);">Fabric Preview</h2>
                    <button onclick="closeImageModal()" style="background: transparent; border: none; color: white; cursor: pointer; display:flex; align-items:center; justify-content:center; padding:5px;"><i data-lucide="x"></i></button>
                </div>
                <img id="image-modal-img" src="" alt="Preview" style="max-width: 100%; border-radius: 4px; border: 1px solid var(--border-glass);">
            </div>
        </div>

    </div>'''
content = content.replace('        </div>\n\n    </div>', '        </div>\n\n' + modal_html)

# 4. Modify render logic
old_render_texture = '''            // TYPE: TEXTURE
            if (step.type === 'texture') {
                contentHtml += '<div class="options-grid">';
                Object.entries(fabricData).forEach(([key, data]) => {
                    const isSelected = selections['texture'] && selections['texture'].id === key;
                    contentHtml += `
                        <div class="option-card ${isSelected ? 'selected' : ''}" onclick="selectTexture('${key}')">
                            <div class="card-header">
                                <i data-lucide="layers" class="card-icon" width="24"></i>
                                <div class="card-title">${data.name}</div>
                            </div>
                            <div class="card-desc">${data.desc}</div>
                        </div>
                    `;
                });
                contentHtml += '</div>';
            }'''

new_render_texture = '''            // TYPE: TEXTURE
            if (step.type === 'texture') {
                contentHtml += '<div class="options-grid">';
                Object.entries(fabricData).forEach(([key, data]) => {
                    const isSelected = selections['texture'] && selections['texture'].id === key;
                    let viewBtnHtml = '';
                    if (data.img) {
                        viewBtnHtml = `
                            <button type="button" class="fabric-preview-btn" onclick="viewFabricImage(event, '${data.img}', '${data.name}')">
                                <i data-lucide="image" width="16"></i> View Fabric
                            </button>
                        `;
                    }
                    contentHtml += `
                        <div class="option-card ${isSelected ? 'selected' : ''}" onclick="selectTexture('${key}')">
                            <div class="card-header">
                                <i data-lucide="layers" class="card-icon" width="24"></i>
                                <div class="card-title">${data.name}</div>
                            </div>
                            <div class="card-desc">${data.desc}</div>
                            ${viewBtnHtml}
                        </div>
                    `;
                });
                contentHtml += '</div>';
            }'''
content = content.replace(old_render_texture, new_render_texture)

# 5. Add JS functions
js_funcs = '''
        function viewFabricImage(e, imgUrl, title) {
            e.stopPropagation(); // prevent option-card click
            document.getElementById('image-modal-img').src = imgUrl;
            document.getElementById('image-modal-title').innerText = title;
            document.getElementById('image-modal').classList.add('active');
        }

        function closeImageModal() {
            document.getElementById('image-modal').classList.remove('active');
            setTimeout(() => {
                document.getElementById('image-modal-img').src = '';
            }, 500);
        }
'''
if 'function closeImageModal' not in content:
    content = content.replace('        function getColorHex(name) {', js_funcs + '\n        function getColorHex(name) {')


with open(filename, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated successfully")
