import type { User } from './models/user';

/** Generic paginated list response */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Returned by all auth endpoints */
export interface AuthTokenResponse {
  accessToken: string;
  expiresAt: string;
  user: User;
}

/** Standard API error shape */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}
