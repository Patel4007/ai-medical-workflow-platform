import { Card, CardContent } from './ui/card';
import { Progress } from './ui/progress';
import { Loader2, FileText } from 'lucide-react';

interface ProcessingCardProps {
  fileName: string;
  progress: number;
}

export function ProcessingCard({ fileName, progress }: ProcessingCardProps) {
  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <h4 className="font-semibold text-slate-900 truncate">
                Processing {fileName}
              </h4>
            </div>
            <Progress value={progress} className="h-2 mb-2" />
            <p className="text-xs text-slate-600">
              Extracting clinical data... {progress}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
