import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Shield, Droplets, CheckCircle, BarChart3, PlayCircle, Brain, Sparkles, Bug, TrendingUp } from 'lucide-react';
import type { ChangelogEntry } from '../../types/changelog';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  Droplets,
  CheckCircle,
  BarChart3,
  PlayCircle,
  Brain,
  Sparkles,
  Bug,
  TrendingUp,
};

const TYPE_CONFIG = {
  feature: { emoji: '✨', color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Nova Feature' },
  fix: { emoji: '🐛', color: 'text-red-400', bg: 'bg-red-400/10', label: 'Correção' },
  improvement: { emoji: '📈', color: 'text-green-500', bg: 'bg-green-500/10', label: 'Melhoria' }
};

interface ChangelogEntryItemProps {
  entry: ChangelogEntry;
}

export function ChangelogEntryItem({ entry }: ChangelogEntryItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = TYPE_CONFIG[entry.type];
  const IconComponent = entry.icon ? ICON_MAP[entry.icon] : null;
  const hasDetails = (entry.details && entry.details.length > 0) || 
                     (entry.screens && entry.screens.length > 0) || 
                     entry.docLink;

  return (
    <div 
      className={`rounded-lg border border-gray-700 overflow-hidden transition-all ${hasDetails ? 'cursor-pointer hover:border-gray-600' : ''}`}
      onClick={() => hasDetails && setIsExpanded(!isExpanded)}
    >
      <div className="p-3 flex items-start gap-3">
        <div className={`p-2 rounded-lg ${config.bg}`}>
          {IconComponent ? (
            <IconComponent className={`h-4 w-4 ${config.color}`} />
          ) : (
            <span className="text-lg">{config.emoji}</span>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-100">{entry.title}</h4>
            <span className={`text-xs px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
              {config.label}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">{entry.description}</p>
        </div>

        {hasDetails && (
          <div className="text-gray-500">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        )}
      </div>

      {isExpanded && hasDetails && (
        <div className="px-3 pb-3 pt-0 border-t border-gray-700/50 bg-gray-800/30">
          <div className="pt-3 space-y-3">
            {entry.details && entry.details.length > 0 && (
              <ul className="space-y-1">
                {entry.details.map((detail, idx) => (
                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-cyan-400 mt-1">•</span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            )}

            {entry.screens && entry.screens.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {entry.screens.map((screen, idx) => (
                  <span key={idx} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                    📍 {screen}
                  </span>
                ))}
              </div>
            )}

            {entry.docLink && (
              <a 
                href={entry.docLink}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {entry.docTitle || 'Ver documentação'}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
