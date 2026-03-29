const TOKEN_KEY = 'plana_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new ApiError(401, 'unauthorized', 'Session expired');
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, data.code ?? 'unknown', data.message ?? 'Request failed');
  }

  return data as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return fetchApi<T>(path);
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return fetchApi<T>(path, {
      method: 'POST',
      body: body != null ? JSON.stringify(body) : null,
    });
  },

  patch<T>(path: string, body: unknown): Promise<T> {
    return fetchApi<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  delete(path: string): Promise<void> {
    return fetchApi<void>(path, { method: 'DELETE' });
  },
};
