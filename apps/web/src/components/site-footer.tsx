import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone } from 'lucide-react'
import { BrandMark } from './brand-mark'
import '../styles/site-footer.css'

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': 'https://gocoaching.in/#organization',
  name: 'GoCoaching',
  legalName: 'GoCoaching Learning Solution LLP',
  url: 'https://gocoaching.in',
  logo: 'https://gocoaching.in/brand/gocoaching-logo.webp',
}

export function SiteFooter({
  includeOrganization,
  children,
}: {
  includeOrganization: boolean
  children?: ReactNode
}) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <Link to="/" className="site-footer-wordmark">
              <BrandMark />
              <span>GoCoaching</span>
            </Link>
            <p>
              Explore home tuition and online tutors. Follow class schedules and student progress in
              one place.
            </p>
          </div>
          <nav aria-labelledby="footer-find-title">
            <h2 id="footer-find-title">Find a tutor</h2>
            <ul>
              <li>
                <Link to="/tutors?searched=1">Browse tutors</Link>
              </li>
              <li>
                <Link to="/tutors?searched=1&mode=online">Online tutors</Link>
              </li>
              <li>
                <Link to="/tutors?searched=1&mode=home">Home tuition tutors</Link>
              </li>
              <li>
                <Link to="/how-it-works">How it works</Link>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-about-title">
            <h2 id="footer-about-title">About GoCoaching</h2>
            <ul>
              <li>
                <Link to="/approach">Our approach</Link>
              </li>
              <li>
                <Link to="/standards">Tutor selection standards</Link>
              </li>
              <li>
                <Link to="/apply">Become a tutor</Link>
              </li>
              <li>
                <Link to="/support">Help &amp; support</Link>
              </li>
            </ul>
          </nav>
          <div className="site-footer-contact" data-nosnippet="">
            <h2>Contact</h2>
            <span className="site-footer-placeholder">Dummy contact details</span>
            <address>
              <p>
                <MapPin size={17} aria-hidden="true" />
                <span>
                  Demo Office, Example Road,
                  <br />
                  Purnea, Bihar 000000, India
                </span>
              </p>
              <p>
                <Mail size={17} aria-hidden="true" />
                <span>contact@example.com</span>
              </p>
              <p>
                <Phone size={17} aria-hidden="true" />
                <span>+91 00000 00000</span>
              </p>
            </address>
          </div>
        </div>
        <div className="site-footer-bottom">
          <p>© {new Date().getFullYear()} GoCoaching Learning Solution LLP. All rights reserved.</p>
          <nav aria-label="Legal & account">
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/terms-of-service">Terms of Service</Link>
            <Link to="/login?staff=1">Staff sign in</Link>
            <a href="/sitemap.xml">Sitemap</a>
          </nav>
        </div>
        {children}
      </div>
      {includeOrganization && (
        <script id="gocoaching-organization" type="application/ld+json">
          {JSON.stringify(organization)}
        </script>
      )}
    </footer>
  )
}
