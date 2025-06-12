"use strict";
class DateRange {
    start = '';
    end = '';
}
class Station {
    // Station object
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
    get(property) {
        if (property in this)
            return this[property];
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
    getStationData(id) {
        // Returns the years object with weather data for a given station ID.
        // { year: { 'mm-dd': { tmax: 30, tmin: 20, ... }, ... }, ... }
        return this[id]?.data;
    }
    getStationYearData(id, year) {
        // Returns the weather data for a given station ID and year.
        // { 'mm-dd': { tmax: 30, tmin: 20, ... }, ... }
        this[id].data[year] ??= {}; // Initialize if not present
        return this[id].data[year];
    }
    getStationYearWeatherParameters(id, year, date) {
        // Returns the weather data for a given station ID, year and date.
        // { tmax: 30, tmin: 20, ... }
        return this.getStationYearData(id, year)[date] || {};
    }
    getNameOrId(id) {
        return this[id]?.name ?? id;
    }
    getCountry(id) {
        return this[id]?.country;
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
function getRGBValue0(stationId, year) {
    // This implementation multiplies the parsed year by 10,000
    // and adds it to the numeric part of the station ID to create a hash.However,
    // because the RGB components are calculated using modulo 256, and the year is
    // simply scaled and added, years that are close together(e.g., 2020, 2021, 2022,
    // etc.) will often produce similar or even identical colors—especially if the
    // numeric part of the station ID is small or zero.
    // Why does this happen ?  The difference between consecutive years(e.g., 2021
    // and 2022) is only 10,000 in the hash.  When multiplied and then taken modulo
    // 256, this difference often "wraps around" and produces the same or similar RGB
    // values.  The hash function is not distributing the year and station ID
    // information evenly across the color space.
    let numericId = stationId.match(/\d+/) ? parseInt(stationId.replace(/\D/g, '')) : 1; // Default to 1 if no numeric characters
    let numericYear = Number.isNaN(parseInt(year)) ? 0 : parseInt(year) * 10000;
    let hash = numericId + numericYear;
    const r = (hash * 10) % 256; // Red component
    const g = (hash * 100) % 256; // Green component
    const b = (hash * 1000) % 256; // Blue component
    // Return hex color string
    let hexColor = (1 << 24) + (r << 16) + (g << 8) + b;
    return "#" + hexColor.toString(16).slice(1).toUpperCase();
}
function getRGBValue1(stationId, year) {
    // This function uses both the station ID and year as a string, so even small
    // changes(like a different year) will result in a very different color.  The
    // hash is distributed across all three color channels, reducing the chance of
    // similar or duplicate colors for nearby years.
    // This code implements the djb2 string hash algorithm, a simple and popular
    // method for generating a numeric hash from a string. It starts by
    // initializing the hash value to 5381, a commonly used seed for this
    // algorithm. Then, it iterates over each character in the input string (str).
    // For each character, it updates the hash by multiplying the current hash by
    // 33 (achieved by shifting left by 5 bits and adding the original hash) and
    // then adding the Unicode code point of the character. This process mixes the
    // characters of the string into the hash value, producing a well-distributed
    // integer result. The djb2 algorithm is widely used for its simplicity and
    // reasonably good distribution of hash values for different input strings. In
    // this context, it helps generate a unique color for each combination of
    // station ID and year.
    const str = `${stationId}-${year}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    // Mix the bits to spread out similar inputs
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = (hash >> 16) ^ hash;
    // Extract RGB
    const r = (hash & 0xFF0000) >> 16;
    const g = (hash & 0x00FF00) >> 8;
    const b = (hash & 0x0000FF);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}
function getRGBValue2(stationId, year) {
    const str = `${stationId}-${year}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = (hash >> 16) ^ hash;
    let r = (hash & 0xFF0000) >> 16;
    let g = (hash & 0x00FF00) >> 8;
    let b = (hash & 0x0000FF);
    // Clamp RGB values to avoid too-bright colors
    const min = 40; // Minimum value for each channel (avoid too dark)
    const max = 200; // Maximum value for each channel (avoid too light)
    r = Math.max(min, Math.min(max, r));
    g = Math.max(min, Math.min(max, g));
    b = Math.max(min, Math.min(max, b));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}
function getDistinctColor(stationId, year, totalVariants = 20) {
    // Create a unique index for each (station, year) pair
    const str = `${stationId}-${year}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) & 0x7FFFFFFF;
    }
    // Spread hues evenly
    const hue = Math.floor((hash % totalVariants) * (360 / totalVariants));
    const saturation = 80;
    const lightness = 45;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
function getDistinctColor1(stationId, year) {
    // Combine stationId and year into a single string and hash it to an integer
    const str = `${stationId}-${year}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) & 0xFFFFFFFF;
    }
    // Use golden angle to spread hues
    const goldenAngle = 137.508;
    // Use the hash as an index to multiply by the golden angle
    const hue = Math.abs(Math.floor(hash * goldenAngle)) % 360;
    const saturation = 70; // percent
    const lightness = 50; // percent
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
function getRGBValue(stationId, year) {
    return getRGBValue1(stationId, year);
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
function findOrFillMissingDatesData(year, dateRange, data, missingData) {
    let startDate = new Date(year + "-" + dateRange.start);
    let endDate = new Date(year + "-" + dateRange.end);
    let missingRange = new DateRange();
    let missingRanges = [];
    let priorDate = "";
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
async function IDBInit() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(idbName);
        request.onerror = function () { reject(request.error); };
        request.onupgradeneeded = function () {
            try {
                request.result.createObjectStore(storeName);
            }
            catch (error) {
                reject(error); // If there is an error during upgrade, reject the Promise
            }
        };
        request.onsuccess = function () {
            try {
                idxDB = request.result;
                resolve(); // Resolve the Promise when successful
            }
            catch (error) {
                reject(error); // If there is an error during success, reject the Promise
            }
        };
    });
}
async function getStorageItem(stationYear, from = 'localStorage') {
    return new Promise((resolve, reject) => {
        let result = {};
        if (from === 'localStorage') {
            let text = localStorage.getItem(stationYear);
            if (text)
                result = JSON.parse(text);
            resolve(result);
        }
        else {
            const store = idxDB.transaction(storeName, 'readwrite').objectStore(storeName);
            const request = store.get(stationYear);
            request.onerror = function () { reject(request.error); };
            request.onsuccess = function () {
                if (request.result)
                    result = request.result;
                resolve(result);
            };
        }
    });
}
async function setStorageItem(stationYear, stationYearStore, from = 'localStorage') {
    return new Promise((resolve, reject) => {
        if (from === 'localStorage') {
            let text = JSON.stringify(stationYearStore);
            localStorage.setItem(stationYear, text);
            resolve();
        }
        else {
            const store = idxDB.transaction(storeName, 'readwrite').objectStore(storeName);
            const request = store.put(stationYearStore, stationYear);
            request.onerror = function () { reject(request.error); };
            request.onsuccess = function () { resolve(); };
        }
    });
}
async function fetchStationYearData(stationId, year, start, end) {
    // For the given station ID and year, try to get weather data from local storage, if not present get via API.
    // Save obtained data into stationsCache object by reference getYearData(stationId, year).
    let stationYearCache = stationsCache.getStationYearData(stationId, year);
    let stationYear = stationId + '-' + year;
    let missingCache = findOrFillMissingDatesData(year, { start, end }, stationYearCache);
    if (!missingCache.length)
        return;
    let missingLocalStorage = [];
    let stationYearStore = await getStorageItem(stationYear, 'IndexedDB');
    if (Object.keys(stationYearStore).length) {
        for (let missingRange of missingCache)
            missingLocalStorage.push(...findOrFillMissingDatesData(year, missingRange, stationYearStore, stationYearCache));
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
                        stationYearStore[date] = row;
                        stationYearCache[date] = row;
                    }
                }
            }
            await setStorageItem(stationYear, stationYearStore, 'IndexedDB');
        }
    });
    await Promise.all(promises);
    warn("", 'blink');
}
async function fetchAllStationsYearData() {
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
            promises.push(fetchStationYearData(stationId, year, start, end));
        }
    }
    try {
        await Promise.all(promises);
    }
    catch (error) {
        console.error("Error fetching stations data:", error);
    }
    return getCommonDatesData();
}
function getCommonDatesData() {
    // Get common dates across all years and their data for each selected station
    // Note: this function assumes that stationsCache has been populated with data
    // for selected stations and years. Yeach year may have different dates, so we
    // need to find the intersection of dates.
    let stations = {};
    for (const stationId of selectedStations) {
        stations[stationId] = Array
            .from(selectedYears)
            .map(year => new Set(Object.keys(stationsCache.getStationYearData(stationId, year))))
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
    return stations;
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
async function switchChartType() {
    setAllCanvasDisplay();
    if (selectedStations.size <= 1 && allStations.checked) {
        warn("Select more than one station to show all stations in a single chart");
        allStations.checked = false;
        searchTextInput.focus();
    }
    if (selectedStations.size <= 1)
        return;
    await renderChart();
}
async function getChartData() {
    let stationsChartData = {};
    // Get data for selected stations and years
    let stationsCommonDatesData = await fetchAllStationsYearData();
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
            const labels = Array.from(Object.values(stationsCommonDatesData).reduce((acc, cur) => acc.intersection(cur))).sort();
            stationsChartData[allStationsId] = {
                labels,
                // For each selected station, create datasets for each selected year
                // The flatMap ensures that all datasets for all years and stations are returned as a single, flat array,
                // which is useful for charting libraries that expect a list of datasets rather than a nested array structure.
                // This approach efficiently prepares the data needed to visualize temperature trends for multiple stations and years in a chart.
                datasets: Array
                    .from(selectedStations)
                    .flatMap(stationId => {
                    // Remove punctuation and whitespace characters, and everything after them, from the station name
                    let name = stationsCache.getNameOrId(stationId).replace(/[\p{P}\p{Z}]+.*$/gu, "");
                    return Array.from(selectedYears).map((year) => newChartDataset({ stationId, year, label: name + "-" + year, dates: labels }));
                }),
            };
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
                let labels = Array.from(stationsCommonDatesData[stationId]).sort();
                let chartData = {
                    labels,
                    // datasets: Array.from(selectedYears).map(year => newChartDataset({ stationId, year, label: year, dates: labels })),
                    datasets: Array.from(selectedYears).map(year => newChartDataset({ stationId, year, label: getRGBValue(stationId, year), dates: labels })),
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
        data: dates.map(date => stationsCache.getStationYearWeatherParameters(stationId, year, date)?.tmax),
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
    for (let [stationId, chart] of Object.entries(stationsChartData).sort(([a,], [b,]) => stationsCache.getNameOrId(a).localeCompare(stationsCache.getNameOrId(b)))) {
        let title = ['Historic Daily High Air Temperature in ' + stationsCache.getNameOrId(stationId)];
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
    eName.textContent = name || stationsCache.getNameOrId(stationId);
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
        header.innerText = text;
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
            let imgHTML = $flagImgTemplate.formatUnicorn({ country: place.country.toLowerCase() });
            const placeLink = document.createElement('a');
            placeLink.className = locationClass;
            placeLink.setAttribute('data-id', place.id);
            placeLink.setAttribute('data-country', place.country);
            placeLink.setAttribute('data-name', place.name);
            placeLink.setAttribute('data-type', 'place');
            placeLink.innerHTML = `
      ${imgHTML}
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
            let imgHTML = $flagImgTemplate.formatUnicorn({ country: matchedStation.country.toLowerCase() });
            stationLink.innerHTML = `
      ${imgHTML}
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
searchTextInput.addEventListener("input", async function () { await populateSearchResults(this.value); });
// Script Variables
const idbName = 'WeatherStationDB';
const storeName = 'StationYearStore';
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
let idxDB;
// main()
window.addEventListener('load', async () => {
    await IDBInit();
    clearSearchResults();
    populateSelectedStationsNavigationBar();
    createYearSelection();
    keyDownHandler();
});
