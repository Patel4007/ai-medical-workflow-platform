from __future__ import annotations

import json
from pathlib import Path
from threading import RLock

from tinydb import TinyDB
from tinydb.storages import JSONStorage


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "db.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


class SafeJSONStorage(JSONStorage):
    _lock = RLock()

    def read(self):
        with self._lock:
            try:
                return super().read()
            except json.JSONDecodeError:
                self._handle.seek(0)
                contents = self._handle.read().strip()
                if not contents:
                    return {}
                self._handle.seek(0)
                self._handle.truncate()
                json.dump({}, self._handle)
                self._handle.flush()
                return {}

    def write(self, data):
        with self._lock:
            return super().write(data)


db = TinyDB(DB_PATH, storage=SafeJSONStorage)
users_table = db.table("users")
sessions_table = db.table("sessions")
documents_table = db.table("documents")
agent_runs_table = db.table("agent_runs")
automation_jobs_table = db.table("automation_jobs")
connectors_table = db.table("connectors")
inference_jobs_table = db.table("inference_jobs")
connector_states_table = db.table("connector_states")
