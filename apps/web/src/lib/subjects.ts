import { useQuery } from '@tanstack/react-query'
import { api, type Schema } from './api'

export const subjectCatalogKey = ['subjects'] as const
export function useSubjects() {
  const query = useQuery({
    queryKey: subjectCatalogKey,
    queryFn: ({ signal }) => api<Schema['SubjectCatalog']>('/subjects', { signal }),
    staleTime: 60000,
    refetchOnWindowFocus: 'always',
  })
  const rows = query.data?.items ?? []
  const active = rows.filter((row) => row.active)
  return {
    ...query,
    rows,
    teachingSubjects: active.filter((row) => !row.system).map((row) => row.id),
    allSubjects: active.map((row) => row.id),
    label: (id: string) => rows.find((row) => row.id === id)?.name ?? id,
    isActive: (id: string) => active.some((row) => row.id === id),
  }
}
