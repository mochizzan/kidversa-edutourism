import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home } from 'lucide-react'
import { ROUTES } from '../core/constants/app'

const NotFoundPage = () => {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark via-primary to-primary-light flex items-center justify-center p-4">
      <div className="text-center text-white">
        <h1 className="text-9xl font-bold text-accent">404</h1>
        <h2 className="text-3xl font-bold mt-4 mb-2">{t('common.notFound.title')}</h2>
        <p className="text-primary-200 mb-8">
          {t('common.notFound.description')}
        </p>
        <Link
          to={ROUTES.HOME}
          className="inline-flex items-center gap-2 bg-accent text-primary-dark px-6 py-3 rounded-lg font-semibold hover:bg-accent-light transition-colors"
        >
          <Home className="w-5 h-5" />
          {t('common.notFound.backHome')}
        </Link>
      </div>
    </div>
  )
}

export default NotFoundPage
