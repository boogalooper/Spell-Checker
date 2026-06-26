import os
import socket
import json
import threading
import time
import sys
import subprocess
from collections import OrderedDict

# ================= AUTO-INSTALL =================
def ensure_package(package_name, import_name=None):
    if import_name is None:
        import_name = package_name
    try:
        __import__(import_name)
    except ImportError:
        print(f"[SETUP] Installing {package_name}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package_name])

ensure_package("requests")

import requests

# ================= CONFIG =================
API_HOST = "127.0.0.1"
API_PORT_SEND = 6411
API_PORT_LISTEN = 6410
TIMEOUT = 5 * 60

SOCKET_READ_CHUNK = 1024 * 1024
MAX_INCOMING_BYTES = 10 * 1024 * 1024
SOCKET_READ_TIMEOUT = 10

YANDEX_SPELLER_URL = "https://speller.yandex.net/services/spellservice.json/checkTexts"
SPELLER_TIMEOUT = 20
SPELLER_LANG = "ru"
SPELLER_FORMAT = "plain"
SPELLER_OPTIONS = 2 + 8

INCLUDE_CAPITALIZATION_ERRORS = True
INCLUDE_REPEAT_WORD_ERRORS = True

IGNORE_WORDS_WITH_DIGITS_LOCAL = False
IGNORE_ALL_CAPS_WORDS_LOCAL = False

USE_CUSTOM_WORDS = False

MAX_TEXT_LENGTH = 500000
DEBUG = True

last_request_time = time.time()

ERROR_UNKNOWN_WORD = 1
ERROR_REPEAT_WORD = 2
ERROR_CAPITALIZATION = 3
ERROR_TOO_MANY_ERRORS = 4

# ================= EXCEPTIONS BASE =================
EXCEPTIONS_BASE = set()

def normalize_word(word: str) -> str:
    return (word or "").strip().lower()

def load_exceptions_base():
    """
    Загружает exceptions_base.txt из:
    - текущей директории
    - ./lib/
    """
    global EXCEPTIONS_BASE

    base_dir = os.path.dirname(os.path.abspath(__file__))

    paths = [
        os.path.join(base_dir, "exceptions_base.txt"),
        os.path.join(base_dir, "lib", "exceptions_base.txt"),
    ]

    for path in paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    EXCEPTIONS_BASE = {
                        normalize_word(line)
                        for line in f
                        if line.strip()
                    }
                print(f"[INFO] Exceptions loaded: {len(EXCEPTIONS_BASE)} from {path}")
                return
            except Exception as e:
                print(f"[WARN] Failed to load exceptions from {path}: {e}")

    print("[INFO] exceptions_base.txt not found, continuing with empty set")


# ================= HELPERS =================
def is_all_caps(word: str) -> bool:
    letters = [ch for ch in word if ch.isalpha()]
    return bool(letters) and all(ch.isupper() for ch in letters)

def should_skip_word(word: str) -> bool:
    if not word:
        return True

    lw = normalize_word(word)

    if USE_CUSTOM_WORDS and lw in CUSTOM_WORDS:
        return True

    if IGNORE_WORDS_WITH_DIGITS_LOCAL and any(ch.isdigit() for ch in word):
        return True

    if IGNORE_ALL_CAPS_WORDS_LOCAL and is_all_caps(word):
        return True

    return False

def is_allowed_error_code(code: int) -> bool:
    if code == ERROR_UNKNOWN_WORD:
        return True
    if code == ERROR_REPEAT_WORD:
        return INCLUDE_REPEAT_WORD_ERRORS
    if code == ERROR_CAPITALIZATION:
        return INCLUDE_CAPITALIZATION_ERRORS
    return False

def split_text_for_speller(text: str):
    if not text:
        return []

    parts = text.split(";")
    result = []

    for part in parts:
        part = part.strip()
        if not part:
            continue
        part = " ".join(part.split())
        if part:
            result.append(part)

    return result


# ================= SOCKET RECEIVE =================
def receive_full_json(client_socket):
    client_socket.settimeout(SOCKET_READ_TIMEOUT)
    buffer = bytearray()

    while True:
        try:
            chunk = client_socket.recv(SOCKET_READ_CHUNK)
        except socket.timeout:
            if buffer:
                break
            raise RuntimeError("Таймаут чтения входящего сообщения")

        if not chunk:
            break

        buffer.extend(chunk)

        if len(buffer) > MAX_INCOMING_BYTES:
            raise RuntimeError("Слишком большой входящий JSON")

    if not buffer:
        return b""

    return bytes(buffer)


# ================= SPELL CHECK =================
def check_spelling_yandex(text):
    # ================= NEW FORMAT: list of objects =================
    if not isinstance(text, list):
        text = str(text).strip()
        if not text:
            return {"errors_count": 0, "errors_total_count": 0, "errors": []}
        return check_spelling_yandex(text)

    prepared_fragments = []
    total_text_length = 0

    for item in text:
        if not isinstance(item, dict):
            continue

        content = item.get("content", "")
        path = item.get("path", [])
        parent = item.get("parent", "")
        id = item.get("id", "")

        if not isinstance(content, str):
            content = str(content)

        content = content.strip()
        if not content:
            continue

        chunks = split_text_for_speller(content)
        if not chunks:
            continue

        for chunk in chunks:
            total_text_length += len(chunk)
            prepared_fragments.append({
                "content": chunk,
                "id": id,
                "path": path if isinstance(path, list) else [],
                "parent": parent
            })

    if not prepared_fragments:
        return {"errors_count": 0, "errors_total_count": 0, "errors": []}

    if total_text_length > MAX_TEXT_LENGTH:
        raise ValueError("Текст слишком длинный")

    payload = [
        ("lang", SPELLER_LANG),
        ("options", str(SPELLER_OPTIONS)),
        ("format", SPELLER_FORMAT),
    ]

    for fragment in prepared_fragments:
        payload.append(("text", fragment["content"]))
    print(payload)
    response = requests.post(
        YANDEX_SPELLER_URL,
        data=payload,
        timeout=SPELLER_TIMEOUT
    )
    response.raise_for_status()

    data = response.json()
    print(data)
    grouped = OrderedDict()
    total_error_occurrences = 0

    for idx, chunk_errors in enumerate(data):
        if not isinstance(chunk_errors, list):
            continue

        if idx >= len(prepared_fragments):
            continue

        fragment = prepared_fragments[idx]
        fragment_path = fragment["path"]
        fragment_parent = fragment["parent"]
        fragment_id = fragment["id"]

        for item in chunk_errors:
            if not isinstance(item, dict):
                continue

            code = item.get("code")
            word = (item.get("word") or "").strip()
            suggestions = item.get("s") or []

            if not word:
                continue

            if not is_allowed_error_code(code):
                continue

            if should_skip_word(word):
                continue

            key = normalize_word(word)

            # ================= EXCEPTIONS FILTER =================
            if key in EXCEPTIONS_BASE:
                continue

            suggestion = suggestions[0] if suggestions else ""

            if key not in grouped:
                grouped[key] = {
                    "word": word,
                    "suggestion": suggestion,
                    "count": 1,
                    "fragments": [
                        {
                            'id':fragment_id,
                            "path": fragment_path,
                            "parent": fragment_parent
                        }
                    ]
                }
            else:
                grouped[key]["count"] += 1

                if not grouped[key]["suggestion"] and suggestion:
                    grouped[key]["suggestion"] = suggestion

                grouped[key]["fragments"].append({
                    'id': fragment_id,
                    "path": fragment_path,
                    "parent": fragment_parent
                })

            total_error_occurrences += 1

    return {
        "errors_count": len(grouped),
        "errors_total_count": total_error_occurrences,
        "errors": list(grouped.values())
    }


# ================= SERVICE =================
def send_data_to_jsx(obj):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(10)
            s.connect((API_HOST, API_PORT_SEND))
            s.send(json.dumps(obj, ensure_ascii=False).encode("utf-8"))
    except Exception:
        pass


# ================= SERVER =================
def handle_client(client_socket, server):
    global last_request_time

    try:
        with client_socket:
            raw = receive_full_json(client_socket)
            if not raw:
                return

            message = json.loads(raw.decode("utf-8"))
            msg_type = message.get("type")
            last_request_time = time.time()

            if msg_type == "handshake":
                send_data_to_jsx({"type": "answer", "message": "success"})

            elif msg_type == "spell_check":
                text = message.get("message", "")
                result = check_spelling_yandex(text)

                send_data_to_jsx({
                    "type": "answer",
                    "message": result
                })

            elif msg_type == "exit":
                try:
                    server.close()
                except Exception:
                    pass
                os._exit(0)

            else:
                send_data_to_jsx({
                    "type": "error",
                    "message": f"Неизвестный тип сообщения: {msg_type}"
                })

    except Exception as e:
        send_data_to_jsx({
            "type": "error",
            "message": str(e)
        })


def timeout_watcher():
    global last_request_time
    while True:
        time.sleep(5)
        if time.time() - last_request_time > TIMEOUT:
            os._exit(0)


def start_server():
    print(f"[START] Сервер {API_HOST}:{API_PORT_LISTEN}")

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((API_HOST, API_PORT_LISTEN))
    server.listen(20)

    threading.Thread(target=timeout_watcher, daemon=True).start()

    print("[READY] Сервер слушает порт")
    send_data_to_jsx({"type": "answer", "message": "success"})

    while True:
        client_socket, addr = server.accept()
        threading.Thread(
            target=handle_client,
            args=(client_socket, server),
            daemon=True
        ).start()


if __name__ == "__main__":
    load_exceptions_base()
    start_server()