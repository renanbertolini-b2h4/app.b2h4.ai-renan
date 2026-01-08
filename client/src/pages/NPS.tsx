import Layout from '../components/Layout'
import NPSWidget from '../components/NPSWidget'
import { useLocation } from 'wouter'

export default function NPS() {
  const [, setLocation] = useLocation()

  const handleComplete = () => {
    setLocation('/')
  }

  return (
    <Layout>
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-4">
        <NPSWidget onComplete={handleComplete} />
      </div>
    </Layout>
  )
}
