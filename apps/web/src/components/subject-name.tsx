import { useSubjects } from '../lib/subjects'

// Historical values remain readable even if a legacy reference is unregistered.
export function SubjectName({ value }: { value: string }) {
  const catalog = useSubjects()
  return <>{catalog.label(value)}</>
}
export function SubjectNames({
  values,
  separator = ', ',
}: {
  values: string[]
  separator?: string
}) {
  const catalog = useSubjects()
  return <>{values.map(catalog.label).join(separator)}</>
}
