const locationElement = document.getElementById("location");
const temperatureElement = document.getElementById("temperature");
const conditionElement = document.getElementById("condition");
const feelsLikeElement = document.getElementById("feels-like");
const humidityElement = document.getElementById("humidity");
const windElement = document.getElementById("wind");
const iconElement = document.getElementById("weather-icon");


/* =========================================
   DEFAULT LOCATION
   ========================================= */

const params = new URLSearchParams(window.location.search);

const city =
  params.get("city") || "Raipur";


/* =========================================
   WEATHER CODE → DESCRIPTION
   ========================================= */

function getWeatherInfo(code) {

  const weather = {

    0: {
      text: "Clear sky",
      icon: "☀"
    },

    1: {
      text: "Mainly clear",
      icon: "🌤"
    },

    2: {
      text: "Partly cloudy",
      icon: "⛅"
    },

    3: {
      text: "Overcast",
      icon: "☁"
    },

    45: {
      text: "Foggy",
      icon: "🌫"
    },

    48: {
      text: "Foggy",
      icon: "🌫"
    },

    51: {
      text: "Light drizzle",
      icon: "🌦"
    },

    53: {
      text: "Drizzle",
      icon: "🌦"
    },

    55: {
      text: "Heavy drizzle",
      icon: "🌧"
    },

    61: {
      text: "Light rain",
      icon: "🌦"
    },

    63: {
      text: "Rain",
      icon: "🌧"
    },

    65: {
      text: "Heavy rain",
      icon: "🌧"
    },

    71: {
      text: "Light snow",
      icon: "🌨"
    },

    73: {
      text: "Snow",
      icon: "🌨"
    },

    75: {
      text: "Heavy snow",
      icon: "❄"
    },

    80: {
      text: "Rain showers",
      icon: "🌦"
    },

    81: {
      text: "Rain showers",
      icon: "🌧"
    },

    82: {
      text: "Heavy showers",
      icon: "⛈"
    },

    95: {
      text: "Thunderstorm",
      icon: "⛈"
    },

    96: {
      text: "Thunderstorm",
      icon: "⛈"
    },

    99: {
      text: "Thunderstorm",
      icon: "⛈"
    }

  };

  return weather[code] || {
    text: "Unknown",
    icon: "☁"
  };
}


/* =========================================
   FIND CITY COORDINATES
   ========================================= */

async function getCoordinates() {

  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Unable to find location.");
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error("Location not found.");
  }

  return data.results[0];
}


/* =========================================
   GET WEATHER
   ========================================= */

async function getWeather() {

  try {

    const place = await getCoordinates();


    const weatherURL =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${place.latitude}` +
      `&longitude=${place.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&temperature_unit=celsius` +
      `&wind_speed_unit=kmh` +
      `&timezone=auto`;


    const response = await fetch(weatherURL);


    if (!response.ok) {
      throw new Error("Weather request failed.");
    }


    const data = await response.json();


    const current = data.current;

    const info =
      getWeatherInfo(current.weather_code);


    /* ---------- UPDATE UI ---------- */

    locationElement.textContent =
      place.name;

    temperatureElement.textContent =
      `${Math.round(current.temperature_2m)}°`;

    conditionElement.textContent =
      info.text;

    feelsLikeElement.textContent =
      `Feels like ${Math.round(current.apparent_temperature)}°`;

    humidityElement.textContent =
      `${Math.round(current.relative_humidity_2m)}%`;

    windElement.textContent =
      `${Math.round(current.wind_speed_10m)} km/h`;

    iconElement.textContent =
      info.icon;


  } catch (error) {

    console.error(error);

    locationElement.textContent =
      "Weather unavailable";

    conditionElement.textContent =
      "Unable to load";

  }

}


/* =========================================
   INITIAL LOAD
   ========================================= */

getWeather();


/* =========================================
   REFRESH EVERY 10 MINUTES
   ========================================= */

setInterval(
  getWeather,
  10 * 60 * 1000
);