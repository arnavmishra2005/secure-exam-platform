// Owner: Person A (Identity/Auth/Security)

import type { LoginRequest, LoginResponse, RefreshRequest, RefreshResponse } from '@secure-exam/types';
import { apiClient } from './client';

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', payload);
  return data;
}

export async function refresh(payload: RefreshRequest): Promise<RefreshResponse> {
  const { data } = await apiClient.post<RefreshResponse>('/auth/refresh', payload);
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

/** The signed-in user's profile (restores the name after a refresh-token session restore). */
export async function getMe(): Promise<LoginResponse['user']> {
  const { data } = await apiClient.get<LoginResponse['user']>('/auth/me');
  return data;
}
