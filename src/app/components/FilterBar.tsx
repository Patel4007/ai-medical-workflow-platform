import { Search, Filter, Calendar } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  documentType: string;
  onDocumentTypeChange: (type: string) => void;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  documentType,
  onDocumentTypeChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      <div className="relative flex-1 w-full sm:w-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search by patient name, MRN, or keywords..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      
      <div className="flex gap-2 w-full sm:w-auto">
        <Select value={documentType} onValueChange={onDocumentTypeChange}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Document Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="discharge-summary">Discharge Summary</SelectItem>
            <SelectItem value="lab-report">Lab Report</SelectItem>
            <SelectItem value="clinical-note">Clinical Note</SelectItem>
            <SelectItem value="radiology">Radiology</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" className="hidden sm:flex">
          <Calendar className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
