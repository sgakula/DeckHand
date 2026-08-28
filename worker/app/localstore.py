"""Local-dev stand-in for Firestore. Enabled by LOCAL_STORE=true; never used in prod.

Firestore needs Application Default Credentials, which a laptop without `gcloud
auth` does not have. This module implements the narrow slice of the Firestore
client surface that `firestore.py` actually calls -- document/collection refs,
`where`/`order_by`/`limit`/`stream`, and ArrayUnion updates -- backed by a JSON
file so state survives a reload.

Everything is normalised to JSON-safe primitives on write (datetimes become ISO
strings), so in-memory and reloaded state have identical types and `order_by`
never compares a datetime against a str.
"""
import json
import os
import threading
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterator, Optional


def _jsonable(value: Any) -> Any:
    """Deep-convert to JSON-safe primitives. Pydantic re-parses ISO strings on read."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def _is_array_union(value: Any) -> bool:
    """Duck-type google.cloud.firestore.ArrayUnion without importing it."""
    return type(value).__name__ == "ArrayUnion" and hasattr(value, "values")


class _Snapshot:
    def __init__(self, doc_id: str, data: Optional[dict]) -> None:
        self.id = doc_id
        self.exists = data is not None
        self._data = data

    def to_dict(self) -> Optional[dict]:
        return dict(self._data) if self._data is not None else None


class _DocRef:
    def __init__(self, store: "LocalClient", path: str) -> None:
        self._store = store
        self.path = path
        self.id = path.rsplit("/", 1)[-1]

    def get(self) -> _Snapshot:
        return _Snapshot(self.id, self._store._read(self.path))

    def set(self, data: dict) -> None:
        self._store._write(self.path, _jsonable(data))

    def update(self, data: dict) -> None:
        current = dict(self._store._read(self.path) or {})
        for key, value in data.items():
            if _is_array_union(value):
                existing = list(current.get(key) or [])
                existing.extend(_jsonable(list(value.values)))
                current[key] = existing
            else:
                current[key] = _jsonable(value)
        self._store._write(self.path, current)

    def delete(self) -> None:
        self._store._delete(self.path)

    def collection(self, name: str) -> "_CollectionRef":
        return _CollectionRef(self._store, f"{self.path}/{name}")


class _Query:
    def __init__(self, store: "LocalClient", path: str) -> None:
        self._store = store
        self.path = path
        self._filters: list[tuple[str, str, Any]] = []
        self._order_by: Optional[str] = None
        self._limit: Optional[int] = None

    def _clone(self) -> "_Query":
        q = _Query(self._store, self.path)
        q._filters = list(self._filters)
        q._order_by = self._order_by
        q._limit = self._limit
        return q

    def where(self, field: str, op: str, value: Any) -> "_Query":
        q = self._clone()
        q._filters.append((field, op, value))
        return q

    def order_by(self, field: str) -> "_Query":
        q = self._clone()
        q._order_by = field
        return q

    def limit(self, count: int) -> "_Query":
        q = self._clone()
        q._limit = count
        return q

    def _matches(self, data: dict) -> bool:
        for field, op, value in self._filters:
            actual = data.get(field)
            if op == "array_contains":
                if not isinstance(actual, list) or value not in actual:
                    return False
            elif op in ("==", "eq"):
                if actual != value:
                    return False
            elif op == "in":
                if actual not in value:
                    return False
            else:  # unsupported operator -> no match, loudly wrong beats silently right
                raise NotImplementedError(f"local store does not implement operator {op!r}")
        return True

    def stream(self) -> Iterator[_Snapshot]:
        rows = [
            (doc_id, data)
            for doc_id, data in self._store._children(self.path)
            if self._matches(data)
        ]
        if self._order_by:
            rows.sort(key=lambda row: (row[1].get(self._order_by) is None,
                                       row[1].get(self._order_by, "")))
        if self._limit is not None:
            rows = rows[: self._limit]
        return iter([_Snapshot(doc_id, data) for doc_id, data in rows])


class _CollectionRef(_Query):
    def document(self, doc_id: str) -> _DocRef:
        return _DocRef(self._store, f"{self.path}/{doc_id}")

    def add(self, data: dict) -> tuple[Any, _DocRef]:
        import uuid

        ref = self.document(uuid.uuid4().hex[:16])
        ref.set(data)
        return (None, ref)


class LocalClient:
    """Flat path -> document map, persisted as JSON. Mirrors the Firestore API we use."""

    def __init__(self, path: str) -> None:
        self._file = Path(path).expanduser()
        self._lock = threading.RLock()
        self._docs: dict[str, dict] = {}
        self._load()

    # ---------- persistence ----------
    #
    # The API and worker services are separate processes sharing one file, so every
    # operation re-reads it and every write is a read-modify-write of a single doc.
    # Whole-file last-writer-wins would otherwise drop the other process's docs.

    def _load(self) -> None:
        if self._file.exists():
            try:
                self._docs = json.loads(self._file.read_text() or "{}")
            except (json.JSONDecodeError, OSError):
                self._docs = {}
        else:
            self._docs = {}

    def _persist(self) -> None:
        self._file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._file.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(self._docs, indent=1))
        os.replace(tmp, self._file)

    # ---------- storage primitives ----------

    def _read(self, path: str) -> Optional[dict]:
        with self._lock:
            self._load()
            data = self._docs.get(path)
            return dict(data) if data is not None else None

    def _write(self, path: str, data: dict) -> None:
        with self._lock:
            self._load()
            self._docs[path] = data
            self._persist()

    def _delete(self, path: str) -> None:
        with self._lock:
            self._load()
            self._docs.pop(path, None)
            self._persist()

    def _children(self, collection_path: str) -> list[tuple[str, dict]]:
        """Immediate documents of a collection (paths with exactly one more segment)."""
        prefix = collection_path.rstrip("/") + "/"
        with self._lock:
            self._load()
            return [
                (path[len(prefix):], dict(data))
                for path, data in self._docs.items()
                if path.startswith(prefix) and "/" not in path[len(prefix):]
            ]

    # ---------- public Firestore-shaped API ----------

    def document(self, path: str) -> _DocRef:
        return _DocRef(self, path.strip("/"))

    def collection(self, path: str) -> _CollectionRef:
        return _CollectionRef(self, path.strip("/"))
