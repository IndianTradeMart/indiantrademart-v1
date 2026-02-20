import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

// NOTE:
// In Supabase/PostgREST, `.single()` throws:
// "Cannot coerce the result to a single JSON object" when the query returns 0 rows.
// This usually happens when:
// 1) the filter doesn't match any row (wrong/undefined id), OR
// 2) RLS blocks UPDATE/DELETE (so 0 rows are affected).
//
// To avoid false "Success" and to show a clear message, we:
// - avoid `.single()` for UPDATE/DELETE
// - request returning rows with `.select()` and verify at least 1 row was affected

const ensureRowExists = async (table, id, notFoundMessage) => {
  const categoryId = String(id || '').trim();
  if (!categoryId) throw new Error(notFoundMessage);

  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', categoryId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error(notFoundMessage);
};

// --- CATEGORY IMAGE UPLOAD ---
const CATEGORY_IMAGE_MIN_BYTES = 100 * 1024; // 100KB
const CATEGORY_IMAGE_MAX_BYTES = 800 * 1024; // 800KB

const safeSlug = (v) =>
  String(v || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

const uploadCategoryImage = async ({ level, slug, file }) => {
  if (!file) return null;

  const fileType = String(file?.type || '').trim().toLowerCase();
  if (!fileType.startsWith('image/')) {
    throw new Error('Only image files are allowed');
  }

  const size = Number(file?.size || 0);
  if (size < CATEGORY_IMAGE_MIN_BYTES) {
    throw new Error(`Image must be at least ${Math.round(CATEGORY_IMAGE_MIN_BYTES / 1024)}KB`);
  }
  if (size > CATEGORY_IMAGE_MAX_BYTES) {
    throw new Error(`Image must be at most ${Math.round(CATEGORY_IMAGE_MAX_BYTES / 1024)}KB`);
  }

  const safe = safeSlug(slug) || 'category';
  const dataUrl = await fileToDataUrl(file);

  const response = await fetchWithCsrf(apiUrl('/api/employee/category-image-upload'), {
    method: 'POST',
    body: JSON.stringify({
      level,
      slug: safe,
      file_name: file.name || 'category-image',
      content_type: fileType,
      data_url: dataUrl,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    const message = payload?.error || `Image upload failed (${response.status})`;
    throw new Error(message);
  }

  const publicUrl = String(payload?.publicUrl || '').trim();
  if (!publicUrl) throw new Error('Image upload succeeded but public URL was not generated.');
  return publicUrl;
};

// HEAD CATEGORIES
export const headCategoryApi = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('head_categories')
      .select('*')
      .order('name');
    if (error) throw error;
    return data;
  },

  getActive: async () => {
    const { data, error } = await supabase
      .from('head_categories')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data;
  },

  create: async (categoryData) => {
    const { name, slug, description, is_active, image_url, imageFile, removeImage } = categoryData;

    let finalImageUrl = (image_url || '').trim() || null;
    if (imageFile) {
      finalImageUrl = await uploadCategoryImage({ level: 'head', slug, file: imageFile });
    }
    if (removeImage) finalImageUrl = null;

    const { data, error } = await supabase
      .from('head_categories')
      .insert([{
        name: name.trim(),
        slug: slug.trim(),
        description: description?.trim() || null,
        image_url: finalImageUrl,
        is_active: is_active !== false
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  update: async (id, categoryData) => {
    const { name, slug, description, is_active, image_url, imageFile, removeImage } = categoryData;
    const categoryId = String(id || '').trim();

    await ensureRowExists('head_categories', categoryId, 'Head category not found. Please refresh and try again.');

    let finalImageUrl = (image_url || '').trim() || null;
    if (imageFile) {
      finalImageUrl = await uploadCategoryImage({ level: 'head', slug, file: imageFile });
    }
    if (removeImage) finalImageUrl = null;

    const { error } = await supabase
      .from('head_categories')
      .update({
        name: name.trim(),
        slug: slug.trim(),
        description: description?.trim() || null,
        image_url: finalImageUrl,
        is_active: is_active !== false
      })
      .eq('id', categoryId);

    if (error) throw error;
    return { id: categoryId };
  },

  delete: async (id) => {
    // Check if has sub categories
    const { data: subCats, error: countError } = await supabase
      .from('sub_categories')
      .select('id', { count: 'exact' })
      .eq('head_category_id', id);

    if (countError) throw countError;

    if (subCats && subCats.length > 0) {
      throw new Error(`Cannot delete. This head category has ${subCats.length} sub-categories.`);
    }

    const { data, error } = await supabase
      .from('head_categories')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Delete failed. No head category was deleted. (Possible RLS/permission issue or wrong id)');
    }
  },

  // Get count of child categories
  getChildCount: async (id) => {
    const { count, error } = await supabase
      .from('sub_categories')
      .select('id', { count: 'exact' })
      .eq('head_category_id', id);

    if (error) throw error;
    return count || 0;
  }
};

// SUB CATEGORIES
export const subCategoryApi = {
  getByHeadCategory: async (headCategoryId) => {
    const { data, error } = await supabase
      .from('sub_categories')
      .select('*')
      .eq('head_category_id', headCategoryId)
      .order('name');

    if (error) throw error;
    return data;
  },

  getActiveByHeadCategory: async (headCategoryId) => {
    const { data, error } = await supabase
      .from('sub_categories')
      .select('*')
      .eq('head_category_id', headCategoryId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data;
  },

  create: async (categoryData, headCategoryId) => {
    const { name, slug, description, is_active, image_url, imageFile, removeImage } = categoryData;

    let finalImageUrl = (image_url || '').trim() || null;
    if (imageFile) {
      finalImageUrl = await uploadCategoryImage({ level: 'sub', slug, file: imageFile });
    }
    if (removeImage) finalImageUrl = null;

    const { data, error } = await supabase
      .from('sub_categories')
      .insert([{
        head_category_id: headCategoryId,
        name: name.trim(),
        slug: slug.trim(),
        description: description?.trim() || null,
        image_url: finalImageUrl,
        is_active: is_active !== false
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  update: async (id, categoryData) => {
    const { name, slug, description, is_active, image_url, imageFile, removeImage } = categoryData;
    const categoryId = String(id || '').trim();

    await ensureRowExists('sub_categories', categoryId, 'Sub category not found. Please refresh and try again.');

    let finalImageUrl = (image_url || '').trim() || null;
    if (imageFile) {
      finalImageUrl = await uploadCategoryImage({ level: 'sub', slug, file: imageFile });
    }
    if (removeImage) finalImageUrl = null;

    const { error } = await supabase
      .from('sub_categories')
      .update({
        name: name.trim(),
        slug: slug.trim(),
        description: description?.trim() || null,
        image_url: finalImageUrl,
        is_active: is_active !== false
      })
      .eq('id', categoryId);

    if (error) throw error;
    return { id: categoryId };
  },

  delete: async (id) => {
    // Check if has micro categories
    const { data: microCats, error: countError } = await supabase
      .from('micro_categories')
      .select('id', { count: 'exact' })
      .eq('sub_category_id', id);

    if (countError) throw countError;

    if (microCats && microCats.length > 0) {
      throw new Error(`Cannot delete. This sub-category has ${microCats.length} micro-categories.`);
    }

    const { data, error } = await supabase
      .from('sub_categories')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Delete failed. No sub category was deleted. (Possible RLS/permission issue or wrong id)');
    }
  },

  // Get count of child categories
  getChildCount: async (id) => {
    const { count, error } = await supabase
      .from('micro_categories')
      .select('id', { count: 'exact' })
      .eq('sub_category_id', id);

    if (error) throw error;
    return count || 0;
  }
};

// MICRO CATEGORIES
export const microCategoryApi = {
  getBySubCategory: async (subCategoryId) => {
    const { data, error } = await supabase
      .from('micro_categories')
      .select('*')
      .eq('sub_category_id', subCategoryId)
      .order('name');

    if (error) throw error;
    return data;
  },

  getActiveBySubCategory: async (subCategoryId) => {
    const { data, error } = await supabase
      .from('micro_categories')
      .select('*')
      .eq('sub_category_id', subCategoryId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data;
  },

  create: async (categoryData, subCategoryId) => {
    const { name, slug, is_active, image_url, imageFile, removeImage } = categoryData;

    let finalImageUrl = (image_url || '').trim() || null;
    if (imageFile) {
      finalImageUrl = await uploadCategoryImage({ level: 'micro', slug, file: imageFile });
    }
    if (removeImage) finalImageUrl = null;

    const { data, error } = await supabase
      .from('micro_categories')
      .insert([{
        sub_category_id: subCategoryId,
        name: name.trim(),
        slug: slug.trim(),
        image_url: finalImageUrl,
        is_active: is_active !== false
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  update: async (id, categoryData) => {
    const { name, slug, is_active, image_url, imageFile, removeImage } = categoryData;
    const categoryId = String(id || '').trim();

    await ensureRowExists('micro_categories', categoryId, 'Micro category not found. Please refresh and try again.');

    let finalImageUrl = (image_url || '').trim() || null;
    if (imageFile) {
      finalImageUrl = await uploadCategoryImage({ level: 'micro', slug, file: imageFile });
    }
    if (removeImage) finalImageUrl = null;

    const { error } = await supabase
      .from('micro_categories')
      .update({
        name: name.trim(),
        slug: slug.trim(),
        image_url: finalImageUrl,
        is_active: is_active !== false
      })
      .eq('id', categoryId);

    if (error) throw error;
    return { id: categoryId };
  },

  delete: async (id) => {
    // If meta exists, it can block deletion due to FK constraint.
    // So delete meta first (safe even if there is no meta row).
    let metaRes = await supabase
      .from('micro_category_meta')
      .delete()
      .eq('micro_categories', id);
    if (metaRes.error && (metaRes.error.code === '42703' || /column .* does not exist/i.test(metaRes.error.message || ''))) {
      metaRes = await supabase
        .from('micro_category_meta')
        .delete()
        .eq('micro_category_id', id);
    }
    if (metaRes.error) throw metaRes.error;

    const { data, error } = await supabase
      .from('micro_categories')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Delete failed. No micro category was deleted. (Possible RLS/permission issue or wrong id)');
    }
  }
};
