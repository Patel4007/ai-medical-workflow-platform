import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { X, Sparkles, Upload, FileText, TrendingUp } from 'lucide-react';
import { useState } from 'react';

export function WelcomeCard() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-emerald-50/30 relative overflow-hidden">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8"
        onClick={() => setIsVisible(false)}
      >
        <X className="w-4 h-4" />
      </Button>

      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <Sparkles className="w-5 h-5 text-blue-600" />
          Welcome to MedExtract AI
        </CardTitle>
      </CardHeader>

      <CardContent>
        <p className="text-sm text-slate-700 mb-4">
          Transform unstructured medical documents into actionable clinical data with
          AI-powered extraction and summarization.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Upload className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-900 mb-1">
                Upload Documents
              </h4>
              <p className="text-xs text-slate-600">
                Drop PDFs or text files to begin analysis
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-900 mb-1">
                Extract Data
              </h4>
              <p className="text-xs text-slate-600">
                AI identifies medications, diagnoses, and more
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-900 mb-1">
                View Insights
              </h4>
              <p className="text-xs text-slate-600">
                Get confidence scores and clinical summaries
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
