
import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { dataEntryApi } from '@/modules/employee/services/dataEntryApi';

const BulkImport = () => {
  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [importing, setImporting] = useState(false);

  const onDrop = (acceptedFiles) => {
    const f = acceptedFiles[0];
    setFile(f);
    if (!f) return;
    (async () => {
      const { default: Papa } = await import('papaparse');
      Papa.parse(f, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => setData(results.data)
      });
    })().catch((err) => {
      toast({ title: "Parse Error", description: err?.message || "Failed to load parser", variant: "destructive" });
    });
  };
  
  const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: { 'text/csv': ['.csv'] } });

  const handleImport = async () => {
      setImporting(true);
      try {
          const res = await dataEntryApi.importLocationsCSV(data);
          toast({ title: "Import Complete", description: `Success: ${res.success}, Failed: ${res.failed}` });
          if(res.failed === 0) { setFile(null); setData([]); }
      } catch(e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
      finally { setImporting(false); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bulk Import Locations</h1>
      <Card>
          <CardHeader><CardTitle>Upload States & Cities CSV</CardTitle></CardHeader>
          <CardContent>
              {!file ? (
                  <div {...getRootProps()} className="border-2 border-dashed p-10 text-center cursor-pointer rounded bg-slate-50 hover:bg-slate-100">
                      <input {...getInputProps()} />
                      <Upload className="w-10 h-10 mx-auto text-gray-400 mb-2" />
                      <p>Drag 'n' drop CSV here (Cols: state_name, city_name)</p>
                  </div>
              ) : (
                  <div>
                      <div className="flex justify-between mb-4 items-center">
                          <p className="font-medium">{file.name} ({data.length} rows)</p>
                          <div className="flex gap-2">
                              <Button variant="outline" onClick={() => { setFile(null); setData([]); }}>Cancel</Button>
                              <Button onClick={handleImport} disabled={importing}>
                                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Import
                              </Button>
                          </div>
                      </div>
                      <div className="border rounded max-h-[300px] overflow-auto">
                          <Table>
                              <TableHeader><TableRow><TableHead>State</TableHead><TableHead>City</TableHead></TableRow></TableHeader>
                              <TableBody>
                                  {data.slice(0,50).map((r, i) => (
                                      <TableRow key={i}>
                                          <TableCell>{r.state_name || <span className="text-red-500">Missing</span>}</TableCell>
                                          <TableCell>{r.city_name || <span className="text-red-500">Missing</span>}</TableCell>
                                      </TableRow>
                                  ))}
                              </TableBody>
                          </Table>
                      </div>
                  </div>
              )}
          </CardContent>
      </Card>
    </div>
  );
};
export default BulkImport;
