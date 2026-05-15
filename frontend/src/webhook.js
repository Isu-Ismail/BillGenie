import { pb } from './db'; // Assuming there is a pb instance or I'll create one

/**
 * Common connector for PocketBase Realtime Subscriptions (SSE).
 * This acts as our "webhook" handler on the frontend.
 */

export const subscribeToCollection = (collectionName, callback) => {
  try {
    // PocketBase SDK's built-in realtime subscription
    // '*' means subscribe to all records (create, update, delete)
    pb.collection(collectionName).subscribe('*', (data) => {
      console.log(`[Realtime Update] ${collectionName}:`, data.action, data.record.id);
      callback(data);
    });

    // Return an unsubscribe function
    return () => {
      pb.collection(collectionName).unsubscribe('*');
    };
  } catch (error) {
    console.error(`Error subscribing to ${collectionName}:`, error);
    return () => {};
  }
};
