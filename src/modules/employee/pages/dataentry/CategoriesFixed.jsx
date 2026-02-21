import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { ChevronRight, ChevronDown, Plus, Edit2, Trash2, Tag, Search, X, Loader2 } from 'lucide-react';
import AddEditCategoryDialog from '@/modules/employee/components/AddEditCategoryDialog';
import DeleteCategoryDialog from '@/modules/employee/components/DeleteCategoryDialog';
import { headCategoryApi, subCategoryApi, microCategoryApi } from '@/modules/employee/services/categoryApi';

const isMissingColumnError = (error) => {
  if (!error) return false;
  return error.code === '42703' || /column .* does not exist/i.test(error.message || '');
};

const toImageUrlList = (value) => {
  const urls = [];
  const append = (entry) => {
    if (entry == null) return;

    if (typeof entry === 'string') {
      const clean = entry.trim();
      if (clean) urls.push(clean);
      return;
    }

    if (Array.isArray(entry)) {
      entry.forEach(append);
      return;
    }

    if (typeof entry === 'object') {
      const candidate = String(entry.url || entry.image_url || entry.src || '').trim();
      if (candidate) urls.push(candidate);
    }
  };

  if (typeof value === 'string') {
    const raw = value.trim();
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        append(parsed);
      } catch (_) {
        append(raw);
      }
    } else {
      append(raw);
    }
  } else {
    append(value);
  }

  const seen = new Set();
  return urls.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
};

const normalizeCategoryImage = (category) => {
  if (!category || typeof category !== 'object') return category;
  const merged = [
    ...toImageUrlList(category.image_urls),
    ...toImageUrlList(category.images),
    ...toImageUrlList(category.image_url),
    ...toImageUrlList(category.image),
  ];
  const seen = new Set();
  const imageUrls = merged.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  return {
    ...category,
    image_urls: imageUrls,
    image_url: imageUrls[0] || '',
  };
};

const CategoriesFixed = () => {
  // State for head categories
  const [headCategories, setHeadCategories] = useState([]);
  const [expandedHeads, setExpandedHeads] = useState({});

  // State for sub categories
  const [subCategories, setSubCategories] = useState({});
  const [expandedSubs, setExpandedSubs] = useState({});

  // State for micro categories
  const [microCategories, setMicroCategories] = useState({});

  // State for micro category meta
  const [microMeta, setMicroMeta] = useState({});

  // Meta dialog
  const [selectedMicroCategory, setSelectedMicroCategory] = useState(null);
  const [showMetaDialog, setShowMetaDialog] = useState(false);
  const [metaData, setMetaData] = useState({ meta_tags: '', description: '', keywords: '' });

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ heads: [], subs: [], micros: [] });
  const [searchLoading, setSearchLoading] = useState(false);

  const [loading, setLoading] = useState(false);

  // CRUD dialogs
  const [showAddEditDialog, setShowAddEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [dialogLevel, setDialogLevel] = useState(null); // 'head', 'sub', 'micro'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [parentCategory, setParentCategory] = useState(null); // for sub/micro
  const [childCount, setChildCount] = useState(0);
  const [savingCategory, setSavingCategory] = useState(false);

  // Refs for scroll (optional but helpful)
  const headRefs = useRef({});
  const subRefs = useRef({});
  const microRefs = useRef({});

  const badgeHead = 'text-[10px] px-2 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200';
  const badgeSub = 'text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200';
  const badgeMicro = 'text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200';

  useEffect(() => {
    fetchHeadCategories();
  }, []);

  // Fetch all head categories
  const fetchHeadCategories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('head_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setHeadCategories((data || []).map(normalizeCategoryImage));
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Fetch sub categories for a head category
  const fetchSubCategories = async (headCategoryId) => {
    try {
      const { data, error } = await supabase
        .from('sub_categories')
        .select('*')
        .eq('head_category_id', headCategoryId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      const normalized = (data || []).map(normalizeCategoryImage);
      setSubCategories((prev) => ({ ...prev, [headCategoryId]: normalized }));
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // Fetch micro categories for a sub category
  const fetchMicroCategories = async (subCategoryId) => {
    try {
      const { data, error } = await supabase
        .from('micro_categories')
        .select('*')
        .eq('sub_category_id', subCategoryId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      const normalized = (data || []).map(normalizeCategoryImage);
      setMicroCategories((prev) => ({ ...prev, [subCategoryId]: normalized }));

      if (normalized.length > 0) {
        normalized.forEach((micro) => {
          fetchMicroMeta(micro.id);
        });
      }
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // Fetch meta for micro category
  const fetchMicroMeta = async (microCategoryId) => {
    try {
      let res = await supabase
        .from('micro_category_meta')
        .select('*')
        .eq('micro_categories', microCategoryId)
        .maybeSingle();

      if (res.error && isMissingColumnError(res.error)) {
        res = await supabase
          .from('micro_category_meta')
          .select('*')
          .eq('micro_category_id', microCategoryId)
          .maybeSingle();
      }

      if (res.error && res.error.code !== 'PGRST116') {
        console.error('Error fetching meta:', res.error);
        return;
      }
      setMicroMeta((prev) => ({ ...prev, [microCategoryId]: res.data || null }));
    } catch (error) {
      console.error('Error fetching meta:', error);
    }
  };

  // ✅ Better Search: Direct DB search (Head/Sub/Micro) with debounce
  useEffect(() => {
    const q = (searchQuery || '').trim();
    const t = setTimeout(() => {
      if (!q) {
        setSearchResults({ heads: [], subs: [], micros: [] });
        setSearchLoading(false);
        return;
      }
      runSearch(q);
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const runSearch = async (q) => {
    try {
      setSearchLoading(true);

      const pattern = `%${q}%`;

      const headPromise = supabase
        .from('head_categories')
        .select('id,name,slug')
        .eq('is_active', true)
        .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
        .order('name')
        .limit(25);

      const subPromise = supabase
        .from('sub_categories')
        .select('id,name,slug,head_category_id')
        .eq('is_active', true)
        .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
        .order('name')
        .limit(25);

      const microPromise = supabase
        .from('micro_categories')
        .select('id,name,slug,sub_category_id')
        .eq('is_active', true)
        .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
        .order('name')
        .limit(25);

      const [{ data: headData, error: headErr }, { data: subData, error: subErr }, { data: microData, error: microErr }] =
        await Promise.all([headPromise, subPromise, microPromise]);

      if (headErr) throw headErr;
      if (subErr) throw subErr;
      if (microErr) throw microErr;

      const heads = headData || [];
      const subsRaw = subData || [];
      const microsRaw = microData || [];

      // Load parent head names for subs
      const headIdsForSubs = [...new Set(subsRaw.map((s) => s.head_category_id).filter(Boolean))];
      const { data: subsHeads, error: subsHeadsErr } = headIdsForSubs.length
        ? await supabase.from('head_categories').select('id,name,slug').in('id', headIdsForSubs)
        : { data: [], error: null };
      if (subsHeadsErr) throw subsHeadsErr;

      const headMap = new Map();
      (heads || []).forEach((h) => headMap.set(h.id, h));
      (subsHeads || []).forEach((h) => headMap.set(h.id, h));

      const subs = subsRaw.map((s) => ({
        ...s,
        headCategoryId: s.head_category_id,
        headName: headMap.get(s.head_category_id)?.name || 'Head',
      }));

      // Load parent sub + head for micros
      const subIdsForMicros = [...new Set(microsRaw.map((m) => m.sub_category_id).filter(Boolean))];
      const { data: microsSubs, error: microsSubsErr } = subIdsForMicros.length
        ? await supabase.from('sub_categories').select('id,name,slug,head_category_id').in('id', subIdsForMicros)
        : { data: [], error: null };
      if (microsSubsErr) throw microsSubsErr;

      const subMap = new Map();
      (microsSubs || []).forEach((s) => subMap.set(s.id, s));

      const headIdsForMicros = [
        ...new Set((microsSubs || []).map((s) => s.head_category_id).filter(Boolean)),
      ].filter((id) => !headMap.has(id));

      const { data: microsHeads, error: microsHeadsErr } = headIdsForMicros.length
        ? await supabase.from('head_categories').select('id,name,slug').in('id', headIdsForMicros)
        : { data: [], error: null };
      if (microsHeadsErr) throw microsHeadsErr;

      (microsHeads || []).forEach((h) => headMap.set(h.id, h));

      const micros = microsRaw.map((m) => {
        const parentSub = subMap.get(m.sub_category_id);
        const headId = parentSub?.head_category_id || null;
        return {
          ...m,
          subCategoryId: m.sub_category_id,
          subName: parentSub?.name || 'Sub',
          headCategoryId: headId,
          headName: headId ? headMap.get(headId)?.name || 'Head' : 'Head',
        };
      });

      setSearchResults({ heads, subs, micros });
    } catch (error) {
      toast({ title: 'Search Error', description: error.message, variant: 'destructive' });
      setSearchResults({ heads: [], subs: [], micros: [] });
    } finally {
      setSearchLoading(false);
    }
  };

  // Toggle head category expansion
  const toggleHeadExpansion = (headId) => {
    if (expandedHeads[headId]) {
      setExpandedHeads((prev) => ({ ...prev, [headId]: false }));
    } else {
      setExpandedHeads((prev) => ({ ...prev, [headId]: true }));
      fetchSubCategories(headId);
    }
  };

  // Toggle sub category expansion
  const toggleSubExpansion = (subId) => {
    if (expandedSubs[subId]) {
      setExpandedSubs((prev) => ({ ...prev, [subId]: false }));
    } else {
      setExpandedSubs((prev) => ({ ...prev, [subId]: true }));
      fetchMicroCategories(subId);
    }
  };

  // Ensure expanded + loaded (for search navigation)
  const ensureHeadOpen = async (headId) => {
    setExpandedHeads((prev) => ({ ...prev, [headId]: true }));
    if (!subCategories[headId]) {
      await fetchSubCategories(headId);
    }
  };

  const ensureSubOpen = async (subId) => {
    setExpandedSubs((prev) => ({ ...prev, [subId]: true }));
    if (!microCategories[subId]) {
      await fetchMicroCategories(subId);
    }
  };

  // Search navigation
  const navigateToCategory = async (level, category) => {
    try {
      if (level === 'head') {
        await ensureHeadOpen(category.id);
        setTimeout(() => headRefs.current[category.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        return;
      }

      if (level === 'sub') {
        const headId = category.headCategoryId || category.head_category_id;
        if (!headId) return;

        await ensureHeadOpen(headId);
        // Wait a bit for subs to render
        setTimeout(async () => {
          await ensureSubOpen(category.id);
          setTimeout(() => subRefs.current[category.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        }, 250);
        return;
      }

      if (level === 'micro') {
        const headId = category.headCategoryId;
        const subId = category.subCategoryId;

        if (!headId || !subId) return;

        await ensureHeadOpen(headId);
        setTimeout(async () => {
          await ensureSubOpen(subId);
          setTimeout(() => microRefs.current[category.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        }, 300);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Open meta dialog for micro category
  const openMetaDialog = (microCategory) => {
    setSelectedMicroCategory(microCategory);
    const meta = microMeta[microCategory.id];
    setMetaData({
      meta_tags: meta?.meta_tags || '',
      description: meta?.description || '',
      keywords: meta?.keywords || '',
    });
    setShowMetaDialog(true);
  };

  // Save meta tags, keywords and description
  const saveMeta = async () => {
    try {
      const existing = microMeta[selectedMicroCategory.id];
      const payload = {
        meta_tags: metaData.meta_tags,
        keywords: metaData.keywords,
        description: metaData.description,
        updated_at: new Date().toISOString(),
      };
      const insertPayload = {
        meta_tags: metaData.meta_tags,
        keywords: metaData.keywords,
        description: metaData.description,
        created_at: new Date().toISOString(),
      };

      if (existing) {
        let res = await supabase
          .from('micro_category_meta')
          .update(payload)
          .eq('micro_categories', selectedMicroCategory.id);

        if (res.error && isMissingColumnError(res.error)) {
          res = await supabase
            .from('micro_category_meta')
            .update(payload)
            .eq('micro_category_id', selectedMicroCategory.id);
        }

        if (res.error) {
          if (res.error.code === '42501') {
            toast({
              title: 'Permission Denied',
              description: 'RLS policy blocks this operation. Contact admin to fix permissions.',
              variant: 'destructive',
            });
          } else {
            throw res.error;
          }
          return;
        }
      } else {
        let res = await supabase.from('micro_category_meta').insert([
          {
            micro_categories: selectedMicroCategory.id,
            ...insertPayload,
          },
        ]);

        if (res.error && isMissingColumnError(res.error)) {
          res = await supabase.from('micro_category_meta').insert([
            {
              micro_category_id: selectedMicroCategory.id,
              ...insertPayload,
            },
          ]);
        }

        if (res.error) {
          if (res.error.code === '42501') {
            toast({
              title: 'Permission Denied',
              description: 'RLS policy blocks this operation. Contact admin to fix permissions.',
              variant: 'destructive',
            });
          } else {
            throw res.error;
          }
          return;
        }
      }

      toast({ title: 'Success', description: 'Meta information saved' });
      setShowMetaDialog(false);
      fetchMicroMeta(selectedMicroCategory.id);
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // CRUD Handlers
  const openAddDialog = (level, parentId = null, parentName = null) => {
    setDialogLevel(level);
    setSelectedCategory(null);
    setParentCategory(parentId ? { id: parentId, name: parentName } : null);
    setShowAddEditDialog(true);
  };

  const openEditDialog = async (level, category, parentId = null) => {
    setDialogLevel(level);
    setSelectedCategory(normalizeCategoryImage(category));
    setParentCategory(parentId ? { id: parentId } : null);
    setShowAddEditDialog(true);
  };

  const openDeleteDialog = async (level, category, parentId = null) => {
    setDialogLevel(level);
    setSelectedCategory(category);
    setParentCategory(parentId ? { id: parentId } : null);

    try {
      let count = 0;
      if (level === 'head') count = await headCategoryApi.getChildCount(category.id);
      else if (level === 'sub') count = await subCategoryApi.getChildCount(category.id);
      setChildCount(count);
    } catch (error) {
      console.error('Error getting child count:', error);
      setChildCount(0);
    }

    setShowDeleteDialog(true);
  };

  const handleSaveCategory = async (formData) => {
    if (savingCategory) return;
    setSavingCategory(true);

    try {
      if (dialogLevel === 'head') {
        if (formData.id) {
          await headCategoryApi.update(formData.id, formData);
          toast({ title: 'Success', description: 'Head category updated' });
        } else {
          await headCategoryApi.create(formData);
          toast({ title: 'Success', description: 'Head category created' });
        }
        await fetchHeadCategories();
      }

      if (dialogLevel === 'sub') {
        if (!formData.parentId) throw new Error('Head category required for sub category');
        if (formData.id) {
          await subCategoryApi.update(formData.id, formData);
          toast({ title: 'Success', description: 'Sub category updated' });
        } else {
          await subCategoryApi.create(formData, formData.parentId);
          toast({ title: 'Success', description: 'Sub category created' });
        }
        await fetchSubCategories(formData.parentId);
      }

      if (dialogLevel === 'micro') {
        if (!formData.parentId) throw new Error('Sub category required for micro category');
        if (formData.id) {
          await microCategoryApi.update(formData.id, formData);
          toast({ title: 'Success', description: 'Micro category updated' });
        } else {
          await microCategoryApi.create(formData, formData.parentId);
          toast({ title: 'Success', description: 'Micro category created' });
        }
        await fetchMicroCategories(formData.parentId);
      }
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      throw error;
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async () => {
    try {
      if (dialogLevel === 'head') {
        await headCategoryApi.delete(selectedCategory.id);
        toast({ title: 'Success', description: 'Head category deleted' });
        await fetchHeadCategories();
      }

      if (dialogLevel === 'sub') {
        await subCategoryApi.delete(selectedCategory.id);
        toast({ title: 'Success', description: 'Sub category deleted' });
        await fetchSubCategories(parentCategory.id);
      }

      if (dialogLevel === 'micro') {
        await microCategoryApi.delete(selectedCategory.id);
        toast({ title: 'Success', description: 'Micro category deleted' });
        await fetchMicroCategories(parentCategory.id);
      }

      setShowDeleteDialog(false);
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const hasAnyResults = useMemo(() => {
    return (
      (searchResults.heads?.length || 0) +
        (searchResults.subs?.length || 0) +
        (searchResults.micros?.length || 0) >
      0
    );
  }, [searchResults]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Category Management</h1>
          <p className="text-sm text-gray-500">
            Click on categories to expand and manage subcategories and meta information
          </p>
        </div>

        <Button onClick={() => openAddDialog('head')} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Head Category
        </Button>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search head, sub, or micro categories..."
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              onClick={() => setSearchQuery('')}
              type="button"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Results */}
        {searchQuery.trim() ? (
          <div className="mt-2 bg-white border rounded-lg shadow-sm p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs font-semibold text-gray-500">Search Results</div>
              {searchLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...
                </div>
              )}
            </div>

            {!searchLoading && !hasAnyResults ? (
              <div className="text-sm text-gray-500 py-3">No results found.</div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-auto">
                {searchResults.heads.map((head) => (
                  <button
                    key={head.id}
                    className="w-full text-left px-2 py-1 rounded hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => navigateToCategory('head', head)}
                    type="button"
                  >
                    <span className={badgeHead}>HEAD</span>
                    <span className="text-sm">{head.name}</span>
                  </button>
                ))}

                {searchResults.subs.map((sub) => (
                  <button
                    key={sub.id}
                    className="w-full text-left px-2 py-1 rounded hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => navigateToCategory('sub', sub)}
                    type="button"
                  >
                    <span className={badgeSub}>SUB</span>
                    <span className="text-sm">{sub.name}</span>
                    <span className="text-xs text-gray-500">— in {sub.headName}</span>
                  </button>
                ))}

                {searchResults.micros.map((micro) => (
                  <button
                    key={micro.id}
                    className="w-full text-left px-2 py-1 rounded hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => navigateToCategory('micro', micro)}
                    type="button"
                  >
                    <span className={badgeMicro}>MICRO</span>
                    <span className="text-sm">{micro.name}</span>
                    <span className="text-xs text-gray-500">
                      — {micro.subName} / {micro.headName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="bg-white border rounded-lg">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading categories...</div>
        ) : (
          headCategories.map((headCategory) => (
            <div key={headCategory.id} className="border-b last:border-b-0" ref={(el) => (headRefs.current[headCategory.id] = el)}>
              {/* HEAD CATEGORY */}
              <div
                className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between group"
                onClick={() => toggleHeadExpansion(headCategory.id)}
              >
                <div className="flex items-center gap-3">
                  {expandedHeads[headCategory.id] ? (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-500" />
                  )}

                  <span className={badgeHead}>HEAD</span>

                  <div>
                    <div className="font-semibold text-lg">{headCategory.name}</div>
                    <div className="text-xs text-gray-500">{headCategory.slug}</div>
                  </div>
                </div>

                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditDialog('head', headCategory);
                    }}
                    className="gap-1"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteDialog('head', headCategory);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* SUB CATEGORIES */}
              {expandedHeads[headCategory.id] && (
                <div className="bg-gray-50 border-t">
                  {/* Always show Add Sub Category */}
                  <div className="flex items-center justify-between gap-3 ml-8 px-4 py-2 bg-gray-50 border-b">
                    <div className="text-xs text-gray-500">
                      Sub-categories for <span className="font-medium text-gray-700">{headCategory.name}</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddDialog('sub', headCategory.id, headCategory.name);
                      }}
                      className="gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add Sub Category
                    </Button>
                  </div>

                  {subCategories[headCategory.id]?.map((subCategory) => (
                    <div key={subCategory.id} className="border-b" ref={(el) => (subRefs.current[subCategory.id] = el)}>
                      <div className="p-4 ml-8 hover:bg-white flex items-center gap-3 justify-between group">
                        <div
                          className="flex-1 cursor-pointer flex items-center gap-3"
                          onClick={() => toggleSubExpansion(subCategory.id)}
                        >
                          {expandedSubs[subCategory.id] ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}

                          <span className={badgeSub}>SUB</span>

                          <div>
                            <div className="font-medium">{subCategory.name}</div>
                            <div className="text-xs text-gray-500">{subCategory.slug}</div>
                          </div>
                        </div>

                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog('sub', subCategory, headCategory.id)}
                            className="gap-1"
                          >
                            <Edit2 className="w-4 h-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => openDeleteDialog('sub', subCategory, headCategory.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* ADD MICRO BUTTON */}
                      <div className="flex gap-2 ml-16 px-4 py-2 bg-gray-50 border-b">
                        <Button
                          size="sm"
                          onClick={() => openAddDialog('micro', subCategory.id, subCategory.name)}
                          className="gap-1 ml-auto"
                        >
                          <Plus className="w-3 h-3" />
                          Add Micro Category
                        </Button>
                      </div>

                      {/* MICRO CATEGORIES */}
                      {expandedSubs[subCategory.id] && (
                        <div className="bg-white border-t">
                          {microCategories[subCategory.id]?.map((microCategory) => (
                            <div
                              key={microCategory.id}
                              ref={(el) => (microRefs.current[microCategory.id] = el)}
                              className="p-4 ml-16 border-b hover:bg-blue-50 flex items-center justify-between gap-3 group"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={badgeMicro}>MICRO</span>
                                  <div className="font-medium text-sm">{microCategory.name}</div>
                                </div>
                                <div className="text-xs text-gray-500">{microCategory.slug}</div>
                                {microMeta[microCategory.id] && (
                                  <div className="text-xs text-green-600 mt-1">✓ Meta tags configured</div>
                                )}
                              </div>

                              <div className="flex gap-2">
                                <Dialog
                                  open={showMetaDialog && selectedMicroCategory?.id === microCategory.id}
                                  onOpenChange={setShowMetaDialog}
                                >
                                  <DialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openMetaDialog(microCategory)}
                                      className="gap-1"
                                    >
                                      <Tag className="w-4 h-4" />
                                      Meta
                                    </Button>
                                  </DialogTrigger>

                                  <DialogContent className="max-w-2xl">
                                    <DialogHeader>
                                      <DialogTitle>Meta Tags & Description - {microCategory.name}</DialogTitle>
                                    </DialogHeader>

                                    <div className="space-y-4 py-4">
                                      <div className="bg-blue-50 border border-blue-200 rounded p-3">
                                        <p className="text-sm text-blue-900">
                                          <strong>ℹ️ Note:</strong> State and city names will be automatically appended to
                                          these meta tags and description on the website.
                                        </p>
                                        <p className="text-xs text-blue-700 mt-2">
                                          Example: "Mobile Phones" → "Mobile Phones in Delhi, Delhi" on website
                                        </p>
                                      </div>

                                      <div>
                                        <Label>Base Meta Tags (comma separated)</Label>
                                        <Input
                                          value={metaData.meta_tags}
                                          onChange={(e) => setMetaData((prev) => ({ ...prev, meta_tags: e.target.value }))}
                                          placeholder="e.g. electronics, phones, mobile"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                          Only the base keywords - location will be added automatically
                                        </p>
                                      </div>

                                      <div>
                                        <Label>Keywords (comma separated)</Label>
                                        <Input
                                          value={metaData.keywords}
                                          onChange={(e) => setMetaData((prev) => ({ ...prev, keywords: e.target.value }))}
                                          placeholder="e.g. buy, sell, cheap, best quality, wholesale"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                          Add search-related keywords for SEO optimization
                                        </p>
                                      </div>

                                      <div>
                                        <Label>Base Description</Label>
                                        <Textarea
                                          value={metaData.description}
                                          onChange={(e) =>
                                            setMetaData((prev) => ({ ...prev, description: e.target.value }))
                                          }
                                          placeholder="e.g. High-quality mobile phones with latest features and competitive prices"
                                          rows={4}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                          Keep under 150 characters - " in [City], [State]" will be appended
                                        </p>
                                      </div>

                                      <Button onClick={saveMeta} className="w-full">
                                        Save Meta Information
                                      </Button>
                                    </div>
                                  </DialogContent>
                                </Dialog>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditDialog('micro', microCategory, subCategory.id)}
                                  className="gap-1"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => openDeleteDialog('micro', microCategory, subCategory.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )) || <div className="p-4 ml-16 text-sm text-gray-500">No micro categories</div>}
                        </div>
                      )}
                    </div>
                  )) || <div className="p-4 ml-8 text-sm text-gray-500">No sub categories</div>}
                </div>
              )}
            </div>
          ))
        )}

        {headCategories.length === 0 && (
          <div className="p-8 text-center text-gray-500">No categories found. Create head categories first.</div>
        )}
      </div>

      {/* ADD/EDIT DIALOG */}
      <AddEditCategoryDialog
        isOpen={showAddEditDialog}
        onClose={() => setShowAddEditDialog(false)}
        category={selectedCategory}
        level={dialogLevel}
        parentId={parentCategory?.id}
        onSave={handleSaveCategory}
      />

      {/* DELETE DIALOG */}
      <DeleteCategoryDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        category={selectedCategory}
        level={dialogLevel}
        childCount={childCount}
        onConfirm={handleDeleteCategory}
      />
    </div>
  );
};

export default CategoriesFixed;
