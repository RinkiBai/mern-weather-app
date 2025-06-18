import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';
import TemperatureChart from './TemperatureChart';
import { countryNameToCode, getFlagEmoji } from './utils/countryCodes';

import sunnyImg from './assets/sunny.jpg';
import rainyImg from './assets/rainy.jpg';
import cloudyImg from './assets/cloudy.jpg';
import snowImg from './assets/snow.jpg';
import defaultImg from './assets/background.jpg';

function App() {
  const [city, setCity] = useState('');
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [history, setHistory] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [unit, setUnit] = useState('metric');
  const autocompleteTimeout = useRef(null);

  const API_BASE_URL = 'http://localhost:5000';

  const updateHistory = (data) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.city.toLowerCase() !== data.city.toLowerCase());
      return [data, ...filtered].slice(0, 4);
    });
    setCity('');
    setAutocompleteSuggestions([]);
  };

  const handleApiError = (error, type) => {
    const errorMsg = error.response?.data?.error || `Failed to fetch weather for your ${type}.`;
    const errorDetails = error.response?.data?.details || '';
    setError(`${errorMsg}${errorDetails ? `: ${errorDetails}` : ''}`);
  };

  const normalizeWeatherData = (data) => {
    const normalized = { ...data };
    if (normalized.visibility !== undefined && normalized.visibility !== null) {
      const visibility = parseFloat(normalized.visibility);
      normalized.visibility = isNaN(visibility) ? null : visibility;
    }
    if (normalized.pressure !== undefined && normalized.pressure !== null) {
      const pressure = parseFloat(normalized.pressure);
      normalized.pressure = isNaN(pressure) ? null : pressure;
    }
    return normalized;
  };

  const fetchWeatherForCity = async (cityName) => {
    if (!cityName.trim()) {
      setError('Please enter a city name.');
      return;
    }

    setLoading(true);
    setError('');
    setHasSearched(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/weather/${encodeURIComponent(cityName)}`);
      const weatherData = normalizeWeatherData(res.data);
      console.log('Weather API response:', weatherData);
      setWeather(weatherData);
      updateHistory(weatherData);

      const forecastRes = await axios.get(`${API_BASE_URL}/forecast/${encodeURIComponent(cityName)}`);
      const cleanedForecast = forecastRes.data.slice(0, 8).map(item => {
        const date = item.time
          ? new Date(typeof item.time === 'number' ? item.time * 1000 : item.time.replace(' ', 'T'))
          : null;
        return {
          ...item,
          temp: item.temp_c,
          parsedTime: date
        };
      });
      console.log('Forecast data received:', cleanedForecast.map(item => ({
        time: item.time,
        parsedTime: item.parsedTime?.toISOString(),
        displayTime: item.parsedTime?.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: true }).replace(/:\d{2}/, '')
      })));
      setForecast(cleanedForecast);
    } catch (error) {
      handleApiError(error, 'city');
      setWeather(null);
      setForecast([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchWeather = () => fetchWeatherForCity(city);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setCity(val);
    if (autocompleteTimeout.current) clearTimeout(autocompleteTimeout.current);

    if (!val.trim()) {
      setAutocompleteSuggestions([]);
      return;
    }

    autocompleteTimeout.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/autocomplete?q=${encodeURIComponent(val)}`);
        setAutocompleteSuggestions(res.data);
      } catch {
        setAutocompleteSuggestions([]);
      }
    }, 300);
  };

  const handleSuggestionClick = (suggestion) => {
    setCity(suggestion);
    setAutocompleteSuggestions([]);
    fetchWeatherForCity(suggestion);
  };

  const clearHistory = async () => {
    try {
      await axios.delete(`${API_BASE_URL}/history`);
      setHistory([]);
    } catch {
      setError('Failed to clear history.');
    }
  };

  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/history`)
      .then((res) => setHistory(res.data.map((c) => ({ city: c }))))
      .catch(() => setError('Could not fetch search history.'));
  }, []);

  const getBackgroundImage = () => {
    const condition = weather?.description?.toLowerCase?.() || '';
    if (condition.includes('rain')) return rainyImg;
    if (condition.includes('cloud')) return cloudyImg;
    if (condition.includes('snow')) return snowImg;
    if (condition.includes('sun') || condition.includes('clear')) return sunnyImg;
    return defaultImg;
  };

  const getWeatherIcon = (description) => {
    if (!description) return '🌈';
    const desc = description.toLowerCase();
    if (desc.includes('rain')) return '🌧️';
    if (desc.includes('cloud')) return '☁️';
    if (desc.includes('sun') || desc.includes('clear')) return '☀️';
    if (desc.includes('snow')) return '❄️';
    return '🌈';
  };

  const getPanelClass = () => {
    const condition = weather?.description?.toLowerCase?.() || '';
    if (condition.includes('rain')) return 'rainy';
    if (condition.includes('cloud')) return 'cloudy';
    if (condition.includes('snow')) return 'snow';
    if (condition.includes('sun') || condition.includes('clear')) return 'sunny';
    return '';
  };

  const renderCountryFlag = (country) => {
    if (!country) return '🏳️';
    try {
      const countryCode = country.length === 2 
        ? country.toUpperCase() 
        : countryNameToCode(country);
      return getFlagEmoji(countryCode) || '🏳️';
    } catch {
      return '🏳️';
    }
  };

  const formatTime = (timestamp, timezoneOffset) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    if (timezoneOffset) {
      const utcOffset = date.getTimezoneOffset() * 60 * 1000;
      const cityOffset = timezoneOffset * 1000;
      date.setTime(date.getTime() + utcOffset + cityOffset);
    }
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const getNextEvent = (sunrise, sunset, timezoneOffset) => {
    if (!sunrise || !sunset) return null;
    const now = new Date();
    const sunriseDate = new Date(sunrise * 1000);
    const sunsetDate = new Date(sunset * 1000);

    if (timezoneOffset) {
      const utcOffset = now.getTimezoneOffset() * 60 * 1000;
      const cityOffset = timezoneOffset * 1000;
      sunriseDate.setTime(sunriseDate.getTime() + utcOffset + cityOffset);
      sunsetDate.setTime(sunsetDate.getTime() + utcOffset + cityOffset);
    }

    if (now < sunriseDate) return 'sunrise';
    if (now < sunsetDate) return 'sunset';
    return 'sunrise';
  };

  const convertUnits = (value, type) => {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    const numericValue = Number(value);
    if (isNaN(numericValue)) {
      console.log(`Invalid value for ${type}:`, value);
      return 'N/A';
    }
    if (unit === 'metric') {
      return numericValue.toFixed(1);
    }
    switch (type) {
      case 'visibility':
        return (numericValue * 0.621371).toFixed(1);
      case 'pressure':
        return (numericValue * 0.02953).toFixed(2);
      default:
        return numericValue.toFixed(1);
    }
  };

  const getUnitLabel = (type) => {
    if (unit === 'metric') {
      switch (type) {
        case 'visibility': return 'km';
        case 'pressure': return 'hPa';
        default: return '';
      }
    }
    switch (type) {
      case 'visibility': return 'mi';
      case 'pressure': return 'inHg';
      default: return '';
    }
  };

  const getWeatherTip = () => {
    if (!weather) return '';
    if (weather.uvi && weather.uvi > 6) return 'High UV Index! Wear sunscreen and protective clothing.';
    if (weather.visibility && weather.visibility < 1) return 'Low visibility! Drive carefully.';
    if (weather.clouds && weather.clouds > 80) return 'Cloudy skies! You might need an umbrella soon.';
    return 'Enjoy the weather! Stay hydrated.';
  };

  const [convertedValues, setConvertedValues] = useState({
    visibility: 'N/A',
    visibilityUnit: 'km',
    pressure: 'N/A',
    pressureUnit: 'hPa',
  });

  useEffect(() => {
    if (weather) {
      console.log('Updating converted values for unit:', unit);
      const visibility = convertUnits(weather.visibility, 'visibility');
      const pressure = convertUnits(weather.pressure, 'pressure');
      setConvertedValues({
        visibility: visibility,
        visibilityUnit: getUnitLabel('visibility'),
        pressure: pressure,
        pressureUnit: getUnitLabel('pressure'),
      });
    }
  }, [weather, unit]);

  useEffect(() => {
    console.log('Unit changed to:', unit);
    console.log('Converted values:', convertedValues);
  }, [unit, convertedValues]);

  const backgroundImage = getBackgroundImage();

  return (
    <div
      className={`app-container ${darkMode ? 'dark' : ''}`}
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="overlay">
        <div className="left-panel">
          <div className="main-content">
            <header className="app-header">
              <h1 className="app-title">🌦️ Weather Forecast</h1>
              <button onClick={() => setDarkMode(!darkMode)} className="dark-toggle-btn">
                {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
              </button>
            </header>

            <div className="search-container">
              <div className="search-box">
                <input
                  type="text"
                  value={city}
                  onChange={handleInputChange}
                  placeholder="Enter city name..."
                  className="search-input"
                />
                <button onClick={fetchWeather} className="search-button">
                  Search
                </button>
              </div>
              {autocompleteSuggestions.length > 0 && (
                <ul className="autocomplete-list">
                  {autocompleteSuggestions.map((suggestion, i) => (
                    <li key={i} onClick={() => handleSuggestionClick(suggestion)}>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {loading && (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading weather data...</p>
              </div>
            )}

            {error && <p className="error-message">{error}</p>}

            <div className="weather-display">
              {hasSearched && weather ? (
                <div className="current-weather card">
                  <h2>
                    {weather.city ?? 'Unknown'}
                    {weather.region ? `, ${weather.region}` : ''}, {weather.country ?? '??'}{' '}
                    <span className="country-flag">{renderCountryFlag(weather.country)}</span>
                  </h2>
                  <div className="weather-main">
                    <div className="weather-icon">
                      {getWeatherIcon(weather.description)}
                    </div>
                    <div className="weather-details">
                      <p className="temperature">
                        {typeof weather?.temp === 'number' ? `${weather.temp}°C` : 'N/A'}
                      </p>
                      <p className="description">{weather.description ?? 'No description'}</p>
                      {weather.humidity && <p>Humidity: {weather.humidity}%</p>}
                      {weather.wind && <p>Wind: {weather.wind} km/h</p>}
                    </div>
                  </div>
                </div>
              ) : hasSearched ? (
                <p className="no-data-message">No weather data available. Please try another city.</p>
              ) : (
                <p className="welcome-message">Enter a city to see the current weather and forecast</p>
              )}

              {forecast.length > 0 && (
                <div className="forecast-container card">
                  <h3>8-Hour Forecast</h3>
                  <TemperatureChart forecast={forecast} />
                  <div className="hourly-forecast">
                    {forecast.map((item, index) => (
                      <div key={index} className="hourly-item" style={{ fontFamily: 'Roboto, sans-serif' }}>
                        <p>
                          {item.parsedTime instanceof Date && !isNaN(item.parsedTime)
                            ? item.parsedTime.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: true }).replace(/:\d{2}/, '')
                            : 'N/A'}
                        </p>
                        <p>
                          {typeof item.temp === 'number' && !isNaN(item.temp)
                            ? `${item.temp.toFixed(1)}°C`
                            : 'N/A'}
                        </p>
                        <p>{item.description || ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {history.length > 0 && (
                <div className="history-container card">
                  <div className="history-header">
                    <h3>Search History</h3>
                    <button onClick={clearHistory} className="clear-history-btn">
                      Clear
                    </button>
                  </div>
                  <ul className="history-list">
                    {history.map((h, i) => (
                      <li key={i} onClick={() => fetchWeatherForCity(h.city)}>
                        {h.city}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`right-panel ${getPanelClass()}`} key={unit}>
          <h2>Additional Weather Details</h2>
          <button
            onClick={() => setUnit(unit === 'metric' ? 'imperial' : 'metric')}
            className="unit-toggle"
          >
            Switch to {unit === 'metric' ? 'Imperial' : 'Metric'}
          </button>
          {weather ? (
            <div>
              {weather.sunrise && (
                <div className="weather-detail" style={{ '--delay': 1 }}>
                  <i className="fas fa-sun icon"></i>
                  <strong>Sunrise:</strong>
                  <span>
                    {formatTime(weather.sunrise, weather.timezone)}
                    {getNextEvent(weather.sunrise, weather.sunset, weather.timezone) === 'sunrise' && (
                      <span style={{ marginLeft: '0.5rem', color: 'var(--primary-color)' }}>(Next)</span>
                    )}
                  </span>
                  <span className="tooltip">Time of sunrise in local timezone</span>
                </div>
              )}
              {weather.sunset && (
                <div className="weather-detail" style={{ '--delay': 2 }}>
                  <i className="fas fa-sunset icon"></i>
                  <strong>Sunset:</strong>
                  <span>
                    {formatTime(weather.sunset, weather.timezone)}
                    {getNextEvent(weather.sunrise, weather.sunset, weather.timezone) === 'sunset' && (
                      <span style={{ marginLeft: '0.5rem', color: 'var(--primary-color)' }}>(Next)</span>
                    )}
                  </span>
                  <span className="tooltip">Time of sunset in local timezone</span>
                </div>
              )}
              {weather.feels_like && (
                <div className="weather-detail" style={{ '--delay': 3 }}>
                  <i className="fas fa-thermometer-half icon"></i>
                  <strong>Feels Like:</strong>
                  <span>{`${weather.feels_like}°C`}</span>
                  <span className="tooltip">Temperature adjusted for humidity and wind</span>
                </div>
              )}
              {weather.clouds && (
                <div className="weather-detail" style={{ '--delay': 4 }}>
                  <i className="fas fa-cloud icon"></i>
                  <strong>Cloudiness:</strong>
                  <span>{`${weather.clouds}%`}</span>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${weather.clouds}%` }}
                    ></div>
                  </div>
                  <span className="tooltip">Percentage of sky covered by clouds</span>
                </div>
              )}
              <div className="weather-detail" style={{ '--delay': 5 }}>
                <i className="fas fa-eye icon"></i>
                <strong>Visibility:</strong>
                <span>{`${convertedValues.visibility} ${convertedValues.visibilityUnit}`}</span>
                <span className="tooltip">Distance you can clearly see</span>
              </div>
              <div className="weather-detail" style={{ '--delay': 6 }}>
                <i className="fas fa-tachometer-alt icon"></i>
                <strong>Pressure:</strong>
                <span>{`${convertedValues.pressure} ${convertedValues.pressureUnit}`}</span>
                <span className="tooltip">Atmospheric pressure at sea level</span>
              </div>
              {weather.uvi && (
                <div className={`weather-detail ${weather.uvi > 6 ? 'highlight' : ''}`} style={{ '--delay': 7 }}>
                  <i className="fas fa-sun icon"></i>
                  <strong>UV Index:</strong>
                  <span>{weather.uvi}</span>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${(weather.uvi / 11) * 100}%` }}
                    ></div>
                  </div>
                  <span className="tooltip">Measure of UV radiation intensity (0-11+)</span>
                </div>
              )}
              <div className="weather-tip">
                <p>{getWeatherTip()}</p>
              </div>
            </div>
          ) : (
            <p>No additional weather details available.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;