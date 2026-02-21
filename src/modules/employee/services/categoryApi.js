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

const isMissingColumnError = (error) => {
  if (!error) return false;
  const message = String(error.message || '');
  return (
    error.code === '42703' ||
    /column .* does not exist/i.test(message) ||
    /could not find the ['"].*['"] column .* schema cache/i.test(message)
  );
};

const normalizeImageValue = (value) => {
  const url = String(value || '').trim();
  return url || null;
};

const normalizeImageListValue = (value) => {
  const collected = [];
  const append = (entry) => {
    if (entry == null) return;

    if (typeof entry === 'string') {
      const clean = normalizeImageValue(entry);
      if (clean) collected.push(clean);
      return;
    }

    if (Array.isArray(entry)) {
      entry.forEach(append);
      return;
    }

    if (typeof entry === 'object') {
      const url = normalizeImageValue(entry.url || entry.image_url || entry.src || '');
      if (url) collected.push(url);
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
  return collected.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
};

const ensureFileList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [value];
};

const normalizeCategoryImages = (row, maxImages = 1) => {
  if (!row || typeof row !== 'object') return row;
  const mergedUrls = [
    ...normalizeImageListValue(row.image_urls),
    ...normalizeImageListValue(row.images),
    ...normalizeImageListValue(row.image_url),
    ...normalizeImageListValue(row.image),
  ];

  const seen = new Set();
  const urls = mergedUrls
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, maxImages);

  return {
    ...row,
    image_urls: urls,
    image_url: urls[0] || null,
  };
};

const normalizeSubCategoryImage = (row) => {
  return normalizeCategoryImages(row, 1);
};

const normalizeMicroCategoryImage = (row) => normalizeCategoryImages(row, 2);

const isRecoverableImageWriteError = (error) => {
  if (!error) return false;
  if (isMissingColumnError(error)) return true;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('image_url') ||
    message.includes('image_urls') ||
    message.includes('column images') ||
    message.includes('column "images"') ||
    (message.includes('images') && message.includes('does not exist')) ||
    (message.includes('invalid input syntax') && message.includes('image'))
  );
};

const uniquePayloads = (payloads) => {
  const seen = new Set();
  return payloads.filter((payload) => {
    const key = JSON.stringify(payload);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildMicroImageValues = async (categoryData = {}) => {
  const requestedImageUrls = normalizeImageListValue(categoryData.image_urls);
  const fallbackImageUrl = normalizeImageValue(categoryData.image_url);
  const combinedImageUrls = fallbackImageUrl
    ? [...requestedImageUrls, fallbackImageUrl]
    : requestedImageUrls;

  const keptImageUrls = [...new Set(combinedImageUrls)].slice(0, 2);
  const uploadFiles = [...ensureFileList(categoryData.imageFiles), ...ensureFileList(categoryData.imageFile)];

  if (keptImageUrls.length + uploadFiles.length > 2) {
    throw new Error('You can only upload 2 images');
  }

  const uploadedUrls = [];
  for (const file of uploadFiles) {
    const uploaded = await uploadCategoryImage({ level: 'micro', slug: categoryData.slug, file });
    if (uploaded) uploadedUrls.push(uploaded);
  }

  let finalImageUrls = [...new Set([...keptImageUrls, ...uploadedUrls])].slice(0, 2);

  if (categoryData.removeImage && keptImageUrls.length === 0 && uploadFiles.length === 0) {
    finalImageUrls = [];
  }

  return {
    imageUrls: finalImageUrls,
    primaryImageUrl: finalImageUrls[0] || null,
  };
};

const serializeImageUrlsForSingleColumn = (value) => {
  const urls = normalizeImageListValue(value).slice(0, 2);
  if (!urls.length) return null;
  if (urls.length === 1) return urls[0];
  return JSON.stringify(urls);
};

const buildMicroPayloadCandidates = ({ basePayload, primaryImageUrl, imageUrls }) =>
  (() => {
    const normalizedUrls = normalizeImageListValue(imageUrls).slice(0, 2);
    const serializedUrls = serializeImageUrlsForSingleColumn(normalizedUrls);
    return uniquePayloads([
      { ...basePayload, image_url: primaryImageUrl, images: normalizedUrls },
      { ...basePayload, image_url: primaryImageUrl, image_urls: normalizedUrls },
      { ...basePayload, image_url: primaryImageUrl, image: serializedUrls },
      { ...basePayload, image_url: serializedUrls },
      { ...basePayload, image: serializedUrls },
      { ...basePayload, image_url: primaryImageUrl },
    ]);
  })();

const buildSingleImagePayloadCandidates = ({ basePayload, imageUrl }) =>
  uniquePayloads([
    { ...basePayload, image_url: imageUrl, image: imageUrl },
    { ...basePayload, image_url: imageUrl },
    { ...basePayload, image: imageUrl },
  ]);

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

const updateCategoryViaServer = async ({ level, id, payload }) => {
  const response = await fetchWithCsrf(apiUrl('/api/employee/category-update'), {
    method: 'POST',
    body: JSON.stringify({
      level,
      id,
      payload,
    }),
  });

  let body = null;
  try {
    body = await response.json();
  } catch (_) {
    body = null;
  }

  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Category update failed (${response.status})`);
  }

  return body;
};

// HEAD CATEGORIES
export const headCategoryApi = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('head_categories')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data || []).map((row) => normalizeCategoryImages(row, 1));
  },

  getActive: async () => {
    const { data, error } = await supabase
      .from('head_categories')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data || []).map((row) => normalizeCategoryImages(row, 1));
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
    return (data || []).map(normalizeSubCategoryImage);
  },

  getActiveByHeadCategory: async (headCategoryId) => {
    const { data, error } = await supabase
      .from('sub_categories')
      .select('*')
      .eq('head_category_id', headCategoryId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return (data || []).map(normalizeSubCategoryImage);
  },

  create: async (categoryData, headCategoryId) => {
    const { name, slug, description, is_active, image_url, imageFile, removeImage } = categoryData;

    let finalImageUrl = (image_url || '').trim() || null;
    if (imageFile) {
      finalImageUrl = await uploadCategoryImage({ level: 'sub', slug, file: imageFile });
    }
    if (removeImage) finalImageUrl = null;

    const basePayload = {
      head_category_id: headCategoryId,
      name: name.trim(),
      slug: slug.trim(),
      description: description?.trim() || null,
      is_active: is_active !== false
    };

    const candidatePayloads = buildSingleImagePayloadCandidates({
      basePayload,
      imageUrl: finalImageUrl,
    });

    let recoverableError = null;
    for (const payload of candidatePayloads) {
      const response = await supabase
        .from('sub_categories')
        .insert([payload])
        .select()
        .single();

      if (!response.error) {
        return normalizeSubCategoryImage(response.data);
      }

      if (isRecoverableImageWriteError(response.error)) {
        recoverableError = response.error;
        continue;
      }

      throw response.error;
    }

    if (recoverableError) throw recoverableError;
    throw new Error('Unable to create sub category');
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

    const basePayload = {
      name: name.trim(),
      slug: slug.trim(),
      description: description?.trim() || null,
      is_active: is_active !== false
    };

    const candidatePayloads = buildSingleImagePayloadCandidates({
      basePayload,
      imageUrl: finalImageUrl,
    });

    let recoverableError = null;
    for (const payload of candidatePayloads) {
      const response = await supabase
        .from('sub_categories')
        .update(payload)
        .eq('id', categoryId)
        .select('id')
        .maybeSingle();

      if (!response.error) {
        if (response.data?.id) return { id: categoryId };
        await updateCategoryViaServer({
          level: 'sub',
          id: categoryId,
          payload,
        });
        return { id: categoryId };
      }

      if (response.error.code === '42501') {
        await updateCategoryViaServer({
          level: 'sub',
          id: categoryId,
          payload,
        });
        return { id: categoryId };
      }

      if (isRecoverableImageWriteError(response.error)) {
        recoverableError = response.error;
        continue;
      }

      throw response.error;
    }

    const fallbackPayload = candidatePayloads[candidatePayloads.length - 1] || basePayload;
    try {
      await updateCategoryViaServer({
        level: 'sub',
        id: categoryId,
        payload: fallbackPayload,
      });
      return { id: categoryId };
    } catch (_) {
      if (recoverableError) throw recoverableError;
      throw new Error('Unable to update sub category');
    }
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
    return (data || []).map(normalizeMicroCategoryImage);
  },

  getActiveBySubCategory: async (subCategoryId) => {
    const { data, error } = await supabase
      .from('micro_categories')
      .select('*')
      .eq('sub_category_id', subCategoryId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return (data || []).map(normalizeMicroCategoryImage);
  },

  create: async (categoryData, subCategoryId) => {
    const { name, slug, is_active } = categoryData;
    const { imageUrls, primaryImageUrl } = await buildMicroImageValues(categoryData);

    const basePayload = {
      sub_category_id: subCategoryId,
      name: name.trim(),
      slug: slug.trim(),
      is_active: is_active !== false,
    };

    const candidatePayloads = buildMicroPayloadCandidates({
      basePayload,
      primaryImageUrl,
      imageUrls,
    });

    let recoverableError = null;
    for (const payload of candidatePayloads) {
      const response = await supabase
        .from('micro_categories')
        .insert([payload])
        .select()
        .single();

      if (!response.error) {
        return normalizeMicroCategoryImage(response.data);
      }

      if (isRecoverableImageWriteError(response.error)) {
        recoverableError = response.error;
        continue;
      }

      throw response.error;
    }

    if (recoverableError) throw recoverableError;
    throw new Error('Unable to create micro category');
  },

  update: async (id, categoryData) => {
    const { name, slug, is_active } = categoryData;
    const categoryId = String(id || '').trim();

    await ensureRowExists('micro_categories', categoryId, 'Micro category not found. Please refresh and try again.');

    const { imageUrls, primaryImageUrl } = await buildMicroImageValues(categoryData);

    const basePayload = {
      name: name.trim(),
      slug: slug.trim(),
      is_active: is_active !== false,
    };

    const candidatePayloads = buildMicroPayloadCandidates({
      basePayload,
      primaryImageUrl,
      imageUrls,
    });

    let recoverableError = null;
    for (const payload of candidatePayloads) {
      const response = await supabase
        .from('micro_categories')
        .update(payload)
        .eq('id', categoryId)
        .select('id')
        .maybeSingle();

      if (!response.error) {
        if (response.data?.id) return { id: categoryId };
        await updateCategoryViaServer({
          level: 'micro',
          id: categoryId,
          payload,
        });
        return { id: categoryId };
      }

      if (response.error.code === '42501') {
        await updateCategoryViaServer({
          level: 'micro',
          id: categoryId,
          payload,
        });
        return { id: categoryId };
      }

      if (isRecoverableImageWriteError(response.error)) {
        recoverableError = response.error;
        continue;
      }

      throw response.error;
    }

    const fallbackPayload = candidatePayloads[candidatePayloads.length - 1] || basePayload;
    try {
      await updateCategoryViaServer({
        level: 'micro',
        id: categoryId,
        payload: fallbackPayload,
      });
      return { id: categoryId };
    } catch (_) {
      if (recoverableError) throw recoverableError;
      throw new Error('Unable to update micro category');
    }
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
