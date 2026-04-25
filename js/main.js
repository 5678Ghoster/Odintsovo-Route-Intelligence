// ============================================================================
// frontend/js/main.js
// MADI MaaS · интерфейс маршрутизации и AI-помощник
// ----------------------------------------------------------------------------
// 1. Карта и рабочая зона Одинцово
// 2. Постановка точек A/B и поиск мест
// 3. Мультимаршрут через Yandex MultiRoute
// 4. Выбор оптимального маршрута из списка
// 5. Компактный UI: табы, аналитика, чат, автоподсказки
// ============================================================================

const CITY = {
    center: [55.678, 37.28],
    zoom: 13,
    boundary: [[55.6908, 37.2635], [55.6917, 37.2725], [55.6910, 37.2845], [55.6887, 37.2985], [55.6840, 37.3070], [55.6765, 37.3090], [55.6690, 37.3045], [55.6650, 37.2950], [55.6645, 37.2820], [55.6668, 37.2688], [55.6725, 37.2612], [55.6825, 37.2598], [55.6908, 37.2635]],
    bounds: [[55.6645, 37.2598], [55.6917, 37.3090]]
};

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const DEFAULT_OPTIMIZATION_GOAL = 'optimal';
const PANEL_LAYOUT = { leftMin: 300, rightMin: 290, mapMin: 460 };
const BOUNDARY_EXPANSION = { polygonScale: 1.18, latPadding: 0.0038, lonPadding: 0.0062 };
const APP_CONFIG = {
    labels: { auto: '🚗 Автомобиль', pedestrian: '🚶 Пешком' },
    productFlags: API_CONFIG.productFlags,
    maxAlternativeRoutes: 5,
    locationContext: 'Одинцово, Московская область'
};
const POPULAR_PLACES = [
    { label: 'МЦД Одинцово', coords: [55.6788, 37.2768], tags: ['станция', 'электричка', 'мцд', 'вокзал'] },
    { label: 'Администрация Одинцовского округа', coords: [55.6783, 37.2777], tags: ['администрация', 'центр', 'муниципалитет'] },
    { label: 'Одинцовский парк культуры, спорта и отдыха', coords: [55.6841, 37.2848], tags: ['парк', 'отдых', 'спорт'] },
    { label: 'МГИМО, филиал Одинцово', coords: [55.6787, 37.2626], tags: ['университет', 'вуз', 'мгимо'] },
    { label: 'ТРЦ Атлас', coords: [55.6769, 37.2936], tags: ['трц', 'торговый центр', 'магазин'] },
    { label: 'Центральная районная больница Одинцово', coords: [55.6734, 37.2851], tags: ['больница', 'медицина', 'поликлиника'] },
    { label: 'Ледовый дворец Армада', coords: [55.6821, 37.2884], tags: ['спорт', 'ледовый дворец', 'армада'] },
    { label: 'Парк Малевича', coords: [55.6910, 37.2972], tags: ['парк', 'малевич', 'прогулка'] },
    { label: 'Городской парк Одинцово', coords: [55.6815, 37.2798], tags: ['парк', 'центр', 'прогулка'] },
    { label: 'Одинцовский филиал МГИМО общежитие', coords: [55.6791, 37.2609], tags: ['общежитие', 'мгимо', 'студенты'] }
];

const dom = {};

const state = {
    map: null,
    traffic: null,
    boundary: null,
    markerLayouts: {},
    mode: 'auto',
    target: 'A',
    points: { A: null, B: null },
    placemarks: { A: null, B: null },
    routes: { auto: null, pedestrian: null },
    choices: { auto: [], pedestrian: [] },
    activeChoiceIndex: { auto: null, pedestrian: null },
    shownRoute: null,
    activePanel: 'result',
    suggestTimer: null,
    hideSuggestTimer: null,
    assistantImageFile: null,
    assistantImagePreviewUrl: '',
    assistantBusy: false,
    assistantLastDebug: null,
    resizeFrame: null,

    metricPollTimer: null,
    metricLastValue: 0,

    voiceRecognition: null,
    voiceListening: false,
    voiceBaseText: ''
};


const ASSISTANT_UI_ACTIONS = [
    'switch_mode',
    'set_panel',
    'build_routes',
    'apply_optimal_route',
    'select_alternative',
    'toggle_traffic',
    'clear_route'
];

const ASSISTANT_CONFIRM_ACTIONS = new Set([
    'build_routes',
    'clear_route'
]);

const ASSISTANT_ALLOWED_PANELS = new Set([
    'result',
    'insights',
    'alternatives'
]);

const ASSISTANT_ALLOWED_MODES = new Set([
    'auto',
    'pedestrian'
]);


ymaps.ready(init);

async function init() {
    cacheDom();
    await hydrateBoundary();
    initMap();
    bindEvents();
    setTarget('A');
    setPanel('result');
    tick();
    setInterval(tick, 1000);
    refreshUi();

    initFooterMetric();
    initVoiceInput();

    setAssistantStatus('AI-ассистент готов к работе.', 'normal');
    installMapUiCleaner();
    installPanelSplitters();
    syncTrafficButton();
    addChat('ai', 'Я готов помочь с маршрутом. Укажите точки на карте или в поле поиска.');
}

function cacheDom() {
    const ids = 'search-place,search-as-a,search-as-b,route-start,route-end,point-row-a,point-row-b,optimization-goal,multiroute-toggle,traffic-overlay-toggle,map-traffic-toggle,btn-build-route,btn-apply-optimal,btn-clear-route,selected-points-info,route-result,route-mode-label,route-distance,route-time,route-arrival,route-delay,insights-card,auto-summary,walk-summary,traffic-badge,recommendation-text,last-mile-text,alternatives-card,alternatives-list,alternatives-title,alternatives-note,current-time-display,map-zoom,traffic-status,summary-chip-mode,summary-chip-goal,summary-chip-status,ai-chat,ai-input,btn-ai-voice,btn-ai-ask,ai-image-input,ai-image-preview,ai-image-thumb,ai-image-name,btn-ai-clear-image,assistant-status-line,footer-route-status,footer-last-mile,footer-traffic,footer-premium,visitor-counter,metric-live-label,panel-tabs,assistant-debug-panel,assistant-debug-request-id,assistant-debug-intent,assistant-debug-response-mode,assistant-debug-context,assistant-debug-classifier,assistant-debug-resolver,assistant-debug-backend,assistant-debug-raw'.split(',');
    ids.forEach(id => { dom[toCamel(id)] = document.getElementById(id); });
    dom.routeModeButtons = document.querySelectorAll('.transport-btn[data-route]');
    dom.hintButtons = document.querySelectorAll('.hint-btn');
    dom.panelTabButtons = document.querySelectorAll('.compact-tab[data-panel]');
}

async function hydrateBoundary() {
    try {
        const res = await fetch('/api/odintsovo/boundary');
        const data = await res.json();
        applyBoundaryConfig(data.coordinates, data.bounds);
    } catch (error) {
        console.warn('Boundary fallback:', error);
        applyBoundaryConfig(CITY.boundary, CITY.bounds);
    }
}

function getSelectedGoal() {
    return dom.optimizationGoal?.value || DEFAULT_OPTIMIZATION_GOAL;
}

function getSelectedGoalLabel() {
    return dom.optimizationGoal?.selectedOptions?.[0]?.text || 'AI-оптимизация маршрута';
}

function roundCoord(value) {
    return Number(Number(value).toFixed(6));
}

function expandBoundaryPolygon(points, scale = BOUNDARY_EXPANSION.polygonScale) {
    if (!Array.isArray(points) || points.length < 3) return Array.isArray(points) ? points : [];

    const normalized = points.map(pair => [Number(pair[0]), Number(pair[1])]).filter(pair => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
    if (normalized.length < 3) return normalized;

    const uniquePoints = normalized.length > 1 && normalized[0][0] === normalized[normalized.length - 1][0] && normalized[0][1] === normalized[normalized.length - 1][1]
        ? normalized.slice(0, -1)
        : normalized.slice();

    const center = uniquePoints.reduce((acc, [lat, lon]) => {
        acc.lat += lat;
        acc.lon += lon;
        return acc;
    }, { lat: 0, lon: 0 });

    center.lat /= uniquePoints.length;
    center.lon /= uniquePoints.length;

    const expanded = uniquePoints.map(([lat, lon]) => [
        roundCoord(center.lat + (lat - center.lat) * scale),
        roundCoord(center.lon + (lon - center.lon) * scale)
    ]);

    expanded.push([...expanded[0]]);
    return expanded;
}

function buildBoundsFromPolygon(points, latPadding = BOUNDARY_EXPANSION.latPadding, lonPadding = BOUNDARY_EXPANSION.lonPadding) {
    if (!Array.isArray(points) || !points.length) return CITY.bounds;

    const lats = points.map(([lat]) => Number(lat)).filter(Number.isFinite);
    const lons = points.map(([, lon]) => Number(lon)).filter(Number.isFinite);
    if (!lats.length || !lons.length) return CITY.bounds;

    return [
        [roundCoord(Math.min(...lats) - latPadding), roundCoord(Math.min(...lons) - lonPadding)],
        [roundCoord(Math.max(...lats) + latPadding), roundCoord(Math.max(...lons) + lonPadding)]
    ];
}

function applyBoundaryConfig(coordinates, bounds) {
    const expandedBoundary = expandBoundaryPolygon(Array.isArray(coordinates) && coordinates.length ? coordinates : CITY.boundary);
    CITY.boundary = expandedBoundary;
    CITY.bounds = buildBoundsFromPolygon(
        Array.isArray(bounds) && bounds.length === 2 ? [[bounds[0][0], bounds[0][1]], [bounds[1][0], bounds[1][1]]] : expandedBoundary,
        BOUNDARY_EXPANSION.latPadding,
        BOUNDARY_EXPANSION.lonPadding
    );
    CITY.center = [
        roundCoord((CITY.bounds[0][0] + CITY.bounds[1][0]) / 2),
        roundCoord((CITY.bounds[0][1] + CITY.bounds[1][1]) / 2)
    ];
}

function initMap() {
    state.map = new ymaps.Map('map', {
        center: CITY.center,
        zoom: CITY.zoom,
        controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
    }, {
        restrictMapArea: CITY.bounds,
        suppressMapOpenBlock: true
    });

    state.traffic = new ymaps.control.TrafficControl({ state: { providerKey: 'traffic#actual', trafficShown: true } });
    state.map.controls.add(state.traffic, { float: 'right' });

    state.markerLayouts = {
        A: pinLayout('map-marker map-marker-a', 'A'),
        B: pinLayout('map-marker map-marker-b', 'B')
    };

    state.boundary = new ymaps.Polygon([CITY.boundary], {}, {
        fillColor: 'rgba(0,90,168,0.06)',
        strokeColor: '#005aa8',
        strokeWidth: 3,
        interactivityModel: 'default#transparent'
    });

    const mask = new ymaps.Polygon([outerMask(CITY.bounds), CITY.boundary], {}, {
        fillColor: 'rgba(15,23,42,0.18)',
        strokeWidth: 0,
        interactivityModel: 'default#transparent'
    });

    state.map.geoObjects.add(mask);
    state.map.geoObjects.add(state.boundary);
    state.map.events.add('click', event => setPoint(state.target, event.get('coords')));
    state.map.events.add('boundschange', () => { dom.mapZoom.innerHTML = `<i class="fas fa-search-plus me-1"></i>${state.map.getZoom()}`; });
    state.map.setBounds(CITY.bounds, { checkZoomRange: true, zoomMargin: 24 });
}


function bindEvents() {
    dom.routeModeButtons.forEach(btn => btn.addEventListener('click', () => switchMode(btn.dataset.route)));
    dom.pointRowA.addEventListener('click', () => setTarget('A'));
    dom.pointRowB.addEventListener('click', () => setTarget('B'));
    dom.searchAsA.addEventListener('click', () => searchPlace('A'));
    dom.searchAsB.addEventListener('click', () => searchPlace('B'));
    dom.btnBuildRoute.addEventListener('click', () => {
    buildRoutes().catch(() => {});
    });
    dom.btnApplyOptimal.addEventListener('click', () => applyOptimalRoute(state.mode, true));
    if (dom.btnClearRoute) dom.btnClearRoute.addEventListener('click', clearAll);
    if (dom.mapTrafficToggle) dom.mapTrafficToggle.addEventListener('click', () => { dom.trafficOverlayToggle.checked = !dom.trafficOverlayToggle.checked; onTrafficToggle(); });
    if (dom.optimizationGoal) dom.optimizationGoal.addEventListener('change', onGoalChange);
    dom.multirouteToggle.addEventListener('change', onRouteOptionsChange);
    dom.trafficOverlayToggle.addEventListener('change', onTrafficToggle);
    dom.btnAiAsk.addEventListener('click', onAiAsk);
    dom.aiInput.addEventListener('keydown', e => e.key === 'Enter' && onAiAsk());
    
    if (dom.btnAiVoice) {
        dom.btnAiVoice.addEventListener('click', toggleVoiceInput);
    }
    dom.aiImageInput.addEventListener('change', onAssistantImageSelected);
    dom.btnAiClearImage.addEventListener('click', clearAssistantImage);
    dom.hintButtons.forEach(btn => btn.addEventListener('click', () => { dom.aiInput.value = btn.textContent; onAiAsk(); }));
    dom.panelTabButtons.forEach(btn => btn.addEventListener('click', () => setPanel(btn.dataset.panel)));
    dom.alternativesList.addEventListener('click', onAlternativesClick);


    bindSearchField(dom.searchPlace, { targetResolver: () => state.target, globalSearch: true });
    bindSearchField(dom.routeStart, { targetResolver: () => 'A' });
    bindSearchField(dom.routeEnd, { targetResolver: () => 'B' });
}

function bindSearchField(input, config) {
    if (!input) return;
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const target = config.targetResolver();
        const query = input.value.trim();
        if (!query) return;
        if (config.globalSearch) searchPlace(target); else geocodeInput(target, query);
    });
}

function disableSuggestPanels() {
    document.querySelectorAll('.suggestions-panel').forEach(panel => {
        panel.classList.add('d-none');
        panel.innerHTML = '';
        panel.style.display = 'none';
    });
}


function initFooterMetric() {
    refreshPresenceMetric();

    if (state.metricPollTimer) {
        clearInterval(state.metricPollTimer);
    }

    state.metricPollTimer = setInterval(() => {
        refreshPresenceMetric();
    }, 10000);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            refreshPresenceMetric();
        }
    });
}

async function refreshPresenceMetric() {
    try {
        const response = await fetch('/api/metrics/presence', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: getOrCreateSessionId(),
                page_path: window.location.pathname
            })
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.error || 'Не удалось обновить presence-метрику.');
        }

        const nextValue = Number(data.online || 0);
        animateMetricCounter(dom.visitorCounter, state.metricLastValue, nextValue);
        state.metricLastValue = nextValue;
        updateMetricLiveLabel();
    } catch (error) {
        console.warn('Presence metric warning:', error);
        if (dom.metricLiveLabel) {
            dom.metricLiveLabel.textContent = 'нет связи';
        }
    }
}

function animateMetricCounter(element, from = 0, to = 0, duration = 700) {
    if (!element) return;

    const safeFrom = Number.isFinite(from) ? from : 0;
    const safeTo = Number.isFinite(to) ? to : 0;

    if (safeFrom === safeTo) {
        element.textContent = formatMetricNumber(safeTo);
        return;
    }

    const start = performance.now();
    const delta = safeTo - safeFrom;

    const step = now => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(safeFrom + delta * eased);
        element.textContent = formatMetricNumber(value);

        if (progress < 1) {
            requestAnimationFrame(step);
        }
    };

    requestAnimationFrame(step);
}

function formatMetricNumber(value) {
    return Number(value || 0).toLocaleString('ru-RU');
}

function updateMetricLiveLabel() {
    if (!dom.metricLiveLabel) return;

    const timeText = new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date());

    dom.metricLiveLabel.textContent = `онлайн · ${timeText}`;
}

function initVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!dom.btnAiVoice) return;

    if (!SpeechRecognition) {
        dom.btnAiVoice.disabled = true;
        dom.btnAiVoice.title = 'Голосовой ввод не поддерживается в этом браузере';
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
        state.voiceListening = true;
        state.voiceBaseText = (dom.aiInput.value || '').trim();
        dom.btnAiVoice.classList.add('is-recording');
        setAssistantStatus('Идёт голосовой ввод. Говорите...', 'busy');
    };

    recognition.onresult = event => {
        let transcript = '';

        for (let i = 0; i < event.results.length; i += 1) {
            transcript += `${event.results[i][0].transcript} `;
        }

        const recognizedText = transcript.replace(/\s+/g, ' ').trim();
        const mergedText = [state.voiceBaseText, recognizedText]
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        dom.aiInput.value = mergedText;
    };

    recognition.onerror = event => {
        state.voiceListening = false;
        dom.btnAiVoice.classList.remove('is-recording');

        const messages = {
            'not-allowed': 'Доступ к микрофону запрещён в браузере.',
            'service-not-allowed': 'Браузер заблокировал сервис распознавания речи.',
            'audio-capture': 'Не удалось получить звук с микрофона.',
            'no-speech': 'Речь не распознана. Попробуйте ещё раз.',
            'network': 'Ошибка сети во время голосового ввода.'
        };

        setAssistantStatus(
            messages[event.error] || `Голосовой ввод завершился с ошибкой: ${event.error}`,
            'error'
        );
    };

    recognition.onend = () => {
        state.voiceListening = false;
        dom.btnAiVoice.classList.remove('is-recording');

        if (!dom.assistantStatusLine.classList.contains('is-error')) {
            setAssistantStatus('Голосовой ввод завершён. Проверьте текст и нажмите отправку.', 'normal');
        }
    };

    state.voiceRecognition = recognition;
}

function toggleVoiceInput() {
    if (!state.voiceRecognition) {
        setAssistantStatus('Голосовой ввод не поддерживается в текущем браузере.', 'error');
        return;
    }

    if (state.voiceListening) {
        state.voiceRecognition.stop();
        return;
    }

    try {
        state.voiceRecognition.start();
    } catch (error) {
        setAssistantStatus('Не удалось запустить голосовой ввод.', 'error');
    }
}

async function searchPlace(target, coords = null, label = '') {
    const query = label || dom.searchPlace.value.trim();
    if (!query && !coords) return;
    if (coords) {
        setPoint(target, coords, query);
        state.map.setCenter(coords, 16, { checkZoomRange: true });
        return;
    }
    await geocodeInput(target, query);
}

async function geocodeInput(target, query) {
    if (!query) return;
    try {
        const resolved = await resolveGeoObjectByQuery(query);
        if (!resolved?.coords) throw new Error('Место не найдено в Одинцово. Проверьте адрес.');
        setPoint(target, resolved.coords, resolved.label || query);
        state.map.setCenter(resolved.coords, 16, { checkZoomRange: true });
    } catch (error) {
        fail(error.message || 'Не удалось найти это место. Попробуйте уточнить запрос.');
    }
}

async function resolveGeoObjectByQuery(query, options = {}) {
    const queries = buildSearchQueries(query, options.item);
    const normalizedTarget = normalizeText(query);
    let bestCandidate = null;

    for (const candidateQuery of queries) {
        try {
            const result = await ymaps.geocode(candidateQuery, {
                boundedBy: CITY.bounds,
                strictBounds: true,
                results: 6
            });

            const collection = result?.geoObjects;
            const total = typeof collection?.getLength === 'function' ? collection.getLength() : 0;
            for (let index = 0; index < total; index += 1) {
                const geoObject = collection.get(index);
                const candidate = toGeoCandidate(geoObject, normalizedTarget, options.item);
                if (!candidate) continue;
                if (!bestCandidate || candidate.score > bestCandidate.score) {
                    bestCandidate = candidate;
                }
            }

            if (bestCandidate?.score >= 160) break;
        } catch (error) {
            console.warn('Geocode warning:', error);
        }
    }

    return bestCandidate ? { coords: bestCandidate.coords, label: bestCandidate.label } : null;
}

function buildSearchQueries(query, item = null) {
    const baseValues = [query, item?.value, item?.label]
        .map(value => String(value || '').trim())
        .filter(Boolean);

    const unique = [];
    const seen = new Set();
    baseValues.forEach(value => {
        [
            value,
            value.includes('одинцово') ? value : `${value}, ${APP_CONFIG.locationContext}`,
            value.includes('одинцово') ? value : `Россия, ${APP_CONFIG.locationContext}, ${value}`
        ].forEach(candidate => {
            const normalized = normalizeText(candidate);
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            unique.push(candidate);
        });
    });

    return unique.slice(0, 6);
}

function toGeoCandidate(geoObject, normalizedTarget, item = null) {
    if (!geoObject?.geometry) return null;
    const coords = geoObject.geometry.getCoordinates();
    if (!isCoordsWithinBounds(coords)) return null;

    const name = String(geoObject.properties?.get?.('name') || '').trim();
    const description = String(geoObject.properties?.get?.('description') || '').trim();
    const addressLine = String(geoObject.getAddressLine?.() || '').trim();
    const label = addressLine || name || item?.value || item?.label || formatCoords(coords);
    const normalizedSource = normalizeText([name, description, addressLine].filter(Boolean).join(' '));

    let score = fuzzyScore(normalizedTarget, normalizedSource);
    if (normalizedSource.startsWith(normalizedTarget)) score += 120;
    else if (normalizedSource.includes(normalizedTarget)) score += 80;

    const rawItemLabel = normalizeText(item?.value || item?.label || '');
    if (rawItemLabel) {
        if (normalizedSource.startsWith(rawItemLabel)) score += 45;
        else if (normalizedSource.includes(rawItemLabel)) score += 20;
    }

    if (Array.isArray(item?.coords)) {
        const delta = Math.abs(item.coords[0] - coords[0]) + Math.abs(item.coords[1] - coords[1]);
        if (delta < 0.004) score += 10;
    }

    return { coords, label, score };
}

function isCoordsWithinBounds(coords) {
    if (!Array.isArray(coords) || coords.length !== 2) return false;
    const [[minLat, minLon], [maxLat, maxLon]] = CITY.bounds;
    return coords[0] >= minLat && coords[0] <= maxLat && coords[1] >= minLon && coords[1] <= maxLon;
}

function setTarget(target) {
    state.target = target;
    dom.pointRowA.classList.toggle('point-armed', target === 'A');
    dom.pointRowB.classList.toggle('point-armed', target === 'B');
}

function switchMode(mode) {
    state.mode = mode;
    dom.routeModeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.route === mode));
    showRoute(mode);
    refreshUi();
}

function setPoint(target, coords, label = '') {
    if (!state.boundary.geometry.contains(coords)) {
        fail('Эта точка находится за пределами зоны Одинцово.');
        return;
    }

    if (state.placemarks[target]) state.map.geoObjects.remove(state.placemarks[target]);

    state.points[target] = coords;
    state.placemarks[target] = new ymaps.Placemark(coords, { iconContent: target }, {
        iconLayout: 'default#imageWithContent',
        iconImageHref: TRANSPARENT_PIXEL,
        iconImageSize: [38, 38],
        iconImageOffset: [-19, -19],
        iconContentLayout: state.markerLayouts[target]
    });
    state.map.geoObjects.add(state.placemarks[target]);

    const input = target === 'A' ? dom.routeStart : dom.routeEnd;
    const row = target === 'A' ? dom.pointRowA : dom.pointRowB;
    input.value = label || formatCoords(coords);
    row.classList.remove('point-updated');
    row.offsetWidth;
    row.classList.add('point-updated');

    if (!label || label.includes(',')) reverseGeocode(coords, input);
    resetRoutes(false);
    dom.selectedPointsInfo.textContent = state.points.A && state.points.B ? 'Точки заданы. Можно строить маршрут.' : 'Укажите вторую точку внутри Одинцово.';
    setTarget(target === 'A' ? 'B' : 'A');
}

async function reverseGeocode(coords, input) {
    try {
        const result = await ymaps.geocode(coords, { results: 1 });
        const item = result.geoObjects.get(0);
        if (item) input.value = item.getAddressLine();
    } catch (_) {}
}

async function buildRoutes() {
    if (!state.points.A || !state.points.B) {
        const message = 'Чтобы построить маршрут, укажите пункты отправления и назначения на карте.';
        fail(message);
        throw new Error(message);
    }

    setStatus('выполняется анализ маршрута');
    resetRoutes(false);

    try {
        const [autoBundle, walkBundle] = await Promise.all([
            buildModeRoute('auto'),
            buildModeRoute('pedestrian')
        ]);

        state.routes.auto = autoBundle.route;
        state.routes.pedestrian = walkBundle.route;
        state.choices.auto = autoBundle.choices;
        state.choices.pedestrian = walkBundle.choices;

        state.activeChoiceIndex.auto = state.choices.auto.length ? state.choices.auto[0].index : null;
        state.activeChoiceIndex.pedestrian = state.choices.pedestrian.length ? state.choices.pedestrian[0].index : null;

        applyOptimalRoute('auto', false);
        applyOptimalRoute('pedestrian', false);
        showRoute(state.mode);
        setPanel('result');
        refreshUi();

        const autoChoice = getActiveChoice('auto');
        const walkChoice = getActiveChoice('pedestrian');
        addChat('ai', chooseRecommendation(getSelectedGoal(), autoChoice, walkChoice));

        return {
            ok: true,
            autoChoices: state.choices.auto.length,
            pedestrianChoices: state.choices.pedestrian.length
        };
    } catch (error) {
        console.error('Build route error:', error);
        const message = error?.message || 'Не удалось построить маршрут. Проверьте правильность указанных адресов.';
        fail(message);
        throw new Error(message);
    }
}

function buildModeRoute(mode) {
    return new Promise((resolve, reject) => {
        const resultsCount = dom.multirouteToggle.checked ? APP_CONFIG.maxAlternativeRoutes : 1;
        const route = new ymaps.multiRouter.MultiRoute({
            referencePoints: [state.points.A, state.points.B],
            params: {
                routingMode: mode,
                avoidTrafficJams: mode === 'auto' && dom.trafficOverlayToggle.checked,
                results: resultsCount
            }
        }, {
            boundsAutoApply: true,
            activeRouteAutoSelection: true,
            routeStrokeColor: '#a6b2c2',
            routeActiveStrokeColor: mode === 'auto' ? '#005aa8' : '#28a745',
            routeActiveStrokeWidth: 6,
            routeStrokeWidth: 4,
            wayPointVisible: false,
            viaPointVisible: false,
            pinVisible: false
        });

        const detach = () => {
            route.model.events.remove('requestsuccess', onSuccess);
            route.model.events.remove('requestfail', onFail);
        };

        const onSuccess = () => {
            detach();
            route.getWayPoints()?.options?.set('visible', false);
            route.getViaPoints()?.options?.set('visible', false);

            const choices = [];
            route.getRoutes().each((routeItem, index) => choices.push(buildChoice(mode, routeItem, index)));
            if (!choices.length) return reject(new Error(`Пустой маршрут для режима ${mode}`));

            resolve({ route, choices });
        };

        const onFail = event => {
            detach();
            reject(event.get('error') || new Error(`Маршрут ${mode} недоступен`));
        };

        route.model.events.add('requestsuccess', onSuccess);
        route.model.events.add('requestfail', onFail);
    });
}

function buildChoice(mode, routeRef, index) {
    const metrics = routeMetrics(routeRef);
    const routeCoords = extractRouteCoords(routeRef);
    const trafficProfile = buildTrafficProfile({ mode, routeCoords, variantKey: variantKey(index) });
    const adjustedSeconds = applyTrafficAdjustment(metrics.seconds, mode, trafficProfile);
    const score = mode === 'auto'
        ? calculateAlternativeScore({ info: { durationSeconds: metrics.seconds, adjustedDurationSeconds: adjustedSeconds, distanceMeters: metrics.meters }, trafficProfile }, getSelectedGoal())
        : calculatePedestrianScore({ seconds: metrics.seconds, meters: metrics.meters }, getSelectedGoal());

    return {
        index,
        mode,
        ref: routeRef,
        meters: metrics.meters,
        seconds: metrics.seconds,
        distanceText: metrics.distanceText,
        durationText: metrics.durationText,
        adjustedSeconds,
        trafficProfile,
        score,
        etaText: formatArrival(adjustedSeconds)
    };
}

function extractRouteCoords(routeRef) {
    const coords = [];
    try {
        routeRef.getPaths().each(path => {
            const part = path.geometry?.getCoordinates?.() || [];
            if (Array.isArray(part)) coords.push(...part);
        });
    } catch (_) {}
    return coords;
}

function calculatePedestrianScore(metrics, goal) {
    if (goal === 'walk_priority') return metrics.seconds + metrics.meters * 0.005;
    if (goal === 'balanced') return metrics.seconds + metrics.meters * 0.003;
    return metrics.seconds + metrics.meters * 0.0015;
}

function variantKey(index) {
    return ['direct', 'north', 'south', 'west', 'east'][index] || 'direct';
}

function showRoute(mode) {
    if (state.shownRoute) state.map.geoObjects.remove(state.shownRoute);
    state.shownRoute = state.routes[mode] || null;
    if (state.shownRoute) state.map.geoObjects.add(state.shownRoute);
    refreshUi();
}

function onAlternativesClick(event) {
    const card = event.target.closest('.alternative-card');
    if (!card) return;
    selectAlternative(Number(card.dataset.index), card.dataset.mode || state.mode);
}

function selectAlternative(index, mode = state.mode, announce = true) {
    const choice = state.choices[mode].find(item => item.index === index);
    if (!choice || !state.routes[mode]) return false;

    state.routes[mode].setActiveRoute(choice.ref);
    state.activeChoiceIndex[mode] = choice.index;

    if (state.mode === mode) showRoute(mode);
    refreshUi();

    if (announce) {
        addChat('ai', `Активирован ${mode === 'auto' ? 'автомобильный' : 'пешеходный'} маршрут №${index + 1}: ${choice.durationText}, ${choice.distanceText}.`);
    }

    return true;
}

function applyOptimalRoute(mode = state.mode, announce = false) {
    const choices = [...state.choices[mode]];
    if (!choices.length || !state.routes[mode]) return null;

    const best = choices.sort((a, b) => a.score - b.score)[0];
    state.routes[mode].setActiveRoute(best.ref);
    state.activeChoiceIndex[mode] = best.index;

    if (state.mode === mode) showRoute(mode);
    refreshUi();

    if (announce) {
        addChat('ai', `Выбран оптимальный ${mode === 'auto' ? 'автомобильный' : 'пешеходный'} маршрут: ${best.durationText}, ${best.distanceText}, прибытие ${best.etaText}.`);
    }

    return best;
}

function onGoalChange() {
    if (!dom.optimizationGoal) return;
    applyOptimalRoute('auto', false);
    applyOptimalRoute('pedestrian', false);
    refreshUi();
}

function onRouteOptionsChange() {
    if (state.points.A && state.points.B) {
        buildRoutes().catch(() => {});
    } else {
        refreshUi();
    }
}

function onTrafficToggle() {
    state.traffic.state.set('trafficShown', dom.trafficOverlayToggle.checked);
    syncTrafficButton();

    if (state.points.A && state.points.B) {
        buildRoutes().catch(() => {});
    } else {
        refreshUi();
    }
}

function refreshUi() {
    const autoChoice = getActiveChoice('auto');
    const walkChoice = getActiveChoice('pedestrian');
    const activeChoice = getActiveChoice(state.mode);
    const traffic = trafficState(dom.trafficOverlayToggle.checked, autoChoice?.adjustedSeconds || autoChoice?.seconds || 0);

    dom.summaryChipMode.textContent = `Режим: ${state.mode === 'auto' ? 'авто' : 'пешком'}`;
    dom.summaryChipGoal.textContent = `AI-режим: ${getSelectedGoalLabel()}`;
    dom.summaryChipStatus.textContent = `Статус: ${activeChoice ? 'маршрут готов' : 'ожидание маршрута'}`;
    dom.trafficStatus.innerHTML = `<i class="fas fa-road me-1"></i>Трафик: ${traffic.label}`;
    dom.footerTraffic.textContent = `Трафик: ${traffic.label}`;
    dom.footerPremium.textContent = 'Альтернативные маршруты';
    syncTrafficButton();

    renderResult(activeChoice, traffic);
    renderInsights(autoChoice, walkChoice, traffic);
    renderAlternatives(state.mode);
}

function renderResult(choice, traffic) {
    if (!choice) {
        dom.routeResult.classList.remove('d-none');
        dom.routeModeLabel.textContent = APP_CONFIG.labels[state.mode];
        dom.routeDistance.textContent = '—';
        dom.routeTime.textContent = '—';
        dom.routeArrival.textContent = '—';
        dom.routeDelay.textContent = state.mode === 'auto' ? '—' : 'Без учета пробок';
        dom.footerRouteStatus.textContent = 'Маршрут не построен';
        return;
    }

    dom.routeModeLabel.textContent = APP_CONFIG.labels[state.mode];
    dom.routeDistance.textContent = choice.distanceText;
    dom.routeTime.textContent = choice.mode === 'auto' ? formatDuration(choice.adjustedSeconds) : choice.durationText;
    dom.routeArrival.textContent = choice.etaText;
    dom.routeDelay.textContent = choice.mode === 'auto' ? traffic.delayText : 'Пробки не влияют';
    dom.footerRouteStatus.textContent = `${APP_CONFIG.labels[state.mode]} · ${choice.mode === 'auto' ? formatDuration(choice.adjustedSeconds) : choice.durationText}`;
}

function renderInsights(autoChoice, walkChoice, traffic) {
    const comparison = buildRouteComparison(asComparisonRoute(autoChoice), asComparisonRoute(walkChoice), getSelectedGoal());

    dom.autoSummary.textContent = autoChoice ? `${formatDuration(autoChoice.adjustedSeconds)} · ${autoChoice.distanceText}` : '—';
    dom.walkSummary.textContent = walkChoice ? `${walkChoice.durationText} · ${walkChoice.distanceText}` : '—';
    dom.trafficBadge.textContent = `Трафик: ${traffic.label}`;
    dom.recommendationText.textContent = comparison.recommendation;
    if (dom.lastMileText) dom.lastMileText.textContent = comparison.lastMile;
    dom.footerLastMile.textContent = comparison.lastMile;
    dom.insightsCard.classList.remove('d-none');
}

function renderAlternatives(mode) {
    const choices = state.choices[mode];
    const active = getActiveChoice(mode);
    const best = choices.length ? [...choices].sort((a, b) => a.score - b.score)[0] : null;
    const isEnabled = dom.multirouteToggle.checked;

    dom.alternativesTitle.textContent = mode === 'auto' ? 'Автомобильные варианты' : 'Пешеходные варианты';
    // dom.alternativesNote.textContent = mode === 'auto'
    //     ? 'Маршруты учитывают дорожную обстановку. Можно выбрать вручную или одной кнопкой сделать лучшим активный вариант.'
    //     : 'Маршруты отражают альтернативные пешие траектории внутри Одинцово. Доступен ручной и автоматический выбор.';

    if (!isEnabled || !choices.length) {
        dom.alternativesList.innerHTML = '<div class="empty-alternatives">Включите опцию "Альтернативные маршруты" и постройте маршрут, чтобы увидеть варианты.</div>';
        return;
    }

    dom.alternativesList.innerHTML = choices.slice(0, APP_CONFIG.maxAlternativeRoutes).map((choice, order) => `
        <article class="alternative-card ${choice === active ? 'selected' : ''} ${choice === best ? 'optimal' : ''}" data-index="${choice.index}" data-mode="${mode}">
            <div class="alternative-card-title">
                <span>${mode === 'auto' ? 'Маршрут' : 'Путь'} ${order + 1}</span>
                <span class="badge-soft">${choice === best ? 'оптимальный' : choice === active ? 'активный' : 'доступен'}</span>
            </div>
            <div class="alternative-description">${mode === 'auto' ? 'Вариант проезда на автомобиле' : 'Вариант пешего маршрута'}</div>
            <div class="alternative-card-meta">
                <div>Время: ${choice.mode === 'auto' ? formatDuration(choice.adjustedSeconds) : choice.durationText}</div>
                <div>Дистанция: ${choice.distanceText}</div>
                <div>ETA: ${choice.etaText}</div>
                <div>Оценка: ${Math.round(choice.score)}</div>
            </div>
        </article>`).join('');
}

function getActiveChoice(mode) {
    const choices = Array.isArray(state.choices[mode]) ? state.choices[mode] : [];
    if (!choices.length) return null;

    const explicitIndex = state.activeChoiceIndex?.[mode];
    if (Number.isInteger(explicitIndex)) {
        const explicitChoice = choices.find(choice => choice.index === explicitIndex);
        if (explicitChoice) return explicitChoice;
    }

    const activeRoute = state.routes[mode]?.getActiveRoute?.();
    const matchedByRef = choices.find(choice => choice.ref === activeRoute);
    if (matchedByRef) return matchedByRef;

    return choices[0] || null;
}

function asComparisonRoute(choice) {
    if (!choice) return null;
    return {
        info: {
            durationSeconds: choice.seconds,
            adjustedDurationSeconds: choice.adjustedSeconds,
            distanceMeters: choice.meters
        },
        trafficProfile: choice.trafficProfile
    };
}

function setPanel(panelName) {
    state.activePanel = panelName;
    dom.panelTabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.panel === panelName));
    dom.routeResult.classList.toggle('d-none', panelName !== 'result');
    dom.insightsCard.classList.toggle('d-none', panelName !== 'insights');
    dom.alternativesCard.classList.toggle('d-none', panelName !== 'alternatives');
}

function getOrCreateSessionId() {
    const storageKey = 'madi_assistant_session_id';
    let sessionId = localStorage.getItem(storageKey);

    if (!sessionId) {
        sessionId = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        localStorage.setItem(storageKey, sessionId);
    }

    return sessionId;
}

function getAssistantTurnIndex() {
    const storageKey = 'madi_assistant_turn_index';
    const raw = localStorage.getItem(storageKey);
    const value = Number(raw);

    if (!Number.isFinite(value) || value < 1) {
        return 1;
    }

    return value;
}

function incrementAssistantTurnIndex() {
    const storageKey = 'madi_assistant_turn_index';
    const nextValue = getAssistantTurnIndex() + 1;
    localStorage.setItem(storageKey, String(nextValue));
    return nextValue;
}

function resetAssistantTurnIndex() {
    localStorage.setItem('madi_assistant_turn_index', '1');
}

function setAssistantStatus(text, mode = 'normal') {
    dom.assistantStatusLine.textContent = text;
    dom.assistantStatusLine.classList.remove('is-error', 'is-busy', 'd-none');

    if (mode === 'error') {
        dom.assistantStatusLine.classList.add('is-error');
        return;
    }

    if (mode === 'busy') {
        dom.assistantStatusLine.classList.add('is-busy');
        return;
    }

    dom.assistantStatusLine.classList.add('d-none');
}

function syncTrafficButton() {
    if (!dom.mapTrafficToggle || !dom.trafficOverlayToggle) return;
    const enabled = !!dom.trafficOverlayToggle.checked;
    dom.mapTrafficToggle.classList.toggle('is-active', enabled);
    dom.mapTrafficToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function installMapUiCleaner() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    const hideElement = element => {
        const target = element.closest('button, a, [role="button"]') || element;
        target.style.display = 'none';
    };

    const scan = () => {
        mapContainer.querySelectorAll('button, a, [role="button"], div, span').forEach(element => {
            const text = String(element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const label = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''}`.trim().toLowerCase();

            if (text === 'открыть маршрут' || text === 'создать свою карту') {
                hideElement(element);
                return;
            }

            if (label.includes('открыть маршрут') || label.includes('создать свою карту')) {
                hideElement(element);
            }
        });
    };

    const observer = new MutationObserver(scan);
    observer.observe(mapContainer, { childList: true, subtree: true, attributes: true });
    scan();
}


function readPanelCssWidth(variableName, fallback) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
}

function queueMapResize() {
    if (state.resizeFrame) cancelAnimationFrame(state.resizeFrame);
    state.resizeFrame = requestAnimationFrame(() => {
        try {
            state.map?.container?.fitToViewport?.();
        } catch (_) {}
    });
}

function installPanelSplitters() {
    const contentRow = document.querySelector('.content-row');
    const leftSplitter = document.getElementById('splitter-left');
    const rightSplitter = document.getElementById('splitter-right');
    if (!contentRow || !leftSplitter || !rightSplitter) return;

    const bindSplitter = (splitter, side) => {
        splitter.addEventListener('mousedown', event => {
            if (window.innerWidth <= 1100) return;
            event.preventDefault();

            const rowRect = contentRow.getBoundingClientRect();
            document.body.classList.add('is-resizing-panels');

            const onMove = moveEvent => {
                const leftWidth = readPanelCssWidth('--left-panel-width', document.getElementById('control-panel')?.getBoundingClientRect().width || 390);
                const rightWidth = readPanelCssWidth('--right-panel-width', document.getElementById('assistant-panel')?.getBoundingClientRect().width || 340);
                const maxLeft = Math.max(PANEL_LAYOUT.leftMin, rowRect.width - rightWidth - PANEL_LAYOUT.mapMin - 24);
                const maxRight = Math.max(PANEL_LAYOUT.rightMin, rowRect.width - leftWidth - PANEL_LAYOUT.mapMin - 24);

                if (side === 'left') {
                    const proposed = Math.min(Math.max(moveEvent.clientX - rowRect.left, PANEL_LAYOUT.leftMin), maxLeft);
                    document.documentElement.style.setProperty('--left-panel-width', `${Math.round(proposed)}px`);
                } else {
                    const proposed = Math.min(Math.max(rowRect.right - moveEvent.clientX, PANEL_LAYOUT.rightMin), maxRight);
                    document.documentElement.style.setProperty('--right-panel-width', `${Math.round(proposed)}px`);
                }

                queueMapResize();
            };

            const onUp = () => {
                document.body.classList.remove('is-resizing-panels');
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                queueMapResize();
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    };

    bindSplitter(leftSplitter, 'left');
    bindSplitter(rightSplitter, 'right');
    window.addEventListener('resize', queueMapResize);
}

function makeAssistantRequestId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `req-${crypto.randomUUID()}`;
    }

    return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function isAssistantDebugEnabled() {
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('assistant_debug') === '1') return true;
    } catch (_) {}

    return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function safePrettyJson(value) {
    try {
        return JSON.stringify(value ?? {}, null, 2);
    } catch (_) {
        return String(value ?? '');
    }
}

function buildDebugPayloadPreview(payload) {
    const preview = { ...(payload || {}) };

    if (preview.image_base64) {
        preview.image_base64 = `[omitted:${String(preview.image_base64).length} chars]`;
    }

    return preview;
}

function logAssistantDebug(stage, requestId, payload) {
    if (!isAssistantDebugEnabled()) return;

    console.groupCollapsed(`[assistant][${requestId}] ${stage}`);
    console.log(payload);
    console.groupEnd();
}

function clearAssistantDebug() {
    if (!dom.assistantDebugPanel) return;

    dom.assistantDebugPanel.classList.add('d-none');
    dom.assistantDebugRequestId.textContent = '—';
    dom.assistantDebugIntent.textContent = '—';
    dom.assistantDebugResponseMode.textContent = '—';
    dom.assistantDebugContext.textContent = '—';
    dom.assistantDebugClassifier.textContent = '—';
    dom.assistantDebugResolver.textContent = '—';
    dom.assistantDebugBackend.textContent = '—';
    dom.assistantDebugRaw.textContent = '—';
}

function renderAssistantDebug(debug) {
    state.assistantLastDebug = debug || null;

    if (!dom.assistantDebugPanel) return;

    if (!debug || !isAssistantDebugEnabled()) {
        clearAssistantDebug();
        return;
    }

    dom.assistantDebugPanel.classList.remove('d-none');
    dom.assistantDebugRequestId.textContent = debug.request_id || '—';
    dom.assistantDebugIntent.textContent = debug.intent || '—';
    dom.assistantDebugResponseMode.textContent = debug.resolved_response_mode || '—';
    dom.assistantDebugContext.textContent = safePrettyJson(debug.context_summary || {});
    dom.assistantDebugClassifier.textContent = safePrettyJson(debug.classifier || {});
    dom.assistantDebugResolver.textContent = safePrettyJson(debug.resolver || {});
    dom.assistantDebugBackend.textContent = safePrettyJson(debug.backend || {});
    dom.assistantDebugRaw.textContent = safePrettyJson(debug.raw || {});
}



function onAssistantImageSelected(event) {
    const file = event.target.files?.[0];
    if (!file) {
        clearAssistantImage();
        return;
    }

    state.assistantImageFile = file;

    if (state.assistantImagePreviewUrl) {
        URL.revokeObjectURL(state.assistantImagePreviewUrl);
    }

    state.assistantImagePreviewUrl = URL.createObjectURL(file);
    dom.aiImageThumb.src = state.assistantImagePreviewUrl;
    dom.aiImageName.textContent = `${file.name} (${Math.max(1, Math.round(file.size / 1024))} КБ)`;
    dom.aiImagePreview.classList.remove('d-none');
    setAssistantStatus('Скриншот прикреплен. Можно отправлять запрос.', 'normal');
}

function clearAssistantImage() {
    state.assistantImageFile = null;

    if (state.assistantImagePreviewUrl) {
        URL.revokeObjectURL(state.assistantImagePreviewUrl);
        state.assistantImagePreviewUrl = '';
    }

    dom.aiImageInput.value = '';
    dom.aiImageThumb.removeAttribute('src');
    dom.aiImageName.textContent = 'Файл не выбран';
    dom.aiImagePreview.classList.add('d-none');
    setAssistantStatus('AI-ассистент готов к работе', 'normal');
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
        reader.readAsDataURL(file);
    });
}

function serializeChoice(choice) {
    if (!choice) return null;

    return {
        mode: choice.mode,
        distance_text: choice.distanceText,
        duration_text: choice.durationText,
        adjusted_duration_text: choice.mode === 'auto' ? formatDuration(choice.adjustedSeconds) : choice.durationText,
        eta_text: choice.etaText,
        score: Math.round(choice.score || 0),
        meters: choice.meters,
        seconds: choice.seconds,
        traffic_delay_minutes: choice.trafficProfile?.delayMinutes || 0,
        traffic_level: choice.trafficProfile?.label || 'неизвестно'
    };
}


function buildUiStateSnapshot() {
    const autoChoice = getActiveChoice('auto');
    const pedestrianChoice = getActiveChoice('pedestrian');

    const hasPointsAB = !!(state.points.A && state.points.B);
    const hasAutoRoute = !!state.routes.auto && !!autoChoice;
    const hasPedestrianRoute = !!state.routes.pedestrian && !!pedestrianChoice;

    const autoAlternativesCount = Array.isArray(state.choices.auto) ? state.choices.auto.length : 0;
    const pedestrianAlternativesCount = Array.isArray(state.choices.pedestrian) ? state.choices.pedestrian.length : 0;

    const currentModeChoices = state.mode === 'auto' ? state.choices.auto : state.choices.pedestrian;
    const hasCurrentModeRoute = state.mode === 'auto' ? hasAutoRoute : hasPedestrianRoute;

    return {
        active_panel: state.activePanel,
        available_panels: ['result', 'insights', 'alternatives'],
        available_modes: ['auto', 'pedestrian'],

        current_mode: state.mode,
        current_mode_label: state.mode === 'auto' ? 'авто' : 'пешком',

        current_goal: getSelectedGoal(),
        current_goal_label: getSelectedGoalLabel(),

        traffic_enabled: !!dom.trafficOverlayToggle.checked,
        multiroute_enabled: !!dom.multirouteToggle.checked,

        has_points_a_b: hasPointsAB,
        has_auto_route: hasAutoRoute,
        has_pedestrian_route: hasPedestrianRoute,
        has_any_route: hasAutoRoute || hasPedestrianRoute,

        auto_alternatives_count: autoAlternativesCount,
        pedestrian_alternatives_count: pedestrianAlternativesCount,

        can_build_routes: hasPointsAB,
        can_clear_route: hasPointsAB || hasAutoRoute || hasPedestrianRoute,
        can_toggle_traffic: true,

        can_apply_optimal_auto: autoAlternativesCount > 0 && hasAutoRoute,
        can_apply_optimal_pedestrian: pedestrianAlternativesCount > 0 && hasPedestrianRoute,
        can_apply_optimal_current_mode: currentModeChoices.length > 0 && hasCurrentModeRoute,

        can_select_alternative_auto: autoAlternativesCount > 0,
        can_select_alternative_pedestrian: pedestrianAlternativesCount > 0,
        can_select_alternative_current_mode: currentModeChoices.length > 0,

        footer_route_status: dom.footerRouteStatus.textContent,
        footer_last_mile: dom.footerLastMile.textContent,
        footer_traffic: dom.footerTraffic.textContent,
        summary_status: dom.summaryChipStatus.textContent
    };
}

function buildAssistantContext() {
    const autoChoice = getActiveChoice('auto');
    const walkChoice = getActiveChoice('pedestrian');
    const comparison = buildRouteComparison(
        asComparisonRoute(autoChoice),
        asComparisonRoute(walkChoice),
        getSelectedGoal()
    );
    const currentTraffic = trafficState(
        dom.trafficOverlayToggle.checked,
        autoChoice?.adjustedSeconds || autoChoice?.seconds || 0
    );

    const uiState = buildUiStateSnapshot();

    return {
        mode: state.mode,
        goal: getSelectedGoal(),
        goal_label: getSelectedGoalLabel(),

        traffic_enabled: !!dom.trafficOverlayToggle.checked,
        multiroute_enabled: !!dom.multirouteToggle.checked,

        points: {
            A: state.points.A,
            B: state.points.B
        },

        active_panel: state.activePanel,

        active_auto_route: serializeChoice(autoChoice),
        active_pedestrian_route: serializeChoice(walkChoice),

        auto_alternatives: state.choices.auto.map(choice => serializeChoice(choice)),
        pedestrian_alternatives: state.choices.pedestrian.map(choice => serializeChoice(choice)),

        recommendation: comparison.recommendation,
        last_mile: comparison.lastMile,
        traffic_label: currentTraffic.label,

        footer_route_status: dom.footerRouteStatus.textContent,
        footer_last_mile: dom.footerLastMile.textContent,
        footer_traffic: dom.footerTraffic.textContent,

        ui_state: uiState
    };
}


function toAssistantBool(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;

    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;

    return ['true', '1', 'yes', 'y', 'да'].includes(normalized);
}

function normalizeAssistantActions(actions) {
    if (Array.isArray(actions)) {
        return actions.filter(item => item && typeof item === 'object');
    }

    if (typeof actions === 'string') {
        try {
            const parsed = JSON.parse(actions);
            return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
        } catch (_) {
            return [];
        }
    }

    return [];
}

function assistantActionLabel(action) {
    const type = String(action?.type || '').trim();

    switch (type) {
        case 'switch_mode':
            return `переключение режима на ${action.mode === 'pedestrian' ? 'пешком' : 'авто'}`;
        case 'set_panel':
            return `открытие вкладки ${action.panel || 'интерфейса'}`;
        case 'build_routes':
            return 'построение маршрутов';
        case 'apply_optimal_route':
            return `применение оптимального маршрута (${action.mode || state.mode})`;
        case 'select_alternative':
            return `выбор альтернативы №${Number(action.index) + 1}`;
        case 'toggle_traffic':
            return `${toAssistantBool(action.enabled) ? 'включение' : 'выключение'} пробок`;
        case 'clear_route':
            return 'очистка маршрута';
        default:
            return `действие ${type || 'unknown'}`;
    }
}


function captureAssistantExecutionState() {
    const autoActive = getActiveChoice('auto');
    const pedestrianActive = getActiveChoice('pedestrian');
    const uiState = buildUiStateSnapshot();

    return {
        ...uiState,
        active_auto_index: Number.isInteger(autoActive?.index) ? autoActive.index : null,
        active_pedestrian_index: Number.isInteger(pedestrianActive?.index) ? pedestrianActive.index : null
    };
}

function getBestChoiceIndex(mode) {
    const choices = Array.isArray(state.choices[mode]) ? [...state.choices[mode]] : [];
    if (!choices.length) return null;

    const best = choices.sort((a, b) => a.score - b.score)[0];
    return Number.isInteger(best?.index) ? best.index : null;
}

function panelHumanLabel(panel) {
    switch (panel) {
        case 'result': return 'результат';
        case 'insights': return 'аналитика';
        case 'alternatives': return 'альтернативы';
        default: return panel || 'интерфейс';
    }
}

function modeHumanLabel(mode) {
    return mode === 'pedestrian' ? 'пешком' : 'авто';
}

function verifyAssistantAction(action, beforeState, afterState) {
    const type = String(action?.type || '').trim();

    switch (type) {
        case 'switch_mode': {
            const expectedMode = String(action.mode || '').trim();

            if (afterState.current_mode !== expectedMode) {
                throw new Error(`режим не переключился на ${expectedMode}`);
            }

            if (!afterState.has_any_route) {
                return `Режим интерфейса переключен на ${modeHumanLabel(expectedMode)}, но маршрут еще не построен.`;
            }

            if (beforeState.current_mode === expectedMode) {
                return `Режим уже был ${modeHumanLabel(expectedMode)}.`;
            }

            return `Режим переключен на ${modeHumanLabel(expectedMode)}.`;
        }

        case 'set_panel': {
            const expectedPanel = String(action.panel || '').trim();

            if (afterState.active_panel !== expectedPanel) {
                throw new Error(`вкладка ${expectedPanel} не открылась`);
            }

            return beforeState.active_panel === expectedPanel
                ? `Вкладка «${panelHumanLabel(expectedPanel)}» уже была открыта.`
                : `Открыта вкладка «${panelHumanLabel(expectedPanel)}».`;
        }

        case 'build_routes': {
            if (!afterState.has_any_route || !afterState.has_auto_route || !afterState.has_pedestrian_route) {
                throw new Error('интерфейс не подтвердил построение авто и пешего маршрутов');
            }
            return 'Маршруты построены и подтверждены интерфейсом.';
        }

        case 'apply_optimal_route': {
            const mode = String(action.mode || state.mode || 'auto').trim();
            const bestIndex = getBestChoiceIndex(mode);
            const actualIndex = mode === 'auto' ? afterState.active_auto_index : afterState.active_pedestrian_index;

            if (bestIndex === null) {
                throw new Error(`для режима ${mode} нет альтернатив для проверки`);
            }

            if (actualIndex !== bestIndex) {
                throw new Error(`активный маршрут не совпал с оптимальным (#${bestIndex + 1})`);
            }

            return `Оптимальный маршрут применен для режима ${modeHumanLabel(mode)}.`;
        }

        case 'select_alternative': {
            const mode = String(action.mode || state.mode || 'auto').trim();
            const expectedIndex = Number(action.index);
            const actualIndex = mode === 'auto' ? afterState.active_auto_index : afterState.active_pedestrian_index;

            if (actualIndex !== expectedIndex) {
                throw new Error(`интерфейс не активировал альтернативу №${expectedIndex + 1}`);
            }

            return `Выбрана альтернатива №${expectedIndex + 1} для режима ${modeHumanLabel(mode)}.`;
        }

        case 'toggle_traffic': {
            const enabled = toAssistantBool(action.enabled);

            if (afterState.traffic_enabled !== enabled) {
                throw new Error('состояние пробок не изменилось');
            }

            return enabled ? 'Пробки включены.' : 'Пробки выключены.';
        }

        case 'clear_route': {
            if (afterState.has_points_a_b || afterState.has_any_route) {
                throw new Error('маршрут очищен не полностью');
            }
            return 'Маршрут очищен.';
        }

        default:
            throw new Error(`Неизвестный тип действия: ${type}`);
    }
}

function captureAssistantExecutionState() {
    const autoActive = getActiveChoice('auto');
    const pedestrianActive = getActiveChoice('pedestrian');
    const uiState = buildUiStateSnapshot();

    return {
        ...uiState,
        active_auto_index: Number.isInteger(autoActive?.index) ? autoActive.index : null,
        active_pedestrian_index: Number.isInteger(pedestrianActive?.index) ? pedestrianActive.index : null
    };
}

function getBestChoiceIndex(mode) {
    const choices = Array.isArray(state.choices[mode]) ? [...state.choices[mode]] : [];
    if (!choices.length) return null;

    const best = choices.sort((a, b) => a.score - b.score)[0];
    return Number.isInteger(best?.index) ? best.index : null;
}

function panelHumanLabel(panel) {
    switch (panel) {
        case 'result':
            return 'результат';
        case 'insights':
            return 'аналитика';
        case 'alternatives':
            return 'альтернативы';
        default:
            return panel || 'интерфейс';
    }
}

function modeHumanLabel(mode) {
    return mode === 'pedestrian' ? 'пешком' : 'авто';
}

function verifyAssistantAction(action, beforeState, afterState) {
    const type = String(action?.type || '').trim();

    switch (type) {
        case 'switch_mode': {
            const expectedMode = String(action.mode || '').trim();

            if (afterState.current_mode !== expectedMode) {
                throw new Error(`режим не переключился на ${expectedMode}`);
            }

            if (beforeState.current_mode === expectedMode) {
                return `Режим уже был ${modeHumanLabel(expectedMode)}.`;
            }

            return `Режим переключен на ${modeHumanLabel(expectedMode)}.`;
        }

        case 'set_panel': {
            const expectedPanel = String(action.panel || '').trim();

            if (afterState.active_panel !== expectedPanel) {
                throw new Error(`вкладка ${expectedPanel} не открылась`);
            }

            if (beforeState.active_panel === expectedPanel) {
                return `Вкладка «${panelHumanLabel(expectedPanel)}» уже была открыта.`;
            }

            return `Открыта вкладка «${panelHumanLabel(expectedPanel)}».`;
        }

        case 'build_routes': {
            if (!afterState.has_any_route || !afterState.has_auto_route || !afterState.has_pedestrian_route) {
                throw new Error('после выполнения интерфейс не подтвердил готовность авто и пешего маршрутов');
            }

            return 'Маршруты построены и подтверждены интерфейсом.';
        }

        case 'apply_optimal_route': {
            const mode = String(action.mode || state.mode || 'auto').trim();
            const bestIndex = getBestChoiceIndex(mode);
            const actualIndex = mode === 'auto' ? afterState.active_auto_index : afterState.active_pedestrian_index;
            const beforeIndex = mode === 'auto' ? beforeState.active_auto_index : beforeState.active_pedestrian_index;

            if (bestIndex === null) {
                throw new Error(`для режима ${mode} нет альтернатив для проверки оптимального маршрута`);
            }

            if (actualIndex !== bestIndex) {
                throw new Error(`активный маршрут не совпал с оптимальным (#${bestIndex + 1})`);
            }

            if (beforeIndex === bestIndex) {
                return `Оптимальный маршрут для режима ${modeHumanLabel(mode)} уже был активен.`;
            }

            return `Оптимальный маршрут применен для режима ${modeHumanLabel(mode)}.`;
        }

        case 'select_alternative': {
            const mode = String(action.mode || state.mode || 'auto').trim();
            const expectedIndex = Number(action.index);
            const actualIndex = mode === 'auto' ? afterState.active_auto_index : afterState.active_pedestrian_index;
            const beforeIndex = mode === 'auto' ? beforeState.active_auto_index : beforeState.active_pedestrian_index;

            if (!Number.isInteger(expectedIndex) || expectedIndex < 0) {
                throw new Error('некорректный индекс альтернативы для проверки');
            }

            if (actualIndex !== expectedIndex) {
                throw new Error(`интерфейс не активировал альтернативу №${expectedIndex + 1}`);
            }

            if (beforeIndex === expectedIndex) {
                return `Альтернатива №${expectedIndex + 1} уже была активной для режима ${modeHumanLabel(mode)}.`;
            }

            return `Выбрана альтернатива №${expectedIndex + 1} для режима ${modeHumanLabel(mode)}.`;
        }

        case 'toggle_traffic': {
            const enabled = toAssistantBool(action.enabled);

            if (afterState.traffic_enabled !== enabled) {
                throw new Error(`состояние пробок осталось ${afterState.traffic_enabled ? 'включенным' : 'выключенным'}`);
            }

            if (beforeState.traffic_enabled === enabled) {
                return enabled ? 'Пробки уже были включены.' : 'Пробки уже были выключены.';
            }

            return enabled ? 'Пробки включены.' : 'Пробки выключены.';
        }

        case 'clear_route': {
            if (afterState.has_points_a_b || afterState.has_any_route || afterState.footer_route_status !== 'Нет активного маршрута') {
                throw new Error('интерфейс не очистил маршрут полностью');
            }

            if (!beforeState.has_points_a_b && !beforeState.has_any_route) {
                return 'Маршрут уже был очищен.';
            }

            return 'Маршрут очищен.';
        }

        default:
            throw new Error(`Неизвестный тип действия для проверки: ${type || 'unknown'}`);
    }
}

function shouldConfirmAssistantActions(actions, forceConfirmation = false) {
    if (forceConfirmation) return true;
    return actions.some(action => ASSISTANT_CONFIRM_ACTIONS.has(String(action?.type || '').trim()));
}

async function executeAssistantAction(action) {
    const type = String(action?.type || '').trim();

    if (!ASSISTANT_UI_ACTIONS.includes(type)) {
        throw new Error(`Неподдерживаемое действие ассистента: ${type || 'unknown'}`);
    }

    const beforeState = captureAssistantExecutionState();

    switch (type) {
        case 'switch_mode': {
            const mode = String(action.mode || '').trim();
            if (!ASSISTANT_ALLOWED_MODES.has(mode)) {
                throw new Error(`Недопустимый режим: ${mode || 'не указан'}`);
            }

            switchMode(mode);
            break;
        }

        case 'set_panel': {
            const panel = String(action.panel || '').trim();
            if (!ASSISTANT_ALLOWED_PANELS.has(panel)) {
                throw new Error(`Недопустимая вкладка: ${panel || 'не указана'}`);
            }

            setPanel(panel);
            break;
        }

        case 'build_routes': {
            if (!state.points.A || !state.points.B) {
                throw new Error('Чтобы построить маршрут, укажите пункты отправления и назначения на карте.');
            }

            await buildRoutes();
            break;
        }

        case 'apply_optimal_route': {
            const mode = String(action.mode || state.mode || 'auto').trim();

            if (!ASSISTANT_ALLOWED_MODES.has(mode)) {
                throw new Error(`Недопустимый режим для оптимального маршрута: ${mode}`);
            }

            if (!state.routes[mode] || !state.choices[mode]?.length) {
                throw new Error(`Нет готовых маршрутов для режима ${mode}. Сначала постройте маршрут.`);
            }

            const best = applyOptimalRoute(mode, false);
            if (!best) {
                throw new Error(`Не удалось применить оптимальный маршрут для режима ${mode}.`);
            }
            break;
        }

        case 'select_alternative': {
            const mode = String(action.mode || state.mode || 'auto').trim();
            const index = Number(action.index);

            if (!ASSISTANT_ALLOWED_MODES.has(mode)) {
                throw new Error(`Недопустимый режим для выбора альтернативы: ${mode}`);
            }

            if (!Number.isInteger(index) || index < 0) {
                throw new Error('Некорректный индекс альтернативы.');
            }

            if (!state.choices[mode]?.length) {
                throw new Error(`Для режима ${mode} нет альтернатив.`);
            }

            const exists = state.choices[mode].some(item => item.index === index);
            if (!exists) {
                throw new Error(`Альтернатива №${index + 1} недоступна.`);
            }

            const selected = selectAlternative(index, mode, false);
            if (!selected) {
                throw new Error(`Не удалось активировать альтернативу №${index + 1}.`);
            }
            break;
        }

        case 'toggle_traffic': {
            const enabled = toAssistantBool(action.enabled);
            dom.trafficOverlayToggle.checked = enabled;
            onTrafficToggle();
            break;
        }

        case 'clear_route': {
            clearAll();
            break;
        }

        default:
            throw new Error(`Необработанное действие: ${type}`);
    }

    const afterState = captureAssistantExecutionState();
    return verifyAssistantAction(action, beforeState, afterState);
}

async function runAssistantActions(actions, options = {}) {
    const normalizedActions = normalizeAssistantActions(actions);
    if (!normalizedActions.length) return [];

    const needsConfirmation = shouldConfirmAssistantActions(
        normalizedActions,
        toAssistantBool(options.needsConfirmation)
    );

    if (needsConfirmation) {
        const summary = normalizedActions.map(action => `• ${assistantActionLabel(action)}`).join('\n');
        const confirmed = window.confirm(
            `Ассистент хочет выполнить действия:\n\n${summary}\n\nПродолжить?`
        );

        if (!confirmed) {
            addChat('ai', 'Действия отменены пользователем.');
            return [];
        }
    }

    const results = [];

    for (const action of normalizedActions) {
        try {
            const result = await executeAssistantAction(action);
            results.push(result);
        } catch (error) {
            const label = assistantActionLabel(action);
            throw new Error(`Не удалось выполнить действие «${label}»: ${error?.message || 'неизвестная ошибка'}`);
        }
    }

    return results;
}


function setAssistantBusy(isBusy) {
    state.assistantBusy = isBusy;
    dom.btnAiAsk.disabled = isBusy;
    dom.aiInput.disabled = isBusy;
    dom.aiImageInput.disabled = isBusy;
}

async function onAiAsk() {
    const text = dom.aiInput.value.trim();
    const hasImage = !!state.assistantImageFile;

    if (!text && !hasImage) {
        setAssistantStatus('Введите вопрос или прикрепите скриншот.', 'error');
        return;
    }

    if (state.assistantBusy) return;

    const requestId = makeAssistantRequestId();
    const startedAt = Date.now();

    addChat('user', text || '📷 Пользователь отправил скриншот.');

    setAssistantBusy(true);
    setAssistantStatus(`Ассистент обрабатывает запрос... request_id: ${requestId}`, 'busy');
    clearAssistantDebug();

    try {
        const payload = {
            request_id: requestId,
            session_id: getOrCreateSessionId(),
            message: text,
            route_context: buildAssistantContext(),
            client_meta: {
                source: 'web-frontend',
                sent_at: new Date().toISOString(),
                turn_index: getAssistantTurnIndex(),
                is_first_turn: getAssistantTurnIndex() === 1,
                page_path: window.location.pathname,
                user_agent: navigator.userAgent
            },
            allow_ui_actions: true,
            ui_capabilities: ASSISTANT_UI_ACTIONS,
            frontend_version: 'v2-actions-stage1'
        };

        if (hasImage) {
            payload.image_base64 = await fileToBase64(state.assistantImageFile);
            payload.image_name = state.assistantImageFile.name;
            payload.image_mime = state.assistantImageFile.type || 'image/png';
        }

        logAssistantDebug('frontend_payload', requestId, buildDebugPayloadPreview(payload));

        const response = await fetch('/api/assistant/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({
            ok: false,
            error: 'Сервер вернул некорректный JSON.',
            request_id: requestId
        }));

        logAssistantDebug('backend_response', requestId, data);

        if (!response.ok || !data.ok) {
            const message = data.error || 'Не удалось получить ответ ассистента.';
            renderAssistantDebug(data.debug || {
                request_id: data.request_id || requestId,
                backend: {
                    frontend_elapsed_ms: Date.now() - startedAt,
                    response_ok: response.ok,
                    status_code: response.status
                },
                raw: data
            });
            throw new Error(message);
        }


        const mergedDebug = {
            ...(data.debug || {}),
            request_id: data.request_id || requestId,
            intent: data.intent || data.debug?.intent || '',
            backend: {
                ...(data.debug?.backend || {}),
                frontend_elapsed_ms: Date.now() - startedAt,
                response_status: response.status
            }
        };

        renderAssistantDebug(mergedDebug);

        const answer = String(data.answer || '').trim() || 'Ассистент не вернул текст ответа.';

        const actionResults = await runAssistantActions(data.actions, {
            needsConfirmation: data.needs_confirmation,
            uiComment: data.ui_comment
        });

        if (actionResults.length) {
            addChat('ai', `${answer}\n\nПодтверждено интерфейсом:\n${actionResults.join('\n')}`);
        } else {
            addChat('ai', answer);
        }

        dom.aiInput.value = '';
        clearAssistantImage();
        incrementAssistantTurnIndex();

        setAssistantStatus(
            actionResults.length
                ? `Ответ получен, действия выполнены. request_id: ${data.request_id || requestId}`
                : `Ответ получен. request_id: ${data.request_id || requestId}`,
            'normal'
        );
    } catch (error) {
        const message = error?.message || 'Ошибка связи с backend-ассистентом.';
        addChat('ai', `⚠️ ${message}`);
        setAssistantStatus(`Ошибка. request_id: ${requestId}. ${message}`, 'error');

        logAssistantDebug('frontend_error', requestId, {
            message,
            elapsed_ms: Date.now() - startedAt
        });
    } finally {
        setAssistantBusy(false);
    }
}

function buildBestAnswer(bestAuto, bestWalk) {
    const parts = [];
    if (bestAuto) parts.push(`Лучший авто-вариант: ${formatDuration(bestAuto.adjustedSeconds)}, ${bestAuto.distanceText}, ETA ${bestAuto.etaText}.`);
    if (bestWalk) parts.push(`Лучший пеший вариант: ${bestWalk.durationText}, ${bestWalk.distanceText}, ETA ${bestWalk.etaText}.`);
    return parts.join(' ') || 'Сначала постройте маршрут, чтобы я выбрал лучший вариант.';
}

function addChat(role, text) {
    const cls = role === 'user' ? 'user-message' : 'ai-message';
    dom.aiChat.insertAdjacentHTML('beforeend', `<div class="chat-message ${cls}"><strong>${role === 'user' ? 'Пользователь' : 'AI-помощник'}</strong><span>${escapeHtml(text)}</span></div>`);
    dom.aiChat.scrollTop = dom.aiChat.scrollHeight;
}

function resetRoutes(hard = true) {
    if (state.shownRoute) {
        try { state.map.geoObjects.remove(state.shownRoute); } catch (_) {}
    }

    ['auto', 'pedestrian'].forEach(mode => {
        if (state.routes[mode]) {
            try { state.routes[mode].model.destroy(); } catch (_) {}
        }
        state.routes[mode] = null;
        state.choices[mode] = [];
        state.activeChoiceIndex[mode] = null;
    });

    state.shownRoute = null;

    if (hard) {
        ['A', 'B'].forEach(key => {
            state.points[key] = null;
            const input = key === 'A' ? dom.routeStart : dom.routeEnd;
            input.value = '';
            if (state.placemarks[key]) {
                try { state.map.geoObjects.remove(state.placemarks[key]); } catch (_) {}
            }
            state.placemarks[key] = null;
        });
    }
}

function clearAll() {
    resetRoutes(true);
    state.activeChoiceIndex.auto = null;
    state.activeChoiceIndex.pedestrian = null;
    dom.searchPlace.value = '';
    dom.selectedPointsInfo.textContent = 'Пункты отправления и назначения не указаны.';
    dom.footerRouteStatus.textContent = 'Нет активного маршрута';
    dom.footerLastMile.textContent = 'Нет данных';
    setStatus('ожидание маршрута');
    refreshUi();
}

function tick() {
    dom.currentTimeDisplay.textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function setStatus(text) {
    dom.summaryChipStatus.textContent = `Статус: ${text}`;
}

function fail(text) {
    addChat('ai', `⚠️ ${text}`);
    setAssistantStatus(text, 'error');
}

function routeMetrics(route) {
    if (!route) return { meters: 0, seconds: 0, distanceText: '—', durationText: '—' };
    const distance = route.properties?.get?.('distance');
    const duration = route.properties?.get?.('duration');
    const meters = Number(distance?.value || 0);
    const seconds = Number(duration?.value || 0);
    return {
        meters,
        seconds,
        distanceText: distance?.text || (meters ? `${(meters / 1000).toFixed(1)} км` : '—'),
        durationText: duration?.text || formatDuration(seconds)
    };
}

function trafficState(enabled, autoSeconds = 0) {
    if (!enabled) return { ...getTrafficState(), label: 'отключены', delayMinutes: 0, delayText: 'Слой пробок выключен' };
    const base = getTrafficState();
    const delayMinutes = Math.max(base.baseDelayMinutes || 0, autoSeconds ? Math.round(autoSeconds / 900) : 0);
    return { ...base, delayMinutes, delayText: delayMinutes ? `+${delayMinutes} мин` : 'без задержки' };
}

function chooseRecommendation(goal, autoChoice, walkChoice) {
    return buildRouteComparison(asComparisonRoute(autoChoice), asComparisonRoute(walkChoice), goal).recommendation;
}

function formatArrival(seconds) {
    return calculateArrivalLabel(seconds || 0);
}

function formatDuration(seconds) {
    if (!seconds) return '—';
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
}

function formatCoords([lat, lon]) {
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function outerMask(bounds) {
    const [[s, w], [n, e]] = bounds;
    return [[s - 0.03, w - 0.03], [n + 0.03, w - 0.03], [n + 0.03, e + 0.03], [s - 0.03, e + 0.03], [s - 0.03, w - 0.03]];
}

function pinLayout(className, text) {
    return ymaps.templateLayoutFactory.createClass(`<div class="${className}">${text}<span class="map-marker__pulse"></span></div>`);
}

function fuzzyScore(query, source) {
    const text = normalizeText(source);
    if (!query || !text) return 0;
    if (text.startsWith(query)) return 100 - Math.abs(text.length - query.length);
    if (text.includes(query)) return 70 - Math.abs(text.indexOf(query));

    let qi = 0;
    let streak = 0;
    for (const ch of text) {
        if (ch === query[qi]) {
            qi += 1;
            streak += 1;
            if (qi === query.length) return 30 + streak;
        }
    }
    return 0;
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9\s-]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toCamel(id) {
    return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
