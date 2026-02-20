
import React, { useState } from 'react';
import { Upload, X, FileText, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { dataEntryApi } from '@/modules/employee/services/dataEntryApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const UploadKYCDocuments = ({ vendorId, onSuccess }) => {
  const [docType, setDocType] = useState('pan');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
      const f = e.target.files[0];
      if (f) {
          if (f.size > 5 * 1024 * 1024) {
              toast({ title: "Error", description: "File too large (Max 5MB)", variant: "destructive" });
              return;
          }
          setFile(f);
      }
  };

  const handleUpload = async () => {
      if (!file || !vendorId) return;
      setUploading(true);
      try {
          await dataEntryApi.uploadKycDoc(vendorId, docType, file);
          toast({ title: "Success", description: "Document uploaded successfully" });
          setFile(null);
          if (onSuccess) onSuccess();
      } catch (e) {
          toast({ title: "Upload Failed", description: e.message, variant: "destructive" });
      } finally {
          setUploading(false);
      }
  };

  return (
    <Card className="border-dashed">
       <CardHeader>
          <CardTitle className="text-base font-medium">Upload KYC Documents</CardTitle>
       </CardHeader>
       <CardContent className="space-y-4">
          <div className="space-y-2">
             <Label>Document Type</Label>
             <Select value={docType} onValueChange={setDocType}>
                 <SelectTrigger>
                     <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                     <SelectItem value="pan">PAN Card</SelectItem>
                     <SelectItem value="gst_certificate">GST Certificate</SelectItem>
                     <SelectItem value="bank_proof">Bank Proof (Cheque/Passbook)</SelectItem>
                     <SelectItem value="company_registration">Company Registration</SelectItem>
                 </SelectContent>
             </Select>
          </div>
          
          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-slate-50 transition-colors">
              <input 
                 type="file" 
                 id="kyc-upload" 
                 className="hidden" 
                 accept=".jpg,.jpeg,.png,.pdf"
                 onChange={handleFileChange}
              />
              <Label htmlFor="kyc-upload" className="cursor-pointer block">
                  <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-gray-400" />
                      <span className="text-sm font-medium text-gray-600">
                          {file ? file.name : "Click to select file"}
                      </span>
                      <span className="text-xs text-gray-400">Max 5MB (PDF, JPG, PNG)</span>
                  </div>
              </Label>
          </div>

          <Button className="w-full" disabled={!file || uploading} onClick={handleUpload}>
              {uploading ? 'Uploading...' : 'Upload Document'}
          </Button>
       </CardContent>
    </Card>
  );
};

export default UploadKYCDocuments;
