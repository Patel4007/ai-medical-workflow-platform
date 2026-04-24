import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { deleteDocument, fetchDocuments, uploadDocuments } from './api';
import { useAuth } from './auth';
import { Document } from '../types';

interface DocumentsContextValue {
  documents: Document[];
  isLoading: boolean;
  uploadError: string | null;
  refreshDocuments: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<Document[]>;
  removeDocument: (documentId: string) => Promise<void>;
  clearUploadError: () => void;
}

const DocumentsContext = createContext<DocumentsContextValue | undefined>(undefined);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const { token, user, isLoading: authLoading } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const refreshDocuments = async () => {
    if (!token) {
      setDocuments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const items = await fetchDocuments(token);
      setDocuments(items);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user || !token) {
      setDocuments([]);
      setIsLoading(false);
      return;
    }

    refreshDocuments().catch(() => {
      setDocuments([]);
      setIsLoading(false);
    });
  }, [authLoading, token, user]);

  const uploadFiles = async (files: File[]) => {
    if (!token) {
      throw new Error('Please log in before uploading files.');
    }

    setUploadError(null);
    try {
      const uploaded = await uploadDocuments(token, files);
      setDocuments((prev) => [...uploaded, ...prev]);
      return uploaded;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload documents.';
      setUploadError(message);
      throw error;
    }
  };

  const removeDocument = async (documentId: string) => {
    if (!token) {
      throw new Error('Please log in before deleting files.');
    }

    await deleteDocument(token, documentId);
    setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
  };

  const value = useMemo(
    () => ({
      documents,
      isLoading,
      uploadError,
      refreshDocuments,
      uploadFiles,
      removeDocument,
      clearUploadError: () => setUploadError(null),
    }),
    [documents, isLoading, uploadError]
  );

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>;
}

export function useDocuments() {
  const context = useContext(DocumentsContext);
  if (!context) {
    throw new Error('useDocuments must be used within a DocumentsProvider');
  }
  return context;
}
