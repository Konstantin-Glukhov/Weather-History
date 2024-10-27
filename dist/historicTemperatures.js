"use strict";
class DateRange {
    start = '';
    end = '';
}
class Station {
    name;
    country;
    region;
    active;
    data;
    constructor({ name, country, region, active }) {
        this.name = name;
        this.country = country;
        this.region = region;
        this.active = active;
        this.data = {};
    }
}
class Stations {
    constructor(id, station) {
        if (id && station) {
            this[id] = station; // Initialize if provided
        }
    }
    [Symbol.iterator]() {
        const keys = Object.keys(this);
        let index = 0;
        return {
            next: () => {
                if (index < keys.length) {
                    const key = keys[index++];
                    return { value: { [key]: this[key] }, done: false };
                }
                else
                    return { value: undefined, done: true };
            }
        };
    }
    getSortedArrayBy(property) {
        return Object.entries(this)
            .filter(([, val]) => val instanceof Station) // Ensure we are only dealing with Station objects
            .sort(([, a], [, b]) => {
            const aValue = a[property];
            const bValue = b[property];
            if (typeof aValue === 'string' && typeof bValue === 'string')
                return aValue.localeCompare(bValue);
            else if (typeof aValue === 'number' && typeof bValue === 'number')
                return aValue - bValue; // Numeric comparison
            else
                return 0; // Handle mixed types or non-comparable types
        });
    }
    upsert(id, station) {
        /*
           upsert(id: string, station: Omit<Stations[string], 'data'> & { data: YearData }): void {
        1. Stations[string]: refers to the type of the 'Station' object for any given key (i.e., the structure of a station).
        2. Omit<> utility creates a new type based on the structure of a station excluding the 'data' property.
        3. & { data: YearData } intersection adds back a 'data' property to the object, which must conform to the YearData interface.
        Type Safety: The use of Omit and intersection types ensures that any object passed to upsert() has the correct structure.
        If you omit required fields or provide incorrect types, TypeScript will raise a compile-time error.
        */
        this[id] = station;
    }
    delete(id) {
        return delete this[id];
    }
    getStations(filter = []) {
        // This method returns a shallow copy of the stations object but does not provide iteration capabilities.
        let length = filter instanceof Set ? filter.size : filter.length;
        if (!length)
            return { ...this };
        const filteredStations = new Stations();
        for (const id of filter)
            if (this[id])
                filteredStations[id] = this[id];
        return filteredStations;
    }
    get(id, property) {
        if (id in this && property in this[id])
            return this[id][property];
    }
    getData(id) {
        return this[id]?.data;
    }
    getYearData(id, year) {
        this[id].data[year] ??= {};
        return this[id].data[year];
    }
    getName(id) {
        return this[id]?.name ?? id;
    }
    getCountry(id) {
        return this[id]?.country;
    }
    getRegion(id) {
        return this[id]?.region;
    }
    isActive(id) {
        return this[id]?.active;
    }
}
String.prototype.formatUnicorn = function (...args) {
    if (!args.length)
        return "";
    const [params] = args;
    let str = this;
    for (const key of Object.keys(params)) {
        const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
        str = str.replace(regex, params[key]);
    }
    return str.trim();
};
function getRGBValue(stationId, year) {
    let numericId = parseInt(stationId.replace(/\D/g, '1'));
    let numericYear = parseInt(year) * 10000;
    let hash = numericId + numericYear;
    const r = (hash * 10) % 256; // Red component
    const g = (hash * 100) % 256; // Green component
    const b = (hash * 1000) % 256; // Blue component
    // Return hex color string
    let rgb = (1 << 24) + (r << 16) + (g << 8) + b;
    return "#" + rgb.toString(16).slice(1).toUpperCase();
}
async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const contentType = res.headers.get("Content-Type");
    let json;
    if (contentType?.includes("application/json")) {
        json = await res.json();
    }
    else if (contentType?.includes("text/")) {
        const text = await res.text();
        json = JSON.parse(text);
    }
    else
        throw new Error("Unsupported content type: " + contentType);
    return json;
}
function allValuesAreNull(obj, keys = []) {
    // Return true if all values for the given set of keys are null
    let count = 0;
    for (let key of keys.length ? keys : Object.keys(obj)) {
        if (obj[key] != null)
            return false; // Return false as soon as we find a non-null value
        count += 1; // Count null values
    }
    return count > 0; // Return true if at least one key is checked
}
function removeNullsFromWeatherData(data) {
    // remove object properties with all null sub-object properties
    for (let [date, parameters] of Object.entries(data))
        if (allValuesAreNull(parameters))
            delete data[date];
}
function removeNullsFromSourceData(data) {
    // remove array elements with all null parameters
    if (!data.length)
        return;
    let { date, ...params } = data[0]; // get all properties except 'date'
    let keys = Object.keys(params);
    for (let i = data.length - 1; i >= 0; i--)
        if (allValuesAreNull(data[i], keys))
            data.splice(i, 1); // del array element by index
}
function findOrFillMissingDates(year, dateRange, data, missingData) {
    let startDate = new Date(year + '-' + dateRange.start);
    let endDate = new Date(year + '-' + dateRange.end);
    let missingRange = new DateRange();
    let missingRanges = [];
    let priorDate = '';
    for (; startDate <= endDate; startDate.setDate(startDate.getDate() + 1)) {
        const date = startDate.toISOString().substring(5, 10);
        if (date in data) {
            if (missingData)
                missingData[date] = data[date];
            if (missingRange.start) {
                missingRange.end = priorDate;
                missingRanges.push(missingRange);
                missingRange = new DateRange();
            }
        }
        else if (missingRange.start)
            missingRange.end = date;
        else
            missingRange.start = date;
        priorDate = date;
    }
    if (missingRange.start) {
        if (!missingRange.end)
            missingRange.end = missingRange.start;
        missingRanges.push(missingRange);
    }
    return missingRanges;
}
async function getStationYearData(stationId, year, start, end) {
    // For the given station ID and year, try to get weather data from local storage, if not present get via API.
    // Save obtained data into stationsCache object by reference getYearData(stationId, year).
    let stationYearCache = stationsCache.getYearData(stationId, year);
    let stationYearLocal = {};
    let stationYear = stationId + '-' + year;
    let missingCache = findOrFillMissingDates(year, { start, end }, stationYearCache);
    if (!missingCache.length)
        return;
    let text = localStorage.getItem(stationYear);
    let missingLocalStorage = [];
    if (text) {
        stationYearLocal = JSON.parse(text);
        for (let missingRange of missingCache)
            missingLocalStorage.push(...findOrFillMissingDates(year, missingRange, stationYearLocal, stationYearCache));
        if (!missingLocalStorage.length)
            return;
    }
    else
        missingLocalStorage = missingCache;
    warn("Fetching data", 'blink');
    let promises = missingLocalStorage.map(async (missingRange) => {
        let start = year + '-' + missingRange.start;
        let end = year + '-' + missingRange.end;
        const url = stationURLTemplate.formatUnicorn({ stationId, start, end });
        const { data: sourceData } = await fetchJson(url);
        if (sourceData.length > 0) {
            for (let row of sourceData) {
                let date = row.date;
                if (date) {
                    delete row.date;
                    if (!allValuesAreNull(row)) {
                        date = date.substring(5, 10);
                        stationYearLocal[date] = row;
                        stationYearCache[date] = row;
                    }
                }
            }
            let text = JSON.stringify(stationYearLocal);
            localStorage.setItem(stationYear, text);
        }
    });
    await Promise.all(promises);
    warn("", 'blink');
}
async function getStationsYearData() {
    // Get weather data for all selectedStations and selectedYears and save them in stationsCache object.
    const todayDate = today.toISOString().substring(5, 10);
    const currentYearRequested = selectedYears.has(todayYear);
    let endDate;
    if (currentYearRequested)
        endDate = todayDate;
    else
        endDate = "12-31";
    const promises = [];
    for (const stationId of selectedStations) {
        for (let year of selectedYears) {
            let start = "01-01";
            let end = endDate;
            promises.push(getStationYearData(stationId, year, start, end));
        }
    }
    try {
        await Promise.all(promises);
    }
    catch (error) {
        console.error("Error fetching station data:", error);
    }
}
function getCommonDatesPerStation() {
    let stationLabel = {};
    for (const stationId of selectedStations) {
        stationLabel[stationId] = Array
            .from(selectedYears)
            .map(year => new Set(Object.keys(stationsCache.getData(stationId)[year])))
            .reduce((acc, cur) => acc.intersection(cur));
    }
    /* Alternative code
    stationLabel = Object.fromEntries(
      Array.from(selectedStations).map(stationId => {
        return [stationId,
          Array.from(selectedYears)
            .map(year => new Set(Object.keys(stationsCache.getData(stationId)[year])))
            .reduce((acc, cur) => acc.intersection(cur))
        ];
      })
    );
    */
    return stationLabel;
}
function isResearchSelected(event) {
    if (!event)
        return true;
    selectedStations = checkedBoxes(stationsCheckboxContainer);
    if (!selectedStations.size) {
        warn("Select stations to submit");
        searchTextInput.focus();
        return false;
    }
    let customYears = customInput.value.split(/\s+/).filter(x => x);
    if (customYears.some(year => year && (year > todayYear || !year.match(/\d{4}/)))) {
        warn("Provide valid years");
        customInput.focus();
        return false;
    }
    selectedYears = checkedBoxes(yearCheckboxContainer).union(new Set(customYears));
    if (selectedYears.size == 0) {
        clearSearchResults(false);
        warn("Select years to submit");
        return false;
    }
    let thisSubmission = selectedStations.union(selectedYears);
    thisSubmission.add(allStations.checked.toString());
    if (areSetsEqual(thisSubmission, priorSubmission)) {
        warn("Change your selection to submit");
        return false;
    }
    priorSubmission = thisSubmission;
    return true;
}
// Function to set the display state of canvas elements
function setCanvasDisplay(chartId, state) {
    let iter;
    let display;
    if (typeof state === 'boolean')
        display = state ? 'block' : 'none';
    else
        display = state;
    if (typeof chartId === 'string')
        iter = [chartId];
    else if (Array.isArray(chartId))
        iter = chartId;
    else
        iter = Array.from(chartId);
    let count = 0;
    for (let chart of iter)
        if (charts[chart]) {
            count += 1;
            charts[chart].canvas.style.display = display;
        }
    return Object.keys(iter).length === count;
}
function setAllCanvasDisplay() {
    if (selectedStations.size == 0) {
        setCanvasDisplay(Object.keys(charts), 'none');
        return;
    }
    let allValue, individualValue;
    if (allStations.checked && selectedStations.size > 1) {
        allValue = 'block';
        individualValue = 'none';
    }
    else {
        allValue = 'none';
        individualValue = 'block';
    }
    setCanvasDisplay(allStationsId, allValue);
    setCanvasDisplay(selectedStations, individualValue);
}
function applyStationSelection(event) {
    warn("");
    let target = event.target;
    let stationId = target.value;
    if (target.checked)
        selectedStations.add(stationId);
    else
        selectedStations.delete(stationId);
    setCanvasDisplay(stationId, target.checked);
    setAllCanvasDisplay();
    if (selectedStations.size <= 1)
        allStations.checked = false;
    populateSelectedStationsNavigationBar();
}
function switchChartType() {
    setAllCanvasDisplay();
    if (selectedStations.size <= 1 && allStations.checked) {
        warn("Select more than one station to show all stations in a single chart");
        allStations.checked = false;
        searchTextInput.focus();
    }
    if (selectedStations.size <= 1)
        return;
    renderChart();
}
async function getChartData() {
    let stationsChartData = {};
    await getStationsYearData(); // Get data for selected stations and years
    let commonDatesPerStation = getCommonDatesPerStation();
    const { [allStationsId]: allStationsChart, ...stationsCharts } = charts;
    const selectedDatasets = selectedStations.union(selectedYears);
    if (allStations.checked && selectedStations.size > 1) {
        const cachedDatasets = new Set();
        if (allStationsChart?.data.datasets.length > 0) {
            // remove unselected stations/years from datasets
            const datasets = allStationsChart.data.datasets;
            for (let i = datasets.length - 1; i >= 0; i--) {
                let stationId = datasets[i].stationId;
                let year = datasets[i].year;
                if (selectedStations.has(stationId) && selectedYears.has(year)) {
                    cachedDatasets.add(stationId);
                    cachedDatasets.add(year);
                    continue;
                }
                else
                    datasets.splice(i, 1); // del array element by index
            }
        }
        if (areSetsEqual(selectedDatasets, cachedDatasets))
            stationsChartData[allStationsId] = allStationsChart.data;
        else {
            // Get common dates across all stations
            const labels = Array.from(Object.values(commonDatesPerStation).reduce((acc, cur) => acc.intersection(cur))).sort();
            let chartData = {
                labels,
                datasets: Array.from(selectedStations).flatMap(stationId => {
                    let name = stationsCache.getName(stationId).replace(/[\p{P}\p{Z}]+.*$/gu, '');
                    return Array.from(selectedYears).map(year => newChartDataset({ stationId, year, label: name + '-' + year, dates: labels }));
                }),
            };
            stationsChartData[allStationsId] = chartData;
        }
    }
    else {
        let cachedDatasets = new Set();
        for (let [stationId, chart] of Object.entries(stationsCharts)) {
            stationsChartData[stationId] = chart.data;
            cachedDatasets = cachedDatasets.add(stationId).union(new Set(chart.data.datasets.map(dataset => dataset.label)));
        }
        if (!areSetsEqual(selectedDatasets, cachedDatasets)) {
            for (const stationId of selectedStations) {
                // if (stationId in charts) { }
                let labels = Array.from(commonDatesPerStation[stationId]).sort();
                let chartData = {
                    labels,
                    datasets: Array.from(selectedYears).map(year => newChartDataset({ stationId, year, label: year, dates: labels })),
                };
                stationsChartData[stationId] = chartData;
            }
        }
    }
    return stationsChartData;
}
function newChartDataset({ stationId, year, label, dates }) {
    let rgb;
    let dataset = {
        label,
        data: dates.map(date => stationsCache.getData(stationId)[year][date].tmax),
    };
    if (label == year) {
        rgb = getRGBValue('27500', year);
    }
    else {
        rgb = getRGBValue(stationId, year);
        // Additional properties for all stations chart
        dataset.stationId = stationId;
        dataset.year = year;
    }
    dataset.borderColor = rgb;
    dataset.backgroundColor = rgb;
    return dataset;
}
async function renderChart(event = undefined) {
    if (!isResearchSelected(event))
        return;
    setAllCanvasDisplay();
    clearSearchResults(false);
    if (!canvasContainer)
        throw new Error('Canvas container is missing');
    const stationsChartData = await getChartData();
    for (let [stationId, chart] of Object.entries(stationsChartData).sort(([a,], [b,]) => stationsCache.getName(a).localeCompare(stationsCache.getName(b)))) {
        let title = ['Historic Daily High Air Temperature in ' + stationsCache.getName(stationId)];
        if (chart.datasets.length > 1)
            title.push('Click on the legend icon to deselect/reselect the graph');
        const options = {
            responsive: true,
            tension: 0.4,
            plugins: {
                title: {
                    display: true,
                    text: title
                },
            },
        };
        if (stationId in charts) {
            charts[stationId].options = options; // Update chart's options
            charts[stationId].data = chart; // Update chart's data
            charts[stationId].update(); // Refresh the chart
        }
        else {
            const canvas = document.createElement("canvas");
            canvas.setAttribute('id', `canvas-${stationId}`);
            canvasContainer.appendChild(canvas);
            charts[stationId] = new Chart(canvas, {
                type: "line",
                options,
                data: chart,
            });
        }
    }
}
function createCheckboxesForSelectedStations() {
    if (selectedLocation)
        selectedLocation.innerHTML = '';
    if (stationsCheckboxContainer) {
        // Recreate checkboxes in sorted order every time a new element is inserted.
        stationsCheckboxContainer.innerHTML = '';
        stationsCache.getSortedArrayBy('name').forEach(([id, { name }]) => {
            let stationCheckboxId = 'station-checkbox-' + id;
            const checkboxItem = document.createElement("div"); // Create a wrapper for checkbox and label
            let checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = stationCheckboxId;
            checkbox.value = id;
            checkbox.checked = selectedStations.has(id);
            // Append the checkbox and label to the checkbox item
            checkboxItem.appendChild(checkbox);
            appendStationWithFlag(checkboxItem, id);
            // Append the checkbox item to the checkbox container
            stationsCheckboxContainer.appendChild(checkboxItem);
        });
        populateSelectedStationsNavigationBar();
        stationsCheckboxContainer.parentElement.style.visibility = 'visible';
    }
}
function createCheckboxesForSelectedStations1() {
    if (selectedLocation)
        selectedLocation.innerHTML = '';
    if (stationsCheckboxContainer) {
        // Recreate checkboxes in sorted order every time a new element is inserted.
        stationsCheckboxContainer.innerHTML = '';
        stationsCache.getSortedArrayBy('name').forEach(([id, { name }]) => {
            let stationCheckboxId = 'station-checkbox-' + id;
            const checkboxItem = document.createElement("div"); // Create a wrapper for checkbox and label
            let checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = stationCheckboxId;
            checkbox.value = id;
            checkbox.checked = selectedStations.has(id);
            const label = document.createElement("label");
            label.htmlFor = stationCheckboxId;
            label.innerText = `${name} (${id})`;
            // Append the checkbox and label to the checkbox item
            checkboxItem.appendChild(checkbox);
            checkboxItem.appendChild(label);
            // Append the checkbox item to the checkbox container
            stationsCheckboxContainer.appendChild(checkboxItem);
        });
        populateSelectedStationsNavigationBar();
        stationsCheckboxContainer.parentElement.style.visibility = 'visible';
    }
}
function createYearSelection() {
    // Create checkboxes for the last 10 years
    const currentYear = new Date().getFullYear();
    for (let i = 9; i >= 0; i--) {
        const year = currentYear - i;
        const checkboxItem = document.createElement("div"); // Create a wrapper for checkbox and label
        checkboxItem.className = "checkbox-year"; // Add class for styling
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `year${year}`;
        checkbox.value = year.toString();
        const label = document.createElement("label");
        label.htmlFor = `year${year}`;
        label.innerText = year.toString();
        // Append the checkbox and label to the checkbox item
        checkboxItem.appendChild(checkbox);
        checkboxItem.appendChild(label);
        // Append the checkbox item to the checkbox container
        yearCheckboxContainer?.appendChild(checkboxItem);
    }
}
function warn(message, cls = '') {
    submissionWarning.textContent = message;
    if (message)
        submissionWarning.parentElement.style.visibility = 'visible';
    else
        submissionWarning.parentElement.style.visibility = 'hidden';
    if (cls)
        submissionWarning.classList.toggle(cls);
}
function checkedBoxes(checkBoxContainer) {
    let ids = Array.from(checkBoxContainer.querySelectorAll('input[type="checkbox"]:checked'))
        .filter((checkbox) => checkbox instanceof HTMLInputElement)
        .map((checkbox) => checkbox.value);
    return new Set(ids);
}
function areSetsEqual(setA, setB) {
    if (setA.size != setB.size)
        return false;
    return !Boolean(setA.symmetricDifference(setB).size);
}
function appendStationWithFlag(element, stationId, name = '', country = '') {
    // Need to use NS (Name Space) version of the createElement for dynamic SVG to work
    if (!element || !stationId)
        return;
    country ||= stationsCache.getCountry(stationId);
    if (country) {
        country = country.toLowerCase();
        const eSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const eImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
        let href = $flagURLTemplate.formatUnicorn({ country });
        eImage.setAttribute("href", href);
        eSVG.appendChild(eImage);
        element.appendChild(eSVG);
    }
    const eName = document.createElement("span");
    eName.textContent = name || stationsCache.getName(stationId);
    element.appendChild(eName);
}
function populateSelectedStationsNavigationBar() {
    if (!selectedStations.size) {
        selectedLocation.innerHTML = '<span style="margin-left: 1em;">Not Set</span>';
        return;
    }
    selectedLocation.innerHTML = '';
    for (let [id, { name, country }] of stationsCache.getStations(selectedStations).getSortedArrayBy('name')) {
        appendStationWithFlag(selectedLocation, id, name, country);
    }
}
async function getFlagURL(country, sourceFolder = '../flags/') {
    // Not working due to CORS restrictions
    try {
        country = country.toLowerCase();
        let path = sourceFolder + country + '.svg';
        let response = await fetch(path, { method: 'HEAD' });
        if (response.ok)
            return path;
        else
            return $flagsRoot + country + '.svg';
    }
    catch (error) {
        console.error('Error:', error);
    }
    return '';
}
async function populateSearchResults(searchString) {
    if (updatingSearchResults)
        return;
    if (searchString.length <= 2) {
        clearSearchResults(false);
        return;
    }
    clearSearchResults(false);
    updatingSearchResults = true;
    const url = autoCompleteURLTemplate.formatUnicorn({ location: searchString, locale: $locale });
    let data = {};
    try {
        // Show loading spinner, hide magnifying glass
        magnifyingGlass.style.display = 'none';
        loadingSpinner.style.display = 'block';
        // fetch data
        ({ data } = await fetchJson(url, { signal: abortController.signal }));
        // Hide loading spinner, show magnifying glass again
        loadingSpinner.style.display = 'none';
        magnifyingGlass.style.display = 'block';
    }
    catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            updatingSearchResults = false;
            return;
        }
    }
    if (Object.keys(data).length === 0) {
        updatingSearchResults = false;
        return;
    }
    const locationClass = 'search-result list-group-item list-group-item-action';
    const searchHeaderClass = "search-category list-group-item fw-bold";
    function insertHeader(container, text) {
        const header = document.createElement('div');
        header.className = searchHeaderClass;
        header.innerText = 'Weather Stations';
        container.appendChild(header);
    }
    async function selectClickedLocation(event) {
        // This refers to the clicked element
        event.preventDefault(); // Prevent the default action (navigation)
        let id = this.getAttribute('data-id');
        let name = this.getAttribute('data-name');
        let country = this.getAttribute('data-country');
        let region = this.getAttribute('data-region');
        let active = (this.getAttribute('data-active') == 'true');
        if (id == null || name == null || country == null)
            return;
        let locationType = this.getAttribute('data-type');
        if (locationType === 'place') {
            const placeURL = $locationURLTemplate.formatUnicorn({ id, country: country.toLowerCase() });
            const { place: { location: { latitude, longitude } } } = await fetchJson(placeURL);
            const nearbyStationURL = $nearbyStationURLTemplate.formatUnicorn({ latitude, longitude });
            // Destructure directly into "station" object
            ({ data: { id, name } } = await fetchJson(nearbyStationURL));
        }
        stationsCache.upsert(id, new Station({ name, country, region, active }));
        selectedStations.add(id);
        createCheckboxesForSelectedStations();
    }
    // Add Places
    // Cannot use places because there is no API to find the nearest station
    if (placesSearchContainer && data.places) {
        insertHeader(placesSearchContainer, 'Places');
        data.places.forEach(place => {
            let img = $flagImgTemplate.formatUnicorn({ country: place.country.toLowerCase() });
            const placeLink = document.createElement('a');
            placeLink.className = locationClass;
            placeLink.setAttribute('data-id', place.id);
            placeLink.setAttribute('data-country', place.country);
            placeLink.setAttribute('data-name', place.name);
            placeLink.setAttribute('data-type', 'place');
            placeLink.innerHTML = `
      ${img}
      <span>${place.name}</span>
      `;
            placesSearchContainer.appendChild(placeLink);
            placeLink.addEventListener('click', selectClickedLocation);
        });
    }
    // Add Weather Stations
    if (stationsSearchContainer && data.stations) {
        insertHeader(stationsSearchContainer, 'Weather Stations');
        data.stations.forEach(async (matchedStation) => {
            if (!matchedStation.active)
                return;
            const stationLink = document.createElement('a');
            stationLink.className = locationClass;
            stationLink.setAttribute('data-id', matchedStation.id);
            stationLink.setAttribute('data-country', matchedStation.country);
            stationLink.setAttribute('data-name', matchedStation.name);
            stationLink.setAttribute('data-region', matchedStation.region);
            stationLink.setAttribute('data-active', matchedStation.active.toString());
            stationLink.setAttribute('data-type', 'station');
            let img = $flagImgTemplate.formatUnicorn({ country: matchedStation.country.toLowerCase() });
            // let img = await getFlagURL(matchedStation.country);
            stationLink.innerHTML = `
      ${img}
      <span>${matchedStation.name}</span>
      <small class="text-muted">, ${matchedStation.region}</small>
      <code class="badge text-dark border ms-auto">${matchedStation.id}</code>
    `;
            stationsSearchContainer.appendChild(stationLink);
            stationLink.addEventListener('click', selectClickedLocation);
        });
    }
    updatingSearchResults = false;
}
function searchLocation() {
    searchTextInput.addEventListener("input", async function () {
        await populateSearchResults(this.value);
    });
}
function clearSearchResults(clearSearchText = true) {
    if (updatingSearchResults)
        abortController.abort();
    if (placesSearchContainer)
        placesSearchContainer.innerHTML = '';
    if (stationsSearchContainer)
        stationsSearchContainer.innerHTML = '';
    if (clearSearchText)
        searchTextInput.value = '';
    warn('');
}
function isInteger(val) {
    if (val && val.length && /^\s*\d+\s*$/.test(val))
        return true;
    else
        return false;
}
function keyDownHandler() {
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape')
            clearSearchResults();
        if (event.key === 'Enter' && document.activeElement === searchTextInput)
            populateSearchResults(searchTextInput.value);
    });
}
// Templates
const $locationURLTemplate = "https://meteostat.net/props/en/place/${country}/${id}";
const $nearbyStationURLTemplate = "https://d.meteostat.net/app/nearby?lang=en&limit=1&lat=${latitude}&lon=${longitude}";
const $flagsRootLocal = '../flags/';
const $flagsRoot = 'https://media.meteostat.net/assets/flags/4x3/';
const $flagURLTemplate = $flagsRoot + '${country}.svg';
const $flagImgTemplate = '<img src="' + $flagURLTemplate + '"class="country-flag me-2" alt="${country}">';
const $api = "https://d.meteostat.net/app/";
const $locale = "en";
const autoCompleteURLTemplate = $api + "autocomplete?q=${location}&lang=${locale}";
const stationURLTemplate = $api + "proxy/stations/daily?station=${stationId}&start=${start}&end=${end}";
// Web Elements
const searchTextInput = document.getElementById("search");
const placesSearchContainer = document.getElementById('places-search-container');
const stationsSearchContainer = document.getElementById('stations-search-container');
const selectedLocation = document.getElementById("selectedLocation");
const stationsCheckboxContainer = document.getElementById("stations-checkboxes");
const yearCheckboxContainer = document.getElementById("years-checkboxes");
const customInput = document.getElementById("customInput");
const submissionWarning = document.getElementById("submissionWarning");
const canvasContainer = document.getElementById("canvas-container");
const magnifyingGlass = document.getElementById('magnifyingGlass');
const loadingSpinner = document.getElementById('loadingSpinner');
const allStations = document.getElementById("all-stations");
// Main Listeners
document.getElementById("input-form")?.addEventListener('submit', event => { event.preventDefault(); renderChart(event); });
stationsCheckboxContainer.addEventListener('change', applyStationSelection);
allStations.addEventListener('change', switchChartType);
// Script Variables
const allStationsId = 'all stations';
const abortController = new AbortController();
const today = new Date();
const todayYear = today.getFullYear().toString();
const stationsCache = new Stations();
let selectedStations = new Set();
let selectedYears = new Set();
let priorSubmission = new Set();
const charts = {};
let updatingSearchResults = false;
clearSearchResults();
searchLocation();
populateSelectedStationsNavigationBar();
createYearSelection();
keyDownHandler();
// TODO: clear canvas when not year selection
// TODO: clear canvas when station is unselected
