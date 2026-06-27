import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

// OfflineContext
// --------------
// Provides offline-first capture: when a POST fails (e.g. no connectivity in the
// field), the screen can enqueue() the intended action. Actions are persisted in
// AsyncStorage under "offline_queue" so they survive app restarts. Calling
// flush() replays each queued request in order against the backend; successfully
// replayed actions are removed from the queue.
//
// A queued action shape:
//   { id, url, method, data, isMultipart, createdAt }
// Note: multipart (photo) payloads cannot be fully serialized to AsyncStorage,
// so for offline capture we store the JSON fields only; photos taken offline are
// best re-attached on the next online attempt. Plain JSON actions replay fully.

const QUEUE_KEY = 'offline_queue';
const OfflineContext = createContext(null);

async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function OfflineProvider({ children }) {
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = async () => {
    const q = await readQueue();
    setPendingCount(q.length);
  };

  useEffect(() => {
    refreshCount();
  }, []);

  // Add an action to the offline queue.
  // action: { url, method = 'post', data }
  const enqueue = async (action) => {
    const queue = await readQueue();
    queue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      method: action.method || 'post',
      url: action.url,
      data: action.data || {},
      isMultipart: !!action.isMultipart,
      createdAt: new Date().toISOString(),
    });
    await writeQueue(queue);
    await refreshCount();
  };

  // Replay all queued actions. Returns { success, failed }.
  const flush = async () => {
    let queue = await readQueue();
    if (queue.length === 0) return { success: 0, failed: 0 };

    const remaining = [];
    let success = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        await client.request({
          url: item.url,
          method: item.method,
          data: item.data,
        });
        success += 1;
      } catch (e) {
        failed += 1;
        remaining.push(item); // keep for the next flush attempt
      }
    }

    await writeQueue(remaining);
    await refreshCount();
    return { success, failed };
  };

  return (
    <OfflineContext.Provider value={{ pendingCount, enqueue, flush, refreshCount }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline must be used within an OfflineProvider');
  return ctx;
}
