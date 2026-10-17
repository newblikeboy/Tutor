export const informationPages = ['approach', 'standards', 'support', 'how-it-works']
export const isInformationPath = (path: string) => {
  const page = path.replace(/^\/+|\/+$/g, '')
  return (
    informationPages.includes(page) ||
    ['privacy-policy', 'privacy', 'terms-of-service'].includes(page)
  )
}
