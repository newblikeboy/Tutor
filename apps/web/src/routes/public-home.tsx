import { Link } from 'react-router-dom'

import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Compass,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
  Target,
  Sprout,
} from 'lucide-react'

import { LinkButton } from '../components/ui'
import '../styles/home.css'
import hero640 from '../assets/purnea-learning-640.webp'
import hero960 from '../assets/purnea-learning-960.webp'
import hero1200 from '../assets/purnea-learning-1200.webp'
import hero1536 from '../assets/purnea-learning-1536.webp'
export function Home() {
  const { t } = useTranslation()
  const pillars = [ShieldCheck, Compass, Sprout]
  const requestIcons = [GraduationCap, Target, Compass, CheckCircle2]
  const stageIcons = [BookOpen, Compass, Target, GraduationCap]
  return (
    <div className="home-page">
      <div className="home-hero-wrap">
        <section className="container hero home-hero" aria-labelledby="home-title">
          <div className="hero-copy">
            <p className="eyebrow home-location">
              <span className="home-location-dot" aria-hidden="true" />
              {t('landing.place')}
            </p>
            <h1 id="home-title">
              {t('landing.title')} <span>{t('landing.titleAccent')}</span>
            </h1>
            <p className="home-intro">{t('landing.intro')}</p>
            <div className="home-actions">
              <LinkButton to="/tutors">{t('landing.start')}</LinkButton>
              <Link to="/apply" className="home-apply-link">
                {t('landing.apply')} <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="home-hero-visual">
            <figure className="home-hero-figure">
              <div className="home-photo-frame">
                <img
                  className="home-hero-image"
                  src={hero1200}
                  srcSet={`${hero640} 640w, ${hero960} 960w, ${hero1200} 1200w, ${hero1536} 1536w`}
                  sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1000px) 680px, 520px"
                  width={1536}
                  height={1024}
                  fetchPriority="high"
                  alt={t('landing.imageAlt')}
                />
              </div>
            </figure>
          </div>
        </section>
      </div>

      <section className="container home-pillars" aria-label={t('landing.pillars')}>
        {pillars.map((Icon, i) => (
          <div className="home-pillar" key={i}>
            <span className="home-pillar-icon">
              <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <h2>{t(`landing.pillar${i + 1}`)}</h2>
              <p>{t(`landing.pillar${i + 1}Body`)}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="home-process home-section" aria-labelledby="home-process-title">
        <div className="container">
          <div className="home-section-heading">
            <div>
              <p className="eyebrow">{t('landing.processEyebrow')}</p>
              <h2 id="home-process-title">{t('landing.processTitle')}</h2>
            </div>
          </div>
          <ol className="home-steps">
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <div className="home-step-top">
                  <span className="home-step-number" aria-hidden="true">
                    0{n}
                  </span>
                  <span className="eyebrow">{t(`landing.step${n}Label`)}</span>
                </div>
                <div className={`home-step-art home-step-art-${n}`} aria-hidden="true">
                  {n === 1 ? (
                    <div className="home-note-art">
                      <span />
                      <i />
                      <i />
                      <i />
                      <Check size={26} />
                    </div>
                  ) : n === 2 ? (
                    <>
                      <span className="home-person-art">
                        <GraduationCap size={34} strokeWidth={1.3} />
                      </span>
                      <span className="home-match-line" />
                      <span className="home-person-art">
                        <BookOpen size={31} strokeWidth={1.3} />
                      </span>
                      <span className="home-match-seal">
                        <Check size={18} />
                      </span>
                    </>
                  ) : (
                    <div className="home-growth-art">
                      <i />
                      <i />
                      <i />
                      <Sprout size={45} strokeWidth={1.2} />
                    </div>
                  )}
                </div>
                <h3>{t(`landing.step${n}Title`)}</h3>
                <p>{t(`landing.step${n}Body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="container home-section home-learning-stages"
        aria-labelledby="home-stages-title"
      >
        <div className="home-section-heading">
          <div>
            <p className="eyebrow">{t('landing.stagesEyebrow')}</p>
            <h2 id="home-stages-title">{t('landing.stagesTitle')}</h2>
            <p className="home-section-intro">{t('landing.stagesBody')}</p>
          </div>
        </div>
        <div className="home-stage-grid">
          {[1, 2, 3, 4].map((n) => {
            const Icon = stageIcons[n - 1]
            return (
              <article className="home-stage-card" key={n}>
                <div className="home-stage-top">
                  <span className="home-stage-number" aria-hidden="true">
                    0{n}
                  </span>
                  <span className="home-stage-symbol" aria-hidden="true">
                    <Icon size={30} strokeWidth={1.45} />
                  </span>
                </div>
                <div>
                  <p className="eyebrow">{t(`landing.stage${n}Range`)}</p>
                  <h3>{t(`landing.stage${n}Title`)}</h3>
                  <p>{t(`landing.stage${n}Body`)}</p>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="container home-request" aria-labelledby="home-request-title">
        <div className="home-request-copy">
          <p className="eyebrow">{t('landing.requestEyebrow')}</p>
          <h2 id="home-request-title">{t('landing.requestTitle')}</h2>
          <p>{t('landing.requestBody')}</p>
          <LinkButton to="/tutors">{t('landing.start')}</LinkButton>
        </div>
        <div className="home-request-list" aria-label={t('landing.requestListLabel')}>
          {[1, 2, 3, 4].map((n) => {
            const Icon = requestIcons[n - 1]
            return (
              <div className="home-request-item" key={n}>
                <span aria-hidden="true">
                  <Icon size={19} strokeWidth={1.6} />
                </span>
                <div>
                  <strong>{t(`landing.request${n}Title`)}</strong>
                  <p>{t(`landing.request${n}Body`)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="container home-story" aria-labelledby="home-story-title">
        <div className="home-story-copy">
          <p className="eyebrow">{t('landing.storyEyebrow')}</p>
          <h2 id="home-story-title">
            {t('landing.storyTitle')} <em>{t('landing.storyAccent')}</em>
          </h2>
          <p>{t('landing.storyBody')}</p>
          <Link className="text-link" to="/approach">
            {t('viewApproach')} <ArrowRight size={18} />
          </Link>
        </div>
        <div className="home-record">
          <div className="home-record-heading">
            <p className="eyebrow">{t('landing.recordEyebrow')}</p>
            <BookOpen size={25} strokeWidth={1.4} aria-hidden="true" />
          </div>
          <h3>{t('landing.recordTitle')}</h3>
          <ol>
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <span className="home-record-number" aria-hidden="true">
                  0{n}
                </span>
                <div>
                  <h4>{t(`landing.record${n}Title`)}</h4>
                  <p>{t(`landing.record${n}Body`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="home-record-footer">
            <LockKeyhole size={15} aria-hidden="true" />
            {t('landing.recordFooter')}
          </p>
        </div>
      </section>

      <section className="container home-section home-faq" aria-labelledby="home-faq-title">
        <div>
          <p className="eyebrow">{t('landing.faqEyebrow')}</p>
          <h2 id="home-faq-title">{t('faqTitle')}</h2>
        </div>
        <div className="home-faq-list">
          {[1, 2, 3].map((n) => (
            <details key={n}>
              <summary>
                {t(`faq${n}`)}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{t(`faq${n}Body`)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="container home-closing" aria-labelledby="home-closing-title">
        <div className="home-closing-art" aria-hidden="true">
          <div className="home-crystal">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="home-closing-copy">
          <p className="eyebrow">{t('landing.finalEyebrow')}</p>
          <h2 id="home-closing-title">{t('landing.finalTitle')}</h2>
        </div>
        <div className="home-closing-actions">
          <LinkButton to="/tutors">{t('landing.start')}</LinkButton>
          <div className="home-teach-link">
            <span>{t('landing.teach')}</span>
            <Link to="/apply">
              {t('landing.teachLink')} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
