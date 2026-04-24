import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Download, FileJson, FileText, Table } from 'lucide-react';
import { useState } from 'react';

interface ExportDialogProps {
  documentId: string;
  documentName: string;
}

export function ExportDialog({ documentId, documentName }: ExportDialogProps) {
  const [selectedData, setSelectedData] = useState({
    medications: true,
    diagnoses: true,
    allergies: true,
    labResults: true,
    summary: true,
  });

  const [format, setFormat] = useState<'json' | 'csv' | 'txt'>('json');

  const handleExport = () => {
    // In a real app, this would generate and download the file
    console.log('Exporting:', { documentId, selectedData, format });
    alert(`Exporting ${documentName} as ${format.toUpperCase()}`);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Document Data</DialogTitle>
          <DialogDescription>
            Select the data fields and format for export
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Data Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Include Data</Label>
            <div className="space-y-2">
              {Object.entries(selectedData).map(([key, value]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={key}
                    checked={value}
                    onCheckedChange={(checked) =>
                      setSelectedData((prev) => ({
                        ...prev,
                        [key]: checked === true,
                      }))
                    }
                  />
                  <Label
                    htmlFor={key}
                    className="text-sm font-normal cursor-pointer capitalize"
                  >
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Format Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Export Format</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={format === 'json' ? 'default' : 'outline'}
                onClick={() => setFormat('json')}
                className="flex flex-col items-center gap-1 h-auto py-3"
              >
                <FileJson className="w-5 h-5" />
                <span className="text-xs">JSON</span>
              </Button>
              <Button
                variant={format === 'csv' ? 'default' : 'outline'}
                onClick={() => setFormat('csv')}
                className="flex flex-col items-center gap-1 h-auto py-3"
              >
                <Table className="w-5 h-5" />
                <span className="text-xs">CSV</span>
              </Button>
              <Button
                variant={format === 'txt' ? 'default' : 'outline'}
                onClick={() => setFormat('txt')}
                className="flex flex-col items-center gap-1 h-auto py-3"
              >
                <FileText className="w-5 h-5" />
                <span className="text-xs">TXT</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <DialogTrigger asChild>
            <Button variant="outline">Cancel</Button>
          </DialogTrigger>
          <Button onClick={handleExport} className="bg-blue-600 hover:bg-blue-700">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
