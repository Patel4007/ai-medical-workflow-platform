import { useEffect, useState } from 'react';
import { DocumentUpload } from '../components/DocumentUpload';
import { ChatInterface } from '../components/ChatInterface';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { DocumentSelector } from '../components/DocumentSelector';
import { generateMedicalReport } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDocuments } from '../lib/documents';

export function Dashboard() {
  const { token } = useAuth();
  const { documents, uploadFiles, removeDocument, uploadError, clearUploadError, isLoading } = useDocuments();
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([
    '',
  ]);
  const [isUploading, setIsUploading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [reportModel, setReportModel] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const handleToggleDocument = (documentId: string) => {
    setSelectedDocumentIds((prev) =>
      prev.includes(documentId)
        ? prev.filter((id) => id !== documentId)
        : [...prev, documentId]
    );
  };

  const handleUpload = async (files: File[]) => {
    setIsUploading(true);
    clearUploadError();

    try {
      const uploadedDocuments = await uploadFiles(files);
      setSelectedDocumentIds((prev) => [
        ...new Set([...uploadedDocuments.map((doc) => doc.id), ...prev]),
      ]);
    } finally {
      setIsUploading(false);
    }
  };

  const selectedDocuments = documents.filter((doc) =>
    selectedDocumentIds.includes(doc.id)
  );

  const handleRemoveDocument = (documentId: string) => {
    setSelectedDocumentIds((prev) => prev.filter((id) => id !== documentId));
    void removeDocument(documentId);
  };

  const handleGenerateReport = async () => {
    if (selectedDocuments.length === 0 || isGeneratingReport) {
      return;
    }

    setIsGeneratingReport(true);
    setReportError(null);

    try {
      if (!token) {
        throw new Error('Please sign in again to generate a report.');
      }
      const response = await generateMedicalReport(token, selectedDocuments);
      setReport(response.content);
      setReportModel(response.model);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Failed to generate report.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  useEffect(() => {
    if (!selectedDocumentIds.filter(Boolean).length && documents.length > 0) {
      setSelectedDocumentIds([documents[0].id]);
    }
  }, [documents, selectedDocumentIds]);

  useEffect(() => {
    setReport(null);
    setReportModel(null);
    setReportError(null);
  }, [selectedDocumentIds, documents.length]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Clinical Document Analyzer</h1>
          <p className="text-sm text-slate-600 mt-1">AI-powered medical document extraction and analysis</p>
        </div>

        {/* Dual Panel Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel - Upload & Chat */}
          <div className="flex flex-col h-[calc(100vh-180px)] gap-4">
            {/* Upload Section */}
            <div className="flex-shrink-0">
              <DocumentUpload
                isUploading={isUploading}
                uploadError={uploadError}
                onUpload={handleUpload}
              />
            </div>

            {/* Document Selector */}
            <div className="flex-shrink-0 bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              {isLoading ? (
                <div className="text-sm text-slate-600">Loading documents...</div>
              ) : (
                <DocumentSelector
                  documents={documents}
                  selectedDocumentIds={selectedDocumentIds}
                  onToggleDocument={handleToggleDocument}
                  onRemoveDocument={handleRemoveDocument}
                />
              )}
            </div>

            {/* Chat Interface Section */}
            <div className="flex-1 min-h-0">
              <ChatInterface
                documents={selectedDocuments}
                documentCount={selectedDocuments.length}
              />
            </div>
          </div>

          {/* Right Panel - Analysis & Insights */}
          <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-180px)]">
            <div className="bg-white rounded-lg border border-slate-200 p-6 h-full overflow-hidden shadow-sm">
              <AnalysisPanel
                documents={selectedDocuments}
                report={report}
                reportModel={reportModel}
                isGeneratingReport={isGeneratingReport}
                reportError={reportError}
                onGenerateReport={handleGenerateReport}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
