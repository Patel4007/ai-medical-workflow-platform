import { useState } from 'react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { Download, FileText, FileSpreadsheet, CheckCircle } from 'lucide-react';
import { Document } from '../types';

interface ExportMenuProps {
  documents: Document[];
}

export function ExportMenu({ documents }: ExportMenuProps) {
  const [exported, setExported] = useState(false);

  const exportToCSV = () => {
    // Prepare CSV data
    let csv = 'Type,Item,Details,Confidence\n';
    
    documents.forEach((doc) => {
      // Medications
      doc.medications.forEach((med) => {
        csv += `Medication,"${med.name}","${med.dosage} ${med.frequency} (${med.route})",${med.confidence}\n`;
      });
      
      // Diagnoses
      doc.diagnoses.forEach((dx) => {
        csv += `Diagnosis,"${dx.code}","${dx.description} (${dx.type})",${dx.confidence}\n`;
      });
      
      // Allergies
      doc.allergies.forEach((allergy) => {
        csv += `Allergy,"${allergy.allergen}","${allergy.reaction} - ${allergy.severity}",${allergy.confidence}\n`;
      });
      
      // Lab Results
      doc.labResults.forEach((lab) => {
        csv += `Lab,"${lab.test}","${lab.value} ${lab.unit} (Ref: ${lab.referenceRange})${lab.flag ? ' - ' + lab.flag : ''}",${lab.confidence}\n`;
      });
    });

    // Create and download file
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinical-analysis-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  const exportToPDF = () => {
    // Generate text report
    let report = 'CLINICAL DOCUMENT ANALYSIS REPORT\n';
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `Documents Analyzed: ${documents.length}\n`;
    report += '='.repeat(80) + '\n\n';

    documents.forEach((doc, idx) => {
      report += `DOCUMENT ${idx + 1}: ${doc.fileName}\n`;
      report += `Patient: ${doc.patientName} (${doc.patientId})\n`;
      report += `Document Type: ${doc.documentType}\n`;
      report += `Overall Confidence: ${Math.round(doc.confidence * 100)}%\n\n`;

      if (doc.medications.length > 0) {
        report += 'MEDICATIONS:\n';
        doc.medications.forEach((med, i) => {
          report += `  ${i + 1}. ${med.name} ${med.dosage} - ${med.frequency} (${med.route}) [${Math.round(med.confidence * 100)}%]\n`;
        });
        report += '\n';
      }

      if (doc.diagnoses.length > 0) {
        report += 'DIAGNOSES:\n';
        doc.diagnoses.forEach((dx, i) => {
          report += `  ${i + 1}. ${dx.code} - ${dx.description} (${dx.type}) [${Math.round(dx.confidence * 100)}%]\n`;
        });
        report += '\n';
      }

      if (doc.allergies.length > 0) {
        report += 'ALLERGIES:\n';
        doc.allergies.forEach((allergy, i) => {
          report += `  ${i + 1}. ${allergy.allergen} - ${allergy.reaction} (${allergy.severity}) [${Math.round(allergy.confidence * 100)}%]\n`;
        });
        report += '\n';
      }

      if (doc.labResults.length > 0) {
        report += 'LAB RESULTS:\n';
        doc.labResults.forEach((lab, i) => {
          report += `  ${i + 1}. ${lab.test}: ${lab.value} ${lab.unit} (Ref: ${lab.referenceRange})${lab.flag ? ' - ' + lab.flag.toUpperCase() : ''} [${Math.round(lab.confidence * 100)}%]\n`;
        });
        report += '\n';
      }

      report += '-'.repeat(80) + '\n\n';
    });

    // Create and download text file (simulating PDF)
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinical-report-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  if (documents.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={exported}
        >
          {exported ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-600" />
              Exported
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Export
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={exportToCSV} className="cursor-pointer">
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportToPDF} className="cursor-pointer">
          <FileText className="w-4 h-4 mr-2" />
          Export as Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}