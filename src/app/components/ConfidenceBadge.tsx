import { Badge } from './ui/badge';

interface ConfidenceBadgeProps {
  confidence: number;
  size?: 'sm' | 'default';
}

export function ConfidenceBadge({ confidence, size = 'default' }: ConfidenceBadgeProps) {
  const percentage = Math.round(confidence * 100);
  
  const getVariant = () => {
    if (confidence >= 0.95) return 'success';
    if (confidence >= 0.85) return 'default';
    if (confidence >= 0.75) return 'warning';
    return 'destructive';
  };

  const getColor = () => {
    if (confidence >= 0.95) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (confidence >= 0.85) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (confidence >= 0.75) return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  return (
    <Badge 
      variant="outline" 
      className={`${getColor()} ${size === 'sm' ? 'text-xs px-1.5 py-0' : ''}`}
    >
      {percentage}% confidence
    </Badge>
  );
}
