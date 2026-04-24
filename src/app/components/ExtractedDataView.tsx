import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Badge } from './ui/badge';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Document } from '../types';
import { Pill, Stethoscope, AlertTriangle, FlaskConical } from 'lucide-react';

interface ExtractedDataViewProps {
  document: Document;
  minConfidence?: number;
  onFieldClick?: (start: number, end: number) => void;
}

export function ExtractedDataView({ document, minConfidence = 0, onFieldClick }: ExtractedDataViewProps) {
  // Filter data based on confidence threshold
  const filteredMedications = document.medications.filter(m => m.confidence >= minConfidence);
  const filteredDiagnoses = document.diagnoses.filter(d => d.confidence >= minConfidence);
  const filteredAllergies = document.allergies.filter(a => a.confidence >= minConfidence);
  const filteredLabResults = document.labResults.filter(l => l.confidence >= minConfidence);

  return (
    <Tabs defaultValue="medications" className="w-full">
      <TabsList className="grid w-full grid-cols-4 bg-slate-100">
        <TabsTrigger value="medications" className="text-xs sm:text-sm data-[state=active]:bg-white">
          <Pill className="w-4 h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Medications</span>
          <span className="sm:hidden">Meds</span>
          {filteredMedications.length > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {filteredMedications.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="diagnoses" className="text-xs sm:text-sm data-[state=active]:bg-white">
          <Stethoscope className="w-4 h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Diagnoses</span>
          <span className="sm:hidden">Dx</span>
          {filteredDiagnoses.length > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {filteredDiagnoses.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="allergies" className="text-xs sm:text-sm data-[state=active]:bg-white">
          <AlertTriangle className="w-4 h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Allergies</span>
          <span className="sm:hidden">Allergy</span>
          {filteredAllergies.length > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {filteredAllergies.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="labs" className="text-xs sm:text-sm data-[state=active]:bg-white">
          <FlaskConical className="w-4 h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Lab Results</span>
          <span className="sm:hidden">Labs</span>
          {filteredLabResults.length > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {filteredLabResults.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="medications" className="mt-4">
        {filteredMedications.length > 0 ? (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Medication</TableHead>
                  <TableHead className="font-semibold">Dosage</TableHead>
                  <TableHead className="font-semibold">Frequency</TableHead>
                  <TableHead className="font-semibold">Route</TableHead>
                  <TableHead className="text-right font-semibold">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMedications.map((med, index) => (
                  <TableRow key={index} className="hover:bg-slate-50">
                    <TableCell className="font-medium">{med.name}</TableCell>
                    <TableCell className="text-slate-700">{med.dosage}</TableCell>
                    <TableCell className="text-slate-700">{med.frequency}</TableCell>
                    <TableCell className="text-slate-700">{med.route}</TableCell>
                    <TableCell className="text-right">
                      <ConfidenceBadge confidence={med.confidence} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12 border border-slate-200 rounded-lg bg-slate-50">
            <Pill className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              {document.medications.length === 0 
                ? 'No medications extracted' 
                : 'No medications meet the confidence threshold'}
            </p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="diagnoses" className="mt-4">
        {filteredDiagnoses.length > 0 ? (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Code</TableHead>
                  <TableHead className="font-semibold">Description</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="text-right font-semibold">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDiagnoses.map((diagnosis, index) => (
                  <TableRow key={index} className="hover:bg-slate-50">
                    <TableCell className="font-mono text-sm font-medium">{diagnosis.code}</TableCell>
                    <TableCell className="text-slate-700">{diagnosis.description}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {diagnosis.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfidenceBadge confidence={diagnosis.confidence} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12 border border-slate-200 rounded-lg bg-slate-50">
            <Stethoscope className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              {document.diagnoses.length === 0 
                ? 'No diagnoses extracted' 
                : 'No diagnoses meet the confidence threshold'}
            </p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="allergies" className="mt-4">
        {filteredAllergies.length > 0 ? (
          <div className="space-y-3">
            {filteredAllergies.map((allergy, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 bg-white"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-slate-900">{allergy.allergen}</h4>
                    <Badge
                      variant="outline"
                      className={
                        allergy.severity === 'severe'
                          ? 'bg-red-100 text-red-800 border-red-300'
                          : allergy.severity === 'moderate'
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                      }
                    >
                      {allergy.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">Reaction: {allergy.reaction}</p>
                </div>
                <ConfidenceBadge confidence={allergy.confidence} size="sm" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border border-slate-200 rounded-lg bg-slate-50">
            <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              {document.allergies.length === 0 
                ? 'No allergies documented' 
                : 'No allergies meet the confidence threshold'}
            </p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="labs" className="mt-4">
        {filteredLabResults.length > 0 ? (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Test</TableHead>
                  <TableHead className="font-semibold">Value</TableHead>
                  <TableHead className="font-semibold">Reference Range</TableHead>
                  <TableHead className="font-semibold">Flag</TableHead>
                  <TableHead className="text-right font-semibold">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLabResults.map((lab, index) => (
                  <TableRow key={index} className="hover:bg-slate-50">
                    <TableCell className="font-medium">{lab.test}</TableCell>
                    <TableCell className="text-slate-700">
                      {lab.value} {lab.unit}
                    </TableCell>
                    <TableCell className="text-slate-600">{lab.referenceRange}</TableCell>
                    <TableCell>
                      {lab.flag && (
                        <Badge
                          variant="outline"
                          className={
                            lab.flag === 'critical'
                              ? 'bg-red-100 text-red-800 border-red-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          }
                        >
                          {lab.flag.toUpperCase()}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfidenceBadge confidence={lab.confidence} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12 border border-slate-200 rounded-lg bg-slate-50">
            <FlaskConical className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              {document.labResults.length === 0 
                ? 'No lab results available' 
                : 'No lab results meet the confidence threshold'}
            </p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}