import i18n from 'i18next'
const casesEN = {
  cases: {
    title: 'Support tickets',
    privacy:
      'Privacy requests need a reviewed response. Saving a request does not erase data or claim a legal decision.',
    kinds: {
      support: 'General support',
      matching: 'Help finding a suitable tutor',
      privacy_access: 'Privacy · access request',
      privacy_correction: 'Privacy · correction request',
      privacy_deletion: 'Privacy · deletion request',
      safeguarding: 'Restricted safeguarding concern',
    },
    case_update: 'Your support request has an update',
    openUpdate: 'Open request update',
  },
}

i18n.addResourceBundle('en', 'translation', casesEN, true, true)
