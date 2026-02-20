
import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, AlertTriangle, FileText, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { dataEntryApi } from '@/modules/employee/services/dataEntryApi';
import { Link } from 'react-router-dom';

const CsvUpload = () => {
    const [file, setFile] = useState(null);
    const [parsedData, setParsedData] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [stats, setStats] = useState(null);

    const onDrop = (acceptedFiles) => {
        const f = acceptedFiles[0];
        if (f) {
            setFile(f);
            setStats(null);
            (async () => {
                const { default: Papa } = await import('papaparse');
                Papa.parse(f, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        setParsedData(results.data);
                        toast({ title: "File Parsed", description: `Found ${results.data.length} rows.` });
                    },
                    error: (err) => {
                        toast({ title: "Parse Error", description: err.message, variant: "destructive" });
                    }
                });
            })().catch((err) => {
                toast({ title: "Parse Error", description: err?.message || "Failed to load parser", variant: "destructive" });
            });
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
        onDrop, 
        accept: { 'text/csv': ['.csv'] },
        maxFiles: 1 
    });

    const handleUpload = async () => {
        if (!parsedData.length) return;
        
        setIsUploading(true);
        try {
            const result = await dataEntryApi.importCategoriesCSV(parsedData);
            setStats(result);
            toast({ 
                title: "Import Complete", 
                description: `Successfully processed. Success: ${result.success}, Failed: ${result.failed}`,
                variant: result.failed > 0 ? "warning" : "default"
            });
            if (result.failed === 0) {
                setFile(null);
                setParsedData([]);
            }
        } catch (error) {
            toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-4">
                <Link to="/employee/dataentry/categories">
                    <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
                </Link>
                <h1 className="text-2xl font-bold text-neutral-800">Category Bulk Import</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Upload Categories CSV</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div 
                        {...getRootProps()} 
                        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        <input {...getInputProps()} />
                        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-lg font-medium text-gray-700">
                            {isDragActive ? "Drop CSV here" : "Drag & drop CSV file here, or click to select"}
                        </p>
                        <p className="text-sm text-gray-500 mt-2">
                            Required headers: <span className="font-mono bg-gray-100 px-1">head_category, sub_category, micro_category</span>
                        </p>
                    </div>

                    {file && (
                        <div className="bg-white border rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-100 rounded text-green-700">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="font-medium">{file.name}</p>
                                    <p className="text-xs text-gray-500">{parsedData.length} rows found</p>
                                </div>
                            </div>
                            <Button onClick={handleUpload} disabled={isUploading} className="bg-[#003D82]">
                                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                Import Data
                            </Button>
                        </div>
                    )}

                    {stats && (
                        <div className={`p-4 rounded-lg border flex items-center gap-3 ${stats.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                            {stats.failed > 0 ? <AlertTriangle className="text-amber-600" /> : <CheckCircle className="text-green-600" />}
                            <div>
                                <p className="font-medium text-gray-900">Import Finished</p>
                                <p className="text-sm text-gray-600">
                                    {stats.success} records inserted. {stats.failed} records skipped/failed.
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <h4 className="font-semibold text-blue-900 mb-2">CSV Format Guidelines</h4>
                <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
                    <li>File must be in <strong>.csv</strong> format</li>
                    <li>Headers: <code>head_category</code>, <code>sub_category</code>, <code>micro_category</code>, <code>description</code>, <code>meta_tags</code></li>
                    <li>Ensure no empty rows in between data</li>
                </ul>
            </div>
        </div>
    );
};
export default CsvUpload;
