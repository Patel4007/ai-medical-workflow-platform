import { Slider } from './ui/slider';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Filter } from 'lucide-react';

interface ConfidenceFilterProps {
  minConfidence: number;
  onMinConfidenceChange: (value: number) => void;
}

export function ConfidenceFilter({
  minConfidence,
  onMinConfidenceChange,
}: ConfidenceFilterProps) {
  // Convert 0-1 to 0-100 for slider
  const sliderValue = Math.round(minConfidence * 100);
  
  const handleValueChange = (values: number[]) => {
    // Convert 0-100 back to 0-1
    onMinConfidenceChange(values[0] / 100);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
          <Filter className="w-4 h-4" />
          Confidence Threshold
        </Label>
        <Badge variant="secondary" className="font-mono text-xs">
          {sliderValue}%+
        </Badge>
      </div>
      <Slider
        value={[sliderValue]}
        onValueChange={handleValueChange}
        min={0}
        max={100}
        step={5}
        className="w-full"
      />
      <p className="text-xs text-slate-600">
        Showing only extractions with {sliderValue}% or higher confidence
      </p>
    </div>
  );
}