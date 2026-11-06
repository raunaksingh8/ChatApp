import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Request interceptor: Attach JWT token if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Global error handler and 401 token invalidation
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // 401 Unauthorized / Token expired
      if (error.response.status === 401) {
        const isAuthEndpoint = error.config?.url?.includes('/api/auth/login');
        if (!isAuthEndpoint) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.dispatchEvent(new Event('auth:unauthorized'));
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth Service Endpoints
export const authAPI = {
  login: async (username, password) => {
    const response = await api.post('/api/auth/login', { username, password });
    return response.data;
  },

  register: async (username, password) => {
    const response = await api.post('/api/auth/register', { username, password });
    return response.data;
  }
};

// User Service Endpoints
export const userAPI = {
  getUsers: async (search = '') => {
    const params = search ? { search } : {};
    const response = await api.get('/api/users', { params });
    return response.data;
  },

  searchUsers: async (username) => {
    const response = await api.get('/api/users/search', { params: { username } });
    return response.data;
  }
};

// Message Service Endpoints
export const messageAPI = {
  sendMessage: async (receiver_id, message_text, reply_to_message_id = null) => {
    const payload = { receiver_id, message_text };
    if (reply_to_message_id) payload.reply_to_message_id = reply_to_message_id;
    const response = await api.post('/api/messages', payload);
    return response.data;
  },

  getConversation: async (userId) => {
    const response = await api.get(`/api/messages/${userId}`);
    return response.data;
  },

  markAsRead: async (userId) => {
    const response = await api.post(`/api/messages/${userId}/read`);
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get('/api/messages/unread-count');
    return response.data;
  }
};

export const pushAPI = {
  getPublicKey: async () => {
    const response = await api.get('/api/push/public-key');
    return response.data;
  },

  subscribe: async (subscription) => {
    const response = await api.post('/api/push/subscriptions', subscription);
    return response.data;
  },

  unsubscribe: async (endpoint) => {
    const response = await api.delete('/api/push/subscriptions', { data: { endpoint } });
    return response.data;
  }
};

// Contact Service Endpoints
export const contactAPI = {
  getContacts: async () => {
    const response = await api.get('/api/contacts');
    return response.data;
  },

  sendRequest: async (recipient_id) => {
    const response = await api.post('/api/contacts/requests', { recipient_id });
    return response.data;
  },

  getIncoming: async () => {
    const response = await api.get('/api/contacts/requests/incoming');
    return response.data;
  },

  getOutgoing: async () => {
    const response = await api.get('/api/contacts/requests/outgoing');
    return response.data;
  },

  acceptRequest: async (requestId) => {
    const response = await api.post(`/api/contacts/requests/${requestId}/accept`);
    return response.data;
  },

  rejectRequest: async (requestId) => {
    const response = await api.post(`/api/contacts/requests/${requestId}/reject`);
    return response.data;
  },

  removeContact: async (userId) => {
    const response = await api.delete(`/api/contacts/${userId}`);
    return response.data;
  }
};

// Profile Service Endpoints (Feature 1)
export const profileAPI = {
  getMe: async () => {
    const response = await api.get('/api/profile/me');
    return response.data;
  },

  updateMe: async (profileData) => {
    const response = await api.put('/api/profile/me', profileData);
    return response.data;
  },

  getProfile: async (userId) => {
    const response = await api.get(`/api/profile/${userId}`);
    return response.data;
  }
};

// Block Service Endpoints (Feature 2)
export const blockAPI = {
  getBlocked: async () => {
    const response = await api.get('/api/blocks');
    return response.data;
  },

  blockUser: async (userId) => {
    const response = await api.post(`/api/blocks/${userId}`);
    return response.data;
  },

  unblockUser: async (userId) => {
    const response = await api.delete(`/api/blocks/${userId}`);
    return response.data;
  }
};

export default api;
