"use strict";
class WeatherParameters {
    static keys = ['tmax', 'tmin'];
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
            if (key in src && src[key] != null) // Check if the key exists in source and is not null
                this[key] = src[key];
    }
}
;
function removeNullsFromSourceData(data) {
    // remove array elements with all null parameters
    if (!data.length)
        return;
    let { date, ...params } = data[0]; // get all properties except 'date'
    let keys = Object.keys(params);
    for (let i = data.length - 1; i >= 0; i--)
        if (allValuesAreMissing(data[i], keys))
            data.splice(i, 1); // del array element by index
}
function removeNullsFromWeatherData(data) {
    // remove object properties with all null sub-object properties
    for (let [date, parameters] of Object.entries(data))
        if (allValuesAreMissing(parameters))
            delete data[date];
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
        const yearParam = year + ' ' + (weatherParameter.substring(1) == 'max' ? 'High' : 'Low');
        if (type == 'all') {
            rgb = getRGBValue(stationId, yearParam);
            this.label = stationName + ' ' + yearParam; // Label for all stations is station name + year parameter
        }
        else {
            rgb = getRGBValue('27500', yearParam); // Use a fixed station ID for single station color
            this.label = yearParam; // Label for single station is year + weather parameter
        }
        this.data = dates.map(date => stations.getStationYearWeatherParameter(stationId, year, date, weatherParameter));
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
;
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
            this.datasets = Array
                .from(selectedStations)
                .map(station => weatherParameters.map(param => years.map(year => new ChartDataset('all', param, station, year, dates)))).flat(2);
        else
            this.datasets = weatherParameters.map(param => years.map(year => new ChartDataset('single', param, stationId, year, dates))).flat();
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
;
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
    data = {}; // Object with year as key and WeatherData as value
    constructor({ name, country, region, active }) {
        this.name = name.replace(/[\p{P}\p{Z}]+.*$/gu, "");
        this.country = country;
        this.region = region;
        this.active = active;
    }
    get(property) {
        if (property in this)
            return this[property];
    }
}
class Stations {
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
    hasStationYearData(id, year) {
        // Check if the station has weather data for a given year.
        // Returns true if the station ID and year exist in the data.
        return this[id]?.data?.[year] && Object.keys(this[id].data[year]).length > 0;
    }
    getStationYearData(id, year) {
        // Returns the weather data for a given station ID and year.
        // { 'mm-dd': { tmax: 30, tmin: 20, ... }, ... }
        if (this[id] && this[id].data) {
            this[id].data[year] ??= {};
            return this[id].data[year];
        }
        return {};
    }
    getStationYearDataDates(id, year) {
        return Object.keys(this.getStationYearData(id, year));
    }
    getStationYearWeatherParameter(id, year, date, parameter) {
        // Returns the weather data for a given station ID, year and date.
        // { tmax: 30, tmin: 20, ... }
        return this.getStationYearData(id, year)?.[date]?.[parameter];
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
function allValuesAreMissing(obj, keys = []) {
    // Return true if all values for the given set of keys are null
    let count = 0;
    for (let key of keys.length ? keys : Object.keys(obj)) {
        if (obj[key] != null || obj[key] != undefined)
            return false; // Return false as soon as we find a non-null value
        count += 1; // Count null values
    }
    return count > 0; // Return true if at least one key is checked
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
function findOrFillMissingDatesData(year, dateRange, data, missingData) {
    if (!data || !Object.keys(data).length)
        return [dateRange]; // If no data, return supplied date range as missing
    let missingRanges = [];
    if (missingData && dateRange.end in missingData && ((selectedYears.has(todayYear) && dateRange.end == todayDate)
        ||
            (!selectedYears.has(todayYear) && dateRange.end == '12-31')))
        return missingRanges; // If the end date is in data, return empty array
    let startDate = new Date(year + "-" + dateRange.start);
    let endDate = new Date(year + "-" + dateRange.end);
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
        const data = weatherParameters.map(parameters => parameters[key]).filter(value => value != undefined);
        const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
        // Step 2: Calculate the Standard Deviation of the data
        const variance = data.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / data.length;
        const standardDeviation = Math.sqrt(variance);
        // Step 3: Calculate the Z-score for each data point
        for (const parameters of weatherParameters) {
            if (parameters[key] == undefined || standardDeviation === 0)
                continue;
            if (Math.abs(parameters[key] - mean) / standardDeviation > threshold)
                parameters[key] = undefined; // Undefine the outlier
        }
    }
}
function modifiedZScoreOutliers(weatherParameters, threshold = 3.5) {
    for (const key of WeatherParameters.keys) {
        // Step 1: Calculate the Median
        const sorted = weatherParameters.map(parameters => parameters[key]).filter(value => value != undefined).sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        // Step 2: Calculate the Median Absolute Deviation (MAD)
        const mad = sorted
            .map(value => Math.abs(value - median)) // Absolute deviation from the median
            .sort((a, b) => a - b); // Sort the absolute deviations
        const madMedian = mad[Math.floor(mad.length / 2)];
        // Step 3: Calculate the Modified Z-Score for each data point
        for (const parameters of weatherParameters) {
            if (parameters[key] == undefined || madMedian === 0)
                continue;
            if (0.6745 * Math.abs(parameters[key] - median) / madMedian > threshold)
                parameters[key] = undefined; // Undefine the outlier
        }
    }
}
function IQROutliers(weatherParameters, k = 1.5) {
    // Undefine outliers using the Interquartile Range (IQR) method
    for (const key of WeatherParameters.keys) {
        const sorted = weatherParameters.map(parameters => parameters[key]).filter(value => value != undefined).sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lower = q1 - k * iqr;
        const upper = q3 + k * iqr;
        for (const parameters of weatherParameters) {
            const value = parameters[key];
            if (value != undefined && (value < lower || value > upper))
                parameters[key] = undefined; // Undefine the outlier
        }
    }
}
function groupByMonth(date) {
    const month = date.substring(0, 1); // Extract the month part of the date (mm-dd)
    return parseInt(month, 10); // Return the month as the group index (e.g., 1 for January)
}
function groupByDays(date, index) {
    return Math.floor(index / 30); // Group every days (based on index)
}
function outliersByGroup(weatherData, groupByCallback) {
    // Undefine outliers by group using the Interquartile Range (IQR) method or other methods
    const sortedData = Object.entries(weatherData).sort((a, b) => a[0].localeCompare(b[0]));
    // Group data by the index defined by the callback
    const groupedData = sortedData.reduce((acc, [date, parameters], index) => {
        const groupIndex = groupByCallback(date, index); // Get group index using the callback
        // Ensure the groupIndex exists in the accumulator
        if (!(groupIndex in acc))
            acc[groupIndex] = [];
        // Push the parameters for the current entry into the correct group
        acc[groupIndex].push(parameters);
        return acc;
    }, {});
    // Detect outliers for each group
    for (const [groupIndex, parameters] of Object.entries(groupedData)) {
        const groupParameters = parameters;
        ZScoreOutliers(groupParameters, 3.5); // You can use modifiedZScoreOutliers or IQROutliers as well
        // modifiedZScoreOutliers(groupParameters, 3.5);
        // IQROutliers(groupParameters, 1.5);
    }
}
async function fetchStationYearData(stationId, year, startDate, endDate) {
    // For the given station ID and year, try to get weather data from local storage, if not present get via API.
    // Save obtained data into stations cache object by reference getYearData(stationId, year).
    let stationYearCache = stations.getStationYearData(stationId, year); // Get station year cache reference
    let missingCache = findOrFillMissingDatesData(year, { start: startDate, end: endDate }, stationYearCache);
    if (!missingCache.length)
        return;
    let missingLocalStorage = [];
    let stationYear = stationId + '-' + year;
    let stationYearStore = await getStorageItem(stationYear, 'IndexedDB');
    if (Object.keys(stationYearStore).length) {
        // Populate missing cache from local storage
        for (let missingRange of missingCache)
            missingLocalStorage.push(...findOrFillMissingDatesData(year, missingRange, stationYearStore, stationYearCache));
        if (!missingLocalStorage.length)
            return; // If no missing dates in local storage, exit
    }
    else
        missingLocalStorage = missingCache;
    // If the date range is not in the cache, fetch it from the API
    let promises = missingLocalStorage.map(async (missingRange) => {
        let start = year + '-' + missingRange.start;
        let end = year + '-' + missingRange.end;
        const url = stationURLTemplate.formatUnicorn({ stationId, start, end });
        // Fetch data from the API for the given station ID and date range into sourceData
        const { data: sourceData } = await fetchJson(url);
        if (sourceData.length > 0) {
            const weatherParametersKeys = Array.from(WeatherParameters.keys);
            for (const row of sourceData)
                if (row.date)
                    stationYearCache[row.date.substring(5, 10)] = new WeatherParameters(row);
            // undefineOutliersIQR(Object.values(stationYearCache), 2.0); // Undefine outliers using the Interquartile Range (IQR) method
            outliersByGroup(stationYearCache, groupByDays); // Undefine outliers using the Interquartile Range (IQR) method
            for (const date of Object.keys(stationYearCache)) {
                if (allValuesAreMissing(stationYearCache[date]))
                    delete stationYearCache[date];
                else
                    stationYearStore[date] = stationYearCache[date]; // Copy the weather parameters to the store
            }
            // save the fetched data to indexedDB
            await setStorageItem(stationYear, stationYearStore, 'IndexedDB');
        }
    });
    await Promise.all(promises);
}
async function fetchData() {
    // Get weather data for all selectedStations and selectedYears and save them in stations cache object.
    const promises = [];
    let endDate = selectedYears.has(todayYear) ? todayDate : "12-31";
    let startDate = "01-01";
    for (const stationId of selectedStations) {
        for (let year of selectedYears)
            promises.push(fetchStationYearData(stationId, year, startDate, endDate));
    }
    try {
        warn('Fetching data', 'blink');
        await Promise.all(promises);
        warn('');
    }
    catch (error) {
        console.error("Error fetching data:", error);
    }
    return getCommonDates();
}
function getCommonDates() {
    // Get common dates across all years and their data for each selected station
    // Note: this function assumes that stationsCache has been populated with data
    // for selected stations and years. Yeach year may have different dates, so we
    // need to find the intersection of dates.
    let stationsCommonDatesArray = {};
    let stationsCommonDates = {};
    let allStationsCommonDates = new Set();
    // Manual reduction of dates for each station
    for (const stationId of selectedStations) {
        for (const year of selectedYears) {
            // Get the weather data for the station and year
            let dates = stations.getStationYearDataDates(stationId, year);
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
    return { stationsCommonDates: stationsCommonDatesArray, allStationsCommonDates: Array.from(allStationsCommonDates).sort() };
}
function updateCustomYears() {
    let years = customInput.value.split(/\s+/).filter(x => x);
    if (years.some(year => year && (year > todayYear || !year.match(/\d{4}/)))) {
        warn("Provide valid years");
        customInput.focus();
        return false;
    }
    for (const year of years) {
        selectedYears.add(year);
    }
    return true;
}
function validateSelection() {
    if (!updateCustomYears())
        return false;
    getCheckedBoxes(weatherParamContainer, selectedParams);
    if (selectedParams.size === 0) {
        warn("Select at least one weather parameter");
        return false;
    }
    getCheckedBoxes(stationsCheckboxContainer, selectedStations);
    if (!selectedStations.size) {
        warn("Select stations to submit");
        searchTextInput.focus();
        return false;
    }
    if (selectedYears.size == 0) {
        clearSearchResults(false);
        warn("Select years to submit");
        return false;
    }
    thisSubmission = selectedStations.union(selectedYears).union(selectedParams);
    thisSubmission.add(allStations.checked ? 'all' : 'single');
    if (areSetsEqual(thisSubmission, priorSubmission)) {
        warn("Change your selection to submit");
        return false;
    }
    priorSubmission = thisSubmission;
    return true;
}
// Function to set the display state of canvas elements
function setChartVisibility(chartId, state) {
    let iter;
    let display;
    if (typeof state === 'boolean')
        display = state ? 'block' : 'none';
    else
        display = state;
    if (typeof chartId === 'string')
        iter = [chartId];
    else
        iter = Array.from(chartId);
    let count = 0;
    iter.forEach(chart => {
        if (chart in charts) {
            charts[chart].canvas.style.display = display;
            count += 1;
        }
    });
    return count == iter.length; // Return true if all canvases were found and set
}
async function applyStationSelection(event) {
    let target = event.target;
    let stationId = target.value;
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
        warn('Select more than one station to show all stations in a single chart');
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
    if (chart && ((selectedYears.has(todayYear) && chart.isLastDate([yesterdayDate, todayDate]))
        ||
            (!selectedYears.has(todayYear) && chart.isLastDate('12-31'))))
        for (let i = chart.datasets.length - 1; i >= 0; i--) {
            const datasetId = chart.datasets[i].datasetId;
            if (datasetId.isSubsetOf(thisSubmission))
                datasetId.forEach(id => cachedDataSets.add(id)); // Therer is no way to add a Set to another Set, so we add each element
            else
                chart.datasets.splice(i, 1); // del array element by index
        }
}
async function getChartData() {
    const { [allStationsId]: allChart, ...stationsCharts } = stationsChartData;
    const selectedDatasets = selectedStations.union(selectedYears).union(selectedParams);
    if (allStations.checked && selectedStations.size > 1) {
        const cachedDataSets = new Set();
        deleteUnselected(allChart, cachedDataSets);
        // Get data for newly selected stations and years
        if (!areSetsEqual(selectedDatasets, cachedDataSets)) {
            let { allStationsCommonDates } = await fetchData();
            stationsChartData[allStationsId] = new ChartData({ stationId: allStationsId, dates: allStationsCommonDates });
        }
    }
    else {
        // Check if the datasets for selected stations and years are already rendered
        let cachedDataSets = new Set();
        for (let chart of Object.values(stationsCharts))
            deleteUnselected(chart, cachedDataSets);
        // Get data for newly selected stations and years
        if (!areSetsEqual(selectedDatasets, cachedDataSets)) {
            let { stationsCommonDates } = await fetchData();
            for (const stationId of selectedStations)
                stationsChartData[stationId] = new ChartData({ stationId, dates: stationsCommonDates[stationId] });
        }
    }
    priorSubmissionYear = thisSubmission;
}
function getChartId(stationId) {
    // Generate a unique chart ID based on the station ID and selected years and parameters
    return stationId + '-' + Array.from(selectedYears.union(selectedParams)).sort().join("-");
}
async function renderChart(event) {
    event.preventDefault();
    clearSearchResults(false);
    if (!validateSelection())
        return;
    await getChartData();
    warn('Rendering', 'blink');
    if (!canvasContainer)
        throw new Error('Canvas container is missing');
    selectedCharts.clear(); // Clear previously selected charts
    for (let stationId of allStations.checked ? [allStationsId] : selectedStations) {
        const chartId = getChartId(stationId);
        selectedCharts.add(chartId); // Add chart ID to selected charts
        if (chartId in charts)
            continue; // Skip if chart already exists
        // Create a new chart for the station
        let stationChartData = stationsChartData[stationId];
        let title = ['Historic Air Temperatures for ' + stations.getNameOrId(stationId)];
        if (stationChartData.datasets.length > 1)
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
        // if (stationId in charts) {
        //   charts[stationId].options = options; // Update chart's options
        //   charts[stationId].data = stationChartData; // Update chart's data
        //   charts[stationId].update(); // Refresh the chart
        //   continue;
        // }
        const canvas = document.createElement("canvas");
        canvas.setAttribute('id', `canvas-${stationId}`);
        canvasContainer.appendChild(canvas);
        charts[chartId] = new Chart(canvas, {
            type: "line",
            options,
            data: stationChartData,
        });
    }
    // Make unselected canvas elements invisible and selected visible
    setChartVisibility(new Set(Object.keys(charts)).difference(selectedCharts), 'none');
    setChartVisibility(selectedCharts, 'block');
    warn('');
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
    yearsCheckboxContainer.addEventListener('change', updateSelectedYears);
}
async function updateSelectedYears(event) {
    getCheckedBoxes(yearsCheckboxContainer, selectedYears);
    await renderChart(event);
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
function getCheckedBoxes(checkBoxContainer, selected) {
    selected.clear();
    for (let id of Array.from(checkBoxContainer.querySelectorAll('input[type="checkbox"]:checked'))
        .filter((checkbox) => checkbox instanceof HTMLInputElement)
        .map((checkbox) => checkbox.value)) {
        selected.add(id);
    }
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
    country ||= stations.getCountry(stationId);
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
    eName.textContent = name || stations.getNameOrId(stationId);
    element.appendChild(eName);
}
function createStationsCheckboxes() {
    if (!stationsCheckboxContainer)
        return;
    // Recreate checkboxes in sorted order every time a new element is inserted.
    stationsCheckboxContainer.innerHTML = '';
    for (let [id, { name, country }] of stations.getSortedArrayBy('name')) {
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
    }
    ;
    stationsCheckboxContainer.parentElement.style.visibility = 'visible';
}
async function populateSearchResults(searchString) {
    searchTextInput.value = searchString; // Set the input value to the search string
    if (updatingSearchResults)
        return;
    clearSearchResults(false);
    if (searchString.length <= 2)
        return;
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
        // this refers to the clicked element
        clearSearchResults(false);
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
        stations.upsert(id, new Station({ name, country, region, active }));
        selectedStations.add(id);
        createStationsCheckboxes();
        applyStationSelection(event); // Apply selection to the checkboxes
        searchTextInput.focus();
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
const stationsCheckboxContainer = document.getElementById("stationsCheckboxContainer");
const yearsCheckboxContainer = document.getElementById("yearsCheckboxContainer");
const weatherParamContainer = document.getElementById("weather-param-checkboxes");
const customInput = document.getElementById("customInput");
const submissionWarning = document.getElementById("submissionWarning");
const canvasContainer = document.getElementById("canvas-container");
const magnifyingGlass = document.getElementById('magnifyingGlass');
const loadingSpinner = document.getElementById('loadingSpinner');
const allStations = document.getElementById("all-stations");
// Main Listeners
document.getElementById("input-form")?.addEventListener('submit', renderChart);
weatherParamContainer.addEventListener('change', renderChart);
stationsCheckboxContainer.addEventListener('change', applyStationSelection);
allStations.addEventListener('change', switchChartType);
searchTextInput.addEventListener("input", async function () { await populateSearchResults(this.value); });
// searchTextInput.addEventListener("focus", async function (this: HTMLInputElement) { await populateSearchResults(this.value); });
// searchTextInput.addEventListener("blur", async function () { clearSearchResults(false); });
searchTextInput.addEventListener('keydown', async function (event) {
    if (event.key === 'Escape')
        clearSearchResults();
    if (event.key === 'Enter' && document.activeElement === searchTextInput)
        await populateSearchResults(searchTextInput.value);
});
// Script Variables
const idbName = 'WeatherStationDB';
const storeName = 'StationYearStore';
const allStationsId = 'all stations';
const abortController = new AbortController();
const today = new Date();
const currentYear = today.getFullYear();
const todayYear = currentYear.toString();
const todayDate = today.toISOString().substring(5, 10);
const yesterdayDate = new Date(today.valueOf() - 1000 * 60 * 60 * 24).toISOString().substring(5, 10);
const selectedParams = new Set();
const selectedStations = new Set();
const selectedYears = new Set();
const selectedCharts = new Set();
let thisSubmission;
let priorSubmission = new Set();
let priorSubmissionYear = new Set();
const charts = {};
const stations = new Stations();
const stationsChartData = {};
let updatingSearchResults = false;
let idxDB;
// main()
document.addEventListener('DOMContentLoaded', async function () {
    await IDBInit();
    clearSearchResults();
    createYearSelection();
    // Fetch the city from the IP API and set it as the search input value
    const ipApiUrl = 'https://ipapi.co/json';
    try {
        const { city } = await fetchJson(ipApiUrl);
        if (city)
            populateSearchResults(city);
        else
            console.warn('City not found in IP API response');
    }
    catch (err) {
        console.error('Failed to fetch IP info:', err);
    }
});
