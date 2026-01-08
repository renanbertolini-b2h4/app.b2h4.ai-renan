interface AccessDeniedProps {
  feature: 'course' | 'flowise' | 'gamma' | 'admin'
}

export default function AccessDenied({ feature }: AccessDeniedProps) {
  const messages = {
    course: {
      title: 'Acesso aos Materiais Restrito',
      description: 'Você não tem permissão para acessar os materiais do curso.'
    },
    flowise: {
      title: 'Acesso ao Flowise Restrito',
      description: 'Você não tem permissão para acessar o Flowise.'
    },
    gamma: {
      title: 'Acesso ao Gamma Restrito',
      description: 'Você não tem permissão para acessar o Gamma.'
    },
    admin: {
      title: 'Acesso Restrito a Administradores',
      description: 'Você precisa ser administrador para acessar esta funcionalidade.'
    }
  }

  const { title, description } = messages[feature]

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg 
            className="w-10 h-10 text-amber-600" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
            />
          </svg>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          {title}
        </h2>
        
        <p className="text-gray-600 mb-6">
          {description}
        </p>
        
        <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            Entre em contato com o administrador do sistema para solicitar acesso.
          </p>
        </div>
      </div>
    </div>
  )
}
