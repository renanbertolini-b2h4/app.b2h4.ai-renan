import { useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        'agent-id': string
      }, HTMLElement>
    }
  }
}

export default function ElevenLabsWidget() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) {
      const widget = document.querySelector('elevenlabs-convai')
      if (widget) {
        widget.remove()
      }
    }
  }, [user])

  if (!user) {
    return null
  }

  return (
    <elevenlabs-convai agent-id="agent_7901kb8p4m34ea5vad0ra5yrgsqf" />
  )
}
