import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { npsAPI } from '../lib/apiClient'

type NPSState = 'score' | 'feedback' | 'thanks'

interface NPSWidgetProps {
  onComplete?: () => void
}

export default function NPSWidget({ onComplete }: NPSWidgetProps) {
  const [state, setState] = useState<NPSState>('score')
  const [selectedScore, setSelectedScore] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [allowShowcase, setAllowShowcase] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getScoreColor = (score: number) => {
    if (score >= 9) return 'bg-emerald-500 hover:bg-emerald-600 border-emerald-400'
    if (score >= 7) return 'bg-amber-500 hover:bg-amber-600 border-amber-400'
    return 'bg-red-500 hover:bg-red-600 border-red-400'
  }

  const getSelectedColor = (score: number) => {
    if (score >= 9) return 'ring-emerald-400 bg-emerald-500'
    if (score >= 7) return 'ring-amber-400 bg-amber-500'
    return 'ring-red-400 bg-red-500'
  }

  const getFeedbackQuestion = () => {
    if (selectedScore === null) return ''
    if (selectedScore >= 9) return 'O que você mais gostou?'
    if (selectedScore >= 7) return 'O que faltou para a nota 10?'
    return 'O que podemos fazer para melhorar?'
  }

  const handleScoreSelect = (score: number) => {
    setSelectedScore(score)
    setState('feedback')
  }

  const handleSubmit = async () => {
    if (selectedScore === null) return
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      await npsAPI.submit(selectedScore, feedback || undefined, allowShowcase)
      setState('thanks')
      
      setTimeout(() => {
        onComplete?.()
      }, 3000)
    } catch (err) {
      setError('Erro ao enviar avaliação. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkipFeedback = async () => {
    if (selectedScore === null) return
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      await npsAPI.submit(selectedScore)
      setState('thanks')
      
      setTimeout(() => {
        onComplete?.()
      }, 3000)
    } catch (err) {
      setError('Erro ao enviar avaliação. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <AnimatePresence mode="wait">
        {state === 'score' && (
          <motion.div
            key="score"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-2xl shadow-lg p-8"
          >
            <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">
              Como você avalia sua experiência?
            </h2>
            <p className="text-gray-500 text-center mb-8">
              Em uma escala de 0 a 10, qual a probabilidade de você recomendar a plataforma B2H4 para um amigo ou colega?
            </p>
            
            <div className="flex justify-center gap-2 flex-wrap">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                <motion.button
                  key={score}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleScoreSelect(score)}
                  className={`
                    w-12 h-12 rounded-full text-white font-bold text-lg
                    transition-all duration-200 border-2 border-transparent
                    ${getScoreColor(score)}
                  `}
                >
                  {score}
                </motion.button>
              ))}
            </div>
            
            <div className="flex justify-between mt-4 text-sm text-gray-400">
              <span>Nada provável</span>
              <span>Muito provável</span>
            </div>
          </motion.div>
        )}

        {state === 'feedback' && selectedScore !== null && (
          <motion.div
            key="feedback"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-2xl shadow-lg p-8"
          >
            <div className="flex items-center justify-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl ring-4 ${getSelectedColor(selectedScore)}`}
              >
                {selectedScore}
              </motion.div>
            </div>

            <h2 className="text-xl font-bold text-gray-800 text-center mb-2">
              {getFeedbackQuestion()}
            </h2>
            <p className="text-gray-500 text-center mb-6 text-sm">
              Seu feedback é muito importante para nós (opcional)
            </p>

            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Conte-nos mais sobre sua experiência..."
              className="w-full h-32 p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />

            <label className="flex items-start gap-3 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={allowShowcase}
                onChange={(e) => setAllowShowcase(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5"
              />
              <span className="text-sm text-gray-600">
                Autorizo o uso do meu depoimento (sem identificação) em materiais de marketing.
              </span>
            </label>

            {error && (
              <p className="text-red-500 text-sm mt-4 text-center">{error}</p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSkipFeedback}
                disabled={isSubmitting}
                className="flex-1 py-3 px-6 text-gray-600 bg-gray-100 rounded-xl font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Pular
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-3 px-6 text-white bg-blue-600 rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Enviando...
                  </>
                ) : (
                  'Enviar Avaliação'
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

        {state === 'thanks' && (
          <motion.div
            key="thanks"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-2xl shadow-lg p-8 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6"
            >
              <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold text-gray-800 mb-2"
            >
              Obrigado pela sua avaliação!
            </motion.h2>
            
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-gray-500"
            >
              Seu feedback nos ajuda a melhorar cada vez mais.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
