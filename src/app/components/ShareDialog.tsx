import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Share2, Mail, Link2, Check, Copy } from 'lucide-react';
import { useState } from 'react';

interface ShareDialogProps {
  documentName: string;
}

export function ShareDialog({ documentName }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const shareLink = `https://medextract.example.com/share/${Date.now()}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1 sm:flex-none">
          <Share2 className="w-4 h-4 mr-2" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Document Summary</DialogTitle>
          <DialogDescription>
            Share {documentName} with colleagues
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Copy Link */}
          <div className="space-y-2">
            <Label htmlFor="link">Share Link</Label>
            <div className="flex gap-2">
              <Input
                id="link"
                value={shareLink}
                readOnly
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
                className="flex-shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Link expires in 7 days. Recipients must have system access.
            </p>
          </div>

          {/* Email Share */}
          <div className="space-y-2">
            <Label htmlFor="email">Send via Email</Label>
            <div className="flex gap-2">
              <Input
                id="email"
                type="email"
                placeholder="colleague@hospital.org"
                className="flex-1"
              />
              <Button variant="outline" className="flex-shrink-0">
                <Mail className="w-4 h-4 mr-2" />
                Send
              </Button>
            </div>
          </div>

          {/* Privacy Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-900">
              <strong>Privacy Notice:</strong> Only share patient information with
              authorized healthcare providers. Ensure compliance with HIPAA and local
              regulations.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <DialogTrigger asChild>
            <Button variant="outline">Close</Button>
          </DialogTrigger>
        </div>
      </DialogContent>
    </Dialog>
  );
}
