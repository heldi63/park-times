let parksIndex = [];
let nameToPark = new Map();

function escapeHtml(input) {
    return String(input)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function loadParksForAutocomplete() {
    const hint = document.getElementById("searchHint");
    hint.textContent = "Loading parks for suggestions...";
    try {
        const response = await fetch("/api/parks");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load parks");

        parksIndex = data.parks || [];
        nameToPark = new Map(parksIndex.map((park) => [park.name.toLowerCase(), park]));

        const list = document.getElementById("parkSuggestions");
        list.innerHTML = parksIndex
            .slice(0, 2000)
            .map((park) => `<option value="${escapeHtml(park.name)}"></option>`)
            .join("");

        hint.textContent = `${parksIndex.length} parks indexed. Start typing to search.`;
    } catch (error) {
        hint.textContent = error.message;
    }
}

function renderSearchResults(park, data) {
    const openRides = data.rides.filter((ride) => ride.is_open);
    const topWaits = openRides
        .sort((a, b) => (b.wait_time || 0) - (a.wait_time || 0))
        .slice(0, 12);

    const rows = topWaits.map((ride) => `
        <tr>
            <td>${escapeHtml(ride.name)}</td>
            <td>${escapeHtml(ride.land || "General")}</td>
            <td>${ride.wait_time ?? 0} mins</td>
        </tr>
    `).join("");

    return `
        <div class="mb-3">
            <h3 class="h5 mb-1">${escapeHtml(park.name)}</h3>
            <div class="small text-muted">${escapeHtml(park.group || "Unknown Group")} | ${escapeHtml(park.country || "Unknown Country")}</div>
            <div class="mt-2">
                <span class="badge text-bg-success me-2">Open rides: ${data.open_rides}</span>
                <span class="badge text-bg-secondary">Total rides: ${data.total_rides}</span>
            </div>
        </div>
        <h4 class="h6">Longest open waits right now</h4>
        <div class="table-responsive">
            <table class="table table-striped table-sm">
                <thead><tr><th>Ride</th><th>Land</th><th>Wait</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="3" class="text-muted">No open ride wait times available.</td></tr>'}</tbody>
            </table>
        </div>
    `;
}

async function searchParkQueueTimes() {
    const input = document.getElementById("parkSearchInput");
    const results = document.getElementById("searchResults");
    const term = input.value.trim();

    if (!term) {
        results.innerHTML = '<div class="text-warning">Please type a park name first.</div>';
        return;
    }

    let selected = nameToPark.get(term.toLowerCase());
    if (!selected) {
        selected = parksIndex.find((park) => park.name.toLowerCase().includes(term.toLowerCase()));
    }
    if (!selected) {
        results.innerHTML = '<div class="text-danger">No matching park found. Try a different spelling.</div>';
        return;
    }

    results.innerHTML = `<div class="text-muted">Loading wait times for ${escapeHtml(selected.name)}...</div>`;
    try {
        const response = await fetch(`/api/queue-times/${selected.id}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load queue times");
        results.innerHTML = renderSearchResults(selected, data);
    } catch (error) {
        results.innerHTML = `<div class="text-danger">${escapeHtml(error.message)}</div>`;
    }
}

document.getElementById("searchBtn").addEventListener("click", searchParkQueueTimes);
document.getElementById("parkSearchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        searchParkQueueTimes();
    }
});

loadParksForAutocomplete();
