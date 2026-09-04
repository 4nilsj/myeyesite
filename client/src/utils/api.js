import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const geocodePin = (pincode) =>
  api.get(`/geocode/${pincode}`).then(r => r.data);

export const reverseGeocode = (lat, lng) =>
  api.get('/geocode/reverse/lookup', { params: { lat, lng } }).then(r => r.data);

export const fetchNearby = (lat, lng, radius, category) =>
  api.get('/places/nearby', { params: { lat, lng, radius, category } }).then(r => r.data);

export const fetchBatchNearby = (lat, lng, radius, categories) =>
  api.get('/places/batch', {
    params: {
      lat,
      lng,
      radius,
      ...(categories ? { categories: Array.isArray(categories) ? categories.join(',') : categories } : {})
    }
  }).then(r => r.data);

export const fetchContact = (placeId) =>
  api.get(`/places/contact/${placeId}`).then(r => r.data);

export const fetchDetails = (placeId) =>
  api.get(`/places/details/${placeId}`).then(r => r.data);

export const fetchMarket = (pincode, radius = 3000, brand = '') =>
  api.get(`/market/${pincode}`, { params: { radius, brand } }).then(r => r.data);

// Foursquare photos are direct URLs; Google photos go through the server proxy
export const photoUrl = (ref, width = 400) => {
  if (!ref) return null;
  if (ref.startsWith('http')) return ref;
  return `/api/places/photo?ref=${ref}&width=${width}`;
};
