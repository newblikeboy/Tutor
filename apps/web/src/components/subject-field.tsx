import { useSubjects } from '../lib/subjects'
import { Alert, Button, Field } from './ui'

export function SubjectField({
  value,
  onChange,
  includeAll = false,
  disabled = false,
  label = 'Subject',
}: {
  value: string
  onChange: (id: string) => void
  includeAll?: boolean
  disabled?: boolean
  label?: string
}) {
  const catalog = useSubjects()
  const options = includeAll ? catalog.allSubjects : catalog.teachingSubjects
  return (
    <div>
      <Field
        label={label}
        hint={
          catalog.isPending
            ? 'Loading subjects…'
            : !catalog.isError && !options.length
              ? 'No active subjects are available. Ask an administrator to add one.'
              : undefined
        }
      >
        <select
          required
          value={value}
          disabled={disabled || catalog.isPending || catalog.isError}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select subject</option>
          {value && !options.includes(value) && (
            <option value={value} disabled>
              {catalog.label(value)} · Unavailable for new selections
            </option>
          )}
          {options.map((id) => (
            <option key={id} value={id}>
              {catalog.label(id)}
            </option>
          ))}
        </select>
      </Field>
      {catalog.isError && (
        <Alert kind="error">
          Subjects could not be loaded.{' '}
          <Button type="button" variant="text" onClick={() => void catalog.refetch()}>
            Try again
          </Button>
        </Alert>
      )}
    </div>
  )
}
