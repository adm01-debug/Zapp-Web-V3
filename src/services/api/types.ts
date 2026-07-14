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

export interface DetailResponse<T> {
  data: T;
}

export interface CreateResponse<T> {
  data: T;
  id: string;
}

export interface UpdateResponse<T> {
  data: T;
}

export interface DeleteResponse {
  success: boolean;
  id: string;
}

export interface BulkResponse<T> {
  successful: T[];
  failed: Array<{ item: T; error: string }>;
  total: number;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterParams {
  [key: string]: any;
}

export interface QueryParams extends PaginationParams, FilterParams {}
