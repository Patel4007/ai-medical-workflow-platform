import { Document } from '../types';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Checkbox } from './ui/checkbox';
import { FileText, Calendar, User, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface DocumentListProps {
  documents: Document[];
  selectedDocumentId?: string;
  onSelectDocument: (document: Document) => void;
}

export function DocumentList({
  documents,
  selectedDocumentId,
  onSelectDocument,
}: DocumentListProps) {
  const getDocumentTypeLabel = (type: Document['documentType']) => {
    const labels = {
      'lab-report': 'Lab Report',
      'discharge-summary': 'Discharge Summary',
      'clinical-note': 'Clinical Note',
      'radiology': 'Radiology',
      'other': 'Other',
    };
    return labels[type] || type;
  };

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2 pr-4">
        {documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No documents uploaded yet</p>
          </div>
        ) : (
          documents.map((doc) => (
            <Card
              key={doc.id}
              className={`cursor-pointer transition-all hover:shadow-sm border-slate-200 ${
                selectedDocumentId === doc.id
                  ? 'bg-blue-50/80 border-blue-200'
                  : 'bg-white hover:bg-slate-50/50'
              }`}
              onClick={() => onSelectDocument(doc)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Checkbox 
                    checked={selectedDocumentId === doc.id}
                    className="flex-shrink-0"
                  />
                  <FileText className={`w-4 h-4 flex-shrink-0 ${
                    selectedDocumentId === doc.id ? 'text-blue-600' : 'text-slate-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm truncate mb-0.5 ${
                      selectedDocumentId === doc.id 
                        ? 'text-slate-900 font-medium' 
                        : 'text-slate-700'
                    }`}>
                      {doc.fileName}
                    </h4>
                    <p className="text-xs text-slate-500 truncate">
                      {doc.patientName} • {getDocumentTypeLabel(doc.documentType)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </ScrollArea>
  );
}