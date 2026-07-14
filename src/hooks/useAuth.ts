// Re-export useAuth and AuthProvider for convenient @/hooks/useAuth import

/** Hook providing access to the current user authentication state and auth methods. */
export { useAuth } from '@/features/auth/hooks/useAuth';

/** Provider component that wraps the application with authentication context and initialization. */
export { AuthProvider } from '@/features/auth/components/AuthProvider';
