require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// Environment Validation
const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173'];

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Schema & Model
const searchSchema = new mongoose.Schema({
  city: { 
    type: String, 
    required: true,
    lowercase: true
  },
  searchedAt: { type: Date, default: Date.now },
});
const Search = mongoose.model('Search', searchSchema);

const apiKey = process.env.WEATHER_API_KEY;
if (!apiKey) {
  console.error('❌ Missing WEATHER_API_KEY in environment variables');
  process.exit(1);
}

// Helper functions
const normalizeCity = (city) => city.trim().toLowerCase();

// Convert timezone ID to UTC offset in seconds
const getTimezoneOffset = (tzId) => {
  try {
    const date = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tzId, timeZoneName: 'longOffset' });
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find(part => part.type === 'timeZoneName');
    if (!offsetPart) return 0;

    const offsetStr = offsetPart.value; // e.g., "GMT+05:30"
    const match = offsetStr.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!match) return 0;

    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = parseInt(match[3], 10);
    return sign * (hours * 3600 + minutes * 60);
  } catch (error) {
    console.error(`Failed to get timezone offset for ${tzId}:`, error);
    return 0; // Fallback to 0 offset (UTC)
  }
};

// Validate coordinates middleware
const validateCoordinates = (req, res, next) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ 
      error: 'Missing coordinates',
      details: 'Both lat and lon parameters are required'
    });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  if (isNaN(latNum) || isNaN(lonNum)) {
    return res.status(400).json({ 
      error: 'Invalid coordinates',
      details: 'Latitude and longitude must be numbers'
    });
  }

  if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
    return res.status(400).json({
      error: 'Invalid coordinates',
      details: 'Latitude must be between -90 and 90, longitude between -180 and 180'
    });
  }

  req.coordinates = { lat: latNum, lon: lonNum };
  next();
};

// Coordinate-based weather endpoint
app.get('/weather/coords', validateCoordinates, async (req, res) => {
  const { lat, lon } = req.coordinates;

  const formattedLat = lat.toFixed(2);
  const formattedLon = lon.toFixed(2);
  const url = `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${formattedLat},${formattedLon}&aqi=no`;

  try {
    const weatherRes = await axios.get(url);
    const { location, current } = weatherRes.data;

    if (!location || !current) {
      return res.status(500).json({
        error: 'Invalid response from weather API',
        details: 'Expected location and current data'
      });
    }

    const actualCity = normalizeCity(location.name);

    try {
      await Search.findOneAndUpdate(
        { city: actualCity },
        { $set: { searchedAt: new Date(), city: actualCity } },
        { upsert: true, new: true }
      );
    } catch (dbError) {
      console.error('Failed to update search history:', dbError);
    }

    // Fetch sunrise/sunset from forecast endpoint
    let sunrise, sunset;
    try {
      const forecastUrl = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${formattedLat},${formattedLon}&days=1&aqi=no&alerts=no`;
      const forecastRes = await axios.get(forecastUrl);
      const astro = forecastRes.data.forecast?.forecastday?.[0]?.astro;
      if (astro) {
        sunrise = new Date(`${forecastRes.data.location.localtime.split(' ')[0]} ${astro.sunrise}`).getTime() / 1000;
        sunset = new Date(`${forecastRes.data.location.localtime.split(' ')[0]} ${astro.sunset}`).getTime() / 1000;
      }
    } catch (error) {
      console.error('Failed to fetch sunrise/sunset:', error);
    }

    res.json({
      city: location.name,
      region: location.region,
      country: location.country,
      temp: current.temp_c,
      description: current.condition.text,
      icon: `https:${current.condition.icon}`,
      last_updated: current.last_updated,
      humidity: current.humidity,
      wind: current.wind_kph,
      pressure: current.pressure_mb,
      visibility: current.vis_km,
      feels_like: current.feelslike_c,
      clouds: current.cloud,
      uvi: current.uv,
      sunrise: sunrise || null,
      sunset: sunset || null,
      timezone: getTimezoneOffset(location.tz_id)
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || 'Failed to fetch weather data for coordinates',
      code: error.response?.data?.error?.code || 'unknown_error'
    });
  }
});

// City-based weather endpoint
app.get('/weather/:city', async (req, res) => {
  const rawCity = req.params.city;
  if (!rawCity?.trim()) {
    return res.status(400).json({ 
      error: 'City parameter is required',
      details: 'A valid city name must be provided'
    });
  }

  const url = `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(rawCity)}&aqi=no`;
  try {
    const weatherRes = await axios.get(url);
    const { location, current } = weatherRes.data;

    if (!location || !current) {
      return res.status(500).json({
        error: 'Invalid response from weather API',
        details: 'Expected location and current data'
      });
    }

    const actualCity = normalizeCity(location.name);

    try {
      await Search.findOneAndUpdate(
        { city: actualCity },
        { $set: { searchedAt: new Date(), city: actualCity } },
        { upsert: true, new: true }
      );
    } catch (dbError) {
      console.error('Failed to update search history:', dbError);
    }

    // Fetch sunrise/sunset from forecast endpoint
    let sunrise, sunset;
    try {
      const forecastUrl = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(rawCity)}&days=1&aqi=no&alerts=no`;
      const forecastRes = await axios.get(forecastUrl);
      const astro = forecastRes.data.forecast?.forecastday?.[0]?.astro;
      if (astro) {
        sunrise = new Date(`${forecastRes.data.location.localtime.split(' ')[0]} ${astro.sunrise}`).getTime() / 1000;
        sunset = new Date(`${forecastRes.data.location.localtime.split(' ')[0]} ${astro.sunset}`).getTime() / 1000;
      }
    } catch (error) {
      console.error('Failed to fetch sunrise/sunset:', error);
    }

    res.json({
      city: location.name,
      region: location.region,
      country: location.country,
      temp: current.temp_c,
      description: current.condition.text,
      icon: `https:${current.condition.icon}`,
      last_updated: current.last_updated,
      humidity: current.humidity,
      wind: current.wind_kph,
      pressure: current.pressure_mb,
      visibility: current.vis_km,
      feels_like: current.feelslike_c,
      clouds: current.cloud,
      uvi: current.uv,
      sunrise: sunrise || null,
      sunset: sunset || null,
      timezone: getTimezoneOffset(location.tz_id)
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || 'Failed to fetch weather data',
      code: error.response?.data?.error?.code || 'unknown_error'
    });
  }
});

// Forecast weather data (8-hour forecast starting from current hour)
app.get('/forecast/:city', async (req, res) => {
  const city = req.params.city;
  if (!city?.trim()) {
    return res.status(400).json({
      error: 'City parameter is required',
      details: 'A valid city name must be provided for forecast'
    });
  }

  const forecastUrl = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(city)}&days=3&aqi=no&alerts=no`;

  try {
    const forecastRes = await axios.get(forecastUrl);
    const location = forecastRes.data.location;
    const forecastData = forecastRes.data.forecast?.forecastday;

    if (!forecastData || !Array.isArray(forecastData)) {
      return res.status(500).json({
        error: 'Invalid forecast data',
        details: 'Expected forecastday array'
      });
    }

    // Get the current time in the city's timezone using location.localtime
    const localTimeStr = location.localtime;
    const cityTime = new Date(localTimeStr.replace(' ', 'T'));
    const cityTimeMs = cityTime.getTime();

    // Extract hourly data
    const hourlyData = forecastData.flatMap(day =>
      day.hour.map(hour => ({
        time: hour.time,
        temp_c: hour.temp_c,
        condition: hour.condition.text,
        icon: `https:${hour.condition.icon}`,
        description: hour.condition.text
      }))
    );

    // Log all available forecast hours with their millisecond timestamps
    console.log('All forecast hours with timestamps:', hourlyData.map(item => ({
      time: item.time,
      timeMs: new Date(item.time.replace(' ', 'T')).getTime()
    })));

    // Log the current time for comparison
    console.log('City local time:', cityTime.toISOString(), 'City time (ms):', cityTimeMs);

    // Find the first forecast entry after the current time
    let startIndex = hourlyData.findIndex(item => {
      const itemTime = new Date(item.time.replace(' ', 'T')).getTime();
      return itemTime >= cityTimeMs;
    });

    // Log the calculated startIndex
    console.log('Calculated startIndex:', startIndex);

    // If no future time is found, wrap around to the beginning (e.g., next day)
    if (startIndex === -1) {
      console.log('No future time found, wrapping around to start');
      startIndex = 0;
    }

    // Slice the next 8 hours
    let forecastSlice = hourlyData.slice(startIndex, startIndex + 8);

    // If we don't have enough hours, append from the beginning (e.g., next day's data)
    if (forecastSlice.length < 8) {
      console.log('Not enough hours, appending from beginning:', 8 - forecastSlice.length);
      const remaining = 8 - forecastSlice.length;
      const additionalHours = hourlyData.slice(0, remaining);
      forecastSlice.push(...additionalHours);
    }

    // Log the selected hours
    console.log('Selected forecast hours:', forecastSlice.map(item => item.time));

    res.json(forecastSlice);
  } catch (error) {
    console.error('Forecast error:', error);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || 'Failed to fetch forecast data',
      code: error.response?.data?.error?.code || 'forecast_error'
    });
  }
});

// History endpoints
app.get('/history', async (req, res) => {
  try {
    const recent = await Search.find()
      .sort({ searchedAt: -1 })
      .limit(4)
      .select('city -_id');
    res.json(recent.map(entry => entry.city));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history', details: err.message });
  }
});

app.delete('/history', async (req, res) => {
  try {
    await Search.deleteMany({});
    res.json({ message: 'History cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear history', details: err.message });
  }
});

// Autocomplete endpoint
app.get('/autocomplete', async (req, res) => {
  try {
    const query = req.query.q?.trim();
    if (!query) return res.json([]);

    const suggestions = await Search.find({
      city: { $regex: `^${normalizeCity(query)}` }
    })
      .limit(5)
      .select('city -_id');

    const formatted = suggestions.map(item => 
      item.city.charAt(0).toUpperCase() + item.city.slice(1)
    );

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Autocomplete service failed', details: err.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));