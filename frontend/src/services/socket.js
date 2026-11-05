import { io } from 'socket.io-client';
import { API_BASE_URL } from './api';

let socket = null;

export const initSocket = (token) => {
  if (!token) return null;

  // If already connected with same token, reuse
  if (socket && socket.connected) {
    return socket;
  }

  // Disconnect any existing stale connection
  if (socket) {
    socket.disconnect();
  }

  socket = io(API_BASE_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 10000
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

