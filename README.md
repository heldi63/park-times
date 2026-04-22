# Park Queue Times Web App

A simple Flask website that displays live queue-time data from Queue-Times.com with:

- A **Dashboard** page for browsing park groups and loading queue times.
- A **Search Parks** page with autocomplete suggestions from cached park data.

## Setup

1. Create and activate a virtual environment:
   - Windows PowerShell:
     - `python -m venv .venv`
     - `.venv\Scripts\Activate.ps1`
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Run the app:
   - `python app.py`
4. Open:
   - `http://127.0.0.1:5000`

## Notes

- Park data is fetched from `https://queue-times.com/parks.json` and cached in `data/parks_cache.json`.
- Queue times are fetched live from `https://queue-times.com/parks/{id}/queue_times.json`.
- Cache can be refreshed from the Dashboard button.
- Includes required attribution: Powered by Queue-Times.com.
