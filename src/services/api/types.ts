/**
 * Common Types for API Services
 *
 * Shared types used across all API services.
 */

export interface SupabaseError {
  code: string;
  message: string;
  status?: number;
}

export interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Detail Response interface definition. */
export interface DetailResponse<T> {
  data: T;
}

/** Create Response interface definition. */
export interface CreateResponse<T> {
  data: T;
  id: string;
}

/** Update Response interface definition. */
export interface UpdateResponse<T> {
  data: T;
}

/** Delete Response interface definition. */
export interface DeleteResponse {
  success: boolean;
  id: string;
}

/** Bulk Response interface definition. */
export interface BulkResponse<T> {
  successful: T[];
  failed: Array<{ item: T; error: string }>;
  total: number;
}

/** Pagination Params interface definition. */
export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Filter Params interface definition. */
export interface FilterParams {
  [key: string]: any;
}

/** Query Params interface definition. */
export interface QueryParams extends PaginationParams, FilterParams {}
