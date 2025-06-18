import React, { useState } from 'react';
import axios from 'axios';

function Weather() {
  const [city, setCity] = useState('');
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const getWeather = async () => {
    setError('');
    setWeather(null);
    if (!city.trim()) return setError('Please enter a city name.');
    setLoading(true);
    try {
      const res = await axios.get(`http://localhost:5000/weather/${encodeURIComponent(city)}`);
      setWeather(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error fetching weather. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const Spinner = () => (
    <div style={{
      display: 'inline-block',
      width: 16,
      height: 16,
      border: '3px solid #ccc',
      borderTop: '3px solid #333',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      marginLeft: 8
    }} />
  );

  return (
    <div style={{
      padding: 30,
      maxWidth: 500,
      margin: '60px auto',
      fontFamily: "'Inter', sans-serif",
      background: 'linear-gradient(to bottom right, #e0f2fe, #f8fafc)',
      borderRadius: 30,
      boxShadow: '0 12px 30px rgba(0,0,0,0.1)',
      textAlign: 'center',
    }}>
      <h1 style={{
        marginBottom: 20,
        color: '#0f172a',
        fontSize: 32,
        fontWeight: 700
      }}>🌤️ WeatherNow</h1>

      <input
        type="text"
        placeholder="Enter city"
        value={city}
        onChange={e => setCity(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') getWeather(); }}
        style={{
          padding: '12px 16px',
          width: '65%',
          borderRadius: 10,
          border: '1.5px solid #cbd5e1',
          fontSize: 16,
          outline: 'none',
          transition: '0.3s ease',
        }}
      />

      <button
        onClick={getWeather}
        disabled={loading}
        style={{
          marginLeft: 12,
          padding: '12px 20px',
          fontSize: 16,
          borderRadius: 10,
          border: 'none',
          backgroundColor: loading ? '#94a3b8' : '#3b82f6',
          color: 'white',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
        }}
      >
        {loading ? 'Loading' : 'Get Weather'}
        {loading && <Spinner />}
      </button>

      {error && <p style={{ color: 'red', marginTop: 20 }}>{error}</p>}

      {weather && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: '24px',
          padding: '24px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
          textAlign: 'center',
          color: '#1e293b',
          marginTop: 30,
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>{weather.city}, {weather.region}, {weather.country}</h2>
          <h1 style={{
            fontSize: '3.2rem',
            fontWeight: 'bold',
            margin: '10px 0',
            color: '#2563eb',
            transition: 'transform 0.3s',
          }}>
            {weather.temp}°C
          </h1>
          <p style={{
            fontStyle: 'italic',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontSize: 18,
            color: '#475569'
          }}>
            <img
              src={weather.icon}
              alt={weather.description}
              style={{ width: 48, height: 48 }}
            />
            {weather.description}
          </p>
          <small style={{
            display: 'block',
            marginTop: 12,
            color: '#64748b',
            fontSize: 13
          }}>
            Last updated: {weather.last_updated}
          </small>

          <div style={{
            marginTop: 24,
            backgroundColor: '#f1f5f9',
            borderRadius: 12,
            padding: '16px',
            fontSize: 14,
            color: '#334155',
            fontStyle: 'italic',
            boxShadow: 'inset 0 0 6px rgba(0,0,0,0.05)'
          }}>
            📊 Hourly forecast chart coming soon...
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg);}
          100% { transform: rotate(360deg);}
        }

        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
      `}</style>
    </div>
  );
}

export default Weather;
