import { AlertCircle, FileText, LoaderCircle, Upload } from 'lucide-react';

interface DocumentUploadProps {
  isUploading: boolean;
  uploadError: string | null;
  onUpload: (files: File[]) => Promise<void>;
}

export function DocumentUpload({ isUploading, uploadError, onUpload }: DocumentUploadProps) {
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await onUpload(Array.from(files));
    }
    e.target.value = '';
  };

  return (
    <label className="cursor-pointer block border-2 border-dashed border-blue-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 bg-blue-50/30 transition-all">
      <input
        type="file"
        accept=".pdf,.txt"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />
      <div className="flex items-center justify-center gap-3 py-6 px-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100">
          {isUploading ? (
            <LoaderCircle className="w-5 h-5 text-blue-600 animate-spin" />
          ) : (
            <Upload className="w-5 h-5 text-blue-600" />
          )}
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-slate-900">
            {isUploading ? 'Uploading Medical Documents' : 'Upload Medical Documents'}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">PDF or TXT • Multiple files supported</p>
          {uploadError && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      </div>
    </label>
  );
}
