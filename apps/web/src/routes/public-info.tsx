import { useTranslation } from 'react-i18next'

import { Alert, LinkButton } from '../components/ui'
export function Info({ page }: { page: string }) {
  const { t } = useTranslation()
  const prefix = page === 'how-it-works' ? 'approach' : page
  const title = page === '404' ? 'notFound' : `${prefix}Title`
  const body = page === '404' ? '' : `${prefix}Body`
  return (
    <div className="container section prose-page">
      <p className="eyebrow">{t('brand')}</p>
      <h1>{t(title)}</h1>
      {body && <p className="intro">{t(body)}</p>}
      {page === 'privacy' && <Alert>{t('consentHelp')}</Alert>}
      <LinkButton to={page === '404' ? '/' : '/match'}>
        {t(page === '404' ? 'returnHome' : 'find')}
      </LinkButton>
    </div>
  )
}
