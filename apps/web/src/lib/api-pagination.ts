/** Wire format for paginated API responses */
export interface PaginatedResponse<T = unknown> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/** Extract just the items array from a paginated response */
export function unwrapItems<T>(raw: PaginatedResponse<T>): T[] {
  return raw.items;
}
