import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  FolderKanban,
  Package,
  Layers,
  Plus,
  Send,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

const Collections = () => {
  const [vendorId, setVendorId] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customGroups, setCustomGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupNote, setNewGroupNote] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [productForGroup, setProductForGroup] = useState('');
  const [groupMode, setGroupMode] = useState('sub'); // custom | head | sub | micro | category

  // ---------------- helpers ----------------
  const fetchVendorId = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: vendor } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (vendor?.id) setVendorId(vendor.id);
    } catch (e) {
      console.error('Vendor fetch failed', e);
    }
  };

  const loadProducts = async (vid) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category, category_path, category_other, extra_micro_categories, is_service, metadata, status, head_category_id, sub_category_id, micro_category_id')
        .eq('vendor_id', vid)
        .neq('status', 'ARCHIVED')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data || [];

      const extraMicroIds = new Set();
      rows.forEach((p) => {
        const extras = Array.isArray(p.extra_micro_categories) ? p.extra_micro_categories : [];
        extras.forEach((item) => {
          if (!item) return;
          if (typeof item === 'string') return;
          const id = item.id || item.micro_category_id;
          if (id) extraMicroIds.add(id);
        });
      });

      const headIds = Array.from(new Set(rows.map((p) => p.head_category_id).filter(Boolean)));
      const subIds = Array.from(new Set(rows.map((p) => p.sub_category_id).filter(Boolean)));
      const microIds = Array.from(
        new Set([
          ...rows.map((p) => p.micro_category_id).filter(Boolean),
          ...Array.from(extraMicroIds),
        ])
      );

      const [headRes, subRes, microRes] = await Promise.all([
        headIds.length
          ? supabase.from('head_categories').select('id, name').in('id', headIds)
          : Promise.resolve({ data: [] }),
        subIds.length
          ? supabase.from('sub_categories').select('id, name, head_categories(id, name)').in('id', subIds)
          : Promise.resolve({ data: [] }),
        microIds.length
          ? supabase
            .from('micro_categories')
            .select('id, name, sub_categories(id, name, head_categories(id, name))')
            .in('id', microIds)
          : Promise.resolve({ data: [] }),
      ]);

      const headMap = new Map((headRes.data || []).map((h) => [h.id, h.name]));
      const subMap = new Map(
        (subRes.data || []).map((s) => [
          s.id,
          {
            name: s.name,
            headId: s.head_categories?.id || null,
            headName: s.head_categories?.name || null,
          },
        ])
      );
      const microMap = new Map(
        (microRes.data || []).map((m) => [
          m.id,
          {
            name: m.name,
            subId: m.sub_categories?.id || null,
            subName: m.sub_categories?.name || null,
            headId: m.sub_categories?.head_categories?.id || null,
            headName: m.sub_categories?.head_categories?.name || null,
          },
        ])
      );

      const mapped = rows.map((p) => ({
        ...p,
        ...(function deriveNames() {
          const pathParts = (p.category_path || '')
            .split('>')
            .map((part) => part.trim())
            .filter(Boolean);

          const subInfo = p.sub_category_id ? subMap.get(p.sub_category_id) : null;
          const microInfo = p.micro_category_id ? microMap.get(p.micro_category_id) : null;

          const extraMicroNames = (Array.isArray(p.extra_micro_categories) ? p.extra_micro_categories : [])
            .map((item) => {
              if (!item) return null;
              if (typeof item === 'string') return item.trim();
              return item.name || null;
            })
            .filter(Boolean);

          const microNames = Array.from(
            new Set([
              microInfo?.name,
              ...extraMicroNames,
              pathParts[2],
              p.category,
              p.category_other,
            ].filter(Boolean))
          );

          const microName = microNames[0] || null;
          const subName =
            subInfo?.name ||
            microInfo?.subName ||
            pathParts[1] ||
            null;
          const headName =
            headMap.get(p.head_category_id) ||
            subInfo?.headName ||
            microInfo?.headName ||
            pathParts[0] ||
            null;

          return {
            head_category_name: headName,
            sub_category_name: subName,
            micro_category_name: microName,
            micro_category_names: microNames,
          };
        })(),
      }));

      setProducts(mapped);
      // preload existing custom groups from metadata
      const groups = new Set();
      (data || []).forEach((p) => {
        const g = p?.metadata?.custom_group;
        if (g) groups.add(g);
      });
      setCustomGroups(Array.from(groups));
    } catch (e) {
      console.error('Products load failed', e);
      toast({ title: 'Error', description: 'Could not load products', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendorId();
  }, []);

  useEffect(() => {
    if (vendorId) loadProducts(vendorId);
  }, [vendorId]);

  const grouped = useMemo(() => {
    const map = {};
    const addToGroup = (key, product) => {
      if (!map[key]) map[key] = [];
      map[key].push(product);
    };

    products.forEach((p) => {
      if (groupMode === 'micro') {
        const microList = Array.isArray(p.micro_category_names) && p.micro_category_names.length
          ? p.micro_category_names
          : (p.micro_category_name ? [p.micro_category_name] : []);
        const uniqueMicros = Array.from(new Set(microList.filter(Boolean)));
        if (uniqueMicros.length) {
          uniqueMicros.forEach((name) => addToGroup(`Micro: ${name}`, p));
          return;
        }
      }

      let grp = 'Uncategorized';
      if (groupMode === 'head' && p.head_category_name) {
        grp = `Head: ${p.head_category_name}`;
      } else if (groupMode === 'sub' && p.sub_category_name) {
        grp = `Sub: ${p.sub_category_name}`;
      } else if (groupMode === 'micro' && p.micro_category_name) {
        grp = `Micro: ${p.micro_category_name}`;
      } else if (groupMode === 'category' && p.category) {
        grp = `Category: ${p.category}`;
      } else {
        grp =
          (p.metadata && p.metadata.custom_group) ||
          (p.category ? `Category: ${p.category}` : p.is_service ? 'Services' : 'Uncategorized');
      }

      addToGroup(grp, p);
    });
    return map;
  }, [products, groupMode]);

  const createCustomGroup = async () => {
    if (!newGroupName.trim()) {
      toast({ title: 'Enter a group name', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const response = await fetchWithCsrf(apiUrl('/api/category-requests'), {
        method: 'POST',
        body: JSON.stringify({
          group_name: newGroupName.trim(),
          note: newGroupNote?.trim() || '',
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to notify data-entry');
      }
      setCustomGroups((prev) => Array.from(new Set([...prev, newGroupName.trim()])));
      toast({ title: 'Custom group created', description: 'We also notified data-entry to add this category.' });
      setNewGroupName('');
      setNewGroupNote('');
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: e?.message || 'Could not create group', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const assignToGroup = async () => {
    if (!productForGroup || !selectedGroup) {
      toast({ title: 'Select product & group first', variant: 'destructive' });
      return;
    }
    setAssigning(true);
    try {
      const product = products.find((p) => p.id === productForGroup);
      const currentMeta = product?.metadata || {};
      const updatedMeta = { ...currentMeta, custom_group: selectedGroup };
      const { error } = await supabase
        .from('products')
        .update({ metadata: updatedMeta })
        .eq('id', productForGroup);
      if (error) throw error;
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productForGroup ? { ...p, metadata: updatedMeta } : p
        )
      );
      toast({ title: 'Assigned', description: 'Product moved to the selected group.' });
      setProductForGroup('');
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: e?.message || 'Could not assign product', variant: 'destructive' });
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px] text-slate-600">
        Loading collections...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FolderKanban className="w-8 h-8 text-[#003D82]" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Collections</h1>
          <p className="text-slate-600 text-sm">
            1) Group products/services by category for better management. 2) Create a custom group if a category is missing – we’ll notify data-entry to add it.
          </p>
        </div>
      </div>

      {/* Custom group creator */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="w-5 h-5 text-[#003D82]" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Custom Group</h2>
            <p className="text-sm text-slate-600">
              Use this when the needed category doesn’t exist. A notification will be sent to data-entry.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            placeholder="Group name (e.g., Solar Accessories)"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
          <Input
            placeholder="Note for data-entry (optional)"
            value={newGroupNote}
            onChange={(e) => setNewGroupNote(e.target.value)}
          />
        </div>
        <Button onClick={createCustomGroup} disabled={saving}>
          {saving ? 'Saving...' : 'Create & Notify'}
          <Send className="w-4 h-4 ml-2" />
        </Button>
        {customGroups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {customGroups.map((g) => (
              <Badge key={g} variant="secondary" className="px-3 py-1">{g}</Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Assign products to custom group */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-900">Assign Product to Custom Group</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            className="border rounded-lg px-3 py-2"
            value={productForGroup}
            onChange={(e) => setProductForGroup(e.target.value)}
          >
            <option value="">Select a product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            className="border rounded-lg px-3 py-2"
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
          >
            <option value="">Select a custom group</option>
            {customGroups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <Button onClick={assignToGroup} disabled={assigning || !productForGroup || !selectedGroup}>
            {assigning ? 'Assigning...' : 'Assign'}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Assigned group is stored in product metadata, so grouping sticks even after reload.
        </p>
      </Card>

      {/* Existing grouped view */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-900">Grouped Products/Services</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-slate-600">Group by:</span>
          {[
            { key: 'custom', label: 'Custom/Category' },
            { key: 'head', label: 'Head Category' },
            { key: 'sub', label: 'Sub Category' },
            { key: 'micro', label: 'Micro Category' },
            { key: 'category', label: 'Text Category' },
          ].map((opt) => (
            <Button
              key={opt.key}
              variant={groupMode === opt.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setGroupMode(opt.key)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        {Object.keys(grouped).length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <AlertCircle className="w-4 h-4" /> No products yet.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([groupName, list]) => (
              <div key={groupName} className="border rounded-lg p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-slate-700" />
                    <h3 className="font-semibold text-slate-900">{groupName}</h3>
                  </div>
                  <Badge variant="outline" className="text-xs">{list.length} item(s)</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {list.map((p) => (
                    <div key={p.id} className="border rounded-lg px-3 py-2 bg-slate-50">
                      <div className="font-semibold text-slate-900 text-sm line-clamp-1">{p.name}</div>
                      <div className="text-xs text-slate-600 flex items-center gap-1 mt-1">
                        <span className="uppercase text-[10px] px-1.5 py-0.5 bg-slate-200 rounded">{p.status}</span>
                        {p.metadata?.custom_group && (
                          <span className="text-emerald-700 text-[11px]">Custom: {p.metadata.custom_group}</span>
                        )}
                        {p.category && groupMode !== 'category' && (
                          <span className="text-blue-700 text-[11px]">Cat: {p.category}</span>
                        )}
                        {p.head_category_name && groupMode !== 'head' && (
                          <span className="text-purple-700 text-[11px]">Head: {p.head_category_name}</span>
                        )}
                        {p.sub_category_name && groupMode !== 'sub' && (
                          <span className="text-orange-700 text-[11px]">Sub: {p.sub_category_name}</span>
                        )}
                        {p.micro_category_name && groupMode !== 'micro' && (
                          <span className="text-rose-700 text-[11px]">Micro: {p.micro_category_name}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Collections;
