// My Observations App - main logic
// All browser code is wrapped so it’s safe if this file is linted in Node, etc.
(function () {
  if (typeof document === 'undefined') return;

  // -------------------- Small helpers --------------------

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  // Very small CSV parser that understands quotes and commas.
  function parseCSV(text) {
    const rows = [];
    let current = [];
    let value = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          value += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          value += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          current.push(value.trim());
          value = '';
        } else if (char === '\n') {
          current.push(value.trim());
          rows.push(current);
          current = [];
          value = '';
        } else if (char !== '\r') {
          value += char;
        }
      }
    }
    if (value.length || current.length) {
      current.push(value.trim());
      rows.push(current);
    }
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

  function parseSheetDate(value) {
    if (!value) return null;
    let d = new Date(value);
    if (!isNaN(d.getTime())) return d;

    const parts = value.split(/[\/\-]/).map(p => p.trim());
    if (parts.length === 3) {
      let [a, b, c] = parts;
      if (c.length === 4) {
        const day = parseInt(a, 10);
        const month = parseInt(b, 10) - 1;
        const year = parseInt(c, 10);
        d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d;
      }
    }
    return null;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function isSameDay(a, b) {
    return (
      a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function isSameMonth(a, b) {
    return (
      a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth()
    );
  }

  function daysBetween(a, b) {
    const ms = startOfDay(a) - startOfDay(b);
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  // -------------------- Global state --------------------

  const state = {
    darkMode: false,
    observations: [],
    observationsLoaded: false,
    lastHeatSummary: null,
    lastWindSummary: null
  };

  const obsFilterState = {
    range: 'today',
    risk: '',
    status: '',
    search: ''
  };

  // -------------------- Tab navigation --------------------

  function openTab(evt, tabId) {
    // hide all
    $all('.tab-content').forEach(sec => {
      sec.classList.remove('active');
      sec.style.display = 'none';
    });

    const target = $('#' + tabId);
    if (target) {
      target.classList.add('active');
      target.style.display = 'block';
    }

    // nav active
    const navButtons = $all('.nav-button');
    navButtons.forEach(btn => btn.classList.remove('active'));

    if (evt && evt.currentTarget) {
      evt.currentTarget.classList.add('active');
    } else {
      const match = navButtons.find(btn => btn.dataset.tab === tabId);
      if (match) match.classList.add('active');
    }

    // lazy-load heavy iframe
    if (tabId === 'TasksTab') {
      initTasksIframe();
    }
  }

  // expose for inline onclick (just in case)
  window.openTab = openTab;

  function setupNav() {
    $all('.nav-button').forEach(btn => {
      const tabId = btn.dataset.tab;
      if (!tabId) return;
      btn.addEventListener('click', e => openTab(e, tabId));
    });
    // default
    openTab(null, 'HomeTab');
  }

  // -------------------- Accordions --------------------

  function setupAccordions() {
    $all('.accordion').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        const panel = btn.nextElementSibling;
        if (!panel) return;
        if (panel.style.maxHeight) {
          panel.style.maxHeight = null;
        } else {
          panel.style.maxHeight = panel.scrollHeight + 'px';
        }
      });
    });
  }

  // -------------------- Modals --------------------

  function showLeaderboardModal() {
    const modal = $('#leaderboardModal');
    if (modal) modal.classList.add('show');
  }

  function hideLeaderboardModal() {
    const modal = $('#leaderboardModal');
    if (modal) modal.classList.remove('show');
  }

  function showEmergencyContactsModal() {
    const modal = $('#emergencyContactsModal');
    if (modal) modal.classList.add('show');
  }

  function hideEmergencyContactsModal() {
    const modal = $('#emergencyContactsModal');
    if (modal) modal.classList.remove('show');
  }

  window.showLeaderboardModal = showLeaderboardModal;
  window.hideLeaderboardModal = hideLeaderboardModal;
  window.showEmergencyContactsModal = showEmergencyContactsModal;
  window.hideEmergencyContactsModal = hideEmergencyContactsModal;

  function setupModals() {
    $all('.modal').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) {
          modal.classList.remove('show');
        }
      });
    });
  }

  // -------------------- Dark / light mode --------------------

  function applyDarkMode(dark) {
    const body = document.body;
    const modeIcon = $('#modeIcon');
    state.darkMode = dark;
    if (dark) {
      body.classList.add('dark-mode');
      if (modeIcon) modeIcon.className = 'fas fa-sun';
    } else {
      body.classList.remove('dark-mode');
      if (modeIcon) modeIcon.className = 'fas fa-moon';
    }
    try {
      localStorage.setItem('safetyAppDarkMode', dark ? '1' : '0');
    } catch (_) {}
  }

  function toggleDarkMode() {
    applyDarkMode(!state.darkMode);
  }

  window.toggleDarkMode = toggleDarkMode;

  function setupDarkMode() {
    let stored = null;
    try {
      stored = localStorage.getItem('safetyAppDarkMode');
    } catch (_) {}
    if (stored === '1') {
      applyDarkMode(true);
    } else {
      applyDarkMode(false);
    }
    const toggle = $('.mode-toggle');
    if (toggle) {
      toggle.addEventListener('click', toggleDarkMode);
    }
  }

  // -------------------- GPS helper --------------------

  function getGPSLocation() {
    const resultEl = $('#locationResult');
    if (!navigator.geolocation) {
      if (resultEl) {
        resultEl.textContent = 'Geolocation not supported on this device.';
      }
      return;
    }

    if (resultEl) {
      resultEl.textContent = 'Getting location...';
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        const link = `https://maps.google.com/?q=${latitude},${longitude}`;
        if (resultEl) {
          resultEl.innerHTML = `
            <strong>Location:</strong> ${latitude.toFixed(5)}, ${longitude.toFixed(5)}
            <br><a href="${link}" target="_blank">Open in Google Maps</a>
          `;
        }
      },
      err => {
        if (resultEl) {
          resultEl.textContent = 'Unable to get location: ' + err.message;
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
  window.getGPSLocation = getGPSLocation;

  // -------------------- EOM + Leaderboard --------------------

  async function loadEomAndLeaderboard() {
    const url = window.EOM_SHEET_URL;
    const eomNameEl = $('#employeeOfMonth');
    const colorNameEl = $('#colorName');
    const leaderboardMini = $('#homeLeaderboardMini');
    const leaderboardContainer = $('#leaderboardContainer');

    if (!url) {
      if (eomNameEl) eomNameEl.textContent = 'Configure EOM_SHEET_URL in js/data.js';
      if (colorNameEl) colorNameEl.textContent = '--';
      if (leaderboardMini) leaderboardMini.textContent = 'No leaderboard data.';
      if (leaderboardContainer) leaderboardContainer.textContent = 'No leaderboard data.';
      return;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const rows = parseCSV(text);
      if (!rows.length) throw new Error('Empty sheet');

      const headers = rows[0];
      const body = rows.slice(1).filter(r => r.some(c => c && c.trim() !== ''));

      if (!body.length) throw new Error('No data rows');

      const idxMonth = findColumnIndex(headers, ['Month', 'Period']);
      const idxColor = findColumnIndex(headers, ['Color', 'Color Code']);
      const idxEomName = findColumnIndex(headers, ['Employee', 'Employee of Month', 'Name']);
      const idxPoints = findColumnIndex(headers, ['Points', 'Score']);

      // first non-empty row is current month (you can adjust in sheet)
      const current = body[0];

      const eomName = idxEomName !== -1 ? current[idxEomName] : '';
      const color = idxColor !== -1 ? current[idxColor] : '';
      if (eomNameEl) eomNameEl.textContent = eomName || 'Not set';
      if (colorNameEl) colorNameEl.textContent = color || '--';

      // Build leaderboard from sheet rows (top 10)
      const leaderboardItems = body.slice(0, 10).map(row => {
        return {
          name: idxEomName !== -1 ? row[idxEomName] : row[0],
          points: idxPoints !== -1 ? row[idxPoints] : ''
        };
      }).filter(p => p.name);

      if (leaderboardMini) {
        if (!leaderboardItems.length) {
          leaderboardMini.textContent = 'No leaderboard data.';
        } else {
          leaderboardMini.innerHTML = leaderboardItems
            .slice(0, 3)
            .map((p, i) =>
              `<div class="leaderboard-mini-item">
                 <span class="rank">#${i + 1}</span>
                 <span class="name">${p.name}</span>
                 <span class="points">${p.points || ''}</span>
               </div>`
            ).join('');
        }
      }

      if (leaderboardContainer) {
        if (!leaderboardItems.length) {
          leaderboardContainer.textContent = 'No leaderboard data.';
        } else {
          leaderboardContainer.innerHTML = leaderboardItems
            .map((p, i) =>
              `<div class="leaderboard-row">
                 <span class="rank">#${i + 1}</span>
                 <span class="name">${p.name}</span>
                 <span class="points">${p.points || ''}</span>
               </div>`
            ).join('');
        }
      }
    } catch (err) {
      console.error('EOM/Leaderboard error:', err);
      if (eomNameEl) eomNameEl.textContent = 'Error loading data';
      if (colorNameEl) colorNameEl.textContent = '--';
      if (leaderboardMini) leaderboardMini.textContent = 'Error loading leaderboard.';
      if (leaderboardContainer) leaderboardContainer.textContent = 'Error loading leaderboard.';
    }
  }

  // -------------------- TBT of the day + TBT/JSA libraries --------------------

  function pickTbtOfDay(list) {
    if (!list || !list.length) return null;
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 0);
    const diff = today - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const index = dayOfYear % list.length;
    return list[index];
  }

  function setupTbtOfDay() {
    const list = Array.isArray(window.tbtData) ? window.tbtData : [];
    const tbtSection = $('#homeTbtSection');
    const tbtContent = $('#homeTbtContent');
    const tbtPanel = $('#tbtPanel');

    if (!list.length) {
      if (tbtContent) tbtContent.textContent = 'No TBT data configured. Add items in js/data.js.';
      if (tbtPanel) tbtPanel.textContent = 'No TBT data configured.';
      return;
    }

    const todayTbt = pickTbtOfDay(list);
    if (tbtContent && todayTbt) {
      tbtContent.innerHTML = `
        <div class="tbt-title">${todayTbt.title}</div>
        <a href="${todayTbt.link}" class="tbt-link" target="_blank">Open TBT document</a>
      `;
    }

    if (tbtPanel) {
      tbtPanel.innerHTML = list.map(item => `
        <div class="tbt-item">
          <i class="fas fa-book-open"></i>
          <a href="${item.link}" target="_blank">${item.title}</a>
        </div>
      `).join('');
    }
  }

  function setupTbtLibrary() {
    const list = Array.isArray(window.tbtData) ? window.tbtData : [];
    const container = $('#tbtLibraryList');
    if (!container) return;

    if (!list.length) {
      container.textContent = 'No TBT items found.';
      return;
    }

    container.innerHTML = list.map(item => `
      <div class="library-item">
        <i class="fas fa-book-open"></i>
        <a href="${item.link}" target="_blank">${item.title}</a>
      </div>
    `).join('');
  }

  function setupJsaLibrary() {
    const list = Array.isArray(window.jsaData) ? window.jsaData : [];
    const container = $('#jsaListContainer');
    const search = $('#jsaSearch');
    if (!container) return;

    function render(filter) {
      const q = (filter || '').toLowerCase();
      const filtered = list.filter(j =>
        !q || (j.title && j.title.toLowerCase().includes(q))
      );

      if (!filtered.length) {
        container.textContent = 'No JSA found for this search.';
        return;
      }

      container.innerHTML = filtered.map(item => `
        <div class="library-item">
          <i class="fas fa-clipboard-list"></i>
          <a href="${item.link}" target="_blank">${item.title}</a>
        </div>
      `).join('');
    }

    if (!list.length) {
      container.textContent = 'No JSA found.';
      return;
    }

    render('');

    if (search) {
      search.addEventListener('input', () => {
        render(search.value);
      });
    }
  }

  // -------------------- Tools (KPI / Heat / Wind) --------------------

  // Heat index formula: convert C to F, apply NOAA formula, back to C
  function calculateHeatIndexC(tempC, humidity) {
    if (tempC == null || humidity == null) return null;
    const T = tempC * 9 / 5 + 32;
    const R = humidity;

    const HI =
      -42.379 +
      2.04901523 * T +
      10.14333127 * R -
      0.22475541 * T * R -
      0.00683783 * T * T -
      0.05481717 * R * R +
      0.00122874 * T * T * R +
      0.00085282 * T * R * R -
      0.00000199 * T * T * R * R;

    const C = (HI - 32) * 5 / 9;
    return C;
  }

  function classifyHeatRisk(heatIndexC) {
    if (heatIndexC == null || isNaN(heatIndexC)) return { label: '--', level: 'unknown' };
    if (heatIndexC < 27) return { label: 'Safe', level: 'safe' };
    if (heatIndexC < 32) return { label: 'Caution', level: 'caution' };
    if (heatIndexC < 41) return { label: 'Extreme Caution', level: 'warning' };
    if (heatIndexC < 54) return { label: 'Danger', level: 'danger' };
    return { label: 'Extreme Danger', level: 'extreme' };
  }

  function classifyWindRisk(speed) {
    if (speed == null || isNaN(speed)) return { label: '--', level: 'unknown' };
    // Saudi Aramco CSM I-11: Manbaskets limit is 32 km/h
    if (speed < 20) return { label: 'Safe for normal work', level: 'safe' };
    if (speed < 32) return { label: 'Caution – Approaching man-basket limit', level: 'caution' };
    return { label: 'STOP Man-basket Operations (>32km/h)', level: 'danger' };
  }

  function calculateHeatIndex() {
    const tempInput = $('#inputTemp');
    const humInput = $('#inputHumidity');
    const valueEl = $('#heatIndexValue');
    const levelEl = $('#heatRiskLevel');
    const listEl = $('#heatRecommendationsList');
    const homeHeat = $('#homeHeatSummary');

    if (!tempInput || !humInput || !valueEl || !levelEl || !listEl) return;

    const t = parseFloat(tempInput.value);
    const h = parseFloat(humInput.value);
    const heatC = calculateHeatIndexC(t, h);
    const risk = classifyHeatRisk(heatC);

    if (heatC == null || isNaN(heatC)) {
      valueEl.textContent = '--';
      levelEl.textContent = '--';
      listEl.innerHTML = '<li>Enter temperature and humidity to see results.</li>';
      if (homeHeat) homeHeat.textContent = '--';
      return;
    }

    const rounded = Math.round(heatC);
    valueEl.textContent = `${rounded}°C HI`;
    levelEl.textContent = risk.label;
    levelEl.className = 'heat-category ' + risk.level;

    let rec = '';
    // Saudi Aramco CSM I-13: Heat Stress Program requirements
    switch (risk.level) {
      case 'safe':
        rec = 'Normal work. Ensure water availability.';
        break;
      case 'caution':
        rec = 'Increase water intake. Monitor workers. Provide shade/rest.';
        break;
      case 'warning':
        rec = 'Frequent breaks in shade. Enforce water replacement. Buddy system.';
        break;
      case 'danger':
        rec = 'Strict work/rest cycles. Only critical work with permit. Monitor continuously.';
        break;
      case 'extreme':
        rec = 'Stop outdoor work except life-saving. Maximum protection required.';
        break;
    }
    listEl.innerHTML = `<li>${rec}</li>`;

    if (homeHeat) {
      homeHeat.textContent = `${risk.label} (${rounded}°C HI)`;
      state.lastHeatSummary = homeHeat.textContent;
    }
  }
  window.calculateHeatIndex = calculateHeatIndex;

  function calculateWindSafety() {
    const windInput = $('#inputWind');
    const valueEl = $('#windValue');
    const levelEl = $('#windRiskLevel');
    const listEl = $('#windRecommendationsList');
    const homeWind = $('#homeWindSummary');

    if (!windInput || !valueEl || !levelEl || !listEl) return;

    const v = parseFloat(windInput.value);
    const risk = classifyWindRisk(v);

    if (v == null || isNaN(v)) {
      valueEl.textContent = '--';
      levelEl.textContent = '--';
      listEl.innerHTML = '<li>Enter wind speed to see limits.</li>';
      if (homeWind) homeWind.textContent = '--';
      return;
    }

    valueEl.textContent = `${v.toFixed(0)} km/h`;
    levelEl.textContent = risk.label;
    levelEl.className = 'wind-category ' + risk.level;

    let rec = '';
    switch (risk.level) {
      case 'safe':
        rec = 'Normal operations allowed.';
        break;
      case 'caution':
        rec = 'Monitor crane/man-basket wind speed indicators closely.';
        break;
      case 'danger':
        // CSM I-11
        rec = 'Stop personnel platform (man-basket) operations immediately.';
        break;
    }
    listEl.innerHTML = `<li>${rec}</li>`;

    if (homeWind) {
      homeWind.textContent = `Safe (${v.toFixed(0)} km/h)`;
      state.lastWindSummary = homeWind.textContent;
    }
  }
  window.calculateWindSafety = calculateWindSafety;

  function setupTools() {
    const kpiBtn = document.querySelector('[data-tool="kpi"]');
    const heatBtn = document.querySelector('[data-tool="heat"]');
    const windBtn = document.querySelector('[data-tool="wind"]');
    const kpiSection = $('#kpiSection');
    const heatSection = $('#heatStressSection');
    const windSection = $('#windSpeedSection');

    function setActive(tool) {
      [kpiBtn, heatBtn, windBtn].forEach(btn => btn && btn.classList.remove('active-tool'));
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

    // expose for old inline onclick, if it exists
    window.switchTool = setActive;

    // default
    setActive('kpi');
  }

  // -------------------- Observations (CSV) --------------------

  async function loadObservations() {
    const url = window.OBSERVATIONS_SHEET_CSV_URL;
    const emptyState = $('#observationsEmptyState');
    if (!url) {
      if (emptyState) {
        emptyState.style.display = 'block';
        emptyState.querySelector('p').textContent =
          'No observations sheet configured. Set OBSERVATIONS_SHEET_CSV_URL in js/data.js.';
      }
      return;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const rows = parseCSV(text);
      if (!rows.length) throw new Error('Empty sheet');

      const headers = rows[0];
      const body = rows.slice(1).filter(r => r.some(c => c && c.trim() !== ''));

      const idxDate = findColumnIndex(headers, ['Date']);
      const idxName = findColumnIndex(headers, ['Name', 'Observer', 'Reported By']);
      const idxRaLevel = findColumnIndex(headers, ['RA Level', 'Risk Level']);
      const idxStatus = findColumnIndex(headers, ['Report Status', 'Status']);
      const idxArea = findColumnIndex(headers, ['Area', 'Location']);
      const idxType = findColumnIndex(headers, ['Activity Type', 'Observation Types', 'Observation Type']);
      const idxClass = findColumnIndex(headers, ['Observation Class']);
      const idxDesc = findColumnIndex(headers, ['Description', 'Details']);

      const observations = body.map(row => {
        const dateRaw = idxDate !== -1 ? row[idxDate] : '';
        const date = parseSheetDate(dateRaw);
        return {
          date,
          dateRaw,
          reporter: idxName !== -1 ? (row[idxName] || '') : '',
          raLevel: idxRaLevel !== -1 ? (row[idxRaLevel] || '') : '',
          status: idxStatus !== -1 ? (row[idxStatus] || '') : '',
          area: idxArea !== -1 ? (row[idxArea] || '') : '',
          type: idxType !== -1 ? (row[idxType] || '') : '',
          obsClass: idxClass !== -1 ? (row[idxClass] || '') : '',
          description: idxDesc !== -1 ? (row[idxDesc] || '') : ''
        };
      });

      state.observations = observations;
      state.observationsLoaded = true;

      updateHomeFromObservations();
      setupObservationsFilters();
      renderObservationsList();
    } catch (err) {
      console.error('Observations load error:', err);
      const list = $('#observationsList');
      if (list) list.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
    }
  }

  function updateHomeFromObservations() {
    const obs = state.observations;
    if (!obs.length) return;
    const today = startOfDay(new Date());

    const todayObs = obs.filter(o => o.date && isSameDay(o.date, today));
    const observersToday = new Set(todayObs.map(o => o.reporter).filter(Boolean)).size;
    const highRiskOpen = obs.filter(o => {
      const level = (o.raLevel || '').toLowerCase();
      const status = (o.status || '').toLowerCase();
      return level.includes('high') && !status.includes('close');
    }).length;

    const observersEl = $('#homeObserversToday');
    const obsTodayEl = $('#homeObservationsToday');
    const highRiskEl = $('#homeHighRiskOpen');

    if (observersEl) observersEl.textContent = observersToday || '--';
    if (obsTodayEl) obsTodayEl.textContent = todayObs.length || '--';
    if (highRiskEl) highRiskEl.textContent = highRiskOpen || '0';
  }

  function filterObservationsForRange(list, range) {
    if (!range || range === 'all') return list.slice();
    const today = startOfDay(new Date());

    return list.filter(o => {
      if (!o.date) return false;
      if (range === 'today') return isSameDay(o.date, today);
      if (range === 'week') return Math.abs(daysBetween(o.date, today)) <= 7;
      if (range === 'month') return isSameMonth(o.date, today);
      return true;
    });
  }

  function updateObservationsSummary() {
    const obs = state.observations;
    const monthObs = filterObservationsForRange(obs, 'month');

    const openCount = monthObs.filter(o =>
      (o.status || '').toLowerCase().includes('open') ||
      (o.status || '').toLowerCase().includes('progress')
    ).length;

    const closedCount = monthObs.filter(o =>
      (o.status || '').toLowerCase().includes('close')
    ).length;

    const thisMonthEl = $('#obsCountMonth');
    const openEl = $('#obsCountOpen');
    const closedEl = $('#obsCountClosed');

    if (thisMonthEl) thisMonthEl.textContent = monthObs.length || '0';
    if (openEl) openEl.textContent = openCount || '0';
    if (closedEl) closedEl.textContent = closedCount || '0';
  }

  function setupObservationsFilters() {
    const rangeButtons = $all('.obs-filter-chip');
    const riskSelect = $('#obsFilterRisk');
    const statusSelect = $('#obsFilterStatus');
    const searchInput = $('#obsSearch');

    rangeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        rangeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        obsFilterState.range = btn.dataset.range || 'today';
        renderObservationsList();
      });
    });

    if (riskSelect) {
      riskSelect.addEventListener('change', () => {
        obsFilterState.risk = riskSelect.value || '';
        renderObservationsList();
      });
    }
    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        obsFilterState.status = statusSelect.value || '';
        renderObservationsList();
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        obsFilterState.search = searchInput.value.toLowerCase();
        renderObservationsList();
      });
    }

    const openSheetBtn = $('#openSheetButton');
    if (openSheetBtn) {
      openSheetBtn.addEventListener('click', () => {
        const url = window.OBSERVATIONS_FULL_SHEET_URL || window.OBSERVATIONS_SHEET_CSV_URL;
        if (url) window.open(url, '_blank');
      });
    }
  }

  function renderObservationsList() {
    const listEl = $('#observationsList');
    const emptyState = $('#observationsEmptyState');
    if (!listEl) return;

    let obs = state.observations || [];
    if (!obs.length) {
      listEl.innerHTML = `
        <div class="obs-empty">
          <i class="fas fa-info-circle"></i>
          <p>No observations loaded yet.</p>
        </div>
      `;
      if (emptyState) emptyState.style.display = 'block';
      updateObservationsSummary();
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Apply filters
    obs = filterObservationsForRange(obs, obsFilterState.range);

    if (obsFilterState.risk) {
      const r = obsFilterState.risk.toLowerCase();
      obs = obs.filter(o => (o.raLevel || '').toLowerCase().includes(r));
    }
    if (obsFilterState.status) {
      const s = obsFilterState.status.toLowerCase();
      obs = obs.filter(o => (o.status || '').toLowerCase().includes(s));
    }
    if (obsFilterState.search) {
      const q = obsFilterState.search;
      obs = obs.filter(o => {
        return (
          (o.area || '').toLowerCase().includes(q) ||
          (o.type || '').toLowerCase().includes(q) ||
          (o.obsClass || '').toLowerCase().includes(q) ||
          (o.reporter || '').toLowerCase().includes(q) ||
          (o.description || '').toLowerCase().includes(q)
        );
      });
    }

    if (!obs.length) {
      listEl.innerHTML = `
        <div class="obs-empty">
          <i class="fas fa-info-circle"></i>
          <p>No observations match the selected filters.</p>
        </div>
      `;
      updateObservationsSummary();
      return;
    }

    const today = new Date();
    const cardsHtml = obs.map(o => {
      const risk = (o.raLevel || '').toLowerCase();
      const status = (o.status || '').toLowerCase();

      let riskClass = 'badge-neutral';
      if (risk.includes('high')) riskClass = 'badge-high';
      else if (risk.includes('medium')) riskClass = 'badge-medium';
      else if (risk.includes('low')) riskClass = 'badge-low';

      let statusClass = 'status-other';
      if (status.includes('open') || status.includes('progress')) statusClass = 'status-open';
      if (status.includes('close')) statusClass = 'status-closed';

      const dateText = o.date
        ? o.date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
        : (o.dateRaw || '');

      return `
        <article class="obs-card">
          <header class="obs-card-header">
            <div class="obs-card-date">${dateText}</div>
            <div class="obs-card-badges">
              <span class="badge ${riskClass}">${o.raLevel || 'No RA'}</span>
              <span class="status-pill ${statusClass}">${o.status || 'No status'}</span>
            </div>
          </header>
          <div class="obs-card-body">
            <div class="obs-main-line">
              <span class="obs-type">${o.type || o.obsClass || 'Observation'}</span>
              <span class="obs-area">${o.area || ''}</span>
            </div>
            <p class="obs-description">${o.description || ''}</p>
          </div>
          <footer class="obs-card-footer">
            <span class="obs-reporter"><i class="fas fa-user"></i> ${o.reporter || 'Unknown'}</span>
          </footer>
        </article>
      `;
    }).join('');

    listEl.innerHTML = cardsHtml;
    updateObservationsSummary();
  }

  // -------------------- News --------------------

  async function loadNews() {
    const url = window.NEWS_SHEET_CSV_URL;
    const container = $('#AnnouncementsContainer');
    const loading = $('#newsLoading');

    if (!container) return;

    if (!url) {
      container.innerHTML = '<p class="text-muted">Configure NEWS_SHEET_CSV_URL in js/data.js to load news.</p>';
      return;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const rows = parseCSV(text);
      if (!rows.length) throw new Error('Empty sheet');

      const headers = rows[0];
      const body = rows.slice(1).filter(r => r.some(c => c && c.trim() !== ''));

      const idxDate = findColumnIndex(headers, ['Date']);
      const idxTitle = findColumnIndex(headers, ['Title', 'Subject']);
      const idxContent = findColumnIndex(headers, ['Content', 'Details', 'Body']);

      if (loading) loading.style.display = 'none';

      if (!body.length) {
        container.innerHTML = '<p class="text-muted">No news found.</p>';
        return;
      }

      container.innerHTML = body.map(row => {
        const d = idxDate !== -1 ? (row[idxDate] || '') : '';
        const t = idxTitle !== -1 ? (row[idxTitle] || '') : 'No Title';
        const c = idxContent !== -1 ? (row[idxContent] || '') : 'No details.';
        const isEmpty = !c || c === 'NULL';

        return `
          <div class="announcement-card">
            <div class="card-date">${d}</div>
            <div class="card-title${isEmpty ? '' : ' expandable'}">
              ${t}
              ${isEmpty ? '' : '<i class="fas fa-chevron-down toggle-icon"></i>'}
            </div>
            <div class="card-content"${isEmpty ? ' style="display:none;"' : ''}>${c}</div>
          </div>
        `;
      }).join('');

      // expand / collapse details
      $all('.announcement-card .card-title.expandable').forEach(titleEl => {
        titleEl.addEventListener('click', () => {
          const content = titleEl.nextElementSibling;
          if (!content) return;
          const icon = titleEl.querySelector('.toggle-icon');
          const isOpen = content.style.display === 'block';
          content.style.display = isOpen ? 'none' : 'block';
          if (icon) icon.classList.toggle('rotated', !isOpen);
        });
      });
    } catch (err) {
      console.error('News load error:', err);
      if (loading) loading.style.display = 'none';
      container.innerHTML = `
        <div class="announcement-card">
          <div class="card-date">Error</div>
          <div class="card-title">Failed to fetch news</div>
          <div class="card-content" style="color:var(--danger-color);">
            Check the NEWS_SHEET_CSV_URL link or your network connection.
          </div>
        </div>
      `;
    }
  }

  // -------------------- Tasks iframe (lazy load) --------------------

  let tasksIframeInitialized = false;

  function initTasksIframe() {
    if (tasksIframeInitialized) return;
    const iframe = $('#tasksIframe');
    if (!iframe) return;

    // If src is already full URL we just mark as initialized.
    if (iframe.dataset && iframe.dataset.src) {
      iframe.src = iframe.dataset.src;
    }
    tasksIframeInitialized = true;
  }

  // -------------------- Floating Add Observation button --------------------

  function setupAddObservationButton() {
    const btn = $('#addObservationButton');
    if (!btn) return;
    // URL comes from js/data.js (ADD_OBSERVATION_FORM_URL), but we also
    // left a fallback href in HTML. Here we just ensure it matches.
    if (window.ADD_OBSERVATION_FORM_URL) {
      btn.href = window.ADD_OBSERVATION_FORM_URL;
    }
  }

  // -------------------- Init app --------------------

  function initApp() {
    setupDarkMode();
    setupNav();
    setupAccordions();
    setupModals();
    setupAddObservationButton();
    setupTbtOfDay();
    setupTbtLibrary();
    setupJsaLibrary();
    setupTools();
    loadEomAndLeaderboard();
    loadObservations();
    loadNews();

    // If we already have summaries from tools, reflect in Home
    const homeHeat = $('#homeHeatSummary');
    const homeWind = $('#homeWindSummary');
    if (homeHeat && state.lastHeatSummary) homeHeat.textContent = state.lastHeatSummary;
    if (homeWind && state.lastWindSummary) homeWind.textContent = state.lastWindSummary;
  }

  document.addEventListener('DOMContentLoaded', initApp);
})();
