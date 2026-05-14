const BASE_URL = import.meta.env.VITE_API_URL || '/api';


export const API_ENDPOINTS = {
  // Trusts / Organizations
  TRUSTS: {
    BASE: `${BASE_URL}/trusts/`,
    CREATE: `${BASE_URL}/trusts/create`,
    DETAIL: (id) => `${BASE_URL}/trusts/${id}`,
  },
  
  // Categories
  CATEGORIES: {
    BASE: `${BASE_URL}/categories/`,
    CREATE: `${BASE_URL}/categories/create`,
    DETAIL: (id) => `${BASE_URL}/categories/${id}`,
    BY_TRUST: (trustId) => `${BASE_URL}/categories/by-trust/${trustId}`,
  },
  
  // Donors
  DONORS: {
    BASE: `${BASE_URL}/donors/`,
    CREATE: `${BASE_URL}/donors/create`,
    BATCH_CREATE: `${BASE_URL}/donors/batch-create`,
    DETAIL: (id) => `${BASE_URL}/donors/detail/${id}`,
  },
  
  // Transactions / Ledgers
  TRANSACTIONS: {
    BASE: `${BASE_URL}/transactions/`,
    CREATE: `${BASE_URL}/transactions/create`,
    BATCH_CREATE: `${BASE_URL}/transactions/batch-create`,
    DETAIL: (id) => `${BASE_URL}/transactions/${id}`,
  },
  
  // Stats & Dashboard
  STATS: {
    BASE: `${BASE_URL}/stats/`,
  },

  // Reports
  REPORTS: {
    BASE: `${BASE_URL}/reports/`,
  },

  // Authentication
  AUTH: {
    LOGIN: `${BASE_URL}/auth/login`,
  }
};


export default BASE_URL;
