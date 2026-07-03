import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'
import { ROUTES } from '../core/constants/app'

const NotFoundPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-600 flex items-center justify-center p-4">
      <div className="text-center text-white">
        <h1 className="text-9xl font-bold text-amber-400">404</h1>
        <h2 className="text-3xl font-bold mt-4 mb-2">Halaman Tidak Ditemukan</h2>
        <p className="text-purple-200 mb-8">
          Sepertinya halaman yang kamu cari sudah dipindahkan atau tidak ada.
        </p>
        <Link
          to={ROUTES.HOME}
          className="inline-flex items-center gap-2 bg-amber-400 text-purple-900 px-6 py-3 rounded-lg font-semibold hover:bg-amber-300 transition-colors"
        >
          <Home className="w-5 h-5" />
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  )
}

export default NotFoundPage
