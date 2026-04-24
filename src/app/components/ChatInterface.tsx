import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { askDocumentsQuestion } from '../lib/api';
import { Document } from '../types';
import { AlertCircle, Bot, LoaderCircle, Send, User } from 'lucide-react';
import { useAuth } from '../lib/auth';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  documents: Document[];
  documentCount: number;
}

export function ChatInterface({ documents, documentCount }: ChatInterfaceProps) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: documents.length > 0
        ? `Hello! I've analyzed ${documentCount} document${documentCount > 1 ? 's' : ''}. You can ask me questions about medications, diagnoses, lab results, or request specific information extraction across all selected documents.`
        : "Hello! Upload and select medical documents to get started. I'll help you extract and analyze clinical information across multiple files.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update welcome message when document changes
  useEffect(() => {
    if (documents.length > 0) {
      setMessages([
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Hello! I've analyzed ${documentCount} document${documentCount > 1 ? 's' : ''}. You can ask me questions about medications, diagnoses, lab results, or request specific information extraction across all selected documents.`,
          timestamp: new Date(),
        },
      ]);
    } else {
      setMessages([
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: "Hello! Upload and select medical documents to get started. I'll help you extract and analyze clinical information across multiple files.",
          timestamp: new Date(),
        },
      ]);
    }
    setError(null);
  }, [documents, documentCount]);

  const handleSend = async () => {
    if (!input.trim() || documents.length === 0 || isLoading) return;

    const question = input.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      if (!token) {
        throw new Error('Please sign in again to use AI analysis.');
      }
      const response = await askDocumentsQuestion(token, documents, question);
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The AI analysis request failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-lg shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3 flex-shrink-0 bg-slate-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-600" />
            AI Assistant
          </h3>
          {documentCount > 0 && (
            <span className="text-xs text-slate-600 font-medium">
              {documentCount} doc{documentCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full px-4">
          <div className="space-y-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user' ? 'bg-blue-600' : 'bg-blue-100'
                }`}>
                  {message.role === 'user' ? (
                    <User className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-blue-600" />
                  )}
                </div>
                <div
                  className={`flex-1 rounded-lg p-3 max-w-[85%] ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-50 text-slate-900 border border-slate-200'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-100">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 rounded-lg p-3 max-w-[85%] bg-slate-50 text-slate-900 border border-slate-200">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <LoaderCircle className="w-4 h-4 animate-spin" />
                    <span>Analyzing selected documents with the local Hugging Face model...</span>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="border-t border-slate-200 p-4 bg-slate-50 flex-shrink-0">
        <div className="flex gap-2">
          <Input
            placeholder={
              documents.length > 0
                ? 'Ask about medications, diagnoses, labs...'
                : 'Select documents to start'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={documents.length === 0 || isLoading}
            className="flex-1 bg-white"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || documents.length === 0 || isLoading}
            size="icon"
            className="bg-blue-600 hover:bg-blue-700 shadow-sm"
          >
            {isLoading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
