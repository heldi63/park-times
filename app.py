from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Any

import requests
from flask import Flask, jsonify, render_template, request


PARKS_URL = "https://queue-times.com/parks.json"
QUEUE_URL_TEMPLATE = "https://queue-times.com/parks/{park_id}/queue_times.json"
CACHE_MAX_AGE = timedelta(hours=12)

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
CACHE_FILE = DATA_DIR / "parks_cache.json"

app = Flask(__name__)
cache_lock = Lock()


def flatten_parks(groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    parks: list[dict[str, Any]] = []
    for group in groups:
        group_name = group.get("name", "Unknown Group")
        for park in group.get("parks", []):
            parks.append(
                {
                    "id": park.get("id"),
                    "name": park.get("name"),
                    "country": park.get("country"),
                    "continent": park.get("continent"),
                    "timezone": park.get("timezone"),
                    "group": group_name,
                }
            )
    return parks


def read_cache() -> dict[str, Any] | None:
    if not CACHE_FILE.exists():
        return None
    with CACHE_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_cache(data: dict[str, Any]) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with CACHE_FILE.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)


def cache_is_fresh(cache_data: dict[str, Any]) -> bool:
    cached_at = cache_data.get("cached_at")
    if not cached_at:
        return False
    try:
        timestamp = datetime.fromisoformat(cached_at)
    except ValueError:
        return False
    return datetime.now(timezone.utc) - timestamp < CACHE_MAX_AGE


def fetch_and_cache_parks() -> dict[str, Any]:
    response = requests.get(PARKS_URL, timeout=20)
    response.raise_for_status()
    groups = response.json()
    payload = {
        "cached_at": datetime.now(timezone.utc).isoformat(),
        "groups": groups,
        "parks": flatten_parks(groups),
    }
    write_cache(payload)
    return payload


def get_cached_parks(force_refresh: bool = False) -> dict[str, Any]:
    with cache_lock:
        cache_data = read_cache()
        if force_refresh or cache_data is None or not cache_is_fresh(cache_data):
            return fetch_and_cache_parks()
        return cache_data


def fetch_queue_times(park_id: int) -> dict[str, Any]:
    response = requests.get(QUEUE_URL_TEMPLATE.format(park_id=park_id), timeout=20)
    response.raise_for_status()
    return response.json()


def normalize_queue_data(queue_data: dict[str, Any]) -> list[dict[str, Any]]:
    rides: list[dict[str, Any]] = []
    for land in queue_data.get("lands", []):
        land_name = land.get("name", "General")
        for ride in land.get("rides", []):
            rides.append(
                {
                    "name": ride.get("name"),
                    "land": land_name,
                    "is_open": ride.get("is_open"),
                    "wait_time": ride.get("wait_time", 0),
                    "last_updated": ride.get("last_updated"),
                }
            )
    for ride in queue_data.get("rides", []):
        rides.append(
            {
                "name": ride.get("name"),
                "land": "General",
                "is_open": ride.get("is_open"),
                "wait_time": ride.get("wait_time", 0),
                "last_updated": ride.get("last_updated"),
            }
        )
    return rides


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/search")
def search_page() -> str:
    return render_template("search.html")


@app.route("/api/parks")
def api_parks():
    query = request.args.get("q", "").strip().lower()
    try:
        data = get_cached_parks()
    except requests.RequestException as exc:
        return jsonify({"error": f"Could not load parks: {exc}"}), 502

    parks = data["parks"]
    if query:
        parks = [park for park in parks if query in park.get("name", "").lower()]
    return jsonify(
        {
            "cached_at": data["cached_at"],
            "count": len(parks),
            "parks": parks,
        }
    )


@app.route("/api/park-groups")
def api_park_groups():
    try:
        data = get_cached_parks()
    except requests.RequestException as exc:
        return jsonify({"error": f"Could not load park groups: {exc}"}), 502
    return jsonify(
        {
            "cached_at": data["cached_at"],
            "groups": data["groups"],
        }
    )


@app.route("/api/queue-times/<int:park_id>")
def api_queue_times(park_id: int):
    try:
        queue_data = fetch_queue_times(park_id)
        rides = normalize_queue_data(queue_data)
    except requests.RequestException as exc:
        return jsonify({"error": f"Could not load queue times: {exc}"}), 502

    return jsonify(
        {
            "park_id": park_id,
            "rides": rides,
            "total_rides": len(rides),
            "open_rides": len([r for r in rides if r.get("is_open")]),
        }
    )


@app.route("/api/refresh-parks", methods=["POST"])
def api_refresh_parks():
    try:
        data = get_cached_parks(force_refresh=True)
    except requests.RequestException as exc:
        return jsonify({"error": f"Refresh failed: {exc}"}), 502
    return jsonify({"message": "Parks cache refreshed", "cached_at": data["cached_at"]})


if __name__ == "__main__":
    app.run(debug=True)
