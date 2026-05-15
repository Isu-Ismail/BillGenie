import PocketBase from 'pocketbase';

// Determine the PocketBase URL from environment or default
const PB_URL = import.meta.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';

export const pb = new PocketBase(PB_URL);
