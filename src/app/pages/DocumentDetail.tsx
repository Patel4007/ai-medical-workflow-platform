import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ExtractedDataView } from '../components/ExtractedDataView';
import { ClinicalSummaryPanel } from '../components/ClinicalSummaryPanel';
import { DocumentViewer } from '../components/DocumentViewer';
import { ExportDialog } from '../components/ExportDialog';
import { ShareDialog } from '../components/ShareDialog';
import { QuickStats } from '../components/QuickStats';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import {
  ArrowLeft,
  Download,
  Share2,
  Calendar,
  User,
  FileText,
  Activity,
} from 'lucide-react';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useDocuments } from '../lib/documents';

export function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { documents, isLoading } = useDocuments();
  const [highlightRange, setHighlightRange] = useState<
    { start: number; end: number } | undefined
  >();

  const document = documents.find((doc) => doc.id === id);

  if (isLoading) {
    return <div className="text-sm text-slate-600 py-8">Loading document...</div>;
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Document Not Found</h2>
        <p className="text-slate-600 mb-4">
          The requested document could not be found.
        </p>
        <Button onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'discharge-summary': 'Discharge Summary',
      'lab-report': 'Lab Report',
      'clinical-note': 'Clinical Note',
      'radiology': 'Radiology',
      'other': 'Other',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate('/')}
            className="mt-1"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              {document.fileName}
            </h1>
            <div className="flex flex-wrap gap-2 items-center text-sm text-slate-600">
              <div className="flex items-center gap-1">
                <User className="w-4 h-4" />
                <span>{document.patientName}</span>
              </div>
              <span>•</span>
              <span>MRN: {document.patientId}</span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{format(document.documentDate, 'MMM d, yyyy')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <ShareDialog documentName={document.fileName} />
          <ExportDialog documentId={document.id} documentName={document.fileName} />
        </div>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap gap-2 items-center">
        <Badge variant="outline" className="text-sm">
          {getDocumentTypeLabel(document.documentType)}
        </Badge>
        <Badge variant="outline" className="text-sm">
          <Activity className="w-3 h-3 mr-1" />
          {document.pageCount} pages
        </Badge>
        <ConfidenceBadge confidence={document.confidence} />
      </div>

      {/* Quick Stats */}
      <QuickStats document={document} />

      {/* Main Content */}
      <Tabs defaultValue="extracted" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="extracted">Extracted Data</TabsTrigger>
          <TabsTrigger value="summary">Clinical Summary</TabsTrigger>
          <TabsTrigger value="source">Source Document</TabsTrigger>
        </TabsList>

        <TabsContent value="extracted" className="space-y-6">
          <ExtractedDataView
            document={document}
            onFieldClick={(start, end) => setHighlightRange({ start, end })}
          />
        </TabsContent>

        <TabsContent value="summary" className="space-y-6">
          <ClinicalSummaryPanel document={document} />
        </TabsContent>

        <TabsContent value="source" className="space-y-6">
          <DocumentViewer rawText={document.rawText} highlightRange={highlightRange} />
        </TabsContent>
      </Tabs>

      {/* Two Column Layout for Desktop - Alternative view */}
      <div className="hidden xl:grid xl:grid-cols-2 gap-6 mt-8">
        <div className="space-y-6">
          <ClinicalSummaryPanel document={document} />
          <ExtractedDataView document={document} />
        </div>
        <DocumentViewer rawText={document.rawText} highlightRange={highlightRange} />
      </div>
    </div>
  );
}
