// Type definitions for medical document extractor

export interface ExtractedField {
  id: string;
  field: string;
  value: string;
  confidence: number;
  sourceLocation: {
    start: number;
    end: number;
    page?: number;
  };
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  route: string;
  confidence: number;
}

export interface Diagnosis {
  code: string;
  description: string;
  type: 'primary' | 'secondary';
  confidence: number;
}

export interface Allergy {
  allergen: string;
  reaction: string;
  severity: 'mild' | 'moderate' | 'severe';
  confidence: number;
}

export interface LabResult {
  test: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag?: 'high' | 'low' | 'critical';
  confidence: number;
}

export interface ClinicalSummary {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  assessment: string;
  plan: string;
}

export interface Document {
  id: string;
  fileName: string;
  patientName: string;
  patientId: string;
  documentType: 'lab-report' | 'discharge-summary' | 'clinical-note' | 'radiology' | 'other';
  uploadDate: Date;
  documentDate: Date;
  pageCount: number;
  status: 'processing' | 'completed' | 'error';
  medications: Medication[];
  diagnoses: Diagnosis[];
  allergies: Allergy[];
  labResults: LabResult[];
  summary: ClinicalSummary;
  rawText: string;
  confidence: number;
}
