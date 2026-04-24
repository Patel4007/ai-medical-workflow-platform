import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { FileText, Upload } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title = 'No documents yet',
  description = 'Upload your first medical document to get started with AI-powered extraction',
  actionLabel = 'Upload Document',
  onAction,
}: EmptyStateProps) {
  return (
    <Card className="border-2 border-dashed border-slate-300">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-600 mb-6 max-w-sm">{description}</p>
        {onAction && (
          <Button onClick={onAction}>
            <Upload className="w-4 h-4 mr-2" />
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
