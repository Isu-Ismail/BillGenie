const BASE_URL = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;

export const getAuthHeaders = () => {
  const userJson = localStorage.getItem('user');
  const userId = userJson ? JSON.parse(userJson)?.id : '';
  const token = localStorage.getItem('token') || '';
  return {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
    'Authorization': token ? `Bearer ${token}` : ''
  };
};

export const API_ENDPOINTS = {
  // Trusts / Organizations
  TRUSTS: {
    BASE: `${BASE_URL}/trusts/`,
    CREATE: `${BASE_URL}/trusts/create/`,
    DETAIL: (id) => `${BASE_URL}/trusts/${id}`,
  },

  // Categories
  CATEGORIES: {
    BASE: `${BASE_URL}/categories/`,
    CREATE: `${BASE_URL}/categories/create/`,
    DETAIL: (id) => `${BASE_URL}/categories/${id}`,
    BY_TRUST: (trustId) => `${BASE_URL}/categories/by-trust/${trustId}`,
  },

  // Donors
  DONORS: {
    BASE: `${BASE_URL}/donors/`,
    CREATE: `${BASE_URL}/donors/create/`,
    BATCH_CREATE: `${BASE_URL}/donors/batch-create/`,
    DETAIL: (id) => `${BASE_URL}/donors/${id}`,
    INFO: (id) => `${BASE_URL}/donors/detail/${id}`,
  },

  // Streets
  STREETS: {
    BASE: `${BASE_URL}/streets/`,
    DETAIL: (id) => `${BASE_URL}/streets/${id}`,
    CREATE: `${BASE_URL}/streets/create/`,
  },

  // Transactions / Ledgers
  TRANSACTIONS: {
    BASE: `${BASE_URL}/transactions/`,
    CREATE: `${BASE_URL}/new-entry/create/`,
    BATCH_CREATE: `${BASE_URL}/transactions/batch-create/`,
    IMPORT_EXCEL: `${BASE_URL}/new-entry/import-excel/`,
    DETAIL: (id) => `${BASE_URL}/transactions/${id}`,
  },

  // Stats & Dashboard
  STATS: {
    BASE: `${BASE_URL}/stats/`,
    REFRESH: `${BASE_URL}/stats/refresh/`,
  },

  // Reports
  REPORTS: {
    BASE: `${BASE_URL}/reports/`,
    GENERATE: `${BASE_URL}/reports/generate/`,
  },

  // Authentication
  AUTH: {
    LOGIN: `${BASE_URL}/auth/login/`,
  }
};


export default BASE_URL;
