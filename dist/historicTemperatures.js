"use strict";
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: valid use case
function isInstanceOf(error, constructors) {
    if (!constructors)
        return false;
    return constructors.some((E) => error instanceof E);
}
async function catchErrorResult(promise, errorsToCatch = [Error]) {
    try {
        const value = await promise;
        return { ok: true, value };
    }
    catch (error) {
        if (isInstanceOf(error, errorsToCatch))
            return { ok: false, error };
        throw error;
    }
}
class WeatherParameters {
    static keys = ["tmax", "tmin"];
    tmax = undefined;
    tmin = undefined;
    /*
    tavg: number | undefined = undefined;
    prcp: number | undefined = undefined;
    snow: number | undefined = undefined;
    wdir: number | undefined = undefined;
    wspd: number | undefined = undefined;
    wpgt: number | undefined = undefined;
    pres: number | undefined = undefined;
    tsun: number | undefined = undefined;
    */
    // [key: string]: number | undefined; // index signature for Object.keys(this)
    constructor(src = {}) {
        // for (const key of Object.keys(this))
        for (const key of WeatherParameters.keys)
            if (key in src && src[key] != null)
                // Check if the key exists in source and is not null
                this[key] = src[key];
    }
}
async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const contentType = response.headers.get("Content-Type");
    let json;
    if (contentType?.includes("application/json")) {
        json = (await response.json());
    }
    else if (contentType?.includes("text/")) {
        const text = await response.text();
        json = JSON.parse(text);
    }
    else
        throw new Error(`Unsupported content type: ${contentType}`);
    return json;
}
class ChartDataset {
    label;
    data;
    cubicInterpolationMode;
    tension;
    borderColor; // '#FFB1C1'
    backgroundColor; // '#FFB1C1'
    // user properties, not in standard chart.js
    stationId;
    stationName;
    year;
    weatherParameter;
    datasetId = new Set();
    constructor(type, weatherParameter, stationId, year, dates) {
        // Remove punctuation and whitespace characters, and everything after them, from the station name
        let rgb;
        const stationName = stations.getNameOrId(stationId);
        const yearParam = `${year} ${weatherParameter.substring(1) === "max" ? "High" : "Low"}`;
        if (type === "all") {
            rgb = getRGBValue(stationId, yearParam);
            this.label = `${stationName} ${yearParam}`; // Label for all stations is station name + year parameter
        }
        else {
            rgb = getRGBValue("27500", yearParam); // Use a fixed station ID for single station color
            this.label = yearParam; // Label for single station is year + weather parameter
        }
        this.data = dates.map((date) => stations.getStationYearWeatherParameter(stationId, year, date, weatherParameter));
        this.borderColor = rgb;
        this.backgroundColor = rgb;
        // Custom properties
        this.stationId = stationId;
        this.stationName = stationName;
        this.year = year;
        this.weatherParameter = weatherParameter;
        this.datasetId = new Set([stationId, year, weatherParameter]);
    }
}
class ChartData {
    labels; // Sorted array of short dates (mm-dd)
    datasets;
    /**
     * Constructs a ChartData object.
     * @param stationId - The station ID for which to create datasets
     * @param dates - An array of date strings (mm-dd) to use as labels for the chart.
     *
     * If stationId is 'all', creates datasets for each selected station and year, flattening the result.
     * Otherwise creates datasets for the selected years for the given station.
     */
    constructor({ stationId, dates }) {
        this.labels = dates; // sorted short dates (mm-dd)
        const years = Array.from(selectedYears);
        const weatherParameters = Array.from(selectedParams);
        if (stationId === allStationsId)
            this.datasets = Array.from(selectedStations)
                .map((station) => weatherParameters.map((param) => years.map((year) => new ChartDataset("all", param, station, year, dates))))
                .flat(2);
        else
            this.datasets = weatherParameters.flatMap((param) => years.map((year) => new ChartDataset("single", param, stationId, year, dates)));
    }
    isLastDate(shortDate) {
        if (this?.labels.length > 0)
            if (Array.isArray(shortDate))
                return shortDate.includes(this.labels[this.labels.length - 1]);
            else
                return this.labels[this.labels.length - 1] === shortDate;
        return false;
    }
}
class DateRange {
    start = "";
    end = "";
}
class Station {
    name;
    country;
    region;
    active;
    data;
    constructor({ name, country, region, active, data = {} }) {
        this.name = name.replace(/[\p{P}\p{Z}]+.*$/gu, "");
        this.country = country;
        this.region = region ?? null;
        this.active = active;
        this.data = data;
    }
    get(property) {
        return this[property];
    }
}
class Stations {
    [Symbol.iterator]() {
        // Only grab keys that map to actual Station instances, skipping methods
        const keys = Object.keys(this).filter((key) => this[key] instanceof Station);
        let index = 0;
        return {
            next: () => {
                if (index < keys.length) {
                    const key = keys[index++];
                    // Cast explicitly since we guaranteed it's a Station via the filter
                    const value = { [key]: this[key] };
                    return { value, done: false };
                }
                return { value: undefined, done: true };
            },
        };
    }
    get(id) {
        const value = this[id];
        return value instanceof Station ? value : undefined;
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
    getStationData(id) {
        // Returns the years object with weather data for a given station ID.
        // { year: { 'mm-dd': { tmax: 30, tmin: 20, ... }, ... }, ... }
        const station = this.get(id);
        return station?.data ?? {};
    }
    hasStationYearData(id, year) {
        // Check if the station has weather data for a given year.
        // Returns true if the station ID and year exist in the data.
        const station = this.get(id);
        if (station?.data)
            return station.data[year] && Object.keys(station.data[year]).length > 0;
        return false;
    }
    getStationYearData(id, year) {
        // Returns the weather data for a given station ID and year.
        // { 'mm-dd': { tmax: 30, tmin: 20, ... }, ... }
        const station = this.get(id);
        if (station?.data) {
            station.data[year] ??= {};
            return station.data[year];
        }
        return {};
    }
    getNameOrId(id) {
        return this.get(id)?.name ?? id;
    }
    getCountry(id) {
        return this.get(id)?.country;
    }
    getStationYearDataDates(id, year) {
        return Object.keys(this.getStationYearData(id, year));
    }
    getStationYearWeatherParameter(id, year, date, parameter) {
        // Returns the weather data for a given station ID, year and date.
        // { tmax: 30, tmin: 20, ... }
        return this.getStationYearData(id, year)?.[date]?.[parameter];
    }
    getSortedArrayBy(property) {
        return Object.entries(this)
            .filter((pair) => pair[1] instanceof Station)
            .sort(([, a], [, b]) => {
            const aValue = a[property];
            const bValue = b[property];
            if (typeof aValue === "string" && typeof bValue === "string")
                return aValue.localeCompare(bValue);
            if (typeof aValue === "number" && typeof bValue === "number")
                return aValue - bValue;
            return 0;
        });
    }
}
function formatUnicorn(str, params) {
    return str
        .replace(/\$\{([^}]+)\}/g, (_, key) => {
        // String template replacement implicitly handles string coercion safely
        return key in params ? String(params[key]) : "";
    })
        .trim();
}
function getRGBValue(stationId, year) {
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
    const yearNum = parseInt(year, 10);
    // Applying djb2 hash algorithm to the input string
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    // Mix the bits to spread out similar inputs
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = (hash >> 16) ^ hash;
    // Introduce more variability between year and station
    const r = (hash & 0xff0000) >> 16;
    const g = (hash & 0x00ff00) >> 8;
    const b = hash & 0x0000ff;
    // Apply small variations to ensure perceptible differences
    // Increase the range of each channel slightly
    const adjustedR = (r + (yearNum % 256)) % 256;
    const adjustedG = (g + ((yearNum * 2) % 256)) % 256;
    const adjustedB = (b + ((stationId.length * 5) % 256)) % 256;
    // Return the color as hex code
    return `#${((1 << 24) + (adjustedR << 16) + (adjustedG << 8) + adjustedB).toString(16).slice(1).toUpperCase()}`;
}
function allValuesAreMissing(obj, keys = []) {
    // Use Object.keys if no specific keys array is supplied
    const targetKeys = keys.length ? keys : Object.keys(obj);
    if (targetKeys.length === 0)
        return false;
    for (const key of targetKeys)
        if (obj[key] != null)
            return false;
    return true;
}
function findOrFillMissingDatesData(year, dateRange, data, missingData) {
    if (!data || !Object.keys(data).length)
        return [dateRange]; // If no data, return supplied date range as missing
    const missingRanges = [];
    if (missingData &&
        dateRange.end in missingData &&
        ((selectedYears.has(todayYear) && dateRange.end === todayDate) ||
            (!selectedYears.has(todayYear) && dateRange.end === "12-31")))
        return missingRanges; // If the end date is in data, return empty array
    const startDate = new Date(`${year}-${dateRange.start}`);
    const endDate = new Date(`${year}-${dateRange.end}`);
    let missingRange = new DateRange();
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
function ZScoreOutliers(weatherParameters, threshold = 3) {
    for (const key of WeatherParameters.keys) {
        // Step 1: Calculate the Mean of the data
        const data = weatherParameters.map((parameters) => parameters[key]).filter((value) => value !== undefined);
        const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
        // Step 2: Calculate the Standard Deviation of the data
        const variance = data.reduce((sum, value) => sum + (value - mean) ** 2, 0) / data.length;
        const standardDeviation = Math.sqrt(variance);
        // Step 3: Calculate the Z-score for each data point
        for (const parameters of weatherParameters) {
            if (parameters[key] === undefined || standardDeviation === 0)
                continue;
            if (Math.abs(parameters[key] - mean) / standardDeviation > threshold)
                parameters[key] = undefined; // Undefine the outlier
        }
    }
}
function outliersByGroup(weatherData) {
    // Undefine outliers by group using the Interquartile Range (IQR) method or other methods
    const sortedData = Object.entries(weatherData).sort((a, b) => a[0].localeCompare(b[0]));
    // Group data by the index defined by the callback
    const groupedData = sortedData.reduce((acc, [, parameters], index) => {
        const groupIndex = Math.floor(index / 30); // Group by every 30 entries (based on array index)
        // Ensure the groupIndex exists in the accumulator
        if (!(groupIndex in acc))
            acc[groupIndex] = [];
        // Push the parameters for the current entry into the correct group
        acc[groupIndex].push(parameters);
        return acc;
    }, {});
    // Detect outliers for each group
    for (const [, parameters] of Object.entries(groupedData)) {
        const groupParameters = parameters;
        ZScoreOutliers(groupParameters, 3.5); // You can use modifiedZScoreOutliers or IQROutliers as well
        // modifiedZScoreOutliers(groupParameters, 3.5);
        // IQROutliers(groupParameters, 1.5);
    }
}
async function fetchStationYearData(idxDbName, storeName, stationId, year, startDate, endDate) {
    // For the given station ID and year, try to get weather data from local storage, if not present get via API.
    // Save obtained data into stations cache object by reference getYearData(stationId, year).
    const stationYearCache = stations.getStationYearData(stationId, year); // Get station year cache reference
    const missingCache = findOrFillMissingDatesData(year, { start: startDate, end: endDate }, stationYearCache);
    if (!missingCache.length)
        return;
    let missingLocalStorage = [];
    const stationYear = `${stationId}-${year}`;
    const stationYearStore = await getStorageItem("idxDB", stationYear, idxDbName, storeName);
    if (Object.keys(stationYearStore).length) {
        // Populate missing cache from local storage
        for (const missingRange of missingCache)
            missingLocalStorage.push(...findOrFillMissingDatesData(year, missingRange, stationYearStore, stationYearCache));
        if (!missingLocalStorage.length)
            return; // If no missing dates in local storage, exit
    }
    else
        missingLocalStorage = missingCache;
    // If the date range is not in the cache, fetch it from the API
    const promises = missingLocalStorage.map(async (missingRange) => {
        const start = `${year}-${missingRange.start}`;
        const end = `${year}-${missingRange.end}`;
        const url = formatUnicorn(stationURLTemplate, { stationId, start, end });
        // Fetch 'data' property from the Weather API object into sourceData
        // object destructuring + renaming during destructuring + type annotation (Typing is bolted on afterwards)
        // const { data: sourceData }: { data: SourceData[] } = await fetchJson(url);
        // object destructuring + renaming during destructuring + generics (Typing flows through the function naturally)
        // const { data: sourceData } = await fetchJson<{ data: SourceData[] }>(url);
        // object destructuring + renaming during destructuring + generics with API response type
        const { data: sourceData } = await fetchJson(url);
        if (sourceData.length > 0) {
            for (const row of sourceData)
                if (row.date)
                    stationYearCache[row.date.substring(5, 10)] = new WeatherParameters(row);
            // undefineOutliersIQR(Object.values(stationYearCache), 2.0); // Undefine outliers using the Interquartile Range (IQR) method
            outliersByGroup(stationYearCache); // Undefine outliers using the Interquartile Range (IQR) method
            for (const date of Object.keys(stationYearCache)) {
                if (allValuesAreMissing(stationYearCache[date]))
                    delete stationYearCache[date];
                else
                    stationYearStore[date] = stationYearCache[date]; // Copy the weather parameters to the store
            }
            // save the fetched data to indexedDB
            await setStorageItem("idxDB", stationYear, stationYearStore, idxDbName, storeName);
        }
    });
    await Promise.all(promises);
}
function getCommonDates() {
    // Get common dates across all years and their data for each selected station
    // Note: this function assumes that stationsCache has been populated with data
    // for selected stations and years. Yeach year may have different dates, so we
    // need to find the intersection of dates.
    const stationsCommonDatesArray = {};
    const stationsCommonDates = {};
    let allStationsCommonDates = new Set();
    // Manual reduction of dates for each station
    for (const stationId of selectedStations) {
        for (const year of selectedYears) {
            // Get the weather data for the station and year
            const dates = stations.getStationYearDataDates(stationId, year);
            // Initialize or update the station's dates set
            if (!stationsCommonDates[stationId])
                stationsCommonDates[stationId] = new Set(dates);
            else
                stationsCommonDates[stationId] = stationsCommonDates[stationId].intersection(new Set(dates));
        }
        stationsCommonDatesArray[stationId] = Array.from(stationsCommonDates[stationId]).sort(); // Sort the dates
        if (allStationsCommonDates.size === 0) {
            // If this is the first station, initialize allStationsCommonDates with its dates
            allStationsCommonDates = new Set(stationsCommonDates[stationId]);
        }
        else {
            // Otherwise, find the intersection with the existing allStationsCommonDates
            allStationsCommonDates = allStationsCommonDates.intersection(stationsCommonDates[stationId]);
        }
    }
    /* Alternative code
    for (const stationId of selectedStations) {
      stationsCommonDates[stationId] = Array
        .from(selectedYears)
        .map(year => new Set(Object.keys(stationsCache.getStationYearData(stationId, year))))
        .reduce((acc, cur) => acc.intersection(cur));
    }
    // Alternative code to get common dates across all selected stations and years
    stationsCommonDates = Object.fromEntries(
      Array
      .from(selectedStations)
      .map(stationId => {
        return [stationId, Array
          .from(selectedYears)
          .map(year => new Set(Object.keys(stationsCache.getData(stationId)[year])))
          .reduce((acc, cur) => acc.intersection(cur))
        ];
      })
    );
    // Alternative code to get common dates across all selected stations and years
    allStationsCommonDates = Array
      .from(Object.keys(stationsCommonDates))
      .map(stationId => stationsCommonDates[stationId])
      .reduce((acc, cur) => acc.intersection(cur));
    */
    return {
        stationsCommonDates: stationsCommonDatesArray,
        allStationsCommonDates: Array.from(allStationsCommonDates).sort(),
    };
}
async function applyStationSelection(event) {
    const target = event.target;
    const stationId = target.value;
    if (target.checked)
        selectedStations.add(stationId);
    else
        selectedStations.delete(stationId);
    if (selectedStations.size <= 1) {
        allStations.checked = false;
        allStations.disabled = true;
    }
    else
        allStations.disabled = false;
    await renderChart(event);
}
async function switchChartType(event) {
    if (selectedStations.size <= 1 && allStations.checked) {
        warn("Select more than one station to show all stations in a single chart");
        allStations.checked = false;
        searchTextInput.focus();
        return;
    }
    if (selectedStations.size <= 1)
        return;
    await renderChart(event);
}
function deleteUnselected(chart, cachedDataSets) {
    // remove unselected stations/years from datasets
    if (chart &&
        ((selectedYears.has(todayYear) && chart.isLastDate([yesterdayDate, todayDate])) ||
            (!selectedYears.has(todayYear) && chart.isLastDate("12-31"))))
        for (let i = chart.datasets.length - 1; i >= 0; i--) {
            const datasetId = chart.datasets[i].datasetId;
            if (datasetId.isSubsetOf(thisSubmission))
                for (const id of datasetId)
                    cachedDataSets.add(id);
            else
                chart.datasets.splice(i, 1); // del array element by index
        }
}
async function fetchWeatherData(idxDbName, storeName) {
    // Get weather data for all selectedStations and selectedYears and save them in stations cache object.
    const promises = [];
    const endDate = selectedYears.has(todayYear) ? todayDate : "12-31";
    const startDate = "01-01";
    for (const stationId of selectedStations)
        for (const year of selectedYears)
            promises.push(fetchStationYearData(idxDbName, storeName, stationId, year, startDate, endDate));
    try {
        warn("Fetching data", { cls: "blink", state: "on" });
        await Promise.all(promises);
        warn("clear", { cls: "blink", state: "off" });
    }
    catch (error) {
        console.error("Error fetching data:", error);
    }
    return getCommonDates();
}
/*
  IndexedDB is based on an event-driven API that doesn't natively support
  async/await (or promises).

  To use async/await with IndexedDB, you have to wrap its callbacks in a
  Promise. There's no way around that because async/await requires a promise to
  resolve (or reject) to work properly.
  */
const idxDb = new Map();
async function openDb(dbName, storeName, version = 1) {
    let db;
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, version);
        request.onerror = () => {
            reject(request.error);
        };
        request.onupgradeneeded = () => {
            db = request.result;
            // console.log("Upgrade needed indexed DB:", dbName, "Version:", db.version);
            db.createObjectStore(storeName);
        };
        request.onsuccess = () => {
            db = request.result;
            idxDb.set(dbName, db);
            // console.log("Opened indexed DB:", dbName);
            resolve(db);
        };
    });
}
async function openStore(dbName, storeName, mode = "readonly") {
    let db;
    db = idxDb.get(dbName);
    if (!db)
        db = await openDb(dbName, storeName);
    if (!db.objectStoreNames.contains(storeName)) {
        const version = db.version + 1;
        db.close();
        idxDb.delete(dbName);
        db = await openDb(dbName, storeName, version);
    }
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
}
// Generic function to perform an operation on the store
async function performStoreOperation(dbName, storeName, mode, operation) {
    const store = await openStore(dbName, storeName, mode);
    return new Promise((resolve, reject) => {
        const request = operation(store);
        request.onsuccess = () => resolve(request.result || {});
        request.onerror = () => reject(request.error);
    });
}
async function putToIdxDbStore(dbName, storeName, data, key) {
    return await performStoreOperation(dbName, storeName, "readwrite", (store) => store.put(data, key));
}
async function getFromIdxDbStore(dbName, storeName, key) {
    return await performStoreOperation(dbName, storeName, "readonly", (store) => store.get(key));
}
const _StorageTypes = {
    localStorage: "local",
    idxDB: "idxDB",
};
async function getStorageItem(storageType, key, idxDbName, storeName) {
    let value = {};
    if (storageType === "local") {
        const text = localStorage.getItem(key);
        if (text)
            value = JSON.parse(text);
    }
    else if (storageType === "idxDB") {
        if (!idxDbName || !storeName)
            throw new Error("Both idxDbName and storeName are required");
        value = await getFromIdxDbStore(idxDbName, storeName, key);
    }
    return value;
}
async function setStorageItem(storageType, key, value, idxDbName, storeName) {
    if (storageType === "local") {
        const text = JSON.stringify(value);
        localStorage.setItem(key, text);
    }
    else if (storageType === "idxDB") {
        if (!idxDbName || !storeName)
            throw new Error("Both idxDbName and storeName are required");
        await putToIdxDbStore(idxDbName, storeName, value, key);
    }
}
async function getBrowserCity() {
    const ipApiUrl = "https://ipapi.co/json";
    const key = "IPCity";
    // 1. Retrieve the cached string and parse it back into an object
    let { city, expiry } = await getStorageItem("local", key);
    // 2. Check if cache exists and if the current time is still before expiry
    if (!city || !expiry || todayDate > expiry) {
        const result = await catchErrorResult(fetchJson(ipApiUrl));
        if (result.ok) {
            city = result.value.city;
            if (city) {
                const location = { city, expiry: tomorrowDate };
                setStorageItem("local", key, location);
            }
            else
                console.warn("'city' is not defined in API response from", ipApiUrl);
        }
        else
            console.error("Browser IP location fetch failed:", result.error);
    }
    else
        console.info("Using cached location:", city);
    if (city) {
        searchTextInput.value = city;
        populateSearchResults();
    }
}
const dbName = "WeatherDB";
const weatherStoreName = "WeatherStore";
async function getChartData() {
    const { [allStationsId]: allChart, ...stationsCharts } = stationsChartData;
    const selectedDatasets = selectedStations.union(selectedYears).union(selectedParams);
    if (allStations.checked && selectedStations.size > 1) {
        const cachedDataSets = new Set();
        deleteUnselected(allChart, cachedDataSets);
        // Get data for newly selected stations and years
        if (!areSetsEqual(selectedDatasets, cachedDataSets)) {
            const { allStationsCommonDates } = await fetchWeatherData(dbName, weatherStoreName);
            stationsChartData[allStationsId] = new ChartData({
                stationId: allStationsId,
                dates: allStationsCommonDates,
            });
        }
    }
    else {
        // Check if the datasets for selected stations and years are already rendered
        const cachedDataSets = new Set();
        for (const chart of Object.values(stationsCharts))
            deleteUnselected(chart, cachedDataSets);
        // Get data for newly selected stations and years
        if (!areSetsEqual(selectedDatasets, cachedDataSets)) {
            const { stationsCommonDates } = await fetchWeatherData(dbName, weatherStoreName);
            for (const stationId of selectedStations)
                stationsChartData[stationId] = new ChartData({
                    stationId,
                    dates: stationsCommonDates[stationId],
                });
        }
    }
}
// Function to set the display state of canvas elements
function setChartVisibility(chartId, state) {
    let iter;
    let display;
    if (typeof state === "boolean")
        display = state ? "block" : "none";
    else
        display = state;
    if (typeof chartId === "string")
        iter = [chartId];
    else
        iter = Array.from(chartId);
    let count = 0;
    iter.forEach((chart) => {
        if (chart in charts) {
            charts[chart].canvas.style.display = display;
            count += 1;
        }
    });
    return count === iter.length; // Return true if all canvases were found and set
}
// let priorSubmission: Set<string> = new Set();
function getChartId(stationId) {
    // Generate a unique chart ID based on the station ID and selected years and parameters
    if (!selectedYears.size)
        throw new Error("Select years to submit");
    if (!selectedParams.size)
        throw new Error("Select at least one weather parameter");
    return `${stationId}-${Array.from(selectedYears.union(selectedParams)).sort().join("-")}`;
}
const priorCustomYears = new Set();
function updateCustomYears(event) {
    const years = customInput.value.split(/(?:\s+|,)/).filter(Boolean);
    const valid = years.every((year) => {
        return /^\d{4}$/.test(year) && year <= todayYear;
    });
    if (valid) {
        for (const year of priorCustomYears)
            selectedYears.delete(year);
        for (const year of years) {
            selectedYears.add(year);
            priorCustomYears.add(year);
        }
        renderChart(event);
    }
}
async function getSelectedCharts() {
    warn("clear", { cls: "blink", state: "off" });
    const allCharts = new Set(Object.keys(charts));
    setChartVisibility(allCharts, "none"); // hide all charts
    const chartStation = new Map();
    updateCheckBoxSelection(stationsCheckboxContainer, selectedStations);
    if (!selectedStations.size) {
        warn("Select stations to submit", { cls: "blink", state: "off" });
        searchTextInput.focus();
        return chartStation;
    }
    updateCheckBoxSelection(yearsCheckboxContainer, selectedYears);
    // if (!validateCustomYears()) return chartStation;
    if (!selectedYears.size) {
        warn("Select years to submit", { cls: "blink", state: "off" });
        return chartStation;
    }
    updateCheckBoxSelection(weatherParamContainer, selectedParams);
    if (!selectedParams.size) {
        warn("Select weather parameters to submit", { cls: "blink", state: "off" });
        return chartStation;
    }
    selectedCharts.clear();
    for (const stationId of allStations.checked ? [allStationsId] : selectedStations) {
        const chartId = getChartId(stationId);
        selectedCharts.add(chartId);
        chartStation.set(chartId, stationId);
    }
    setChartVisibility(selectedCharts, "block");
    thisSubmission = selectedStations.union(selectedYears).union(selectedParams);
    thisSubmission.add(allStations.checked ? "all" : "single");
    // if (areSetsEqual(thisSubmission, priorSubmission)) {
    //   warn("Change your selection to submit");
    //   return false;
    // }
    // priorSubmission = thisSubmission;
    return chartStation;
}
async function renderChart(event) {
    event.preventDefault();
    clearSearchResults(false);
    const chartStation = await getSelectedCharts();
    if (!chartStation.size)
        return;
    warn("Rendering", { cls: "blink", state: "on" });
    await getChartData();
    if (!canvasContainer)
        throw new Error("Canvas container is missing");
    for (const [chartId, stationId] of chartStation) {
        const stationChartData = stationsChartData[stationId];
        if (chartId in charts)
            continue; // Skip if chart already exists
        if (!stationChartData)
            throw new Error("Chart data is missing");
        // Create a new chart for the station
        const title = [`Historic Air Temperatures for ${stations.getNameOrId(stationId)}`];
        if (stationChartData.datasets.length > 1)
            title.push("Click on the legend icon to deselect/reselect the graph");
        const options = {
            responsive: true,
            tension: 0.4,
            plugins: {
                title: {
                    display: true,
                    text: title,
                },
            },
        };
        // if (stationId in charts) {
        //   charts[stationId].options = options; // Update chart's options
        //   charts[stationId].data = stationChartData; // Update chart's data
        //   charts[stationId].update(); // Refresh the chart
        //   continue;
        // }
        const canvas = document.createElement("canvas");
        canvas.setAttribute("id", `canvas-${stationId}`);
        canvasContainer.appendChild(canvas);
        charts[chartId] = new Chart(canvas, {
            type: "line",
            options,
            data: stationChartData,
        });
    }
    // Make selected canvas visible
    setChartVisibility(selectedCharts, "block");
    warn("clear", { cls: "blink", state: "off" });
}
function createYearSelection() {
    // Create checkboxes for the last 10 years
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
        yearsCheckboxContainer?.appendChild(checkboxItem);
    }
    yearsCheckboxContainer.addEventListener("change", renderChart);
}
function warn(message, options) {
    submissionWarning.textContent = message;
    if (submissionWarning.parentElement)
        submissionWarning.parentElement.style.visibility = message !== "clear" ? "visible" : "hidden";
    if (options?.cls) {
        const { cls, state } = options;
        if (state === "off")
            submissionWarning.classList.remove(cls);
        else if (state === "on")
            submissionWarning.classList.add(cls);
        else
            submissionWarning.classList.toggle(cls);
    }
}
function updateCheckBoxSelection(checkBoxContainer, selected) {
    for (const checkbox of checkBoxContainer.querySelectorAll('input[type="checkbox"]')) {
        if (!(checkbox instanceof HTMLInputElement))
            continue;
        if (checkbox.checked)
            selected.add(checkbox.value);
        else
            selected.delete(checkbox.value);
    }
}
function areSetsEqual(setA, setB) {
    if (setA.size !== setB.size)
        return false;
    return !setA.symmetricDifference(setB).size;
}
function appendStationWithFlag(element, stationId) {
    // Need to use NS (Name Space) version of the createElement for dynamic SVG to work
    if (!element || !stationId)
        return;
    const country = stations.getCountry(stationId);
    if (country) {
        const eSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const eImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
        const href = formatUnicorn(flagURLTemplate, {
            country: country.toLowerCase(),
        });
        eImage.setAttribute("href", href);
        eSVG.appendChild(eImage);
        element.appendChild(eSVG);
    }
    const eName = document.createElement("span");
    eName.textContent = stations.getNameOrId(stationId);
    element.appendChild(eName);
}
function createStationsCheckboxes() {
    if (!stationsCheckboxContainer)
        return;
    // Recreate checkboxes in sorted order every time a new element is inserted.
    stationsCheckboxContainer.innerHTML = "";
    for (const [id, _] of stations.getSortedArrayBy("name")) {
        const stationCheckboxId = `station-checkbox-${id}`;
        const checkboxItem = document.createElement("div"); // Create a wrapper for checkbox and label
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = stationCheckboxId;
        checkbox.value = id;
        checkbox.checked = selectedStations.has(id);
        // Append the checkbox and label to the checkbox item
        checkboxItem.appendChild(checkbox);
        appendStationWithFlag(checkboxItem, id);
        // Append the checkbox item to the checkbox container
        stationsCheckboxContainer.appendChild(checkboxItem);
    }
    if (stationsCheckboxContainer.parentElement)
        stationsCheckboxContainer.parentElement.style.visibility = "visible";
}
function setSpinnerOrLens(mode) {
    if (mode === "on") {
        // Show loading spinner, hide magnifying glass
        loadingSpinner.style.display = "block";
        magnifyingGlass.style.display = "none";
    }
    else {
        // Hide loading spinner, show magnifying glass again
        loadingSpinner.style.display = "none";
        magnifyingGlass.style.display = "block";
    }
}
async function selectClickedLocation(event) {
    // this refers to the clicked element
    clearSearchResults(false);
    event.preventDefault(); // Prevent the default action (navigation)
    let id = this.getAttribute("data-id");
    let name = this.getAttribute("data-name");
    const country = this.getAttribute("data-country");
    const region = this.getAttribute("data-region");
    const active = this.getAttribute("data-active") === "true";
    if (id == null || name == null || country == null)
        return;
    const locationType = this.getAttribute("data-type");
    if (locationType === "place") {
        const placeURL = formatUnicorn(locationURLTemplate, {
            country: country.toLowerCase(),
            id,
        });
        // Destructure: take location properties: latitude and longitude from Place 'place' property
        const { place: { location: { latitude, longitude }, }, } = await fetchJson(placeURL);
        const nearbyStationURL = formatUnicorn(nearbyStationURLTemplate, {
            latitude,
            longitude,
        });
        // Destructure: take properties id and name from NearbyStation 'data' property
        ({
            data: { id, name },
        } = await fetchJson(nearbyStationURL));
    }
    stations.upsert(id, new Station({ name, country, region, active }));
    selectedStations.add(id);
    createStationsCheckboxes();
    applyStationSelection(event); // Apply selection to the checkboxes
    searchTextInput.focus();
}
async function populateSearchResults() {
    const searchString = searchTextInput.value;
    if (updatingSearchResults)
        return;
    clearSearchResults(false);
    if (searchString.length <= 2)
        return;
    updatingSearchResults = true;
    const url = formatUnicorn(autoCompleteURLTemplate, {
        location: searchString,
        locale: locale,
    });
    setSpinnerOrLens("on");
    const result = await catchErrorResult(fetchJson(url, {
        signal: abortController.signal,
    }));
    setSpinnerOrLens("off");
    if (!result.ok) {
        if (result.error.name === "AbortError") {
            updatingSearchResults = false;
            return;
        }
        throw result.error;
    }
    const data = result.value.data;
    if (Object.keys(data).length === 0) {
        updatingSearchResults = false;
        return;
    }
    const locationClass = "search-result list-group-item list-group-item-action";
    function insertHeader(container, text) {
        const header = document.createElement("div");
        header.className = "search-category list-group-item fw-bold";
        header.innerText = text;
        container.appendChild(header);
    }
    // Add Places
    // Cannot use places because there is no API to find the nearest station
    if (placesSearchContainer && data.places) {
        insertHeader(placesSearchContainer, "Places");
        data.places.forEach((place) => {
            const imgHTML = formatUnicorn(flagImgTemplate, {
                country: place.country.toLowerCase(),
            });
            const placeLink = document.createElement("a");
            placeLink.className = locationClass;
            placeLink.setAttribute("data-id", place.id);
            placeLink.setAttribute("data-country", place.country);
            placeLink.setAttribute("data-name", place.name);
            placeLink.setAttribute("data-type", "place");
            placeLink.innerHTML = `
      ${imgHTML}
  <span>${place.name} </span>
    `;
            placesSearchContainer.appendChild(placeLink);
            placeLink.addEventListener("click", selectClickedLocation);
        });
    }
    // Add Weather Stations
    if (stationsSearchContainer && data.stations) {
        insertHeader(stationsSearchContainer, "Weather Stations");
        data.stations.forEach(async (station) => {
            if (!station.active)
                return;
            const stationLink = document.createElement("a");
            stationLink.className = locationClass;
            stationLink.setAttribute("data-id", station.id);
            stationLink.setAttribute("data-name", station.name);
            stationLink.setAttribute("data-country", station.country);
            if (station.region)
                stationLink.setAttribute("data-region", station.region);
            stationLink.setAttribute("data-active", station.active.toString());
            stationLink.setAttribute("data-type", "station");
            const imgHTML = formatUnicorn(flagImgTemplate, {
                country: station.country.toLowerCase(),
            });
            stationLink.innerHTML = `
      ${imgHTML}
      <span>${station.name}</span>
      <small class="text-muted">, ${station.region}</small>
      <code class="badge text-dark border ms-auto">${station.id}</code>
      `;
            stationsSearchContainer.appendChild(stationLink);
            stationLink.addEventListener("click", selectClickedLocation);
        });
    }
    updatingSearchResults = false;
}
function clearSearchResults(clearSearchText = true) {
    if (updatingSearchResults)
        abortController.abort();
    if (placesSearchContainer)
        placesSearchContainer.innerHTML = "";
    if (stationsSearchContainer)
        stationsSearchContainer.innerHTML = "";
    if (clearSearchText)
        searchTextInput.value = "";
    // warn("clear", { cls: "blink", state: "off" });
}
// Templates
const locationURLTemplate = "https://meteostat.net/props/en/place/${country}/${id}";
const nearbyStationURLTemplate = "https://d.meteostat.net/app/nearby?lang=en&limit=1&lat=${latitude}&lon=${longitude}";
const flagURLTemplate = "https://media.meteostat.net/assets/flags/4x3/${country}.svg";
const flagImgTemplate = `<img src="${flagURLTemplate}"class="country-flag me-2" alt="\${country}">`;
const api = "https://d.meteostat.net/app/";
const locale = "en";
const autoCompleteURLTemplate = `${api}autocomplete?q=\${location}&lang=\${locale}`;
const stationURLTemplate = `${api}proxy/stations/daily?station=\${stationId}&start=\${start}&end=\${end}`;
// Web Elements
const searchTextInput = document.getElementById("search");
const placesSearchContainer = document.getElementById("places-search-container");
const stationsSearchContainer = document.getElementById("stations-search-container");
const stationsCheckboxContainer = document.getElementById("stationsCheckboxContainer");
const yearsCheckboxContainer = document.getElementById("yearsCheckboxContainer");
const weatherParamContainer = document.getElementById("weather-param-checkboxes");
const customInput = document.getElementById("customInput");
const submissionWarning = document.getElementById("submissionWarning");
const canvasContainer = document.getElementById("canvas-container");
const magnifyingGlass = document.getElementById("magnifyingGlass");
const loadingSpinner = document.getElementById("loadingSpinner");
const allStations = document.getElementById("all-stations");
// Script Variables
const allStationsId = "all stations";
const abortController = new AbortController();
const oneDayInMs = 24 * 60 * 60 * 1000; // 24 hours
const today = new Date();
const currentYear = today.getFullYear();
const todayYear = currentYear.toString();
const todayDate = today.toISOString().substring(5, 10);
const yesterdayDate = new Date(today.valueOf() - oneDayInMs).toISOString().substring(5, 10);
const tomorrowDate = new Date(today.valueOf() + oneDayInMs).toISOString().substring(5, 10);
const selectedParams = new Set();
const selectedStations = new Set();
const selectedYears = new Set();
const selectedCharts = new Set();
let thisSubmission;
const charts = {};
const stations = new Stations();
const stationsChartData = {};
let updatingSearchResults = false;
// Main Listeners
customInput.addEventListener("input", updateCustomYears);
weatherParamContainer.addEventListener("change", renderChart);
stationsCheckboxContainer.addEventListener("change", applyStationSelection);
allStations.addEventListener("change", switchChartType);
searchTextInput.addEventListener("input", populateSearchResults);
searchTextInput.addEventListener("keydown", async (event) => {
    if (event.key === "Escape")
        clearSearchResults();
    if (event.key === "Enter" && document.activeElement === searchTextInput)
        await populateSearchResults();
});
// Main execution
document.addEventListener("DOMContentLoaded", async (event) => {
    clearSearchResults();
    createYearSelection();
    await getBrowserCity();
    await renderChart(event);
});
