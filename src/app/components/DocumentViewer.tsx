import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { FileText, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';

interface DocumentViewerProps {
  rawText: string;
  highlightRange?: { start: number; end: number };
}

export function DocumentViewer({ rawText, highlightRange }: DocumentViewerProps) {
  const [fontSize, setFontSize] = useState(14);

  const renderTextWithHighlight = () => {
    if (!highlightRange) {
      return rawText;
    }

    const before = rawText.slice(0, highlightRange.start);
    const highlighted = rawText.slice(highlightRange.start, highlightRange.end);
    const after = rawText.slice(highlightRange.end);

    return (
      <>
        {before}
        <mark className="bg-yellow-200 px-1 rounded">{highlighted}</mark>
        {after}
      </>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Source Document
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFontSize(Math.max(10, fontSize - 2))}
              className="h-8 w-8"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFontSize(Math.min(20, fontSize + 2))}
              className="h-8 w-8"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] w-full rounded-md border border-slate-200 bg-white">
          <div className="p-6">
            <pre
              className="font-mono text-slate-800 whitespace-pre-wrap leading-relaxed"
              style={{ fontSize: `${fontSize}px` }}
            >
              {renderTextWithHighlight()}
            </pre>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
