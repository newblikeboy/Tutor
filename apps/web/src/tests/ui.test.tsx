import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { Button, Modal, Status } from '../components/ui'
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
  it('renders Hindi status text and sets document language', async () => {
    await i18n.changeLanguage('hi')
    render(<Status status="approved" />)
    expect(screen.getByText('स्वीकृत')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('hi')
    await i18n.changeLanguage('en')
  })
})
