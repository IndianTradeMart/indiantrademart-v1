
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { dataEntryApi } from '@/modules/employee/services/dataEntryApi';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const VendorProducts = () => {
  const { vendorId } = useParams();
  const [products, setProducts] = useState([]);
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [vData, pData] = await Promise.all([
          dataEntryApi.getVendorById(vendorId),
          dataEntryApi.getVendorProducts(vendorId)
        ]);
        setVendor(vData);
        setProducts(pData || []);
      } catch (error) {
        console.error("Failed to load vendor products", error);
      } finally {
        setLoading(false);
      }
    };
    if (vendorId) loadData();
  }, [vendorId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/employee/dataentry/vendors">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">
            {loading ? 'Loading...' : `${vendor?.company_name || 'Vendor'} Products`}
          </h1>
          <p className="text-sm text-gray-500">Manage products for this vendor</p>
        </div>
        <div className="ml-auto">
          <Link to={`/employee/dataentry/vendors/${vendorId}/products/add`}>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" /> Add Product
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Product Name</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
            ) : products.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-500">No products found for this vendor.</TableCell></TableRow>
            ) : (
              products.map(p => {
                const relationalImage =
                  p.product_images && p.product_images.length > 0 ? p.product_images[0].image_url : null;
                const jsonImage =
                  Array.isArray(p.images) && p.images.length > 0
                    ? (typeof p.images[0] === 'string' ? p.images[0] : p.images[0]?.url || p.images[0]?.image_url || null)
                    : null;
                const firstImage = relationalImage || jsonImage;
                const categoryName =
                  p.micro_category?.name ||
                  p.sub_category?.name ||
                  p.head_category?.name ||
                  p.category_path ||
                  p.category_other ||
                  p.category ||
                  'Uncategorized';
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                        {firstImage ? (
                          <img src={firstImage} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>₹{p.price || 'N/A'}</TableCell>
                    <TableCell>{categoryName}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'ACTIVE' ? 'default' : 'secondary'}>{p.status || 'ACTIVE'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to={`/employee/dataentry/vendors/${vendorId}/products/${p.id}/edit`}>
                        <Button variant="ghost" size="sm">Edit</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default VendorProducts;
