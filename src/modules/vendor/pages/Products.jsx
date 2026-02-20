
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { vendorApi } from '@/modules/vendor/services/vendorApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { Plus, Search, Edit, Trash2, Eye, MapPin, Tag, Package, Copy, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { shareUtils } from '@/shared/utils/shareUtils';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const location = useLocation();

  const handleCopyProductLink = async (slug) => {
    const url = `${window.location.origin}/p/${slug}`;
    const success = await shareUtils.copyToClipboard(url);
    if (success) {
      setCopiedId(slug);
      toast({ title: 'Link copied!', description: 'Product link copied to clipboard' });
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  useEffect(() => { 
    loadProducts(); 
  }, [location]);

  const loadProducts = async () => {
    try {
      const data = await vendorApi.products.list();
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: 'Error loading products', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return products;
    return products.filter(p =>
      (p.name || '').toLowerCase().includes(t) ||
      (p.sku || '').toLowerCase().includes(t)
    );
  }, [products, searchTerm]);

  const handleDelete = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await vendorApi.products.delete(productId);
      setProducts(products.filter(p => p.id !== productId));
      toast({ title: 'Product deleted successfully' });
    } catch (error) {
      toast({ title: 'Error deleting product', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h1 className="text-2xl font-bold text-gray-900">My Products</h1>
           <p className="text-gray-500">Manage your product catalog</p>
        </div>
        <Button className="bg-[#003D82]" asChild>
          <Link to="/vendor/products/add"><Plus className="mr-2 h-4 w-4" /> Add Product</Link>
        </Button>
      </div>

      <div className="flex items-center gap-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search products..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="bg-white border rounded-lg p-8 text-center text-gray-600">Loading...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white border rounded-lg p-12 text-center text-gray-500">
             <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <Package className="w-6 h-6 text-gray-400" />
             </div>
             <p className="text-lg font-medium text-gray-900">No products found</p>
             <p className="text-gray-500">Add your first product to start selling.</p>
          </div>
        ) : (
          filteredProducts.map((p) => {
            const mainImage = p.images?.[0];
            const priceLabel = p.price ? `₹ ${p.price}${p.price_unit ? ` / ${p.price_unit}` : ''}` : 'Price on request';
            const categoryLabel = p.category_path ? p.category_path : (p.category_other || 'Uncategorized');

            return (
              <Card key={p.id} className="overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_220px]">
                  {/* LEFT: Image */}
                  <div className="relative bg-slate-50 h-52 lg:h-full border-b lg:border-b-0 lg:border-r flex items-center justify-center">
                    {mainImage ? (
                      <img src={mainImage} className="w-full h-full object-cover" alt={p.name} />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                        <Eye className="w-8 h-8" />
                        <span className="text-xs">No image</span>
                      </div>
                    )}
                    <Badge
                      variant={p.status === 'ACTIVE' ? 'default' : 'secondary'}
                      className={`absolute top-3 left-3 text-xs ${p.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : ''}`}
                    >
                      {p.status || 'DRAFT'}
                    </Badge>
                  </div>

                  {/* CENTER: Product Info */}
                  <div className="p-5 flex flex-col justify-between gap-3 min-w-0">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-semibold text-slate-900 line-clamp-2 break-words">{p.name}</h3>
                      </div>
                      <div className="text-base font-semibold text-[#003D82]">{priceLabel}</div>

                      <div className="text-xs text-slate-600 break-all">
                        {categoryLabel.split('>').map((cat, idx, arr) => (
                          <React.Fragment key={idx}>
                            <span>{cat.trim()}</span>
                            {idx < arr.length - 1 && <span className="mx-1 text-slate-400">›</span>}
                          </React.Fragment>
                        ))}
                      </div>

                      {p.extra_micro_categories && p.extra_micro_categories.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {p.extra_micro_categories.map((cat, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[11px] bg-blue-50 text-blue-700 border-blue-200">
                              {cat.name || cat}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {p.description && (
                        <p className="text-sm text-slate-600 line-clamp-2 break-all whitespace-pre-wrap">
                          {p.description.replace(/<[^>]*>/g, '')}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-slate-600 pt-2 border-t">
                      {p.min_order_qty && (
                        <div>
                          Min Order: <span className="font-medium">{p.min_order_qty} {p.qty_unit}</span>
                        </div>
                      )}
                      {p.target_locations?.states?.length > 0 && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {p.target_locations.states.length} States, {p.target_locations.cities.length} Cities
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Specs + Actions */}
                  <div className="bg-slate-50 p-4 border-t lg:border-t-0 lg:border-l flex flex-col justify-between gap-4 min-w-0">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Specifications</h4>
                      {p.specifications && p.specifications.length > 0 ? (
                        <div className="space-y-1 text-xs">
                          {p.specifications.slice(0, 3).map((spec, idx) => (
                            <div key={idx} className="flex justify-between gap-2">
                              <span className="text-slate-600 line-clamp-1">{spec.key}</span>
                              <span className="font-medium text-slate-900 line-clamp-1">{spec.value}</span>
                            </div>
                          ))}
                          {p.specifications.length > 3 && (
                            <div className="text-[11px] text-blue-600">+{p.specifications.length - 3} more</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">No specs added</div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button size="sm" variant="outline" asChild className="justify-start">
                        <Link to={`/p/${p.slug || p.id}`} target="_blank">
                          <Eye className="w-4 h-4 mr-2" /> View Product
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyProductLink(p.slug || p.id)}
                        className="justify-start"
                      >
                        {copiedId === (p.slug || p.id) ? (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-2" /> Copy Link
                          </>
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" asChild className="justify-start">
                        <Link to={`/vendor/products/${p.id}/edit`}>
                          <Edit className="w-4 h-4 mr-2" /> Edit
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 justify-start"
                        onClick={() => handleDelete(p.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Products;
