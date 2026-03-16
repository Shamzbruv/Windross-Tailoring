const fs = require('fs');

// The original file is cached in the `.gemini/antigravity/brain/.../.system_generated/logs` from earlier in this task list.
// Alternatively, I will just rebuild the missing blocks based on the exact structure shown in the view_file logs above.
const path = 'book.html';
let content = fs.readFileSync(path, 'utf8');

const missingBlock = `                <button class="measure-card" onclick="showView('view-instore')">
                    <div style="z-index: 2;">
                        <div class="measure-icon"><i data-lucide="store"></i></div>
                        <div style="display:flex; align-items:center; margin-bottom:5px;">
                            <h3>In-Store Atelier</h3>
                            <span class="badge warning">Service Fee</span>
                        </div>
                        <p>Book a private appointment at our Kingston atelier for a traditional tape measurement.</p>
                    </div>
                    <div class="measure-cta" style="z-index: 2;">
                        <span>Book Appointment</span><i data-lucide="arrow-right"></i>
                    </div>
                </button>
            </div>
        </div>

        <div id="view-measurements" style="display:none; max-width:900px; margin:0 auto; animation: fadeUp 0.5s ease;">
            <div style="text-align: center; margin-bottom: 50px;">
                <span class="eyebrow">Digital Atelier</span>
                <h2>Measurement Profile</h2>
                <p style="color: var(--text-muted);">Please follow our guide for accuracy.</p>
            </div>

            <form class="measurement-form" onsubmit="window.handleMeasurementSubmit(event)">
                <div class="form-section">
                    <h3><i data-lucide="shirt"></i> Blazer Measurements</h3>
                    <div class="grid-3">
                        <div class="form-group">
                            <label>Chest (inches)</label>
                            <input name="chest" type="number" step="0.5" placeholder="Fullest part">
                        </div>
                        <div class="form-group">
                            <label>Torso Waist (inches)</label>
                            <input name="torso_waist" type="number" step="0.5" placeholder="Narrowest part">
                        </div>
                        <div class="form-group">
                            <label>Shoulder (inches)</label>
                            <input name="shoulder" type="number" step="0.5" placeholder="Shoulder to shoulder">
                        </div>
                        <div class="form-group">
                            <label>Sleeve Length (inches)</label>
                            <input name="sleeve" type="number" step="0.5" placeholder="Centre back to wrist">
                        </div>
                        <div class="form-group">
                            <label>Jacket Length (inches)</label>
                            <input name="jacket_length" type="number" step="0.5" placeholder="Base collar to hem">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h3><i data-lucide="scissors"></i> Pants Measurements</h3>
                    <div class="grid-3">
                        <div class="form-group">
                            <label>Pant Waist (inches)</label>
                            <input name="pant_waist" type="number" step="0.5" placeholder="Natural waistline">
                        </div>
                        <div class="form-group">
                            <label>Inseam (inches)</label>
                            <input name="inseam" type="number" step="0.5" placeholder="Crotch to hem">
                        </div>
                        <div class="form-group">
                            <label>Outseam (inches)</label>
                            <input name="outseam" type="number" step="0.5" placeholder="Waist to hem">
                        </div>
                        <div class="form-group">
                            <label>Thigh (inches)</label>
                            <input name="thigh" type="number" step="0.5" placeholder="Fullest part">
                        </div>
                        <div class="form-group">
                            <label>Rise (inches)</label>
                            <input name="rise" type="number" step="0.5" placeholder="Crotch to top">
                        </div>
                    </div>
                </div>

                <div class="form-actions"
                    style="margin-top: 60px; display: flex; justify-content: space-between; align-items: center;">
                    <button type="button" class="btn-secondary" onclick="showView('view-choice')">Back</button>
                    <button type="submit" class="btn-primary">
                        Submit Profile <i data-lucide="check" style="margin-left:8px; width:18px;"></i>
                    </button>
                </div>
            </form>
        </div>

        <div id="view-instore" style="display:none; max-width:600px; margin:0 auto; animation: fadeUp 0.5s ease;">
            <div class="warning-banner" id="instore-warning-banner">
                <i data-lucide="info"></i>
                <div><strong>Note:</strong> In-house consultations may attract a service fee depending on location and
                    requirements.</div>
            </div>

            <div style="text-align: center; margin-bottom: 40px;">
                <span class="eyebrow">Kingston Atelier</span>
                <h2>Request Appointment</h2>
                <p style="color: var(--text-muted);">Select a date and time to secure your slot.</p>
            </div>

            <form class="booking-form" onsubmit="window.handleInStoreBooking(event)">

                <div class="form-section" id="booking-step-1">
                    <h3><i data-lucide="calendar"></i> 1. Select Date & Time</h3>
                    <div class="calendar-header">
                        <button type="button" id="prev-month">&lt;</button>
                        <strong id="calendar-month-year">Month Year</strong>
                        <button type="button" id="next-month">&gt;</button>
                    </div>
                    <div class="calendar-grid" id="calendar-grid">
                        <!-- Days will be generated here -->
                    </div>

                    <div class="slots-container" id="slots-container" style="display: none;">
                        <h4 style="margin-bottom: 5px; color: var(--gold-primary);" id="slots-date-label">Available
                            times</h4>
                        <div id="slots-loader" style="display: none; font-size: 0.9rem; color: var(--text-muted);">
                            Loading times...</div>
                        <div class="slots-grid" id="slots-grid">
                            <!-- Slots will be generated here -->
                        </div>
                    </div>
                    <input type="hidden" name="date" id="selected-date" required>
                    <input type="hidden" name="time" id="selected-time" required>
                    <div id="booking-error-msg" class="booking-error"></div>
                </div>

                <div class="form-section">
                    <h3><i data-lucide="user"></i> 2. Personal Details</h3>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label>Full Name</label>
                        <input name="name" type="text" required placeholder="John Doe">
                    </div>
                    <div class="grid-3" style="grid-template-columns: 1fr 1fr; margin-bottom: 20px;">
                        <div class="form-group">
                            <label>Email Address</label>
                            <input name="email" type="email" required placeholder="john@example.com">
                        </div>
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input name="phone" type="tel" required placeholder="(876) 555-0123">
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label>Notes (Optional)</label>
                        <input name="notes" type="text" placeholder="Any special requests?">
                    </div>
                </div>

                <div style="display:flex; flex-direction: column; gap: 15px;">
                    <button type="submit" class="btn-primary"
                        style="width: 100%; justify-content: center; display: flex; align-items: center;"
                        id="submit-booking-btn">
                        Confirm Booking <i data-lucide="send" style="margin-left: 8px; width: 18px;"></i>
                    </button>

                    <button type="button" class="btn-secondary"
                        style="width: 100%; border:none; color: var(--text-muted);" onclick="showView('view-choice')">
                        Back
                    </button>
                </div>
            </form>
        </div>

    </main>

    <script>
        lucide.createIcons();

        // Mobile Menu Logic
        const mobileToggle = document.querySelector('.mobile-toggle');
        const mobileOverlay = document.querySelector('.mobile-menu-overlay');
        let isMenuOpen = false;

        function toggleMenu() {
            isMenuOpen = !isMenuOpen;
            mobileOverlay.classList.toggle('active');

            // Switch Icon
            if (isMenuOpen) {
                mobileToggle.innerHTML = '<i data-lucide="x" width="28" height="28"></i>';
            } else {
                mobileToggle.innerHTML = '<i data-lucide="menu" width="28" height="28"></i>';
            }
            lucide.createIcons();
        }

        if (mobileToggle) {
            mobileToggle.addEventListener('click', toggleMenu);
        }

        function showView(id) {
            document.querySelectorAll('main > div').forEach(div => div.style.display = 'none');
            document.getElementById(id).style.display = 'block';
            window.scrollTo(0, 0);
        }

        let currentDate = new Date();
        let selectedDateStr = null;
        let selectedTimeStr = null;

        function renderCalendar() {
            const grid = document.getElementById('calendar-grid');
            const monthYear = document.getElementById('calendar-month-year');
            if (!grid || !monthYear) return;
            grid.innerHTML = '';

            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            monthYear.textContent = \`\${monthNames[month]} \${year}\`;

            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const firstDayIndex = new Date(year, month, 1).getDay();

            const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
            dayNames.forEach(d => {
                const el = document.createElement('div');
                el.className = 'calendar-day-header';
                el.textContent = d;
                grid.appendChild(el);
            });

            for (let i = 0; i < firstDayIndex; i++) {
                const empty = document.createElement('div');
                grid.appendChild(empty);
            }

            // Current day starts at midnight local time
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (let i = 1; i <= daysInMonth; i++) {
                const dayEl = document.createElement('div');
                dayEl.className = 'calendar-day';
                dayEl.textContent = i;

                const dayDate = new Date(year, month, i);
                const dateStr = \`\${year}-\${String(month + 1).padStart(2, '0')}-\${String(i).padStart(2, '0')}\`;

                if (dayDate < today) {
                    dayEl.classList.add('disabled');
                } else {
                    if (selectedDateStr === dateStr) {
                        dayEl.classList.add('selected');
                    }
                    dayEl.onclick = () => selectDate(dateStr, dayEl);
                }

                grid.appendChild(dayEl);
            }
        }

        document.getElementById('prev-month')?.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });
        document.getElementById('next-month')?.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });

        async function selectDate(dateStr, el) {
            document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
            el.classList.add('selected');
            selectedDateStr = dateStr;
            document.getElementById('selected-date').value = dateStr;

            selectedTimeStr = null;
            document.getElementById('selected-time').value = '';

            const slotsContainer = document.getElementById('slots-container');
            const slotsGrid = document.getElementById('slots-grid');
            const slotsLoader = document.getElementById('slots-loader');
            const dateLabel = document.getElementById('slots-date-label');
            const errorMsg = document.getElementById('booking-error-msg');

            errorMsg.style.display = 'none';
            slotsContainer.style.display = 'block';
            slotsGrid.innerHTML = '';
            slotsLoader.style.display = 'block';

            const d = new Date(dateStr + "T00:00:00");
            dateLabel.textContent = \`Available times for \${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\`;

            try {
                const response = await fetch(\`/api/bookings/availability?date=\${dateStr}\`);
                const data = await response.json();

                slotsLoader.style.display = 'none';

                if (data.slots && data.slots.length > 0) {
                    data.slots.forEach(slot => {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'slot-btn';

                        if (!slot.available) {
                            btn.disabled = true;
                            btn.textContent = \`\${slot.label} (\${slot.reason === 'PAST' ? 'Passed' : 'Booked'})\`;
                        } else {
                            btn.textContent = slot.label;
                            btn.onclick = () => selectTime(slot.time, btn);
                        }

                        slotsGrid.appendChild(btn);
                    });
                } else {
                    slotsGrid.innerHTML = '<div style="grid-column: 1/-1; color: var(--text-muted);">No slots available</div>';
                }
            } catch (err) {
                console.error(err);
                slotsLoader.style.display = 'none';
                slotsGrid.innerHTML = '<div style="grid-column: 1/-1; color: #ff4d4d;">Failed to load times.</div>';
            }
        }

        function selectTime(timeStr, el) {
            document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
            el.classList.add('selected');
            selectedTimeStr = timeStr;
            document.getElementById('selected-time').value = timeStr;
        }

        // On Load region checking and initialization
        document.addEventListener('DOMContentLoaded', () => {
            renderCalendar();

            // Central Region Validation
            const isJM = window.Region.isJamaica();
            const instoreCardBtn = Array.from(document.querySelectorAll('.measure-card')).find(el => el.textContent.includes('In-Store Atelier'));

            if (!isJM) {
                if (instoreCardBtn) {
                    instoreCardBtn.style.opacity = '0.5';
                    instoreCardBtn.style.cursor = 'not-allowed';
                    instoreCardBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        alert("In-house appointments are available in Jamaica only. Please submit measurements online.");
                    };
                    const p = instoreCardBtn.querySelector('p');
                    if (p) p.innerHTML = '<span style="color:#ff4d4d">In-house appointments are available in Jamaica only. Please use the Digital Profile.</span>';
                }
            } else {
                // If it IS Jamaica, ensure the card works normally and clicking it routes to book.html
                if (instoreCardBtn) {
                    instoreCardBtn.style.opacity = '1';
                    instoreCardBtn.style.cursor = 'pointer';
                    instoreCardBtn.onclick = () => {
                        showView('view-instore');
                    };
                    const p = instoreCardBtn.querySelector('p');
                    if (p && p.innerHTML.includes('color:#ff4d4d')) {
                        p.innerHTML = 'Visit our Kingston atelier for personal measurement and fabric selection.';
                    }
                }
            }
        });

        window.handleInStoreBooking = async (event) => {
            event.preventDefault();`;

// Locate the flawed section 
const boundaryTopString = `                    <div class="measure-cta" style="z-index: 2;">
                        <span>Begin Profile</span><i data-lucide="arrow-right"></i>
                    </div>
                </button>
            </div>
        </div>

        <div id="view-calendar" class="booking-flow">`;

const boundaryBottomString = `            const form = event.target;
            const errorMsg = document.getElementById('booking-error-msg');
            errorMsg.style.display = 'none';`;

let newContent = content.replace(boundaryTopString + "\n" + boundaryBottomString, missingBlock);

fs.writeFileSync(path, newContent);
console.log("Revert complete!");

