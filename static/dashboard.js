const FAVORITES_KEY = "parkFavorites";
let parksByName = new Map();
let parksById = new Map();

function escapeHtml(input) {
    return String(input)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getFavorites() {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function setFavorites(favorites) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function isFavorite(parkId) {
    return getFavorites().some((park) => String(park.id) === String(parkId));
}

function toggleFavorite(park) {
    const favorites = getFavorites();
    const exists = favorites.some((item) => String(item.id) === String(park.id));
    const next = exists
        ? favorites.filter((item) => String(item.id) !== String(park.id))
        : [...favorites, { id: park.id, name: park.name, group: park.group || "Unknown Group", country: park.country || "Unknown Country" }];
    setFavorites(next);
    renderFavorites();
    updateFavoriteButtons();
}

function updateFavoriteButtons() {
    document.querySelectorAll(".favorite-toggle-btn").forEach((button) => {
        const favorite = isFavorite(button.dataset.parkId);
        button.classList.toggle("is-favorite", favorite);
        button.textContent = favorite ? "★" : "☆";
        button.setAttribute("aria-label", favorite ? "Remove from favorites" : "Add to favorites");
        button.title = favorite ? "Remove from favorites" : "Add to favorites";
    });
}

function renderFavorites() {
    const container = document.getElementById("favoritesContainer");
    if (!container) return;
    const favorites = getFavorites();
    if (!favorites.length) {
        container.innerHTML = '<span class="text-muted">No favorites yet. Click a star to save parks.</span>';
        return;
    }
    container.innerHTML = favorites
        .map((park) => `
            <div class="favorite-item">
                <button class="btn btn-outline-primary btn-sm favorite-load-btn"
                    data-action="load-park"
                    data-park-id="${park.id}"
                    data-park-name="${escapeHtml(park.name)}">${escapeHtml(park.name)}</button>
                <button class="btn btn-sm favorite-toggle-btn is-favorite"
                    data-action="toggle-favorite"
                    data-park-id="${park.id}"
                    aria-label="Remove from favorites"
                    title="Remove from favorites">★</button>
            </div>
        `)
        .join("");
}

async function loadGroups() {
    const groupsContainer = document.getElementById("groupsContainer");
    groupsContainer.textContent = "Loading groups...";

    try {
        const response = await fetch("/api/park-groups");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load groups");

        const html = data.groups.map((group) => {
            const parks = group.parks || [];
            parks.forEach((park) => {
                parksByName.set(park.name, park.id);
                parksById.set(String(park.id), {
                    id: park.id,
                    name: park.name,
                    group: group.name || "Unknown Group",
                    country: park.country || "Unknown Country",
                });
            });
            const parkButtons = parks.slice(0, 20).map(
                (park) => {
                    const favorite = isFavorite(park.id);
                    return `
                        <span class="park-pill-wrap">
                            <button class="btn btn-outline-primary btn-sm park-pill"
                                data-action="load-park"
                                data-park-id="${park.id}"
                                data-park-name="${escapeHtml(park.name)}">${escapeHtml(park.name)}</button>
                            <button class="btn btn-sm favorite-toggle-btn ${favorite ? "is-favorite" : ""}"
                                data-action="toggle-favorite"
                                data-park-id="${park.id}"
                                aria-label="${favorite ? "Remove from favorites" : "Add to favorites"}"
                                title="${favorite ? "Remove from favorites" : "Add to favorites"}">${favorite ? "★" : "☆"}</button>
                        </span>
                    `;
                }
            ).join("");

            const overflow = parks.length > 20 ? `<div class="small text-muted mt-2">...and ${parks.length - 20} more parks</div>` : "";
            return `
                <div class="group-card">
                    <div class="group-title">${escapeHtml(group.name)} <span class="text-muted">(${parks.length})</span></div>
                    <div>${parkButtons || '<span class="text-muted">No parks found</span>'}</div>
                    ${overflow}
                </div>
            `;
        }).join("");

        groupsContainer.innerHTML = html || '<div class="text-muted">No groups available.</div>';
        updateFavoriteButtons();
    } catch (error) {
        groupsContainer.innerHTML = `<div class="text-danger">${escapeHtml(error.message)}</div>`;
    }
}

function renderRidesTable(rides) {
    if (!rides.length) return '<div class="text-muted">No ride data available for this park.</div>';

    const rows = rides.map((ride) => {
        const isOpen = ride.is_open;
        const statusClass = isOpen ? "wait-open" : "wait-closed";
        const statusLabel = isOpen ? "Open" : "Closed";
        const waitLabel = isOpen ? `${ride.wait_time ?? 0} mins` : "N/A";
        const updated = ride.last_updated ? new Date(ride.last_updated).toLocaleString() : "-";

        return `
            <tr>
                <td class="ride-name">${escapeHtml(ride.name)}</td>
                <td>${escapeHtml(ride.land || "General")}</td>
                <td class="${statusClass}">${statusLabel}</td>
                <td>${waitLabel}</td>
                <td>${escapeHtml(updated)}</td>
            </tr>
        `;
    }).join("");

    return `
        <table class="table table-sm table-hover align-middle">
            <thead>
                <tr>
                    <th>Ride</th>
                    <th>Land</th>
                    <th>Status</th>
                    <th>Wait</th>
                    <th>Last Updated</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

async function loadQueueTimes(parkId, parkName) {
    const selectedParkLabel = document.getElementById("selectedParkLabel");
    const queueSummary = document.getElementById("queueSummary");
    const ridesContainer = document.getElementById("ridesContainer");

    selectedParkLabel.textContent = `Loading data for ${parkName}...`;
    queueSummary.innerHTML = "";
    ridesContainer.innerHTML = "";

    try {
        const response = await fetch(`/api/queue-times/${parkId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load queue times");

        selectedParkLabel.innerHTML = `<strong>${escapeHtml(parkName)}</strong>`;
        queueSummary.innerHTML = `
            <span class="badge text-bg-success me-2">Open rides: ${data.open_rides}</span>
            <span class="badge text-bg-secondary">Total rides: ${data.total_rides}</span>
        `;
        ridesContainer.innerHTML = renderRidesTable(data.rides);
    } catch (error) {
        selectedParkLabel.innerHTML = `<span class="text-danger">${escapeHtml(error.message)}</span>`;
    }
}

async function refreshCache() {
    const status = document.getElementById("cacheStatus");
    status.textContent = "Refreshing...";
    try {
        const response = await fetch("/api/refresh-parks", { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Refresh failed");
        status.textContent = "Cache refreshed.";
        await loadGroups();
    } catch (error) {
        status.textContent = error.message;
    }
}

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "load-park") {
        loadQueueTimes(button.dataset.parkId, button.dataset.parkName);
        return;
    }
    if (action === "toggle-favorite") {
        const park = parksById.get(String(button.dataset.parkId));
        if (!park) return;
        toggleFavorite(park);
    }
});

document.getElementById("refreshCacheBtn").addEventListener("click", refreshCache);
renderFavorites();
loadGroups();
