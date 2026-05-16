import PocketBase from 'pocketbase';

// Determine the PocketBase URL from environment or default
const PB_URL = import.meta.env.VITE_POCKETBASE_URL || `${window.location.origin}/pb`;

export const pb = new PocketBase(PB_URL);
