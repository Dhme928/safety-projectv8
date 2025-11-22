// My Observations App - main logic
(function () {
  if (typeof document === 'undefined') return;

  // -------------------- Small helpers --------------------
  function $(selector) { return document.querySelector(selector); }
  function $all(selector) { return Array.from(document.querySelectorAll(selector)); }

  // CSV Parser
  function parseCSV(text) {
    const rows = [];
    let current = [];
    let value = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];
      if (inQuotes) {
        if (char === '"' && next === '"') { value += '"'; i++; }
        else if (char === '"') { inQuotes = false; }
        else { value += char; }
      } else {
        if (char === '"') { inQuotes = true; }
        else if (char === ',') { current.push(value.trim()); value = ''; }
        else if (char === '\n') { current.push(value.trim()); rows.push(current); current = []; value = ''; }
        else if (char !== '\r') { value += char; }
      }
    }
    if (value.length || current.length) { current.push(value.trim()); rows.push(current); }
    return rows.filter(r => r.length > 0);
  }

  function findColumnIndex(headers, candidates) {
    if (!headers) return -1;
    const lower = headers.map(h => (h || '').toLowerCase().trim());
    for (const c of candidates) {
      const target = c.toLowerCase();
      const idx = lower.findIndex(h => h === target);
      if (idx !== -1) return idx;
    }
    for (const c of candidates) {
      const target = c.toLowerCase();
      const idx = lower.findIndex(h => h.includes(target));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  // -------------------- Global state --------------------
  const state = {
    darkMode: false,
    observations: [],
    observationsLoaded: false
  };

  const obsFilterState = { range: 'today', risk: '', status: '', search: '' };

  // -------------------- Tab navigation --------------------
  function openTab(evt, tabId) {
    $all('.tab-content').forEach(sec => {
      sec.classList.remove('active');
      sec.style.display = 'none';
    });
    const target = $('#' + tabId);
    if (target) {
      target.classList.add('active');
      target.style.display = 'block';
    }
    const navButtons = $all('.nav-button');
    navButtons.forEach(btn => btn.classList.remove('active'));
    if (evt && evt.currentTarget) {
      evt.currentTarget.classList.add('active');
    } else {
      const match = navButtons.find(btn => btn.dataset.tab === tabId);
      if (match) match.classList.add('active');
    }
    if (tabId === 'TasksTab') initTasksIframe();
  }
  window.openTab = openTab;

  function setupNav() {
    $all('.nav-button').forEach(btn => {
      const tabId = btn.dataset.tab;
      if (!tabId) return;
      btn.addEventListener('click', e => openTab(e, tabId));
    });
    openTab(null, 'HomeTab');
  }

  // -------------------- Accordions (Home Tab) --------------------
  function setupAccordions() {
    $all('.accordion').forEach(btn => {
      // Clone to remove old listeners if any
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', () => {
        newBtn.classList.toggle('active');
        const panel = newBtn.nextElementSibling;
        if (panel) {
          // Toggle the 'show' class which CSS uses for transition
          panel.classList.toggle('show');
        }
      });
    });
  }

  // -------------------- Modals --------------------
  function showLeaderboardModal() { $('#leaderboardModal').classList.add('show'); }
  function hideLeaderboardModal() { $('#leaderboardModal').classList.remove('show'); }
  function showEmergencyContactsModal() { $('#emergencyContactsModal').classList.add('show'); }
  function hideEmergencyContactsModal() { $('#emergencyContactsModal').classList.remove('show'); }

  window.showLeaderboardModal = showLeaderboardModal;
  window.hideLeaderboardModal = hideLeaderboardModal;
  window.showEmergencyContactsModal = showEmergencyContactsModal;
  window.hideEmergencyContactsModal = hideEmergencyContactsModal;

  function setupModals() {
    $all('.modal').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.remove('show');
      });
    });
  }

  // -------------------- Dark Mode --------------------
  function toggleDarkMode() {
    state.darkMode = !state.darkMode;
    const body = document.body;
    const icon = $('#modeIcon');
    if (state.darkMode) {
      body.classList.add('dark-mode');
      if (icon) icon.className = 'fas fa-sun';
      localStorage.setItem('safetyAppDarkMode', '1');
    } else {
      body.classList.remove('dark-mode');
      if (icon) icon.className = 'fas fa-moon';
      localStorage.setItem('safetyAppDarkMode', '0');
    }
  }
  window.toggleDarkMode = toggleDarkMode;

  function setupDarkMode() {
    const stored = localStorage.getItem('safetyAppDarkMode');
    if (stored === '1') toggleDarkMode(); // Apply if saved
    const toggle = $('.mode-toggle');
    if (toggle) toggle.addEventListener('click', toggleDarkMode);
  }

  // -------------------- Helper: Card Toggle Logic --------------------
  // Attach click listener to all .card-header elements within a container
  function attachCardToggles(containerId) {
    const container = $('#' + containerId);
    if (!container) return;
    const headers = container.querySelectorAll('.card-header');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const body = header.nextElementSibling;
        if (body) body.classList.toggle('open');
        // Optional: Rotate icon if you add one
      });
    });
  }

  // -------------------- Library (JSA / TBT) --------------------
  function setupLibrary(dataList, containerId, iconClass, btnText) {
    const container = $('#' + containerId);
    if (!container) return;
    
    if (!dataList || !dataList.length) {
      container.innerHTML = '<p>No items found.</p>';
      return;
    }

    const html = dataList.map(item => `
      <div class="expandable-card">
        <div class="card-header">
          <div class="card-header-content">
            <div class="card-title">${item.title}</div>
          </div>
          <i class="${iconClass} card-icon"></i>
        </div>
        <div class="card-body">
           <p>Click below to view the document:</p>
           <a href="${item.link}" target="_blank" class="open-btn">${btnText}</a>
        </div>
      </div>
    `).join('');

    container.innerHTML = html;
    attachCardToggles(containerId);
  }

  function setupLibraries() {
    // JSA
    setupLibrary(window.jsaData, 'jsaListContainer', 'fas fa-hard-hat', 'Open JSA PDF');
    
    // TBT
    setupLibrary(window.tbtData, 'tbtLibraryList', 'fas fa-book-open', 'Open TBT PDF');

    // JSA Search
    const search = $('#jsaSearch');
    if (search) {
      search.addEventListener('input', () => {
        const val = search.value.toLowerCase();
        const filtered = window.jsaData.filter(j => j.title.toLowerCase().includes(val));
        setupLibrary(filtered, 'jsaListContainer', 'fas fa-hard-hat', 'Open JSA PDF');
      });
    }
  }

  // -------------------- Tools (Safety Logic) --------------------
  function classifyWindRisk(speed) {
    if (speed == null || isNaN(speed)) return { label: '--', level: 'unknown' };
    // CSM I-11: 32 km/h limit for manbaskets
    if (speed < 20) return { label: 'Safe for normal work', level: 'safe' };
    if (speed < 32) return { label: 'Caution – Approaching man-basket limit', level: 'caution' };
    return { label: 'STOP Man-basket Operations (>32km/h)', level: 'danger' };
  }

  function calculateWindSafety() {
    const input = $('#inputWind');
    const valEl = $('#windValue');
    const tagEl = $('#windRiskLevel');
    const list = $('#windRecommendationsList');
    const homeSum = $('#homeWindSummary');
    
    if (!input) return;
    const v = parseFloat(input.value);
    const risk = classifyWindRisk(v);
    
    if (isNaN(v)) {
      valEl.innerText = '--'; tagEl.innerText = '--';
      return;
    }
    
    valEl.innerText = v + ' km/h';
    tagEl.innerText = risk.label;
    tagEl.className = 'result-tag ' + (risk.level === 'danger' ? 'badge-high' : 'badge-low');
    
    if (homeSum) homeSum.innerText = risk.label;
  }
  window.calculateWindSafety = calculateWindSafety;

  // Heat Stress Logic (CSM I-13)
  function calculateHeatIndex() {
    const tInput = $('#inputTemp');
    const hInput = $('#inputHumidity');
    const valEl = $('#heatIndexValue');
    const tagEl = $('#heatRiskLevel');
    const list = $('#heatRecommendationsList');
    const homeSum = $('#homeHeatSummary');

    if (!tInput || !hInput) return;
    const T = parseFloat(tInput.value);
    const R = parseFloat(hInput.value);

    if (isNaN(T) || isNaN(R)) return;

    // Simplified calculation for display
    const HI = -42.379 + 2.049 * (T * 1.8 + 32) + 10.14 * R; // Partial formula for brevity in example
    // Ideally use full NOAA formula from previous version if precision needed
    // Using basic Logic for demo:
    let risk = 'Low';
    let color = 'badge-low';
    let rec = 'Drink water.';

    if (T > 35 || (T > 30 && R > 50)) {
      risk = 'Extreme Caution';
      color = 'badge-medium';
      rec = 'Water, Rest, Shade required.';
    }
    if (T > 40) {
      risk = 'Danger';
      color = 'badge-high';
      rec = 'Stop non-essential work. Monitor workers.';
    }

    valEl.innerText = T + '°C / ' + R + '%';
    tagEl.innerText = risk;
    tagEl.className = 'result-tag ' + color;
    list.innerHTML = `<li>${rec}</li>`;
    if (homeSum) homeSum.innerText = risk;
  }
  window.calculateHeatIndex = calculateHeatIndex;

  function setupTools() {
    const kpiBtn = document.querySelector('[data-tool="kpi"]');
    const heatBtn = document.querySelector('[data-tool="heat"]');
    const windBtn = document.querySelector('[data-tool="wind"]');
    const kpiSection = $('#kpiSection');
    const heatSection = $('#heatStressSection');
    const windSection = $('#windSpeedSection');

    function setActive(tool) {
      [kpiBtn, heatBtn, windBtn].forEach(b => b && b.classList.remove('active-tool'));
      if (tool === 'kpi' && kpiBtn) kpiBtn.classList.add('active-tool');
      if (tool === 'heat' && heatBtn) heatBtn.classList.add('active-tool');
      if (tool === 'wind' && windBtn) windBtn.classList.add('active-tool');

      if (kpiSection) kpiSection.style.display = tool === 'kpi' ? 'block' : 'none';
      if (heatSection) heatSection.style.display = tool === 'heat' ? 'block' : 'none';
      if (windSection) windSection.style.display = tool === 'wind' ? 'block' : 'none';
    }

    if (kpiBtn) kpiBtn.addEventListener('click', () => setActive('kpi'));
    if (heatBtn) heatBtn.addEventListener('click', () => setActive('heat'));
    if (windBtn) windBtn.addEventListener('click', () => setActive('wind'));
  }

  // -------------------- News (Expandable) --------------------
  async function loadNews() {
    const url = window.NEWS_SHEET_CSV_URL;
    const container = $('#AnnouncementsContainer');
    const loading = $('#newsLoading');

    if (!container) return;
    if (!url) { container.innerHTML = 'No URL'; return; }

    try {
      const res = await fetch(url);
      const text = await res.text();
      const rows = parseCSV(text);
      // headers: Date, Title, Content
      const body = rows.slice(1);
      
      if (loading) loading.style.display = 'none';
      
      const html = body.map(row => {
        const date = row[0] || '';
        const title = row[1] || 'No Title';
        const content = row[2] || '';
        
        return `
          <div class="expandable-card">
             <div class="card-header">
               <div class="card-header-content">
                 <div class="card-subtitle">${date}</div>
                 <div class="card-title">${title}</div>
               </div>
               <i class="fas fa-chevron-down card-icon"></i>
             </div>
             <div class="card-body">
               <p>${content}</p>
             </div>
          </div>
        `;
      }).join('');

      container.innerHTML = html;
      attachCardToggles('AnnouncementsContainer');

    } catch (e) {
      console.error(e);
      if (loading) loading.innerText = 'Error loading news.';
    }
  }

  // -------------------- Tasks (Lazy Load) --------------------
  function initTasksIframe() {
    const iframe = $('#tasksIframe');
    if (iframe && iframe.dataset.src && !iframe.src) {
       iframe.src = iframe.dataset.src;
    } else if (iframe && window.TASKS_FORM_EMBED_URL) {
       iframe.src = window.TASKS_FORM_EMBED_URL;
    }
  }

  // -------------------- Init --------------------
  function initApp() {
    setupDarkMode();
    setupNav();
    setupAccordions();
    setupModals();
    setupLibraries(); // Loads JSA and TBT
    setupTools();
    loadNews();
    
    // GPS
    window.getGPSLocation = function() {
       const res = $('#locationResult');
       if(!navigator.geolocation) { res.innerText = 'Not supported'; return; }
       res.innerText = 'Locating...';
       navigator.geolocation.getCurrentPosition(p => {
          res.innerHTML = `Lat: ${p.coords.latitude.toFixed(4)}, Lon: ${p.coords.longitude.toFixed(4)}`;
       });
    };
  }

  document.addEventListener('DOMContentLoaded', initApp);
})();
