import { FileText, Calendar, User, Activity, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Document } from '../types';
import { format } from 'date-fns';
import { useNavigate } from 'react-router';

interface DocumentCardProps {
  document: Document;
  isSelected?: boolean;
  onToggleSelect?: (documentId: string) => void;
}

export function DocumentCard({ document, isSelected = false, onToggleSelect }: DocumentCardProps) {
  const navigate = useNavigate();

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

  const handleCardClick = (e: React.MouseEvent) => {
    if (onToggleSelect) {
      e.stopPropagation();
      onToggleSelect(document.id);
    } else {
      navigate(`/document/${document.id}`);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleSelect) {
      onToggleSelect(document.id);
    }
  };

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-sm border-slate-200 ${
        isSelected 
          ? 'bg-blue-50/80 border-blue-200' 
          : 'bg-white hover:bg-slate-50/50'
      }`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {onToggleSelect && (
            <Checkbox 
              checked={isSelected}
              onClick={handleCheckboxClick}
              className="flex-shrink-0 mt-0.5"
            />
          )}
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isSelected ? 'bg-blue-100' : 'bg-slate-100'
          }`}>
            <FileText className={`w-4 h-4 ${
              isSelected ? 'text-blue-600' : 'text-slate-500'
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm truncate mb-1 ${
              isSelected ? 'text-slate-900 font-medium' : 'text-slate-700'
            }`}>
              {document.fileName}
            </h3>
            <p className="text-xs text-slate-500 truncate mb-2">
              {document.patientName} • {getDocumentTypeLabel(document.documentType)}
            </p>
            
            {document.status === 'completed' && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{document.medications.length} meds</span>
                <span>•</span>
                <span>{document.diagnoses.length} diagnoses</span>
                <span>•</span>
                <ConfidenceBadge confidence={document.confidence} size="sm" />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}