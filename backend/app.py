"""Flask-бэкенд для MADI Mobility AI.

Назначение:
1. Раздача статических файлов фронтенда.
2. Возврат рабочего контура Одинцово для ограничения карты.
3. Выдача feature-flags под коммерческое развитие (PRO / n8n).
4. Backend-прослойка для ассистента: фронтенд -> Flask -> n8n/Ollama.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from threading import Lock
from time import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / 'frontend'

DEBUG_MODE = os.getenv('FLASK_ENV', 'development') == 'development'
ASSISTANT_DEBUG = os.getenv('ASSISTANT_DEBUG', 'true').lower() == 'true'
PORT = int(os.getenv('FLASK_PORT', '5000'))

ASSISTANT_ENABLED = os.getenv('ASSISTANT_ENABLED', 'true').lower() == 'true'
ASSISTANT_MOCK_MODE = os.getenv('ASSISTANT_MOCK_MODE', 'true').lower() == 'true'
N8N_WEBHOOK_URL = os.getenv('N8N_WEBHOOK_URL', '').strip()
N8N_TIMEOUT_SECONDS = int(os.getenv('N8N_TIMEOUT_SECONDS', '60'))
N8N_SHARED_TOKEN = os.getenv('N8N_SHARED_TOKEN', '').strip()

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path='')
CORS(app)

# ============================================================================
# РАБОЧАЯ ГРАНИЦА ОДИНЦОВО
# ============================================================================
ODINTSOVO_WORKING_BOUNDARY = [
    [55.6908, 37.2635],
    [55.6917, 37.2725],
    [55.6910, 37.2845],
    [55.6887, 37.2985],
    [55.6840, 37.3070],
    [55.6765, 37.3090],
    [55.6690, 37.3045],
    [55.6650, 37.2950],
    [55.6645, 37.2820],
    [55.6668, 37.2688],
    [55.6725, 37.2612],
    [55.6825, 37.2598],
    [55.6908, 37.2635],
]

FEATURE_FLAGS = {
    'multi_route_preview_enabled': True,
    'multi_route_future_premium': True,
    'traffic_overlay_enabled': True,
    'n8n_assistant_ready': bool(N8N_WEBHOOK_URL),
    'llm_agent_enabled': ASSISTANT_ENABLED,
    'assistant_mock_mode': ASSISTANT_MOCK_MODE,
}
PRESENCE_TTL_SECONDS = int(os.getenv('PRESENCE_TTL_SECONDS', '30'))

presence_lock = Lock()
presence_sessions: dict[str, float] = {}

# ============================================================================
# ТЕХНИЧЕСКИЕ УТИЛИТЫ
# ============================================================================
def calculate_bounds(points: list[list[float]]) -> list[list[float]]:
    """Минимальный bounding box для рабочего полигона."""
    lats = [point[0] for point in points]
    lons = [point[1] for point in points]
    return [[min(lats), min(lons)], [max(lats), max(lons)]]

def utc_now_iso() -> str:
    """UTC timestamp в ISO-формате для debug и корреляции запросов."""
    return datetime.now(timezone.utc).isoformat()

def cleanup_presence(now_ts: float | None = None) -> int:
    """Удаляет неактивные presence-сессии и возвращает текущее онлайн-количество."""
    current_ts = now_ts if now_ts is not None else time()
    expired_ids = [
        session_id
        for session_id, last_seen_ts in presence_sessions.items()
        if current_ts - last_seen_ts > PRESENCE_TTL_SECONDS
    ]

    for session_id in expired_ids:
        presence_sessions.pop(session_id, None)

    return len(presence_sessions)


def ensure_request_id(payload: dict) -> str:
    """Возвращает request_id из frontend или генерирует новый."""
    raw = str((payload or {}).get('request_id') or '').strip()
    return raw or f'req-{uuid.uuid4()}'


def safe_json_loads(value, fallback):
    """Безопасно парсит JSON-строку в dict/list."""
    if isinstance(value, (dict, list)):
        return value

    if not isinstance(value, str):
        return fallback

    raw = value.strip()
    if not raw:
        return fallback

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return fallback


def sanitize_debug_payload(payload: dict) -> dict:
    """Убирает из debug тяжелые или шумные поля."""
    prepared = dict(payload or {})

    if prepared.get('image_base64'):
        prepared['image_base64'] = f"[omitted:{len(str(prepared['image_base64']))} chars]"

    return prepared


def build_debug_bundle(request_id: str, prepared_payload: dict, normalized: dict, n8n_result: dict) -> dict:
    """Собирает единый debug-пакет для frontend."""
    return {
        'request_id': request_id,
        'intent': normalized.get('intent', ''),
        'resolved_response_mode': str(n8n_result.get('resolved_response_mode') or '').strip(),
        'context_summary': safe_json_loads(n8n_result.get('debug_context_summary'), {}),
        'classifier': safe_json_loads(n8n_result.get('classifier_debug'), {}),
        'resolver': safe_json_loads(n8n_result.get('resolver_debug'), {}),
        'backend': {
            'gateway': 'flask',
            'received_at_utc': utc_now_iso(),
            'frontend_version': prepared_payload.get('frontend_version'),
            'session_id': prepared_payload.get('session_id'),
            'has_image': bool(prepared_payload.get('image_base64')),
            'used_route_context': bool(prepared_payload.get('route_context')),
        },
        'raw': n8n_result if ASSISTANT_DEBUG else {},
    }

def build_mock_answer(payload: dict) -> dict:
    """Временный mock-ответ, пока n8n еще не подключен окончательно."""
    message = str(payload.get('message') or '').strip()
    image_present = bool(payload.get('image_base64'))
    route_context = payload.get('route_context') or {}

    if image_present and message:
        answer = (
            'Mock-режим: сервер получил и текст, и изображение. '
            'На следующем этапе этот запрос будет уходить в n8n/Ollama.'
        )
    elif image_present:
        answer = (
            'Mock-режим: сервер получил изображение. '
            'На следующем этапе ассистент будет анализировать скриншот маршрута и местности.'
        )
    elif message:
        mode = route_context.get('mode', 'не указан')
        goal = route_context.get('goal', 'не указана')
        answer = (
            f'Mock-режим: сервер получил текстовый вопрос. '
            f'Текущий режим: {mode}. Цель оптимизации: {goal}.'
        )
    else:
        answer = 'Mock-режим: запрос пустой. Передайте message, image_base64 или оба поля.'

    return {
        'ok': True,
        'answer': answer,
        'source': 'mock',
        'request_id': str(payload.get('request_id') or '').strip(),
        'has_image': image_present,
        'used_route_context': bool(route_context),
    }


def validate_assistant_payload(payload: dict) -> tuple[bool, str]:
    """Проверка входного payload от фронтенда."""
    if not isinstance(payload, dict):
        return False, 'Некорректный формат запроса: ожидается JSON-объект.'

    message = str(payload.get('message') or '').strip()
    image_base64 = str(payload.get('image_base64') or '').strip()

    if not message and not image_base64:
        return False, 'Нужно передать message, image_base64 или оба поля.'

    route_context = payload.get('route_context')
    if route_context is not None and not isinstance(route_context, dict):
        return False, 'Поле route_context должно быть JSON-объектом.'

    return True, ''


def build_n8n_payload(payload: dict) -> dict:
    """Подготовка данных для отправки в n8n."""
    return {
        'request_id': str(payload.get('request_id') or '').strip(),
        'session_id': str(payload.get('session_id') or '').strip(),
        'message': str(payload.get('message') or '').strip(),
        'image_base64': str(payload.get('image_base64') or '').strip(),
        'image_name': str(payload.get('image_name') or '').strip(),
        'image_mime': str(payload.get('image_mime') or '').strip(),
        'route_context': payload.get('route_context') or {},
        'client_meta': payload.get('client_meta') or {},
        'allow_ui_actions': bool(payload.get('allow_ui_actions', True)),
        'ui_capabilities': payload.get('ui_capabilities') or [
            'switch_mode',
            'set_panel',
            'build_routes',
            'apply_optimal_route',
            'select_alternative',
            'toggle_traffic',
            'clear_route',
        ],
        'frontend_version': str(payload.get('frontend_version') or 'v1'),
    }


def to_bool(value) -> bool:
    """Безопасное преобразование произвольного значения в bool."""
    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return value != 0

    normalized = str(value or '').strip().lower()
    if not normalized:
        return False

    return normalized in {'true', '1', 'yes', 'y', 'да'}


def normalize_actions(value) -> list[dict]:
    """Гарантированно возвращает список действий."""
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []

        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]

    return []


def normalize_assistant_response(n8n_result: dict) -> dict:
    """Нормализует ответ n8n к единому контракту для фронтенда."""
    if not isinstance(n8n_result, dict):
        n8n_result = {}

    answer = str(
        n8n_result.get('answer')
        or n8n_result.get('output')
        or ''
    ).strip()

    if not answer:
        answer = 'Ассистент не вернул текст ответа.'

    normalized = {
        'request_id': str(n8n_result.get('request_id') or '').strip(),
        'answer': answer,
        'intent': str(n8n_result.get('intent') or 'route_consulting').strip() or 'route_consulting',
        'confidence': str(n8n_result.get('confidence') or 'средняя').strip() or 'средняя',
        'limitations': str(n8n_result.get('limitations') or '').strip(),
        'needs_confirmation': to_bool(n8n_result.get('needs_confirmation')),
        'actions': normalize_actions(n8n_result.get('actions')),
        'ui_comment': str(n8n_result.get('ui_comment') or '').strip(),
        'resolved_response_mode': str(n8n_result.get('resolved_response_mode') or '').strip(),
    }

    return normalized


def send_to_n8n(payload: dict) -> dict:
    """Синхронный вызов n8n webhook."""
    if not N8N_WEBHOOK_URL:
        raise RuntimeError('Не задан N8N_WEBHOOK_URL.')

    headers = {
        'Content-Type': 'application/json',
    }

    if N8N_SHARED_TOKEN:
        headers['X-Assistant-Token'] = N8N_SHARED_TOKEN

    response = requests.post(
        N8N_WEBHOOK_URL,
        json=payload,
        headers=headers,
        timeout=N8N_TIMEOUT_SECONDS,
    )

    response.raise_for_status()

    data = response.json()

    if not isinstance(data, dict):
        raise RuntimeError('n8n вернул неожиданный формат ответа.')

    return data


# ============================================================================
# РОУТЫ
# ============================================================================
@app.route('/')
def index():
    """Главная страница SPA/статического фронтенда."""
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.route('/<path:path>')
def static_files(path: str):
    """Раздача клиентских файлов: css, js, assets и т.д."""
    return send_from_directory(FRONTEND_DIR, path)


@app.route('/api/health')
def health():
    """Health-check для локального запуска и демонстрации."""
    return jsonify({
        'status': 'ok',
        'service': 'madi-mobility-ai',
        'focus': 'automobile-pedestrian-optimization',
    })


@app.route('/api/assistant/health')
def assistant_health():
    """Проверка готовности backend-ассистента."""
    return jsonify({
        'status': 'ok',
        'assistant_enabled': ASSISTANT_ENABLED,
        'assistant_debug': ASSISTANT_DEBUG,
        'assistant_mock_mode': ASSISTANT_MOCK_MODE,
        'n8n_configured': bool(N8N_WEBHOOK_URL),
        'n8n_webhook_url_present': bool(N8N_WEBHOOK_URL),
        'timeout_seconds': N8N_TIMEOUT_SECONDS,
        'token_configured': bool(N8N_SHARED_TOKEN),
        'ui_actions_supported': True,
    })


@app.route('/api/assistant/chat', methods=['POST'])
def assistant_chat():
    """Прием запроса от фронтенда и проксирование его в n8n."""
    if not ASSISTANT_ENABLED:
        return jsonify({
            'ok': False,
            'error': 'Ассистент временно отключен на сервере.',
        }), 503

    payload = request.get_json(silent=True) or {}
    request_id = ensure_request_id(payload)
    payload['request_id'] = request_id

    is_valid, error_message = validate_assistant_payload(payload)
    if not is_valid:
        return jsonify({
            'ok': False,
            'error': error_message,
            'request_id': request_id,
        }), 400

    prepared_payload = build_n8n_payload(payload)

    if ASSISTANT_MOCK_MODE:
        mock_response = build_mock_answer(prepared_payload)

        if ASSISTANT_DEBUG:
            mock_response['debug'] = {
                'request_id': request_id,
                'backend': {
                    'gateway': 'flask',
                    'mode': 'mock',
                    'received_at_utc': utc_now_iso(),
                },
                'raw': sanitize_debug_payload(prepared_payload),
            }

        return jsonify(mock_response)

    try:
        n8n_result = send_to_n8n(prepared_payload)
        normalized = normalize_assistant_response(n8n_result)

        response_payload = {
            'ok': True,
            'request_id': normalized['request_id'] or request_id,
            'answer': normalized['answer'],
            'intent': normalized['intent'],
            'confidence': normalized['confidence'],
            'limitations': normalized['limitations'],
            'needs_confirmation': normalized['needs_confirmation'],
            'actions': normalized['actions'],
            'ui_comment': normalized['ui_comment'],
            'source': 'n8n',
            'has_image': bool(prepared_payload.get('image_base64')),
            'used_route_context': bool(prepared_payload.get('route_context')),
        }

        if ASSISTANT_DEBUG:
            response_payload['debug'] = build_debug_bundle(
                request_id=response_payload['request_id'],
                prepared_payload=prepared_payload,
                normalized=normalized,
                n8n_result=n8n_result,
            )

        if DEBUG_MODE:
            response_payload['raw'] = n8n_result

        return jsonify(response_payload)

    except requests.Timeout:
        return jsonify({
            'ok': False,
            'error': 'Превышено время ожидания ответа от n8n.',
            'request_id': request_id,
            'debug': {
                'request_id': request_id,
                'backend': {
                    'gateway': 'flask',
                    'stage': 'send_to_n8n',
                    'error_type': 'timeout',
                    'received_at_utc': utc_now_iso(),
                },
                'prepared_payload': sanitize_debug_payload(prepared_payload) if ASSISTANT_DEBUG else {},
            } if ASSISTANT_DEBUG else {},
        }), 504

    except requests.RequestException as exc:
        return jsonify({
            'ok': False,
            'error': f'Ошибка связи с n8n: {exc}',
            'request_id': request_id,
            'debug': {
                'request_id': request_id,
                'backend': {
                    'gateway': 'flask',
                    'stage': 'send_to_n8n',
                    'error_type': 'request_exception',
                    'received_at_utc': utc_now_iso(),
                },
                'prepared_payload': sanitize_debug_payload(prepared_payload) if ASSISTANT_DEBUG else {},
            } if ASSISTANT_DEBUG else {},
        }), 502

    except Exception as exc:
        return jsonify({
            'ok': False,
            'error': f'Внутренняя ошибка backend-ассистента: {exc}',
            'request_id': request_id,
            'debug': {
                'request_id': request_id,
                'backend': {
                    'gateway': 'flask',
                    'stage': 'assistant_chat',
                    'error_type': 'internal_exception',
                    'received_at_utc': utc_now_iso(),
                },
                'prepared_payload': sanitize_debug_payload(prepared_payload) if ASSISTANT_DEBUG else {},
            } if ASSISTANT_DEBUG else {},
        }), 500


@app.route('/api/odintsovo/boundary')
def odintsovo_boundary():
    """Рабочий полигон и ограничения карты."""
    return jsonify({
        'city': 'Одинцово',
        'coordinates': ODINTSOVO_WORKING_BOUNDARY,
        'bounds': calculate_bounds(ODINTSOVO_WORKING_BOUNDARY),
        'restriction_note': 'Точки и маршруты проекта должны оставаться внутри рабочего контура.',
    })


@app.route('/api/project-meta')
def project_meta():
    """Feature-flags и флаги коммерческого развития."""
    return jsonify({
        'service': 'madi-mobility-ai',
        'feature_flags': FEATURE_FLAGS,
        'assistant': {
            'enabled': ASSISTANT_ENABLED,
            'mock_mode': ASSISTANT_MOCK_MODE,
            'n8n_configured': bool(N8N_WEBHOOK_URL),
        },
        'commercial_notes': {
            'multi_route': 'Preview-функция под будущий PRO-доступ.',
            'assistant': 'Подготовлено к интеграции с n8n и внешней LLM.',
        },
    })

@app.route('/api/metrics/presence', methods=['GET', 'POST'])
def metrics_presence():
    """Простая realtime-метрика: количество активных пользователей на сайте."""
    if request.method == 'POST':
        payload = request.get_json(silent=True) or {}
        session_id = str(payload.get('session_id') or '').strip()

        if not session_id:
            return jsonify({
                'ok': False,
                'error': 'Не передан session_id.'
            }), 400

        now_ts = time()

        with presence_lock:
            presence_sessions[session_id] = now_ts
            online = cleanup_presence(now_ts)

        return jsonify({
            'ok': True,
            'online': online,
            'ttl_seconds': PRESENCE_TTL_SECONDS,
            'updated_at_utc': utc_now_iso(),
        })

    with presence_lock:
        online = cleanup_presence(time())

    return jsonify({
        'ok': True,
        'online': online,
        'ttl_seconds': PRESENCE_TTL_SECONDS,
        'updated_at_utc': utc_now_iso(),
    })
if __name__ == '__main__':
    print('=' * 64)
    print('MADI Mobility AI · optimized edition v4')
    print('Фокус: автомобильно-пешеходная мобильность внутри Одинцово')
    print('Добавлено: backend assistant gateway')
    print(f'Assistant enabled: {ASSISTANT_ENABLED}')
    print(f'Assistant mock mode: {ASSISTANT_MOCK_MODE}')
    print(f'n8n configured: {bool(N8N_WEBHOOK_URL)}')
    print(f'URL: http://localhost:{PORT}')
    print('=' * 64)
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG_MODE)