import { Document } from '../types';
import { ExtractedDataView } from './ExtractedDataView';
import { ClinicalSummaryPanel } from './ClinicalSummaryPanel';
import { ConfidenceFilter } from './ConfidenceFilter';
import { ExportMenu } from './ExportMenu';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { AlertCircle, BarChart3, FileText, LoaderCircle, Sparkles, ClipboardList, Users } from 'lucide-react';
import { Badge } from './ui/badge';
import { useEffect, useState } from 'react';

interface AnalysisPanelProps {
  documents: Document[];
  report: string | null;
  reportModel: string | null;
  isGeneratingReport: boolean;
  reportError: string | null;
  onGenerateReport: () => Promise<void>;
}

export function AnalysisPanel({
  documents,
  report,
  reportModel,
  isGeneratingReport,
  reportError,
  onGenerateReport,
}: AnalysisPanelProps) {
  const [minConfidence, setMinConfidence] = useState(0);
  const [activeTab, setActiveTab] = useState('extracted');

  useEffect(() => {
    if (isGeneratingReport || report || reportError) {
      setActiveTab('report');
    }
  }, [isGeneratingReport, report, reportError]);

  if (!documents || documents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3 p-8">
          <BarChart3 className="w-12 h-12 text-slate-300 mx-auto" />
          <div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">
              No Documents Selected
            </h3>
            <p className="text-sm text-slate-600 max-w-md">
              Select medical documents to view combined extraction results
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Merge data from multiple documents
  const mergedDocument: Document = {
    id: 'merged',
    fileName: `${documents.length} Document${documents.length > 1 ? 's' : ''} Combined`,
    patientName: documents.length === 1 
      ? documents[0].patientName 
      : `${documents.length} Patients`,
    patientId: documents.length === 1 
      ? documents[0].patientId 
      : 'Multiple MRNs',
    documentType: 'other',
    uploadDate: new Date(),
    documentDate: new Date(),
    pageCount: documents.reduce((sum, doc) => sum + doc.pageCount, 0),
    status: 'completed',
    medications: documents.flatMap(doc => doc.medications),
    diagnoses: documents.flatMap(doc => doc.diagnoses),
    allergies: documents.flatMap(doc => doc.allergies),
    labResults: documents.flatMap(doc => doc.labResults),
    summary: {
      chiefComplaint: documents.map(doc => doc.summary.chiefComplaint).join('; '),
      historyOfPresentIllness: documents.map(doc => doc.summary.historyOfPresentIllness).join('\n\n'),
      assessment: documents.map(doc => doc.summary.assessment).join('\n\n'),
      plan: documents.map(doc => doc.summary.plan).join('\n\n'),
    },
    rawText: documents.map((doc, idx) => `=== Document ${idx + 1}: ${doc.fileName} ===\n\n${doc.rawText}`).join('\n\n'),
    confidence: documents.reduce((sum, doc) => sum + doc.confidence, 0) / documents.length,
  };

  return (
    <div className="h-full flex flex-col">
      {/* Document Header */}
      <div className="mb-4 pb-4 border-b border-slate-200">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">
              Combined Analysis
            </h2>
            <div className="text-sm text-slate-600">
              {documents.length === 1 ? (
                <>
                  <span>{documents[0].patientName}</span>
                  <span className="mx-2">•</span>
                  <span>MRN {documents[0].patientId}</span>
                </>
              ) : (
                <>
                  <span>{documents.length} documents</span>
                  <span className="mx-2">•</span>
                  <span>{mergedDocument.pageCount} total pages</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {documents.length > 1 && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                Multi-doc
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveTab('report');
                void onGenerateReport();
              }}
              disabled={documents.length === 0 || isGeneratingReport}
              className="shadow-sm"
            >
              {isGeneratingReport ? (
                <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate report
            </Button>
            <ExportMenu documents={documents} />
          </div>
        </div>
        
        {/* Document List */}
        {documents.length > 1 && (
          <div className="mt-3 space-y-1 mb-4">
            {documents.map((doc, idx) => (
              <div key={doc.id} className="text-xs text-slate-600 flex items-center gap-2">
                <FileText className="w-3 h-3" />
                <span className="truncate">{doc.fileName}</span>
              </div>
            ))}
          </div>
        )}

        {/* Confidence Filter */}
        <ConfidenceFilter
          minConfidence={minConfidence}
          onMinConfidenceChange={setMinConfidence}
        />
        {reportError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{reportError}</span>
          </div>
        )}
      </div>

      {/* Tabs for Different Views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 bg-slate-100">
          <TabsTrigger value="extracted" className="text-sm data-[state=active]:bg-white">
            <ClipboardList className="w-4 h-4 mr-2" />
            Data
          </TabsTrigger>
          <TabsTrigger value="summary" className="text-sm data-[state=active]:bg-white">
            <Sparkles className="w-4 h-4 mr-2" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="document" className="text-sm data-[state=active]:bg-white">
            <FileText className="w-4 h-4 mr-2" />
            Source
          </TabsTrigger>
          <TabsTrigger value="report" className="text-sm data-[state=active]:bg-white">
            <Sparkles className="w-4 h-4 mr-2" />
            Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="extracted" className="flex-1 mt-4">
          <ScrollArea className="h-[calc(100vh-450px)]">
            <ExtractedDataView document={mergedDocument} minConfidence={minConfidence} />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="summary" className="flex-1 mt-4">
          <ScrollArea className="h-[calc(100vh-450px)]">
            <ClinicalSummaryPanel document={mergedDocument} />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="document" className="flex-1 mt-4">
          <ScrollArea className="h-[calc(100vh-450px)]">
            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono bg-slate-50 p-4 rounded-lg leading-relaxed border border-slate-200">
              {mergedDocument.rawText}
            </pre>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="report" className="flex-1 mt-4">
          <ScrollArea className="h-[calc(100vh-450px)]">
            <div className="border border-slate-200 rounded-lg bg-slate-50 p-4">
              {report ? (
                <>
                  {reportModel && (
                    <p className="text-xs text-slate-500 mb-3">Generated with {reportModel}</p>
                  )}
                  <pre className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                    {report}
                  </pre>
                </>
              ) : (
                <div className="text-sm text-slate-600">
                  {isGeneratingReport
                    ? 'Generating report from the selected documents...'
                    : 'Generate a report to view a Hugging Face model summary here.'}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
