/* ============================================
   WeatherScope - Application Logic
   ============================================ */

const API_KEY = 'd956309f334adf36c85392e194fcf218';
const BASE_URL = 'https://api.openweathermap.org';

// State
const state = {
    unit: localStorage.getItem('weather-unit') || 'metric',
    lastCity: localStorage.getItem('weather-city') || null,
    lastLat: localStorage.getItem('weather-lat') || null,
    lastLon: localStorage.getItem('weather-lon') || null,
    currentData: null,
    forecastData: null,
    aqiData: null,
    debounceTimer: null,
};

// DOM Elements
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
    loadingOverlay: $('#loading-overlay'),
    citySearch: $('#city-search'),
    clearSearch: $('#clear-search'),
    suggestions: $('#search-suggestions'),
    locationBtn: $('#location-btn'),
    unitToggle: $('#unit-toggle'),
    unitC: $('.unit-c'),
    unitF: $('.unit-f'),
    // Current
    cityName: $('#city-name'),
    countryName: $('#country-name'),
    currentDate: $('#current-date'),
    currentTemp: $('#current-temp'),
    tempUnit: $('#temp-unit'),
    weatherDesc: $('#weather-desc'),
    weatherIconAnimated: $('#weather-icon-animated'),
    tempMax: $('#temp-max'),
    tempMin: $('#temp-min'),
    // Stats
    feelsLike: $('#feels-like'),
    humidity: $('#humidity'),
    windSpeed: $('#wind-speed'),
    pressure: $('#pressure'),
    // Hourly
    hourlyContainer: $('#hourly-container'),
    hourlyLeft: $('#hourly-left'),
    hourlyRight: $('#hourly-right'),
    hourlyChart: $('#hourly-chart'),
    // Daily
    dailyContainer: $('#daily-container'),
    // Details
    uvValue: $('#uv-value'),
    uvDesc: $('#uv-desc'),
    uvIndicator: $('#uv-indicator'),
    sunrise: $('#sunrise'),
    sunset: $('#sunset'),
    sunDot: $('#sun-dot'),
    visibilityValue: $('#visibility-value'),
    visibilityDesc: $('#visibility-desc'),
    dewPoint: $('#dew-point'),
    dewDesc: $('#dew-desc'),
    windDetailSpeed: $('#wind-detail-speed'),
    windDirectionText: $('#wind-direction-text'),
    compassNeedle: $('#compass-needle'),
    cloudsValue: $('#clouds-value'),
    cloudFill: $('#cloud-fill'),
    cloudsDesc: $('#clouds-desc'),
    // AQI
    aqiProgress: $('#aqi-progress'),
    aqiValue: $('#aqi-value'),
    aqiLabel: $('#aqi-label'),
    aqiPollutants: $('#aqi-pollutants'),
    // Error
    errorToast: $('#error-toast'),
    errorMessage: $('#error-message'),
    errorClose: $('#error-close'),
};

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initEvents();
    initReveal();
    updateUnitUI();
    loadInitialWeather();
});

function loadInitialWeather() {
    if (state.lastLat && state.lastLon) {
        fetchWeatherByCoords(parseFloat(state.lastLat), parseFloat(state.lastLon));
    } else if (state.lastCity) {
        searchAndFetchCity(state.lastCity);
    } else {
        // Try geolocation, fall back to Jakarta
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
                () => fetchWeatherByCoords(-6.2088, 106.8456), // Jakarta
                { timeout: 5000 }
            );
        } else {
            fetchWeatherByCoords(-6.2088, 106.8456);
        }
    }
}

// ===================== EVENTS =====================
function initEvents() {
    // Search
    DOM.citySearch.addEventListener('input', onSearchInput);
    DOM.citySearch.addEventListener('keydown', onSearchKeydown);
    DOM.clearSearch.addEventListener('click', () => {
        DOM.citySearch.value = '';
        DOM.clearSearch.classList.add('hidden');
        DOM.suggestions.classList.add('hidden');
        DOM.citySearch.focus();
    });
    document.addEventListener('click', (e) => {
        if (!$('#search-container').contains(e.target)) {
            DOM.suggestions.classList.add('hidden');
        }
    });

    // Location
    DOM.locationBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
            DOM.locationBtn.classList.add('loading');
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude);
                    DOM.locationBtn.classList.remove('loading');
                },
                (err) => {
                    showError('Tidak dapat mengakses lokasi. Pastikan izin lokasi aktif.');
                    DOM.locationBtn.classList.remove('loading');
                },
                { timeout: 8000 }
            );
        } else {
            showError('Geolokasi tidak didukung oleh browser Anda.');
        }
    });

    // Unit toggle
    DOM.unitToggle.addEventListener('click', toggleUnit);

    // Hourly scroll
    DOM.hourlyLeft.addEventListener('click', () => {
        DOM.hourlyContainer.scrollBy({ left: -240, behavior: 'smooth' });
    });
    DOM.hourlyRight.addEventListener('click', () => {
        DOM.hourlyContainer.scrollBy({ left: 240, behavior: 'smooth' });
    });

    // Error close
    DOM.errorClose.addEventListener('click', () => {
        DOM.errorToast.classList.add('hidden');
    });
}

// ===================== SEARCH =====================
function onSearchInput(e) {
    const query = e.target.value.trim();
    DOM.clearSearch.classList.toggle('hidden', query.length === 0);

    clearTimeout(state.debounceTimer);
    if (query.length < 2) {
        DOM.suggestions.classList.add('hidden');
        return;
    }

    state.debounceTimer = setTimeout(() => fetchSuggestions(query), 350);
}

function onSearchKeydown(e) {
    const items = DOM.suggestions.querySelectorAll('li');
    const active = DOM.suggestions.querySelector('li.active');
    let idx = Array.from(items).indexOf(active);

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (active) active.classList.remove('active');
        idx = (idx + 1) % items.length;
        items[idx]?.classList.add('active');
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (active) active.classList.remove('active');
        idx = idx <= 0 ? items.length - 1 : idx - 1;
        items[idx]?.classList.add('active');
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active) {
            active.click();
        } else if (DOM.citySearch.value.trim().length >= 2) {
            searchAndFetchCity(DOM.citySearch.value.trim());
            DOM.suggestions.classList.add('hidden');
        }
    }
}

async function fetchSuggestions(query) {
    try {
        const res = await fetch(
            `${BASE_URL}/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${API_KEY}`
        );
        if (!res.ok) return;
        const data = await res.json();
        renderSuggestions(data);
    } catch {
        // silently fail
    }
}

function renderSuggestions(cities) {
    if (!cities.length) {
        DOM.suggestions.classList.add('hidden');
        return;
    }
    DOM.suggestions.innerHTML = cities.map((c) => `
        <li data-lat="${c.lat}" data-lon="${c.lon}" data-name="${c.name}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <span>${c.name}${c.state ? ', ' + c.state : ''}</span>
            <span class="suggestion-country">${c.country}</span>
        </li>
    `).join('');

    DOM.suggestions.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            const lat = parseFloat(li.dataset.lat);
            const lon = parseFloat(li.dataset.lon);
            DOM.citySearch.value = li.dataset.name;
            DOM.suggestions.classList.add('hidden');
            fetchWeatherByCoords(lat, lon);
        });
    });

    DOM.suggestions.classList.remove('hidden');
}

async function searchAndFetchCity(name) {
    try {
        const res = await fetch(
            `${BASE_URL}/geo/1.0/direct?q=${encodeURIComponent(name)}&limit=1&appid=${API_KEY}`
        );
        const data = await res.json();
        if (data.length) {
            fetchWeatherByCoords(data[0].lat, data[0].lon);
        } else {
            showError(`Kota "${name}" tidak ditemukan.`);
        }
    } catch {
        showError('Gagal mencari kota. Periksa koneksi internet Anda.');
    }
}

// ===================== DATA FETCHING =====================
async function fetchWeatherByCoords(lat, lon) {
    showLoading(true);

    try {
        const unitParam = state.unit;
        const [currentRes, forecastRes, aqiRes] = await Promise.all([
            fetch(`${BASE_URL}/data/2.5/weather?lat=${lat}&lon=${lon}&units=${unitParam}&lang=id&appid=${API_KEY}`),
            fetch(`${BASE_URL}/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${unitParam}&lang=id&appid=${API_KEY}`),
            fetch(`${BASE_URL}/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`),
        ]);

        if (!currentRes.ok || !forecastRes.ok) {
            throw new Error('API error');
        }

        state.currentData = await currentRes.json();
        state.forecastData = await forecastRes.json();
        state.aqiData = aqiRes.ok ? await aqiRes.json() : null;

        // Save location
        localStorage.setItem('weather-city', state.currentData.name);
        localStorage.setItem('weather-lat', lat);
        localStorage.setItem('weather-lon', lon);
        state.lastLat = lat;
        state.lastLon = lon;

        renderAll();
    } catch (err) {
        console.error(err);
        showError('Gagal memuat data cuaca. Silakan coba lagi.');
    } finally {
        showLoading(false);
    }
}

// ===================== RENDER =====================
function renderAll() {
    renderCurrent();
    renderQuickStats();
    renderHourly();
    renderDaily();
    renderDetails();
    renderAQI();
    updateBackground();
    triggerReveal();
}

function renderCurrent() {
    const d = state.currentData;
    if (!d) return;

    DOM.cityName.textContent = d.name;
    DOM.countryName.textContent = getCountryName(d.sys.country);
    DOM.currentDate.textContent = formatDate(new Date());
    DOM.currentTemp.textContent = Math.round(d.main.temp);
    DOM.tempUnit.textContent = state.unit === 'metric' ? '°C' : '°F';
    DOM.weatherDesc.textContent = d.weather[0].description;
    DOM.tempMax.textContent = Math.round(d.main.temp_max) + '°';
    DOM.tempMin.textContent = Math.round(d.main.temp_min) + '°';

    // Weather icon
    const iconCode = d.weather[0].icon;
    DOM.weatherIconAnimated.innerHTML = `<img src="https://openweathermap.org/img/wn/${iconCode}@4x.png" alt="${d.weather[0].description}">`;
}

function renderQuickStats() {
    const d = state.currentData;
    if (!d) return;

    const unitSuffix = state.unit === 'metric' ? '°C' : '°F';
    DOM.feelsLike.textContent = Math.round(d.main.feels_like) + unitSuffix;
    DOM.humidity.textContent = d.main.humidity + '%';
    DOM.windSpeed.textContent = d.wind.speed.toFixed(1) + (state.unit === 'metric' ? ' m/s' : ' mph');
    DOM.pressure.textContent = d.main.pressure + ' hPa';
}

function renderHourly() {
    const f = state.forecastData;
    if (!f) return;

    const list = f.list.slice(0, 12);
    const unitSuffix = state.unit === 'metric' ? '°' : '°';

    DOM.hourlyContainer.innerHTML = list.map((item, i) => {
        const dt = new Date(item.dt * 1000);
        const isNow = i === 0;
        const pop = Math.round((item.pop || 0) * 100);
        return `
            <div class="hourly-card ${isNow ? 'now' : ''}">
                <div class="hourly-time">${isNow ? 'Saat ini' : formatTime(dt)}</div>
                <div class="hourly-icon">
                    <img src="https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png" alt="${item.weather[0].description}">
                </div>
                <div class="hourly-temp">${Math.round(item.main.temp)}${unitSuffix}</div>
                ${pop > 0 ? `<div class="hourly-pop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>${pop}%</div>` : ''}
            </div>
        `;
    }).join('');

    // Draw chart
    drawHourlyChart(list);
}

function drawHourlyChart(list) {
    const canvas = DOM.hourlyChart;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const temps = list.map(item => item.main.temp);
    const minT = Math.min(...temps) - 2;
    const maxT = Math.max(...temps) + 2;
    const padding = { top: 20, bottom: 20, left: 10, right: 10 };

    const points = temps.map((t, i) => ({
        x: padding.left + (i / (temps.length - 1)) * (w - padding.left - padding.right),
        y: padding.top + (1 - (t - minT) / (maxT - minT)) * (h - padding.top - padding.bottom),
    }));

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0.02)');

    // Draw area
    ctx.beginPath();
    ctx.moveTo(points[0].x, h);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        const xc = (points[i - 1].x + points[i].x) / 2;
        const yc = (points[i - 1].y + points[i].y) / 2;
        ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw dots
    points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#38bdf8' : 'rgba(56, 189, 248, 0.6)';
        ctx.fill();

        // Labels
        ctx.fillStyle = 'rgba(241, 245, 249, 0.7)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(temps[i]) + '°', p.x, p.y - 10);
    });
}

function renderDaily() {
    const f = state.forecastData;
    if (!f) return;

    // Group forecast by day
    const dailyMap = {};
    f.list.forEach(item => {
        const date = new Date(item.dt * 1000).toDateString();
        if (!dailyMap[date]) dailyMap[date] = { temps: [], icons: [], pops: [], dt: item.dt };
        dailyMap[date].temps.push(item.main.temp_min, item.main.temp_max);
        dailyMap[date].icons.push(item.weather[0].icon);
        dailyMap[date].pops.push(item.pop || 0);
    });

    const days = Object.entries(dailyMap).slice(0, 5);
    if (!days.length) return;

    // Get overall min/max for temperature bar range
    const allTemps = days.flatMap(([, d]) => d.temps);
    const overallMin = Math.min(...allTemps);
    const overallMax = Math.max(...allTemps);
    const range = overallMax - overallMin || 1;

    DOM.dailyContainer.innerHTML = days.map(([dateStr, d], i) => {
        const dayMin = Math.round(Math.min(...d.temps));
        const dayMax = Math.round(Math.max(...d.temps));
        const dayPop = Math.round(Math.max(...d.pops) * 100);
        // Most common icon (pick midday)
        const iconIdx = Math.min(Math.floor(d.icons.length / 2), d.icons.length - 1);
        const icon = d.icons[iconIdx];

        const barLeft = ((Math.min(...d.temps) - overallMin) / range) * 100;
        const barWidth = ((Math.max(...d.temps) - Math.min(...d.temps)) / range) * 100;

        const today = new Date().toDateString();
        const isToday = dateStr === today;
        const dayName = isToday ? '<span class="today-label">Hari ini</span>' : formatDayName(new Date(d.dt * 1000));

        return `
            <div class="daily-row">
                <div class="daily-day">${dayName}</div>
                <div class="daily-icon">
                    <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="weather">
                </div>
                <div class="daily-temp-bar">
                    <span class="daily-temp-lo">${dayMin}°</span>
                    <div class="daily-bar-track">
                        <div class="daily-bar-fill" style="left: ${barLeft}%; width: ${Math.max(barWidth, 8)}%"></div>
                    </div>
                    <span class="daily-temp-hi">${dayMax}°</span>
                </div>
                <div class="daily-pop">
                    ${dayPop > 0 ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>${dayPop}%` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderDetails() {
    const d = state.currentData;
    if (!d) return;

    const unitSuffix = state.unit === 'metric' ? '°C' : '°F';

    // Visibility
    const visKm = (d.visibility / 1000).toFixed(1);
    DOM.visibilityValue.textContent = visKm + ' km';
    DOM.visibilityDesc.textContent = d.visibility >= 10000 ? 'Sangat jernih' : d.visibility >= 5000 ? 'Cukup jernih' : 'Berkabut';

    // Dew point (calculate from temp & humidity)
    const temp = d.main.temp;
    const hum = d.main.humidity;
    let dewC;
    if (state.unit === 'metric') {
        dewC = temp - ((100 - hum) / 5);
    } else {
        const tempC = (temp - 32) * 5 / 9;
        dewC = tempC - ((100 - hum) / 5);
        dewC = dewC * 9 / 5 + 32;
    }
    DOM.dewPoint.textContent = Math.round(dewC) + unitSuffix;
    if (state.unit === 'metric') {
        DOM.dewDesc.textContent = dewC < 10 ? 'Udara kering' : dewC < 16 ? 'Nyaman' : dewC < 21 ? 'Agak lembab' : 'Sangat lembab';
    } else {
        const dewCelsius = (dewC - 32) * 5 / 9;
        DOM.dewDesc.textContent = dewCelsius < 10 ? 'Udara kering' : dewCelsius < 16 ? 'Nyaman' : dewCelsius < 21 ? 'Agak lembab' : 'Sangat lembab';
    }

    // Wind
    DOM.windDetailSpeed.textContent = d.wind.speed.toFixed(1) + (state.unit === 'metric' ? ' m/s' : ' mph');
    const deg = d.wind.deg || 0;
    DOM.compassNeedle.style.transform = `rotate(${deg}deg)`;
    DOM.windDirectionText.textContent = degToDirection(deg);

    // Clouds
    const clouds = d.clouds.all;
    DOM.cloudsValue.textContent = clouds + '%';
    DOM.cloudFill.style.width = clouds + '%';
    DOM.cloudsDesc.textContent = clouds < 20 ? 'Cerah' : clouds < 50 ? 'Berawan sebagian' : clouds < 80 ? 'Berawan' : 'Mendung';

    // Sunrise/Sunset
    const sunrise = new Date(d.sys.sunrise * 1000);
    const sunset = new Date(d.sys.sunset * 1000);
    DOM.sunrise.textContent = formatTime(sunrise);
    DOM.sunset.textContent = formatTime(sunset);

    // Sun arc position
    const now = Date.now() / 1000;
    const dayLength = d.sys.sunset - d.sys.sunrise;
    let sunProgress = (now - d.sys.sunrise) / dayLength;
    sunProgress = Math.max(0, Math.min(1, sunProgress));

    // Calculate position on quadratic bezier: P0=(10,90), P1=(100,-10), P2=(190,90)
    const t = sunProgress;
    const cx = (1 - t) * (1 - t) * 10 + 2 * (1 - t) * t * 100 + t * t * 190;
    const cy = (1 - t) * (1 - t) * 90 + 2 * (1 - t) * t * (-10) + t * t * 90;
    DOM.sunDot.setAttribute('cx', cx);
    DOM.sunDot.setAttribute('cy', cy);

    // UV Index (estimate from weather data - use a simple heuristic if no UV API)
    estimateUV(d);
}

function estimateUV(d) {
    // Simple UV estimate based on time, clouds, and weather conditions
    const now = new Date();
    const hour = now.getHours();
    const clouds = d.clouds.all;
    const weatherMain = d.weather[0].main.toLowerCase();

    let baseUV = 0;
    if (hour >= 6 && hour <= 18) {
        // Peak at noon
        const solarAngle = Math.sin((hour - 6) / 12 * Math.PI);
        baseUV = solarAngle * 11;
    }

    // Reduce by clouds
    baseUV *= (1 - clouds / 100 * 0.6);

    // Reduce by rain/snow
    if (weatherMain.includes('rain') || weatherMain.includes('snow') || weatherMain.includes('thunderstorm')) {
        baseUV *= 0.3;
    }

    const uv = Math.max(0, Math.round(baseUV * 10) / 10);
    DOM.uvValue.textContent = uv.toFixed(1);

    // Position indicator
    const uvPercent = Math.min(uv / 11, 1) * 100;
    DOM.uvIndicator.style.left = uvPercent + '%';

    // Description
    if (uv <= 2) DOM.uvDesc.textContent = 'Rendah';
    else if (uv <= 5) DOM.uvDesc.textContent = 'Sedang';
    else if (uv <= 7) DOM.uvDesc.textContent = 'Tinggi';
    else if (uv <= 10) DOM.uvDesc.textContent = 'Sangat Tinggi';
    else DOM.uvDesc.textContent = 'Ekstrem';
}

function renderAQI() {
    if (!state.aqiData || !state.aqiData.list || !state.aqiData.list.length) {
        DOM.aqiValue.textContent = 'N/A';
        DOM.aqiLabel.textContent = 'Tidak tersedia';
        return;
    }

    const aqi = state.aqiData.list[0].main.aqi;
    const components = state.aqiData.list[0].components;

    // AQI labels
    const labels = ['', 'Baik', 'Sedang', 'Cukup', 'Buruk', 'Berbahaya'];
    const colors = ['', '#22c55e', '#eab308', '#f97316', '#ef4444', '#9333ea'];

    DOM.aqiValue.textContent = aqi;
    DOM.aqiLabel.textContent = labels[aqi] || '—';

    // Ring progress
    const circumference = 2 * Math.PI * 54; // r = 54
    const progress = (aqi / 5) * circumference;
    DOM.aqiProgress.style.strokeDashoffset = circumference - progress;
    DOM.aqiProgress.style.stroke = colors[aqi] || '#22c55e';

    // Pollutants
    const pollutants = [
        { name: 'PM2.5', value: components.pm2_5, unit: 'μg/m³' },
        { name: 'PM10', value: components.pm10, unit: 'μg/m³' },
        { name: 'O₃', value: components.o3, unit: 'μg/m³' },
        { name: 'NO₂', value: components.no2, unit: 'μg/m³' },
        { name: 'SO₂', value: components.so2, unit: 'μg/m³' },
        { name: 'CO', value: components.co, unit: 'μg/m³' },
    ];

    DOM.aqiPollutants.innerHTML = pollutants.map(p => `
        <div class="pollutant-card">
            <div class="pollutant-name">${p.name}</div>
            <div class="pollutant-value">${p.value ? p.value.toFixed(1) : '—'}</div>
            <span class="pollutant-unit">${p.unit}</span>
        </div>
    `).join('');
}

// ===================== BACKGROUND =====================
function updateBackground() {
    const d = state.currentData;
    if (!d) return;

    const now = Date.now() / 1000;
    const sunrise = d.sys.sunrise;
    const sunset = d.sys.sunset;
    const weatherMain = d.weather[0].main.toLowerCase();

    let gradient;

    if (now < sunrise || now > sunset) {
        // Night
        gradient = 'linear-gradient(135deg, #0a0a1a 0%, #0f172a 40%, #1a1a40 100%)';
    } else if (now < sunrise + 3600 || now > sunset - 3600) {
        // Sunrise/Sunset (golden hour)
        gradient = 'linear-gradient(135deg, #1a1a2e 0%, #4a1942 30%, #a0522d 60%, #2d1b4e 100%)';
    } else if (weatherMain.includes('rain') || weatherMain.includes('drizzle') || weatherMain.includes('thunderstorm')) {
        gradient = 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #1a202c 100%)';
    } else if (weatherMain.includes('cloud')) {
        gradient = 'linear-gradient(135deg, #0f172a 0%, #2d3748 40%, #1a202c 100%)';
    } else if (weatherMain.includes('snow')) {
        gradient = 'linear-gradient(135deg, #1a1a2e 0%, #2d3748 40%, #4a5568 100%)';
    } else {
        // Clear day
        gradient = 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 30%, #1a1a40 100%)';
    }

    document.body.style.background = gradient;
}

// ===================== UNIT TOGGLE =====================
function toggleUnit() {
    state.unit = state.unit === 'metric' ? 'imperial' : 'metric';
    localStorage.setItem('weather-unit', state.unit);
    updateUnitUI();

    // Re-fetch data with new units
    if (state.lastLat && state.lastLon) {
        fetchWeatherByCoords(parseFloat(state.lastLat), parseFloat(state.lastLon));
    }
}

function updateUnitUI() {
    if (state.unit === 'metric') {
        DOM.unitC.classList.add('active');
        DOM.unitF.classList.remove('active');
    } else {
        DOM.unitF.classList.add('active');
        DOM.unitC.classList.remove('active');
    }
}

// ===================== PARTICLES =====================
function initParticles() {
    const container = document.getElementById('particles');
    const count = 30;
    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.classList.add('particle');
        el.style.left = Math.random() * 100 + '%';
        el.style.width = (Math.random() * 3 + 1) + 'px';
        el.style.height = el.style.width;
        el.style.animationDuration = (Math.random() * 15 + 10) + 's';
        el.style.animationDelay = (Math.random() * 10) + 's';
        el.style.opacity = Math.random() * 0.3 + 0.05;
        container.appendChild(el);
    }
}

// ===================== REVEAL ON SCROLL =====================
function initReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    $$('.reveal').forEach(el => observer.observe(el));
}

function triggerReveal() {
    setTimeout(() => {
        $$('.reveal').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight) {
                el.classList.add('visible');
            }
        });
    }, 100);
}

// ===================== UTILS =====================
function showLoading(show) {
    if (show) {
        DOM.loadingOverlay.classList.remove('hidden');
    } else {
        DOM.loadingOverlay.classList.add('hidden');
    }
}

function showError(msg) {
    DOM.errorMessage.textContent = msg;
    DOM.errorToast.classList.remove('hidden');
    setTimeout(() => DOM.errorToast.classList.add('hidden'), 6000);
}

function formatDate(date) {
    return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function formatTime(date) {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDayName(date) {
    return date.toLocaleDateString('id-ID', { weekday: 'short' });
}

function getCountryName(code) {
    const countries = {
        'ID': 'Indonesia', 'US': 'Amerika Serikat', 'GB': 'Inggris', 'AU': 'Australia',
        'JP': 'Jepang', 'KR': 'Korea Selatan', 'CN': 'China', 'IN': 'India',
        'DE': 'Jerman', 'FR': 'Prancis', 'IT': 'Italia', 'ES': 'Spanyol',
        'BR': 'Brasil', 'RU': 'Rusia', 'CA': 'Kanada', 'MX': 'Meksiko',
        'SA': 'Arab Saudi', 'AE': 'Uni Emirat Arab', 'SG': 'Singapura', 'MY': 'Malaysia',
        'TH': 'Thailand', 'VN': 'Vietnam', 'PH': 'Filipina', 'NL': 'Belanda',
        'SE': 'Swedia', 'NO': 'Norwegia', 'DK': 'Denmark', 'FI': 'Finlandia',
        'NZ': 'Selandia Baru', 'ZA': 'Afrika Selatan', 'EG': 'Mesir', 'TR': 'Turki',
        'PL': 'Polandia', 'PT': 'Portugal', 'CH': 'Swiss', 'AT': 'Austria',
        'BE': 'Belgia', 'IE': 'Irlandia', 'AR': 'Argentina', 'CL': 'Chili',
    };
    return countries[code] || code;
}

function degToDirection(deg) {
    const dirs = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];
    const idx = Math.round(deg / 45) % 8;
    return dirs[idx];
}

// Resize chart on window resize
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (state.forecastData) {
            drawHourlyChart(state.forecastData.list.slice(0, 12));
        }
    }, 250);
});
