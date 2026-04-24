import { Stethoscope } from 'lucide-react';

export function WorkspaceHeader() {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
          <Stethoscope className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clinical Document Analyzer</h1>
          <p className="text-sm text-slate-600">AI-powered medical document extraction</p>
        </div>
      </div>
    </div>
  );
}