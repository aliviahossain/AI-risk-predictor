// config.js — single source of truth for API URL
// Works on localhost AND other devices on the same network

const getApiUrl = () => {
  // If env variable set (for production deployment), use it
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  // In browser: use same hostname but port 8000
  // This works whether you're on localhost OR another device on the network
  const host = window.location.hostname;
  return `http://${host}:8000`;
};

export const API = getApiUrl();