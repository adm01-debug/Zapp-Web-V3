/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { vi } from 'vitest';

export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: { name: 'Test User' },
  created_at: '2024-01-01T00:00:00Z',
};

export const mockProfile = {
  id: 'test-profile-id',
  user_id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  avatar_url: null,
  role: 'agent',
  max_chats: 5,
};

export const mockSession = {
  access_token: 'test-token',
  refresh_token: 'test-refresh',
  user: mockUser,
  expires_at: Date.now() + 3600,
};

export const mockAuthContext = {
  user: mockUser,
  session: mockSession,
  profile: mockProfile,
  loading: false,
  signIn: vi.fn().mockResolvedValue({ error: null }),
  signUp: vi.fn().mockResolvedValue({ error: null }),
  signOut: vi.fn().mockResolvedValue(undefined),
} as const;

export const mockAuthContextLoggedOut = {
  user: null,
  session: null,
  profile: null,
  loading: false,
  signIn: vi.fn().mockResolvedValue({ error: null }),
  signUp: vi.fn().mockResolvedValue({ error: null }),
  signOut: vi.fn().mockResolvedValue(undefined),
};

// Mock AuthProvider that provides test auth context
export function MockAuthProvider({
  children,
  _value = mockAuthContext,
}: {
  children: React.ReactNode;
  _value?: typeof mockAuthContext;
}) {
  // We mock the useAuth hook directly in tests
  return <>{children}</>;
}
