import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { Button, Field, Modal, Status } from '../components/ui'
import i18n from '../locales'
describe('accessible component contracts', () => {
  it('keeps a pending mutation from being submitted twice', async () => {
    const onClick = vi.fn()
    render(
      <Button busy onClick={onClick}>
        Save
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })
  it('restores focus to dialog trigger after Escape', async () => {
    render(
      <Modal
        title="Review scope"
        description="Recorded teaching evidence"
        trigger={<Button>Review</Button>}
      >
        <label>
          Reason
          <input />
        </label>
      </Modal>,
    )
    const trigger = screen.getByRole('button', { name: 'Review' })
    await userEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
  it('retains authored instructions alongside a field hint and invalid-state explanation', () => {
    const { rerender } = render(
      <>
        <p id="name-guidance">Use the name on your account.</p>
        <Field label="Full name" hint="Include your surname." error="Add your full name.">
          <input id="full-name" aria-describedby="name-guidance" aria-invalid={false} />
        </Field>
      </>,
    )
    const input = screen.getByRole('textbox', { name: 'Full name' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(
      'Use the name on your account. Include your surname. Add your full name.',
    )
    rerender(
      <Field label="Full name">
        <input id="full-name" aria-invalid="grammar" />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveAttribute(
      'aria-invalid',
      'grammar',
    )
    expect(screen.getByRole('textbox', { name: 'Full name' })).not.toHaveAttribute(
      'aria-describedby',
    )
  })
  it('gives nested dialogs independent descriptions and preserves focus restoration', async () => {
    render(
      <Modal
        title="Outer dialog"
        description="Outer instructions"
        trigger={<Button>Open outer</Button>}
      >
        <Modal
          title="Inner dialog"
          description="Inner instructions"
          trigger={<Button>Open inner</Button>}
        >
          <p>Nested example</p>
        </Modal>
      </Modal>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open outer' }))
    const outerDescription = screen
      .getByRole('dialog', { name: 'Outer dialog' })
      .getAttribute('aria-describedby')
    const innerTrigger = screen.getByRole('button', { name: 'Open inner' })
    await userEvent.click(innerTrigger)
    const inner = screen.getByRole('dialog', { name: 'Inner dialog' })
    expect(inner).toHaveAccessibleDescription('Inner instructions')
    expect(inner.getAttribute('aria-describedby')).not.toBe(outerDescription)
    expect(document.getElementById(outerDescription!)).toHaveTextContent('Outer instructions')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(innerTrigger).toHaveFocus())
  })
  it('uses English for an unsupported legacy language', async () => {
    await i18n.changeLanguage('hi')
    render(<Status status="approved" />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    expect(i18n.resolvedLanguage).toBe('en')
    expect(i18n.hasResourceBundle('hi', 'translation')).toBe(false)
    await i18n.changeLanguage('en')
  })
})
