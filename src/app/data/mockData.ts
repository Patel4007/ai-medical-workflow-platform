import { Document } from '../types';

export const mockDocuments: Document[] = [
  {
    id: '1',
    fileName: 'discharge_summary_2026-03-15.pdf',
    patientName: 'Sarah Johnson',
    patientId: 'MRN-00123456',
    documentType: 'discharge-summary',
    uploadDate: new Date('2026-03-28T09:30:00'),
    documentDate: new Date('2026-03-15T14:22:00'),
    pageCount: 4,
    status: 'completed',
    confidence: 0.94,
    medications: [
      {
        name: 'Lisinopril',
        dosage: '10mg',
        frequency: 'Once daily',
        route: 'Oral',
        confidence: 0.96,
      },
      {
        name: 'Metformin',
        dosage: '500mg',
        frequency: 'Twice daily',
        route: 'Oral',
        confidence: 0.98,
      },
      {
        name: 'Atorvastatin',
        dosage: '20mg',
        frequency: 'Once daily at bedtime',
        route: 'Oral',
        confidence: 0.95,
      },
    ],
    diagnoses: [
      {
        code: 'I10',
        description: 'Essential (primary) hypertension',
        type: 'primary',
        confidence: 0.97,
      },
      {
        code: 'E11.9',
        description: 'Type 2 diabetes mellitus without complications',
        type: 'secondary',
        confidence: 0.95,
      },
      {
        code: 'E78.5',
        description: 'Hyperlipidemia, unspecified',
        type: 'secondary',
        confidence: 0.93,
      },
    ],
    allergies: [
      {
        allergen: 'Penicillin',
        reaction: 'Rash, hives',
        severity: 'moderate',
        confidence: 0.99,
      },
      {
        allergen: 'Sulfa drugs',
        reaction: 'Nausea, dizziness',
        severity: 'mild',
        confidence: 0.92,
      },
    ],
    labResults: [
      {
        test: 'Hemoglobin A1c',
        value: '7.2',
        unit: '%',
        referenceRange: '4.0-5.6',
        flag: 'high',
        confidence: 0.98,
      },
      {
        test: 'LDL Cholesterol',
        value: '128',
        unit: 'mg/dL',
        referenceRange: '<100',
        flag: 'high',
        confidence: 0.97,
      },
      {
        test: 'Blood Pressure',
        value: '142/88',
        unit: 'mmHg',
        referenceRange: '<120/80',
        flag: 'high',
        confidence: 0.96,
      },
    ],
    summary: {
      chiefComplaint: 'Follow-up for diabetes and hypertension management',
      historyOfPresentIllness:
        'Patient is a 58-year-old female with history of type 2 diabetes mellitus and hypertension presenting for routine follow-up. Reports good medication compliance. Denies chest pain, shortness of breath, or other acute concerns.',
      assessment:
        'Type 2 diabetes with suboptimal control (A1c 7.2%). Hypertension adequately controlled on current medication. Hyperlipidemia stable.',
      plan: 'Continue current medications. Increase Metformin to 1000mg twice daily. Schedule follow-up in 3 months with repeat A1c and lipid panel. Reinforce diet and exercise modifications.',
    },
    rawText: `DISCHARGE SUMMARY

Patient: Sarah Johnson
MRN: MRN-00123456
DOB: 05/12/1968
Date of Service: March 15, 2026

CHIEF COMPLAINT:
Follow-up for diabetes and hypertension management

HISTORY OF PRESENT ILLNESS:
Patient is a 58-year-old female with history of type 2 diabetes mellitus and hypertension presenting for routine follow-up. Reports good medication compliance. Denies chest pain, shortness of breath, or other acute concerns.

ALLERGIES:
- Penicillin (rash, hives)
- Sulfa drugs (nausea, dizziness)

CURRENT MEDICATIONS:
1. Lisinopril 10mg once daily
2. Metformin 500mg twice daily
3. Atorvastatin 20mg once daily at bedtime

PHYSICAL EXAMINATION:
Blood Pressure: 142/88 mmHg
Heart Rate: 76 bpm
Temperature: 98.4°F

LABORATORY RESULTS:
Hemoglobin A1c: 7.2% (Reference: 4.0-5.6%)
LDL Cholesterol: 128 mg/dL (Reference: <100 mg/dL)

DIAGNOSES:
1. I10 - Essential (primary) hypertension
2. E11.9 - Type 2 diabetes mellitus without complications
3. E78.5 - Hyperlipidemia, unspecified

ASSESSMENT:
Type 2 diabetes with suboptimal control (A1c 7.2%). Hypertension adequately controlled on current medication. Hyperlipidemia stable.

PLAN:
Continue current medications. Increase Metformin to 1000mg twice daily. Schedule follow-up in 3 months with repeat A1c and lipid panel. Reinforce diet and exercise modifications.

Electronically signed by:
Dr. Michael Chen, MD
March 15, 2026`,
  },
  {
    id: '2',
    fileName: 'lab_results_2026-03-22.pdf',
    patientName: 'James Martinez',
    patientId: 'MRN-00789012',
    documentType: 'lab-report',
    uploadDate: new Date('2026-03-27T14:15:00'),
    documentDate: new Date('2026-03-22T08:30:00'),
    pageCount: 2,
    status: 'completed',
    confidence: 0.97,
    medications: [],
    diagnoses: [],
    allergies: [
      {
        allergen: 'Shellfish',
        reaction: 'Anaphylaxis',
        severity: 'severe',
        confidence: 0.98,
      },
    ],
    labResults: [
      {
        test: 'WBC',
        value: '11.2',
        unit: 'K/uL',
        referenceRange: '4.5-11.0',
        flag: 'high',
        confidence: 0.99,
      },
      {
        test: 'Hemoglobin',
        value: '14.5',
        unit: 'g/dL',
        referenceRange: '13.5-17.5',
        confidence: 0.99,
      },
      {
        test: 'Platelets',
        value: '225',
        unit: 'K/uL',
        referenceRange: '150-400',
        confidence: 0.98,
      },
      {
        test: 'Creatinine',
        value: '1.1',
        unit: 'mg/dL',
        referenceRange: '0.7-1.3',
        confidence: 0.97,
      },
    ],
    summary: {
      chiefComplaint: 'Routine laboratory testing',
      historyOfPresentIllness: 'Patient presented for routine pre-operative laboratory testing.',
      assessment: 'Laboratory values within normal limits except for mildly elevated WBC.',
      plan: 'Results reviewed with patient. Cleared for planned procedure.',
    },
    rawText: `LABORATORY REPORT

Patient: James Martinez
MRN: MRN-00789012
DOB: 08/23/1975
Collection Date: March 22, 2026

COMPLETE BLOOD COUNT:
WBC: 11.2 K/uL (Reference: 4.5-11.0) HIGH
Hemoglobin: 14.5 g/dL (Reference: 13.5-17.5)
Platelets: 225 K/uL (Reference: 150-400)

BASIC METABOLIC PANEL:
Creatinine: 1.1 mg/dL (Reference: 0.7-1.3)

ALLERGIES:
- Shellfish (anaphylaxis)

Clinical Notes: Routine pre-operative laboratory testing. Values within acceptable range for planned procedure.`,
  },
  {
    id: '3',
    fileName: 'clinical_note_2026-03-20.pdf',
    patientName: 'Emily Chen',
    patientId: 'MRN-00345678',
    documentType: 'clinical-note',
    uploadDate: new Date('2026-03-26T11:45:00'),
    documentDate: new Date('2026-03-20T10:15:00'),
    pageCount: 3,
    status: 'completed',
    confidence: 0.91,
    medications: [
      {
        name: 'Albuterol inhaler',
        dosage: '90mcg',
        frequency: 'As needed for wheezing',
        route: 'Inhalation',
        confidence: 0.94,
      },
      {
        name: 'Fluticasone inhaler',
        dosage: '110mcg',
        frequency: 'Twice daily',
        route: 'Inhalation',
        confidence: 0.93,
      },
    ],
    diagnoses: [
      {
        code: 'J45.909',
        description: 'Unspecified asthma, uncomplicated',
        type: 'primary',
        confidence: 0.96,
      },
    ],
    allergies: [
      {
        allergen: 'Latex',
        reaction: 'Contact dermatitis',
        severity: 'mild',
        confidence: 0.89,
      },
    ],
    labResults: [],
    summary: {
      chiefComplaint: 'Asthma exacerbation',
      historyOfPresentIllness:
        '32-year-old female with history of asthma presents with increased wheezing and shortness of breath over past 3 days. Reports increased use of rescue inhaler.',
      assessment: 'Asthma exacerbation, mild to moderate.',
      plan: 'Started on oral prednisone 40mg daily for 5 days. Advised to continue current inhalers. Follow-up in 1 week or sooner if symptoms worsen.',
    },
    rawText: `CLINICAL NOTE

Patient: Emily Chen
MRN: MRN-00345678
DOB: 11/15/1993
Date: March 20, 2026

CHIEF COMPLAINT: Asthma exacerbation

HISTORY:
32-year-old female with history of asthma presents with increased wheezing and shortness of breath over past 3 days. Reports increased use of rescue inhaler.

ALLERGIES:
- Latex (contact dermatitis)

MEDICATIONS:
1. Albuterol inhaler 90mcg as needed for wheezing
2. Fluticasone inhaler 110mcg twice daily

DIAGNOSIS:
J45.909 - Unspecified asthma, uncomplicated

ASSESSMENT AND PLAN:
Asthma exacerbation, mild to moderate. Started on oral prednisone 40mg daily for 5 days. Advised to continue current inhalers. Follow-up in 1 week or sooner if symptoms worsen.

Dr. Sarah Williams, MD`,
  },
];
