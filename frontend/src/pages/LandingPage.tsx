import { Globe, MapPin, BookOpen, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../core/constants/app'

const LandingPage = () => {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="text-center text-white">
        {/* Hero */}
        <div className="flex justify-center items-center gap-3 mb-6">
          <Globe className="w-12 h-12 text-amber-400" />
          <h1 className="text-5xl font-bold">Kidversa</h1>
        </div>
        <p className="text-xl text-purple-200 mb-8 max-w-2xl mx-auto">
          Platform Edutourism Interaktif untuk Anak - Belajar Sambil Berpetualang!
        </p>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6 mt-12">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/20 transition-all">
            <MapPin className="w-10 h-10 text-amber-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Petualangan Digital</h3>
            <p className="text-purple-200 text-sm">
              Jelajahi destinasi edukatif secara interaktif
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/20 transition-all">
            <BookOpen className="w-10 h-10 text-amber-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Storytelling</h3>
            <p className="text-purple-200 text-sm">
              Cerita digital yang memikat dan edukatif
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/20 transition-all">
            <Sparkles className="w-10 h-10 text-amber-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Belajar Menyenangkan</h3>
            <p className="text-purple-200 text-sm">
              Metode belajar interaktif untuk anak
            </p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="mt-16 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to={ROUTES.AUTH}
            className="bg-amber-400 text-purple-900 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-amber-300 transition-colors"
          >
            Mulai Sekarang
          </Link>
          <Link
            to={`${ROUTES.AUTH}?mode=register`}
            className="bg-white/20 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white/30 transition-colors"
          >
            Daftar Gratis
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-16 text-purple-300 text-sm">
          <p>© 2025 Kidversa Edutourism. Built with ❤️</p>
        </div>
      </div>
    </div>
  )
}

export default LandingPage
