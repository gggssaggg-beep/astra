#!/usr/bin/env python3
"""
Отправка писем входа для своего GoTrue (astra.svcode.ru).

Зачем отдельная служба. GoTrue умеет слать письма сам, но только по SMTP, а
хостинг (reg.ru) режет исходящие 25/587/465 на все хосты — обычный SMTP с этого
сервера невозможен в принципе. Зато открыт HTTPS, а у российских почтовых
сервисов есть HTTP-API. GoTrue это предусматривает: хук send_email отдаёт письмо
наружу, и мы сами решаем, чем его слать.

Почему российский сервис, а не Mailgun/SendGrid: адрес человека — персональные
данные, и слать их на зарубежный сервер значит вывозить данные за границу, ровно
то, от чего мы уезжали (152-ФЗ). Из открытого на этом хосте зарубежное как раз
доступно, а российское — только по HTTPS, отсюда и API.

В письме — ШЕСТИЗНАЧНЫЙ КОД, а не ссылка. Ссылка возвращает в браузер, а
приложение на телефоне живёт по адресу https://localhost и поймать возврат не
может; код человек просто перепечатывает, и веб с APK ведут себя одинаково.

Настройки — /etc/astra-mailhook.env (в репозитории ключей нет):
    MAIL_API_KEY   ключ Unisender Go (пусто → письмо только пишется в журнал)
    MAIL_FROM      адрес отправителя, домен должен быть подтверждён DKIM/SPF
    MAIL_FROM_NAME имя отправителя
    HOOK_SECRET    общий секрет с GoTrue: v1,whsec_<base64>
    LISTEN_PORT    по умолчанию 9910, только 127.0.0.1
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

API_URL = 'https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json'
MAX_BODY = 256 * 1024

log = logging.getLogger('mailhook')

# Тексты писем. Ключ — email_action_type от GoTrue. Интерфейс приложения на «ты»,
# письма тоже. Ссылок внутри нет: только код, который человек перепечатает.
LETTERS = {
    'recovery': (
        'Восстановление пароля — Astra',
        'Ты попросила сменить пароль в «Сообществе» Astra.',
        'Если это не ты — просто удали письмо, пароль останется прежним.',
    ),
    'signup': (
        'Подтверждение почты — Astra',
        'Код для подтверждения почты в «Сообществе» Astra.',
        'Если ты не заводила вход — просто удали письмо.',
    ),
    'magiclink': (
        'Вход — Astra',
        'Код для входа в «Сообщество» Astra.',
        'Если это не ты — просто удали письмо.',
    ),
    'email_change': (
        'Смена почты — Astra',
        'Код для смены почты в «Сообществе» Astra.',
        'Если это не ты — просто удали письмо.',
    ),
}
FALLBACK = ('Код — Astra', 'Код для «Сообщества» Astra.', 'Если это не ты — просто удали письмо.')


def render(action: str, code: str) -> tuple[str, str, str]:
    """→ (тема, html, простой текст)."""
    subject, lead, tail = LETTERS.get(action, FALLBACK)
    html = (
        '<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:15px;'
        'line-height:1.6;color:#1a1730">'
        f'<p>{lead}</p>'
        '<p>Код (действует час):</p>'
        f'<p style="font-size:30px;letter-spacing:6px;font-weight:700;margin:14px 0">{code}</p>'
        f'<p style="color:#6c6784;font-size:13px">{tail}</p>'
        '</div>'
    )
    text = f'{lead}\n\nКод (действует час): {code}\n\n{tail}\n'
    return subject, html, text


def verify(secret: str, headers, raw: bytes) -> bool:
    """Подпись Standard Webhooks, как её ставит GoTrue.

    Секрет хранится в виде «v1,whsec_<base64>»; подписывается строка
    «id.timestamp.тело», сравнение — постоянного времени.
    Пустой секрет = проверки нет; служба слушает только 127.0.0.1, но так
    настроенный секрет никогда не окажется необязательным по недосмотру.
    """
    if not secret:
        return True
    key = secret.split(',', 1)[-1]
    if key.startswith('whsec_'):
        key = key[len('whsec_'):]
    try:
        key_bytes = base64.b64decode(key)
    except Exception:
        key_bytes = key.encode()
    msg_id = headers.get('webhook-id', '')
    ts = headers.get('webhook-timestamp', '')
    signed = f'{msg_id}.{ts}.'.encode() + raw
    mine = base64.b64encode(hmac.new(key_bytes, signed, hashlib.sha256).digest()).decode()
    for part in headers.get('webhook-signature', '').split():
        if hmac.compare_digest(part.split(',', 1)[-1], mine):
            return True
    return False


def send(to: str, subject: str, html: str, text: str) -> None:
    """Отдать письмо Unisender Go. Без ключа — только в журнал (видно `journalctl`)."""
    api_key = os.environ.get('MAIL_API_KEY', '').strip()
    if not api_key:
        log.warning('ключа нет — письмо не отправлено, вот его содержимое:\n%s\n%s', subject, text)
        return
    payload = json.dumps({'message': {
        'recipients': [{'email': to}],
        'subject': subject,
        'from_email': os.environ.get('MAIL_FROM', 'no-reply@svcode.ru'),
        'from_name': os.environ.get('MAIL_FROM_NAME', 'Astra'),
        'body': {'html': html, 'plaintext': text},
        # письма служебные: следить, кто их открыл, незачем — и это лишние данные
        'track_links': 0, 'track_read': 0,
    }}).encode()
    req = urllib.request.Request(API_URL, data=payload, method='POST', headers={
        'Content-Type': 'application/json', 'X-API-KEY': api_key,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        answer = json.loads(resp.read() or b'{}')
    if answer.get('status') != 'success' and answer.get('failed_emails'):
        raise RuntimeError(f'сервис не принял письмо: {answer}')
    log.info('письмо отправлено: %s', answer.get('job_id', 'ок'))


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def reply(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 — имя задаёт http.server
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_BODY:
            return self.reply(413, {'error': {'http_code': 413, 'message': 'слишком большой запрос'}})
        raw = self.rfile.read(length)
        if not verify(os.environ.get('HOOK_SECRET', ''), self.headers, raw):
            log.warning('подпись не сошлась — запрос отброшен')
            return self.reply(401, {'error': {'http_code': 401, 'message': 'подпись не сошлась'}})
        try:
            data = json.loads(raw)
            email = data['user']['email']
            ed = data['email_data']
            subject, html, text = render(ed.get('email_action_type', ''), ed['token'])
            send(email, subject, html, text)
        except Exception as e:            # GoTrue покажет это человеку — без подробностей
            log.exception('письмо не ушло')
            return self.reply(500, {'error': {'http_code': 500,
                                              'message': 'Письмо отправить не удалось, попробуй позже.'}})
        self.reply(200, {})

    def log_message(self, fmt: str, *args) -> None:
        log.info(fmt, *args)


def main() -> None:
    logging.basicConfig(stream=sys.stdout, level=logging.INFO, format='%(levelname)s %(message)s')
    port = int(os.environ.get('LISTEN_PORT', '9910'))
    HTTPServer(('127.0.0.1', port), Handler).serve_forever()


if __name__ == '__main__':
    main()
