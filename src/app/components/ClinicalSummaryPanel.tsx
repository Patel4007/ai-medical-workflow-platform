import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Sparkles, FileText, Activity, Clipboard } from 'lucide-react';
import { Document } from '../types';

interface ClinicalSummaryPanelProps {
  document: Document;
}

export function ClinicalSummaryPanel({ document }: ClinicalSummaryPanelProps) {
  const { summary } = document;
  
  const sections = [
    {
      title: 'Chief Complaint',
      content: summary.chiefComplaint,
      icon: FileText,
    },
    {
      title: 'History of Present Illness',
      content: summary.historyOfPresentIllness,
      icon: Activity,
    },
    {
      title: 'Assessment',
      content: summary.assessment,
      icon: Clipboard,
    },
    {
      title: 'Plan',
      content: summary.plan,
      icon: Sparkles,
    },
  ];
  
  return (
    <div className="space-y-4">
      {sections.map((section, index) => {
        const Icon = section.icon;
        return (
          <div key={index} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Icon className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="font-semibold text-slate-900">{section.title}</h4>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {section.content}
            </p>
          </div>
        );
      })}
    </div>
  );
}