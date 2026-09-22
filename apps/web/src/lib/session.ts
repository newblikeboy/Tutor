import { useQuery } from '@tanstack/react-query'
import { api, setCSRF } from './api'
import type { Schema } from './api'
export function useAuth() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async ({ signal }) => {
      const value = await api<Schema['Auth'] | null>('/auth/session', { signal })
      setCSRF(value?.csrf ?? '')
      return value
    },
    retry: false,
  })
}
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: ({ signal }) => api<Schema['Config']>('/config', { signal }),
    staleTime: Infinity,
  })
}
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => api<Schema['Dashboard']>('/dashboard', { signal }),
    retry: false,
  })
}
