require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// ✅ Allowed origins (adjust for your project needs)
const allowedOrigins = [
  'https://mern-weather-app-rinki-bais-projects.vercel.app',
  'https://mern-weather-gykk4njcy-rinki-bais-projects.vercel.app',
  'http://localhost:5173',
];

// ✅ CORS Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app')
    ) {
      callback(null, true);
    } else {
      console.error(`❌ CORS blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
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
  city: { type: String, required: true, lowercase: true },
  searchedAt: { type: Date, default: Date.now },
});
const Search = mongoose.model('Search', searchSchema);

const apiKey = process.env.WEATHER_API_KEY;
if (!apiKey) {
  console.error('❌ Missing WEATHER_API_KEY in environment variables');
  process.exit(1);
}

const normalizeCity = (city) => city.trim().toLowerCase();

const getTimezoneOffset = (tzId) => {
  try {
    const date = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tzId, timeZoneName: 'longOffset' });
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find(part => part.type === 'timeZoneName');
    if (!offsetPart) return 0;

    const match = offsetPart.value.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!match) return 0;

    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = parseInt(match[3], 10);
    return sign * (hours * 3600 + minutes * 60);
  } catch (error) {
    console.error(`Failed to get timezone offset for ${tzId}:`, error);
    return 0;
  }
};

const validateCoordinates = (req, res, next) => {
  const { lat, lon } = req.query;
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  if (!lat || !lon || isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  req.coordinates = { lat: latNum, lon: lonNum };
  next();
};

app.get('/weather/coords', validateCoordinates, async (req, res) => {
  const { lat, lon } = req.coordinates;
  const url = `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${lat.toFixed(2)},${lon.toFixed(2)}&aqi=no`;

  try {
    const weatherRes = await axios.get(url);
    const { location, current } = weatherRes.data;
    const actualCity = normalizeCity(location.name);

    await Search.findOneAndUpdate(
      { city: actualCity },
      { $set: { searchedAt: new Date(), city: actualCity } },
      { upsert: true, new: true }
    );

    let sunrise = null, sunset = null;
    try {
      const forecastUrl = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${lat},${lon}&days=1`;
      const forecastRes = await axios.get(forecastUrl);
      const astro = forecastRes.data.forecast?.forecastday?.[0]?.astro;
      if (astro) {
        sunrise = new Date(`${forecastRes.data.location.localtime.split(' ')[0]} ${astro.sunrise}`).getTime() / 1000;
        sunset = new Date(`${forecastRes.data.location.localtime.split(' ')[0]} ${astro.sunset}`).getTime() / 1000;
      }
    } catch (err) {
      console.error('Sunrise/sunset fetch failed:', err);
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
      sunrise,
      sunset,
      timezone: getTimezoneOffset(location.tz_id)
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || 'Failed to fetch weather data',
      code: error.response?.data?.error?.code || 'unknown_error'
    });
  }
});

app.get('/weather/:city', async (req, res) => {
  const city = req.params.city?.trim();
  if (!city) return res.status(400).json({ error: 'City is required' });

  try {
    const url = `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}&aqi=no`;
    const { location, current } = (await axios.get(url)).data;
    const actualCity = normalizeCity(location.name);

    await Search.findOneAndUpdate(
      { city: actualCity },
      { $set: { searchedAt: new Date(), city: actualCity } },
      { upsert: true, new: true }
    );

    let sunrise = null, sunset = null;
    try {
      const forecastUrl = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(city)}&days=1`;
      const forecastRes = await axios.get(forecastUrl);
      const astro = forecastRes.data.forecast?.forecastday?.[0]?.astro;
      if (astro) {
        sunrise = new Date(`${forecastRes.data.location.localtime.split(' ')[0]} ${astro.sunrise}`).getTime() / 1000;
        sunset = new Date(`${forecastRes.data.location.localtime.split(' ')[0]} ${astro.sunset}`).getTime() / 1000;
      }
    } catch (err) {
      console.error('Sunrise/sunset fetch failed:', err);
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
      sunrise,
      sunset,
      timezone: getTimezoneOffset(location.tz_id)
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || 'Weather fetch failed',
      code: error.response?.data?.error?.code || 'unknown_error'
    });
  }
});

app.get('/forecast/:city', async (req, res) => {
  const city = req.params.city;
  if (!city) return res.status(400).json({ error: 'City is required' });

  try {
    const forecastUrl = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(city)}&days=3`;
    const forecastRes = await axios.get(forecastUrl);
    const { location, forecast } = forecastRes.data;
    const hourlyData = forecast.forecastday.flatMap(day =>
      day.hour.map(hour => ({
        time: hour.time,
        temp_c: hour.temp_c,
        condition: hour.condition.text,
        icon: `https:${hour.condition.icon}`,
      }))
    );

    const cityTimeMs = new Date(location.localtime.replace(' ', 'T')).getTime();
    let startIndex = hourlyData.findIndex(item => new Date(item.time.replace(' ', 'T')).getTime() >= cityTimeMs);
    if (startIndex === -1) startIndex = 0;

    let forecastSlice = hourlyData.slice(startIndex, startIndex + 8);
    if (forecastSlice.length < 8) {
      forecastSlice = forecastSlice.concat(hourlyData.slice(0, 8 - forecastSlice.length));
    }

    res.json(forecastSlice);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: 'Forecast fetch failed' });
  }
});

app.get('/history', async (req, res) => {
  try {
    const recent = await Search.find().sort({ searchedAt: -1 }).limit(4).select('city -_id');
    res.json(recent.map(entry => entry.city));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.delete('/history', async (req, res) => {
  try {
    await Search.deleteMany({});
    res.json({ message: 'History cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

app.get('/autocomplete', async (req, res) => {
  try {
    const query = req.query.q?.trim();
    if (!query) return res.json([]);

    const suggestions = await Search.find({
      city: { $regex: `^${normalizeCity(query)}` }
    }).limit(5).select('city -_id');

    const formatted = suggestions.map(item =>
      item.city.charAt(0).toUpperCase() + item.city.slice(1)
    );

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Autocomplete service failed' });
  }
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
