import { Card, CardContent } from './ui/card';
import { Pill, Stethoscope, AlertTriangle, FlaskConical } from 'lucide-react';
import { Document } from '../types';

interface QuickStatsProps {
  document: Document;
}

export function QuickStats({ document }: QuickStatsProps) {
  const stats = [
    {
      label: 'Medications',
      value: document.medications.length,
      icon: Pill,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      label: 'Diagnoses',
      value: document.diagnoses.length,
      icon: Stethoscope,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
    },
    {
      label: 'Allergies',
      value: document.allergies.length,
      icon: AlertTriangle,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
    },
    {
      label: 'Lab Results',
      value: document.labResults.length,
      icon: FlaskConical,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-600">{stat.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
