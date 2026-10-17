import content from '../content/privacy-policy.json'
import { LegalDocument, type LegalDocumentContent } from '../components/legal-document'

export default function PrivacyPolicy() {
  return (
    <LegalDocument
      content={content as LegalDocumentContent}
      canonicalPath="/privacy-policy"
      description="Privacy Policy for GoCoaching, operated by GoCoaching Learning Solution LLP."
    />
  )
}
