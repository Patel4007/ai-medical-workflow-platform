import { useState } from 'react';
import { DocumentCard } from '../components/DocumentCard';
import { FilterBar } from '../components/FilterBar';
import { FileText } from 'lucide-react';
import { useDocuments } from '../lib/documents';

export function Library() {
  const { documents, isLoading } = useDocuments();
  const [searchQuery, setSearchQuery] = useState('');
  const [documentType, setDocumentType] = useState('all');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.fileName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = documentType === 'all' || doc.documentType === documentType;

    return matchesSearch && matchesType;
  });

  const handleToggleSelect = (documentId: string) => {
    setSelectedDocumentIds((prev) =>
      prev.includes(documentId)
        ? prev.filter((id) => id !== documentId)
        : [...prev, documentId]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Document Library</h1>
        <p className="text-slate-600">
          Browse and search all uploaded medical documents
        </p>
      </div>

      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        documentType={documentType}
        onDocumentTypeChange={setDocumentType}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center py-12">
            <p className="text-slate-500">Loading documents...</p>
          </div>
        ) : filteredDocuments.length > 0 ? (
          filteredDocuments.map((doc) => (
            <DocumentCard 
              key={doc.id} 
              document={doc}
              isSelected={selectedDocumentIds.includes(doc.id)}
              onToggleSelect={handleToggleSelect}
            />
          ))
        ) : (
          <div className="col-span-full text-center py-12">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No documents found matching your criteria</p>
          </div>
        )}
      </div>
    </div>
  );
}
