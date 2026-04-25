// ============================================================================
// frontend/js/api.js
// СЛУЖЕБНЫЕ API-УТИЛИТЫ
// ----------------------------------------------------------------------------
// 1. Конфигурация проекта
// 2. Запрос маршрутов OpenRouteService
// 3. Разбор ответа маршрута
// 4. Эвристика дорожной загрузки
// 5. Выбор оптимального маршрута и последней мили
// ============================================================================

// ============================================================================
// 1. КОНФИГУРАЦИЯ ПРОЕКТА
// ============================================================================

const API_CONFIG = {
    orsApiKey: 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImU0NDQ1ZDU5OGQwNDQ1ZmE5OTExOGFmMjI3ZjljOTMxIiwiaCI6Im11cm11cjY0In0=',
    orsBaseUrl: 'https://api.openrouteservice.org/v2/directions',
    requestTimeoutMs: 8000,
    supportedProfiles: {
        auto: 'driving-car',
        pedestrian: 'foot-walking'
    },
    productFlags: {
        multiRoutePreview: true,
        multiRoutePremiumCandidate: true,
        n8nAssistantReady: true
    }
};

const TRAFFIC_VARIANT_MODIFIERS = {
    direct: 1.15,
    north: 0.78,
    south: 0.86,
    west: 0.93,
    east: 1.02
};

// ============================================================================
// 2. ROUTING
// ============================================================================

async function getORSRoute(startCoords, endCoords, profile, viaPoints = []) {
    const start = [startCoords[1], startCoords[0]]; // ORS: [lon, lat]
    const end = [endCoords[1], endCoords[0]];
    const coordinates = [start, ...viaPoints.map(([lat, lon]) => [lon, lat]), end];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.requestTimeoutMs);

    try {
        const response = await fetch(`${API_CONFIG.orsBaseUrl}/${profile}/geojson`, {
            method: 'POST',
            headers: {
                Authorization: API_CONFIG.orsApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                coordinates,
                format: 'geojson',
                geometry_simplify: false,
                instructions: false
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ORS error: ${response.status} ${errorText}`.trim());
        }

        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('ORS timeout: превышено время ожидания ответа');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

// ============================================================================
// 3. РАЗБОР ROUTE-ОТВЕТА
// ============================================================================

function decodeORSGeoJSON(geojson) {
    const coordinates = geojson?.features?.[0]?.geometry?.coordinates;
    if (!coordinates || !Array.isArray(coordinates)) {
        return [];
    }

    return coordinates.map(([lon, lat]) => [lat, lon]);
}

function getORSRouteInfo(geojson) {
    const segment = geojson?.features?.[0]?.properties?.segments?.[0];

    return {
        distanceMeters: segment?.distance || 0,
        durationSeconds: segment?.duration || 0,
        ascent: segment?.ascent || 0,
        descent: segment?.descent || 0
    };
}

// ============================================================================
// 4. ТРАФИК И ETA
// ============================================================================

function getTrafficState(date = new Date()) {
    const hour = date.getHours();

    if ((hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20)) {
        return {
            score: 8,
            level: 'high',
            label: 'высокий',
            colorClass: 'bg-danger',
            description: 'Часы пик. Автомобильный сегмент чувствителен к потере времени.',
            baseDelayMinutes: 8
        };
    }

    if ((hour >= 11 && hour <= 16) || (hour >= 21 && hour <= 22)) {
        return {
            score: 5,
            level: 'medium',
            label: 'средний',
            colorClass: 'bg-warning text-dark',
            description: 'Средняя загрузка. Авто чаще выигрывает, но локальные перегрузы уже заметны.',
            baseDelayMinutes: 4
        };
    }

    return {
        score: 2,
        level: 'low',
        label: 'низкий',
        colorClass: 'bg-success',
        description: 'Дороги относительно свободны. Авто устойчиво по времени прибытия.',
        baseDelayMinutes: 1
    };
}

function buildTrafficProfile({
    date = new Date(),
    mode = 'auto',
    routeCoords = [],
    variantKey = 'direct'
} = {}) {
    const baseState = getTrafficState(date);

    if (mode !== 'auto') {
        return {
            ...baseState,
            delayMinutes: 0,
            corridor: 'pedestrian',
            routeRisk: 'low'
        };
    }

    const corridorPenalty = estimateCorridorPenalty(routeCoords);
    const variantModifier = TRAFFIC_VARIANT_MODIFIERS[variantKey] || 1;
    const computedDelay = Math.max(
        0,
        Math.round((baseState.baseDelayMinutes + corridorPenalty) * variantModifier)
    );

    return {
        ...baseState,
        delayMinutes: computedDelay,
        corridor: corridorPenalty >= 3 ? 'central' : 'distributed',
        routeRisk: computedDelay >= 9 ? 'high' : computedDelay >= 5 ? 'medium' : 'low'
    };
}

function estimateCorridorPenalty(routeCoords = []) {
    if (!Array.isArray(routeCoords) || routeCoords.length === 0) {
        return 0;
    }

    let penalty = 0;
    let centralHits = 0;
    let mozhaiskHits = 0;

    routeCoords.forEach(([lat, lon]) => {
        const inCentralCore = lat >= 55.674 && lat <= 55.683 && lon >= 37.272 && lon <= 37.292;
        const inMozhaiskAxis = lat >= 55.676 && lat <= 55.686 && lon >= 37.266 && lon <= 37.300;

        if (inCentralCore) {
            centralHits += 1;
        }

        if (inMozhaiskAxis) {
            mozhaiskHits += 1;
        }
    });

    if (centralHits > routeCoords.length * 0.28) {
        penalty += 3;
    }

    if (mozhaiskHits > routeCoords.length * 0.4) {
        penalty += 2;
    }

    return penalty;
}

function applyTrafficAdjustment(durationSeconds, mode, trafficProfile) {
    if (mode !== 'auto') {
        return durationSeconds;
    }

    return durationSeconds + (trafficProfile?.delayMinutes || 0) * 60;
}

function calculateArrivalLabel(durationSeconds, now = new Date()) {
    const arrival = new Date(now.getTime() + durationSeconds * 1000);
    return arrival.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function calculateAlternativeScore(route, selectedGoal = 'fastest') {
    const adjusted = route?.info?.adjustedDurationSeconds || route?.info?.durationSeconds || Number.MAX_SAFE_INTEGER;
    const trafficPenalty = (route?.trafficProfile?.delayMinutes || 0) * 60;
    const distancePenalty = route?.info?.distanceMeters || 0;

    if (selectedGoal === 'optimal') {
        return adjusted + trafficPenalty * 0.85 + distancePenalty * 0.012;
    }

    return adjusted + trafficPenalty * 0.2;
}

// ============================================================================
// 5. ПОСЛЕДНЯЯ МИЛЯ И СРАВНЕНИЕ
// ============================================================================

function estimateLastMile(distanceKm, autoMinutes, walkMinutes, trafficState) {
    if (!distanceKm) {
        return 'Недостаточно данных для оценки последней мили.';
    }

    if (distanceKm <= 1.2) {
        return 'Маршрут короткий: последнюю милю целесообразно проходить полностью пешком.';
    }

    if (distanceKm <= 2.5 && trafficState.score >= 5) {
        return 'При средней или высокой загрузке можно сократить задержки: завершайте поездку пешком на последнем участке 400–900 м.';
    }

    if (autoMinutes && walkMinutes && (walkMinutes - autoMinutes) <= 8 && trafficState.score >= 8) {
        return 'Разница во времени умеренная: в часы пик выгодно парковаться заранее и идти пешком последний сегмент.';
    }

    return 'Выраженной выгоды по последней миле нет: можно доезжать автомобилем почти до самой точки назначения.';
}

function buildRouteComparison(autoRoute, pedestrianRoute, selectedGoal) {
    const autoTraffic = autoRoute?.trafficProfile || getTrafficState();
    const autoMinutes = autoRoute ? Math.round((autoRoute.info.adjustedDurationSeconds || autoRoute.info.durationSeconds) / 60) : null;
    const walkMinutes = pedestrianRoute ? Math.round(pedestrianRoute.info.durationSeconds / 60) : null;
    const autoDistanceKm = autoRoute ? (autoRoute.info.distanceMeters / 1000) : null;
    const walkDistanceKm = pedestrianRoute ? (pedestrianRoute.info.distanceMeters / 1000) : null;

    const baselineDistance = autoDistanceKm || walkDistanceKm || 0;
    const recommendation = getRecommendation({
        autoMinutes,
        walkMinutes,
        distanceKm: baselineDistance,
        trafficState: autoTraffic,
        selectedGoal
    });

    return {
        autoMinutes,
        walkMinutes,
        autoDistanceKm,
        walkDistanceKm,
        trafficState: autoTraffic,
        recommendation,
        lastMile: estimateLastMile(baselineDistance, autoMinutes, walkMinutes, autoTraffic)
    };
}

function getRecommendation({ autoMinutes, walkMinutes, distanceKm, trafficState, selectedGoal }) {
    if (autoMinutes === null && walkMinutes === null) {
        return 'Маршрут не удалось оценить. Попробуйте перестроить его.';
    }

    if (autoMinutes === null) {
        return 'Автомобильный маршрут недоступен. Для текущего участка используйте пеший сценарий.';
    }

    if (walkMinutes === null) {
        return 'Пеший маршрут недоступен. Используйте автомобильный сценарий.';
    }

    if (selectedGoal === 'optimal') {
        if (distanceKm <= 2.0 && trafficState.score >= 5) {
            return 'Оптимальный выбор — пеший маршрут: дистанция короткая, а риск задержек на дороге заметен.';
        }

        if ((walkMinutes - autoMinutes) <= 8 && trafficState.score >= 8) {
            return 'Оптимальный выбор — комбинированный сценарий: автомобиль до удобной точки и короткий пеший участок.';
        }

        return autoMinutes <= walkMinutes
            ? 'Оптимальный выбор — автомобильный маршрут с учетом текущей дорожной обстановки.'
            : 'Оптимальный выбор — пеший маршрут.';
    }

    if (distanceKm <= 1.5) {
        return 'Быстрее и проще идти пешком: короткое плечо маршрута не требует автомобиля.';
    }

    if (trafficState.score >= 8 && (walkMinutes - autoMinutes) <= 5) {
        return 'В часы пик выигрыш автомобиля почти исчезает. Рассмотрите пеший сценарий или раннюю парковку.';
    }

    return autoMinutes <= walkMinutes
        ? 'На текущем участке быстрее использовать автомобиль.'
        : 'Пеший маршрут по времени конкурентоспособен и может быть эффективнее по фактическому прибытию.';
}
