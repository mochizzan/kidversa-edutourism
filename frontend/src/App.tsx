import { useState } from 'react'
import { Globe, MapPin, BookOpen, Sparkles } from 'lucide-react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-600">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center text-white">
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

          {/* Counter Demo */}
          <div className="mt-16 bg-white/10 backdrop-blur-sm rounded-2xl p-8 max-w-md mx-auto">
            <p className="text-purple-200 mb-4">Interactive Counter Demo</p>
            <div className="text-6xl font-bold text-amber-400 mb-6">{count}</div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setCount(c => c + 1)}
                className="bg-amber-400 text-purple-900 px-6 py-3 rounded-lg font-semibold hover:bg-amber-300 transition-colors"
              >
                Tambah
              </button>
              <button
                onClick={() => setCount(0)}
                className="bg-white/20 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/30 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-16 text-purple-300 text-sm">
            <p>© 2025 Kidversa Edutourism. Built with ❤️</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
