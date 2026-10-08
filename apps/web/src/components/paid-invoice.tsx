import { useMutation } from '@tanstack/react-query'
import { send, queryClient, indiaDate, type Schema } from '../lib/api'
import { Button, Field, MutationError } from './ui'
import { BrandMark } from './brand-mark'

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n / 100)
export function PaidInvoice({ invoice: v }: { invoice: Schema['PaidInvoice'] }) {
  return (
    <article className="tu-panel tu-stack paid-invoice">
      <div className="invoice-brand">
        <BrandMark /> GoCoaching
      </div>
      <div className="tu-card-top">
        <h2>Paid invoice · {v.number}</h2>
        <Button variant="secondary" onClick={() => window.print()}>
          Print / save PDF
        </Button>
      </div>
      <p>{indiaDate(v.issuedAt, 'en')}</p>
      <div className="finance-form-grid">
        <div>
          <h3>{v.issuerName}</h3>
          <p>{v.issuerAddress}</p>
          {v.issuerGstin && <p>GSTIN: {v.issuerGstin}</p>}
        </div>
        <div>
          <h3>Billed to {v.customerName}</h3>
          <p>{v.customerAddress}</p>
          <p>Place of supply: {v.supplyState}</p>
        </div>
      </div>
      <p>
        {v.description} · SAC {v.sac}
      </p>
      <dl className="finance-metrics">
        {[
          ['Taxable value', v.taxablePaise],
          ['CGST', v.cgstPaise],
          ['SGST', v.sgstPaise],
          ['IGST', v.igstPaise],
          ['Total paid', v.totalPaise],
        ].map(([label, n]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{money(Number(n))}</dd>
          </div>
        ))}
      </dl>
      <p>
        Payment collected through GoCoaching. Subsequent refunds are shown separately in your
        payment history.
      </p>
    </article>
  )
}
export function InvoiceForm({ id }: { id: string }) {
  const m = useMutation({
    mutationFn: (body: Schema['InvoiceInput']) => send(`/billing/${id}/invoice`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billing'] }),
  })
  return (
    <details className="tu-panel tu-disclosure">
      <summary>Record approved paid invoice</summary>
      <form
        className="tu-stack"
        onSubmit={(event) => {
          event.preventDefault()
          const d = new FormData(event.currentTarget)
          m.mutate({
            number: String(d.get('number')),
            issuerName: String(d.get('issuerName')),
            issuerAddress: String(d.get('issuerAddress')),
            issuerGstin: String(d.get('issuerGstin')),
            customerName: String(d.get('customerName')),
            customerAddress: String(d.get('customerAddress')),
            supplyState: String(d.get('supplyState')),
            sac: String(d.get('sac')),
            description: String(d.get('description')),
            gstBps: Math.round(Number(d.get('gst')) * 100),
            issuedAt: new Date(String(d.get('issuedAt'))).toISOString(),
            confirmed: d.get('confirmed') === 'on',
          })
        }}
      >
        <p>
          Enter the supplier’s approved invoice. The server fixes its total to the captured payment
          and calculates inclusive GST. Saved invoices cannot be edited.
        </p>
        <div className="finance-form-grid">
          {[
            ['number', 'Invoice number', 16],
            ['issuerName', 'Supplier legal name', 160],
            ['issuerAddress', 'Supplier billing address', 600],
            ['issuerGstin', 'Supplier GSTIN (leave empty if unregistered)', 15],
            ['customerName', 'Customer billing name', 160],
            ['customerAddress', 'Customer billing address', 600],
            ['supplyState', 'Place of supply state code', 2],
            ['sac', 'Tuition SAC', 6],
            ['description', 'Invoice description', 1000],
          ].map(([name, label, max]) => (
            <Field key={name} label={String(label)}>
              <input
                name={String(name)}
                maxLength={Number(max)}
                required={name !== 'issuerGstin'}
              />
            </Field>
          ))}
          <Field label="Tuition GST included in paid amount (%)">
            <input name="gst" type="number" step="0.01" min="0" max="28" required />
          </Field>
          <Field label="Original invoice date and time">
            <input name="issuedAt" type="datetime-local" required />
          </Field>
        </div>
        <label>
          <input name="confirmed" type="checkbox" required /> I verified the supplier, invoice, tax
          treatment and authorization to record it.
        </label>
        <MutationError error={m.error} />
        <Button busy={m.isPending}>Save paid invoice</Button>
      </form>
    </details>
  )
}
