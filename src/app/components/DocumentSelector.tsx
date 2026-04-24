import { Document } from '../types';
import { Check, FileText, Trash2 } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface DocumentSelectorProps {
  documents: Document[];
  selectedDocumentIds: string[];
  onToggleDocument: (documentId: string) => void;
  onRemoveDocument: (documentId: string) => void;
}

export function DocumentSelector({
  documents,
  selectedDocumentIds,
  onToggleDocument,
  onRemoveDocument,
}: DocumentSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Document Library</h3>
        <Badge variant="secondary" className="text-xs font-medium">
          {selectedDocumentIds.length} of {documents.length}
        </Badge>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {documents.map((doc) => {
          const isSelected = selectedDocumentIds.includes(doc.id);
          return (
            <div
              key={doc.id}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => onToggleDocument(doc.id)}
                  className="flex items-start gap-3 flex-1 min-w-0 text-left"
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {doc.fileName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                      <span>{doc.patientName}</span>
                      <span>•</span>
                      <span className="capitalize">{doc.documentType.replace('-', ' ')}</span>
                    </div>
                  </div>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemoveDocument(doc.id);
                  }}
                  aria-label={`Remove ${doc.fileName}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
