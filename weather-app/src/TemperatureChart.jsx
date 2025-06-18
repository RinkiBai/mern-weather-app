import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export default function TemperatureChart({ forecast }) {
  if (!forecast || forecast.length === 0) return null;

  const data = forecast
    .filter(hour => hour.parsedTime && !isNaN(hour.parsedTime) && hour.temp !== undefined)
    .map((hour) => ({
      time: hour.parsedTime.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      temperature: hour.temp,
    }));

  return (
    <div className="chart-wrapper">
      <h3 className="chart-title">🌤 Hourly Forecast</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <defs>
            <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip formatter={(val) => `${val}°C`} />
          <Line
            type="monotone"
            dataKey="temperature"
            stroke="#1d4ed8"
            strokeWidth={2}
            fill="url(#tempGradient)"
            dot={{ r: 4, stroke: '#1d4ed8', strokeWidth: 2, fill: 'white' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
