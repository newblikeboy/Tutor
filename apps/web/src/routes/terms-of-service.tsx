import content from '../content/terms-of-service.json'
import { LegalDocument, type LegalDocumentContent } from '../components/legal-document'

export default function TermsOfService() {
  return (
    <LegalDocument
      content={content as LegalDocumentContent}
      canonicalPath="/terms-of-service"
      description="Terms of Service for GoCoaching, operated by GoCoaching Learning Solution LLP."
    />
  )
}
