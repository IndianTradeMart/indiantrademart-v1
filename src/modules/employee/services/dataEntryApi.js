
import { supabase } from '@/lib/customSupabaseClient';
import { fetchWithCsrf } from '@/lib/fetchWithCsrf';
import { apiUrl } from '@/lib/apiBase';

const getUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
};

// Helper to get authenticated employee context
const getEmployeeContext = async () => {
    const user = await getUser();
    // Verify role in employees table
    let { data: emp } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(); // Use maybeSingle to avoid 406 errors if row missing

    if (!emp && user?.email) {
        const { data: empByEmail } = await supabase
            .from('employees')
            .select('*')
            .ilike('email', user.email)
            .maybeSingle();
        emp = empByEmail || null;
        if (emp && !emp.user_id) {
            try {
                await supabase.from('employees').update({ user_id: user.id }).eq('id', emp.id);
                emp = { ...emp, user_id: user.id };
            } catch (_) {
                // ignore update failures; continue with fallback
            }
        }
    }
    
    // Fallback: if direct query fails, try server-side resolver (bypasses RLS)
    if (!emp) {
        try {
            const res = await fetchWithCsrf(apiUrl('/api/employee/me'));
            if (res.ok) {
                const data = await res.json();
                if (data?.employee) return data.employee;
            }
        } catch (_) {
            // ignore
        }
    }

    // Fallback: If not in employees, check admin_users for dev/testing
    if (!emp) {
        const { data: admin } = await supabase.from('admin_users').select('*').eq('id', user.id).maybeSingle();
        if (admin) return { ...admin, user_id: admin.id };
        // If still nothing, just return user object assuming RLS will handle permission
        return { user_id: user.id, role: 'UNKNOWN' };
    }
    return emp;
};

// Helper for ID Generation
const generateRandomString = (length, chars) => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const buildVendorFilter = ({ userId, employeeId }) => {
  const parts = [];
  if (userId) {
    parts.push(
      `assigned_to.eq.${userId}`,
      `created_by_user_id.eq.${userId}`,
      `user_id.eq.${userId}`
    );
  }
  if (employeeId && employeeId !== userId) {
    parts.push(`assigned_to.eq.${employeeId}`);
  }
  return parts.join(',');
};

const KYC_PENDING_STATUSES = ['PENDING', 'pending', 'SUBMITTED', 'submitted'];
const KYC_APPROVED_STATUSES = ['APPROVED', 'approved', 'VERIFIED', 'verified'];

const safeApiJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const isMissingColumnError = (error, columnName = '') => {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  const column = String(columnName || '').toLowerCase();
  const hasColumnMatch = !column || message.includes(column);

  if (!hasColumnMatch) return false;

  return (
    error.code === '42703' ||
    (message.includes('column') && message.includes('does not exist')) ||
    (message.includes('could not find') && message.includes('schema cache'))
  );
};

const buildProductInsertPayloadCandidates = (productData, actorId) => {
  const basePayload = {
    ...productData,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  };

  const candidates = [
    { ...basePayload, created_by: actorId },
    { ...basePayload, created_by_user_id: actorId },
    basePayload,
  ];

  const seen = new Set();
  return candidates.filter((payload) => {
    const key = JSON.stringify(payload);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const insertProductWithCompat = async (productData, actorId) => {
  const payloadCandidates = buildProductInsertPayloadCandidates(productData, actorId);
  let recoverableError = null;

  for (const payload of payloadCandidates) {
    const { data, error } = await supabase
      .from('products')
      .insert([payload])
      .select()
      .single();

    if (!error) return data;

    const creatorColumnMissing =
      isMissingColumnError(error, 'created_by') ||
      isMissingColumnError(error, 'created_by_user_id');

    if (creatorColumnMissing) {
      recoverableError = error;
      continue;
    }

    throw error;
  }

  if (recoverableError) throw recoverableError;
  throw new Error('Unable to save product');
};

const postKycAction = async (vendorId, action, body = {}) => {
  if (!vendorId) throw new Error('Vendor ID is required');
  const response = await fetchWithCsrf(apiUrl(`/api/kyc/vendors/${vendorId}/${action}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const payload = await safeApiJson(response);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.details || payload?.error || payload?.message || `KYC ${action} failed`);
  }
  return payload;
};

export const dataEntryApi = {
  // --- DASHBOARD ---
  getDashboardStats: async (userId) => {
    try {
      const emp = await getEmployeeContext();
      const effectiveUserId = userId || emp?.user_id;
      const filter = buildVendorFilter({ userId: effectiveUserId, employeeId: emp?.id });
      console.log('📊 Dashboard: Fetching stats for userId:', effectiveUserId, 'empId:', emp?.id);
      
      // Count vendors assigned to, created by, or owned by user (checking user_id as well)
      let vendorQuery = supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true });
      if (filter) vendorQuery = vendorQuery.or(filter);
      const { count: totalVendors, error: vendorError } = await vendorQuery;
      
      if (vendorError) console.error('❌ Error counting vendors:', vendorError);
      console.log('✅ Total vendors found:', totalVendors);

      // Get vendor IDs to count products
      let vendorIdQuery = supabase
        .from('vendors')
        .select('id');
      if (filter) vendorIdQuery = vendorIdQuery.or(filter);
      const { data: vendorIds, error: vendorIdError } = await vendorIdQuery;
      
      if (vendorIdError) console.error('❌ Error fetching vendor IDs:', vendorIdError);
      
      let totalProducts = 0;
      const ids = vendorIds?.map(v => v.id) || [];
      console.log('✅ Vendor IDs found:', ids.length);
      
      if (ids.length > 0) {
        const { count: productCount, error: productError } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .in('vendor_id', ids);
        
        if (productError) console.error('❌ Error counting products:', productError);
        totalProducts = productCount || 0;
        console.log('✅ Total products found:', totalProducts);
      }

      // Count pending KYC vendors
      let pendingQuery = supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true })
        .in('kyc_status', KYC_PENDING_STATUSES);
      if (filter) pendingQuery = pendingQuery.or(filter);
      const { count: pendingCount, error: pendingError } = await pendingQuery;
      
      if (pendingError) console.error('❌ Error counting pending KYC:', pendingError);
      console.log('✅ Pending KYC found:', pendingCount);

      // Count approved/verified KYC vendors
      let verifiedQuery = supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true })
        .in('kyc_status', KYC_APPROVED_STATUSES);
      if (filter) verifiedQuery = verifiedQuery.or(filter);
      const { count: verifiedCount, error: verifiedError } = await verifiedQuery;
      
      if (verifiedError) console.error('❌ Error counting verified KYC:', verifiedError);
      console.log('✅ Approved KYC found:', verifiedCount);

      const scopedStats = { 
        totalVendors: totalVendors || 0, 
        totalProducts, 
        pendingKyc: pendingCount || 0, 
        approvedKyc: verifiedCount || 0 
      };

      const allZero = Object.values(scopedStats).every((v) => Number(v || 0) === 0);

      if (allZero && effectiveUserId) {
        try {
          const [allVendors, allProducts, allPending, allApproved] = await Promise.all([
            supabase.from('vendors').select('*', { count: 'exact', head: true }),
            supabase.from('products').select('*', { count: 'exact', head: true }),
            supabase.from('vendors').select('*', { count: 'exact', head: true }).in('kyc_status', KYC_PENDING_STATUSES),
            supabase.from('vendors').select('*', { count: 'exact', head: true }).in('kyc_status', KYC_APPROVED_STATUSES),
          ]);

          return {
            totalVendors: allVendors.count || 0,
            totalProducts: allProducts.count || 0,
            pendingKyc: allPending.count || 0,
            approvedKyc: allApproved.count || 0,
          };
        } catch (fallbackErr) {
          console.error('❌ Dashboard fallback stats error:', fallbackErr);
          return scopedStats;
        }
      }

      return scopedStats;
    } catch (error) {
      console.error('❌ Dashboard stats error:', error);
      return { totalVendors: 0, totalProducts: 0, pendingKyc: 0, approvedKyc: 0 };
    }
  },

  getRecentActivities: async (userId) => {
    const emp = await getEmployeeContext();
    const effectiveUserId = userId || emp?.user_id;
    const filter = buildVendorFilter({ userId: effectiveUserId, employeeId: emp?.id });
    let vendorQuery = supabase
      .from('vendors')
      .select('id, company_name, created_at, kyc_status')
      .order('created_at', { ascending: false })
      .limit(5);
    if (filter) vendorQuery = vendorQuery.or(filter);
    
    const { data: vendors } = await vendorQuery;

    const mapped = (vendors || []).map(v => ({
      type: 'VENDOR',
      message: `Created vendor ${v.company_name}`,
      time: v.created_at,
      id: v.id
    }));

    if (mapped.length === 0 && effectiveUserId) {
      const { data: recent } = await supabase
        .from('vendors')
        .select('id, company_name, created_at, kyc_status')
        .order('created_at', { ascending: false })
        .limit(5);
      return (recent || []).map(v => ({
        type: 'VENDOR',
        message: `Created vendor ${v.company_name}`,
        time: v.created_at,
        id: v.id
      }));
    }

    return mapped;
  },

  getCategoryRequests: async (limit = 6) => {
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, subject, description, status, priority, created_at, vendor_id, vendors(company_name), attachments')
        .eq('category', 'Category Request')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Category requests fetch error:', error);
      return [];
    }
  },

  // --- VENDORS ---
  getVendors: async () => {
    const { data, error } = await supabase.from('vendors').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  
  getAssignedVendors: async () => {
    const emp = await getEmployeeContext();
    const filter = buildVendorFilter({ userId: emp?.user_id, employeeId: emp?.id });
    let query = supabase
      .from('vendors')
      .select('*, products(count)')
      .order('created_at', { ascending: false });
    if (filter) query = query.or(filter);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  
  getAllVendors: async (filters = {}) => {
    let query = supabase.from('vendors').select('*, products(count)').order('created_at', { ascending: false });
    
    if (filters.status && filters.status !== 'all') {
      const status = String(filters.status).toLowerCase();
      if (status === 'pending') {
        query = query.in('kyc_status', KYC_PENDING_STATUSES);
      } else if (status === 'approved') {
        query = query.in('kyc_status', KYC_APPROVED_STATUSES);
      } else if (status === 'rejected') {
        query = query.in('kyc_status', ['REJECTED', 'rejected']);
      }
    }

    if (filters.search) {
      const term = String(filters.search || '').trim();
      if (term) {
        query = query.or(
          `vendor_id.ilike.%${term}%,company_name.ilike.%${term}%,owner_name.ilike.%${term}%,email.ilike.%${term}%`
        );
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  generateVendorId: () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    
    const part1 = generateRandomString(3, letters); // ABC
    const part2 = generateRandomString(4, digits);  // 1234
    const part3 = generateRandomString(3, letters); // XYZ
    
    return `${part1}-VIN-${part2}-${part3}`;
  },

  createVendor: async (vendorData) => {
    const emp = await getEmployeeContext();
    const user = await getUser();
    const actorId = emp?.user_id || user.id;
    
    // Generate new style Vendor ID if not provided (though this function allows passing one in via prompt logic, let's enforce generator)
    const generatedId = dataEntryApi.generateVendorId();
    const tempPassword = vendorData.temp_password || Math.random().toString(36).slice(-8) + "!Aa1";
    
    const payload = {
        ...vendorData,
        vendor_id: generatedId,
        assigned_to: actorId,
        created_by_user_id: actorId,
        kyc_status: 'PENDING',
        profile_completion: 10,
        is_active: true,
        generated_password_hash: tempPassword, // Storing plain/temp for display (In prod, hash this!)
        is_password_temporary: true
    };
    
    // Remove temp_password from payload to avoid schema error if column doesn't exist
    delete payload.temp_password;

    const { data, error } = await supabase.from('vendors').insert([payload]).select().single();
    
    if (error) {
        console.error("Create Vendor DB Error:", error);
        throw new Error(error.message);
    }
    
    return { ...data, password: tempPassword };
  },

  // --- CATEGORIES ---
  getHeadCategories: async () => {
    const { data, error } = await supabase.from('head_categories').select('*, sub_categories(count)').order('name');
    if (error) throw error;
    return data;
  },
  
  getAllHeadCategories: async () => {
    const { data, error } = await supabase.from('head_categories').select('*').order('name');
    if (error) throw error;
    return data;
  },

  createHeadCategory: async (categoryData) => {
    const { data, error } = await supabase.from('head_categories').insert([categoryData]).select().single();
    if (error) throw error;
    return data;
  },
  
  updateHeadCategory: async (id, updates) => {
      const { data, error } = await supabase.from('head_categories').update(updates).eq('id', id).select().single();
      if(error) throw error;
      return data;
  },
  
  deleteHeadCategory: async (id) => {
      const { error } = await supabase.from('head_categories').delete().eq('id', id);
      if(error) throw error;
  },

  getSubCategories: async (headId) => {
    const { data, error } = await supabase.from('sub_categories').select('*, micro_categories(count)').eq('head_category_id', headId).order('name');
    if (error) throw error;
    return data;
  },
  
  createSubCategory: async (categoryData) => {
    const { data, error } = await supabase.from('sub_categories').insert([categoryData]).select().single();
    if(error) throw error;
    return data;
  },

  updateSubCategory: async (id, updates) => {
      const { data, error } = await supabase.from('sub_categories').update(updates).eq('id', id).select().single();
      if(error) throw error;
      return data;
  },

  deleteSubCategory: async (id) => {
      const { error } = await supabase.from('sub_categories').delete().eq('id', id);
      if(error) throw error;
  },

  getMicroCategories: async (subId) => {
    const { data, error } = await supabase.from('micro_categories').select('*').eq('sub_category_id', subId).order('name');
    if (error) throw error;
    return data;
  },

  createMicroCategory: async (categoryData) => {
      const { data, error } = await supabase.from('micro_categories').insert([categoryData]).select().single();
      if(error) throw error;
      return data;
  },

  updateMicroCategory: async (id, updates) => {
      const { data, error } = await supabase.from('micro_categories').update(updates).eq('id', id).select().single();
      if(error) throw error;
      return data;
  },

  deleteMicroCategory: async (id) => {
      const { error } = await supabase.from('micro_categories').delete().eq('id', id);
      if(error) throw error;
  },

  importCategoriesCSV: async (rows) => {
    let success = 0, failed = 0, errors = [];
    for (const row of rows) {
      try {
        const headName = row.head_category || row.head_category_name;
        const subName = row.sub_category || row.sub_category_name;
        const microName = row.micro_category || row.micro_category_name;
        
        if (!headName || !subName || !microName) throw new Error("Missing names");

        // 1. Head
        const headSlug = headName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        let { data: head } = await supabase.from('head_categories').select('id').eq('slug', headSlug).maybeSingle();
        if (!head) {
             const { data: newHead, error } = await supabase.from('head_categories').insert([{ name: headName, slug: headSlug, is_active: true }]).select().single();
             if (error) throw error;
             head = newHead;
        }

        // 2. Sub
        const subSlug = subName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        let { data: sub } = await supabase.from('sub_categories').select('id').eq('slug', subSlug).eq('head_category_id', head.id).maybeSingle();
        if (!sub) {
             const { data: newSub, error } = await supabase.from('sub_categories').insert([{ head_category_id: head.id, name: subName, slug: subSlug, is_active: true }]).select().single();
             if (error) throw error;
             sub = newSub;
        }

        // 3. Micro
        const microSlug = microName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const { data: existingMicro } = await supabase.from('micro_categories').select('id').eq('slug', microSlug).eq('sub_category_id', sub.id).maybeSingle();
        if (!existingMicro) {
             const { error } = await supabase.from('micro_categories').insert([{ 
                 sub_category_id: sub.id, 
                 name: microName, 
                 slug: microSlug, 
                 description: row.description,
                 meta_tags: row.meta_tags,
                 is_active: true 
             }]);
             if (error) throw error;
        }
        success++;
      } catch (e) {
        failed++;
        errors.push(e.message);
      }
    }
    return { success, failed, errors };
  },

  // --- LOCATIONS ---
  getStates: async () => {
      const { data, error } = await supabase.from('states').select('*').order('name');
      if (error) throw error;
      return data;
  },
  getCitiesByState: async (stateId) => {
      const { data, error } = await supabase.from('cities').select('*').eq('state_id', stateId).order('name');
      if (error) throw error;
      return data;
  },
  createState: async (name) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      const { error } = await supabase.from('states').insert([{ name, slug, is_active: true }]);
      if(error) throw error;
  },
  updateState: async (id, name) => {
       const { error } = await supabase.from('states').update({ name }).eq('id', id);
       if(error) throw error;
  },
  deleteState: async (id) => {
       const { error } = await supabase.from('states').delete().eq('id', id);
       if(error) throw error;
  },
  createCity: async (stateId, name) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      const { error } = await supabase.from('cities').insert([{ state_id: stateId, name, slug, is_active: true }]);
      if(error) throw error;
  },
  updateCity: async (id, name) => {
       const { error } = await supabase.from('cities').update({ name }).eq('id', id);
       if(error) throw error;
  },
  deleteCity: async (id) => {
       const { error } = await supabase.from('cities').delete().eq('id', id);
       if(error) throw error;
  },
  
  importLocationsCSV: async (rows) => {
      let success = 0, failed = 0;
      for (const row of rows) {
          try {
              const sName = row.state_name || row.State;
              const cName = row.city_name || row.City;
              if (!sName || !cName) { failed++; continue; }
              
              let sId;
              const { data: s } = await supabase.from('states').select('id').ilike('name', sName).maybeSingle();
              if (s) sId = s.id;
              else {
                  const { data: ns } = await supabase.from('states').insert([{ name: sName, slug: sName.toLowerCase().replace(/\s/g, '-'), is_active: true }]).select().single();
                  sId = ns?.id;
              }
              
              if (sId) {
                  await supabase.from('cities').insert([{ state_id: sId, name: cName, slug: cName.toLowerCase().replace(/\s/g, '-'), is_active: true }]);
                  success++;
              } else {
                  failed++;
              }
          } catch(e) { failed++; }
      }
      return { success, failed };
  },

  // --- KYC ---
  getKycDocuments: async (vendorId) => {
    try {
      // Query vendor_documents table where actual KYC documents are stored
      console.log('🔍 [KYC] Fetching documents for vendor:', vendorId);
      const { data, error } = await supabase
        .from('vendor_documents')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      console.log('✅ [KYC] Found documents:', data?.length || 0, data);
      return data || [];
    } catch (error) {
      console.error('❌ [KYC] Error fetching KYC documents:', error);
      throw error;
    }
  },
  getKYCDocuments: async (vendorId) => {
    try {
      // Query vendor_documents table where actual KYC documents are stored
      const { data, error } = await supabase
        .from('vendor_documents')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching KYC documents:', error);
      throw error;
    }
  },
  approveVendorKyc: async (vendorId) => {
      try {
          const data = await postKycAction(vendorId, 'approve');
          console.log('✅ KYC approved via API:', data);
          return data;
      } catch (error) {
          console.error('❌ Error approving KYC:', error);
          throw error;
      }
  },
  approveVendor: async (vendorId) => {
      try {
          const data = await postKycAction(vendorId, 'approve');
          console.log('✅ Vendor approved via API:', data);
          return data;
      } catch (error) {
          console.error('❌ Error approving vendor:', error);
          throw error;
      }
  },
  rejectVendorKyc: async (vendorId, remarks) => {
      try {
          const data = await postKycAction(vendorId, 'reject', { remarks });
          console.log('✅ KYC rejected via API:', data);
          return data;
      } catch (error) {
          console.error('❌ Error rejecting KYC:', error);
          throw error;
      }
  },
  rejectVendor: async (vendorId, remarks) => {
      try {
          const data = await postKycAction(vendorId, 'reject', { remarks });
          console.log('✅ Vendor rejected via API:', data);
          return data;
      } catch (error) {
          console.error('❌ Error rejecting vendor:', error);
          throw error;
      }
  },

  // --- KYC DOCUMENTS GROUPING ---
  getVendorsGroupedByKycDocuments: async () => {
    try {
      console.log('🔍 [KYC] Fetching PENDING vendors...');
      const { data: vendors, error: vendorError } = await supabase
        .from('vendors')
        .select('*')
        .eq('kyc_status', 'PENDING')
        .order('created_at', { ascending: false });

      if (vendorError) throw vendorError;
      console.log('✅ [KYC] Found vendors:', vendors?.length || 0, vendors?.map(v => ({ id: v.id, name: v.company_name })));
      if (!vendors || vendors.length === 0) return { withDocuments: [], withoutDocuments: [] };

      // Check vendor_documents table (actual KYC docs location)
      console.log('🔍 [KYC] Checking vendor_documents table for these vendor IDs:', vendors.map(v => v.id));
      const { data: allDocs, error: docsError } = await supabase
        .from('vendor_documents')
        .select('vendor_id, document_type, document_url')
        .in('vendor_id', vendors.map(v => v.id));

      if (docsError) throw docsError;
      console.log('✅ [KYC] Found documents:', allDocs?.length || 0, allDocs);

      const vendorIdsWithDocs = new Set(allDocs?.map(d => d.vendor_id) || []);

      const withDocuments = vendors.filter(v => vendorIdsWithDocs.has(v.id));
      const withoutDocuments = vendors.filter(v => !vendorIdsWithDocs.has(v.id));

      console.log('📊 [KYC] Grouping result - With docs:', withDocuments.length, 'Without docs:', withoutDocuments.length);
      return { withDocuments, withoutDocuments };
    } catch (error) {
      console.error('❌ [KYC] Error grouping vendors by KYC documents:', error);
      throw error;
    }
  },

  // --- VENDORS (Additional) ---
  getVendorById: async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', vendorId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching vendor:', error);
      throw error;
    }
  },

  // --- PRODUCTS ---
  getVendorProducts: async (vendorId) => {
    try {
      // First get all products for this vendor
      console.log('🔍 [PRODUCTS] Fetching products for vendor:', vendorId);
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;
      console.log('✅ [PRODUCTS] Found products:', products?.length || 0);
      if (!products || products.length === 0) {
        console.log('⚠️ [PRODUCTS] No products found for vendor');
        return [];
      }

      // Enrich each product with category and image data
      const enrichedProducts = await Promise.all(products.map(async (product) => {
        let categories = {};

        // Fetch category data if IDs exist
        if (product.head_category_id) {
          const { data: head } = await supabase
            .from('head_categories')
            .select('id, name, slug')
            .eq('id', product.head_category_id)
            .single();
          if (head) categories.head_category = head;
        }

        if (product.sub_category_id) {
          const { data: sub } = await supabase
            .from('sub_categories')
            .select('id, name, slug')
            .eq('id', product.sub_category_id)
            .single();
          if (sub) categories.sub_category = sub;
        }

        if (product.micro_category_id) {
          const { data: micro } = await supabase
            .from('micro_categories')
            .select('id, name, slug')
            .eq('id', product.micro_category_id)
            .single();
          if (micro) categories.micro_category = micro;
        }

        // Fetch product images
        const { data: images } = await supabase
          .from('product_images')
          .select('*')
          .eq('product_id', product.id);

        return {
          ...product,
          ...categories,
          product_images: images || []
        };
      }));

      return enrichedProducts;
    } catch (error) {
      console.error('Error fetching vendor products:', error);
      throw error;
    }
  },


  createProduct: async (productData) => {
    try {
      const emp = await getEmployeeContext();
      const user = await getUser();
      const actorId = emp?.user_id || user.id;
      return await insertProductWithCompat(productData, actorId);
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  },

  updateProduct: async (productId, updates) => {
    try {
      console.log('🔄 Updating product:', productId, 'with data:', updates);
      
      // First verify product exists
      const { data: existingProduct, error: checkError } = await supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .single();
      
      if (checkError) {
        console.error('❌ Product check error:', checkError);
        throw new Error(`Product not found: ${checkError.message}`);
      }
      
      if (!existingProduct) {
        throw new Error('Product does not exist');
      }
      
      console.log('✅ Product exists, proceeding with update');
      
      // PATCH without select (RLS may prevent reading back)
      const { error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', productId);

      if (error) {
        console.error('❌ Update error:', error);
        throw error;
      }
      
      console.log('✅ Product updated successfully');
      // Return the updated object (data was passed in)
      return { id: productId, ...updates };
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  },

  addProductImage: async (productId, imageUrl) => {
    try {
      const { data, error } = await supabase
        .from('product_images')
        .insert([{ product_id: productId, image_url: imageUrl }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding product image:', error);
      throw error;
    }
  },

  addProduct: async (productData) => {
    try {
      const emp = await getEmployeeContext();
      const user = await getUser();
      const actorId = emp?.user_id || user.id;
      return await insertProductWithCompat(productData, actorId);
    } catch (error) {
      console.error('Error adding product:', error);
      throw error;
    }
  },

  getCategoriesTree: async () => {
    try {
      // Load all categories with relationships in single query
      const { data: heads, error: headError } = await supabase
        .from('head_categories')
        .select(`
          id, name, slug,
          sub_categories(
            id, name, slug,
            micro_categories(id, name, slug)
          )
        `);

      if (headError) throw headError;

      const tree = (heads || []).map(head => ({
        ...head,
        subs: (head.sub_categories || []).map(sub => ({
          ...sub,
          micros: sub.micro_categories || []
        }))
      }));

      return tree;
    } catch (error) {
      console.error('Error fetching category tree:', error);
      throw error;
    }
  },

  getProduct: async (productId) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching product:', error);
      throw error;
    }
  },

  getProductById: async (productId) => {
    try {
      // Fetch basic product data
      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error) throw error;

      // Fetch category details separately (no FK relationships in schema)
      const categories = {};
      
      if (product.head_category_id) {
        const { data: head } = await supabase
          .from('head_categories')
          .select('id, name, slug')
          .eq('id', product.head_category_id)
          .single();
        if (head) categories.head_category = head;
      }

      if (product.sub_category_id) {
        const { data: sub } = await supabase
          .from('sub_categories')
          .select('id, name, slug')
          .eq('id', product.sub_category_id)
          .single();
        if (sub) categories.sub_category = sub;
      }

      if (product.micro_category_id) {
        const { data: micro } = await supabase
          .from('micro_categories')
          .select('id, name, slug')
          .eq('id', product.micro_category_id)
          .single();
        if (micro) categories.micro_category = micro;
      }

      // Fetch product images separately
      const { data: images } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', productId);

      return {
        ...product,
        ...categories,
        product_images: images || []
      };
    } catch (error) {
      console.error('Error fetching product details:', error);
      throw error;
    }
  },

  uploadProductMedia: async (file, type) => {
    try {
      if (!file) throw new Error('No file selected');

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const response = await fetchWithCsrf(apiUrl('/api/employee/product-media-upload'), {
        method: 'POST',
        body: JSON.stringify({
          type,
          file_name: file.name || 'upload-file',
          content_type: file.type || '',
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
        throw new Error(payload?.error || `Upload failed (${response.status})`);
      }

      const publicUrl = String(payload?.publicUrl || '').trim();
      if (!publicUrl) {
        throw new Error('Upload succeeded but public URL was not returned');
      }

      return publicUrl;
    } catch (error) {
      console.error('Error uploading media:', error);
      throw error;
    }
  },

  // ============================================
  // VENDOR TABLE MAPPINGS - All vendor* tables
  // ============================================

  // --- vendor_documents (KYC docs) ---
  getVendorDocuments: async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_documents')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching vendor documents:', error);
      throw error;
    }
  },

  addVendorDocument: async (vendorId, documentType, documentUrl, originalName) => {
    try {
      const { data, error } = await supabase
        .from('vendor_documents')
        .insert([{ vendor_id: vendorId, document_type: documentType, document_url: documentUrl, original_name: originalName, verification_status: 'PENDING' }])
        .select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding vendor document:', error);
      throw error;
    }
  },

  // --- vendor_bank_details ---
  getVendorBankDetails: async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_bank_details')
        .select('*')
        .eq('vendor_id', vendorId);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching bank details:', error);
      throw error;
    }
  },

  addBankAccount: async (vendorId, bankData) => {
    try {
      const { data, error } = await supabase
        .from('vendor_bank_details')
        .insert([{ vendor_id: vendorId, ...bankData, is_primary: bankData.is_primary || false }])
        .select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding bank account:', error);
      throw error;
    }
  },

  // --- vendor_contact_persons ---
  getVendorContacts: async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_contact_persons')
        .select('*')
        .eq('vendor_id', vendorId);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching vendor contacts:', error);
      throw error;
    }
  },

  addContactPerson: async (vendorId, contactData) => {
    try {
      const { data, error } = await supabase
        .from('vendor_contact_persons')
        .insert([{ vendor_id: vendorId, ...contactData, is_primary: contactData.is_primary || false }])
        .select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding contact person:', error);
      throw error;
    }
  },

  // --- vendor_preferences ---
  getVendorPreferences: async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_preferences')
        .select('*')
        .eq('vendor_id', vendorId).single();
      if (error?.code === 'PGRST116') return null;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching vendor preferences:', error);
      throw error;
    }
  },

  setVendorPreferences: async (vendorId, preferences) => {
    try {
      const { data: existing } = await supabase.from('vendor_preferences').select('id').eq('vendor_id', vendorId).single();
      let data, error;
      if (existing) {
        ({ data, error } = await supabase.from('vendor_preferences').update({ ...preferences, updated_at: new Date() }).eq('vendor_id', vendorId).select().single());
      } else {
        ({ data, error } = await supabase.from('vendor_preferences').insert([{ vendor_id: vendorId, ...preferences }]).select().single());
      }
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error setting vendor preferences:', error);
      throw error;
    }
  },

  // --- vendor_payments ---
  getVendorPayments: async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_payments')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching vendor payments:', error);
      throw error;
    }
  },

  recordVendorPayment: async (vendorId, paymentData) => {
    try {
      const { data, error } = await supabase
        .from('vendor_payments')
        .insert([{ vendor_id: vendorId, ...paymentData }])
        .select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error recording payment:', error);
      throw error;
    }
  },

  // --- vendor_messages ---
  getVendorMessages: async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_messages')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching vendor messages:', error);
      throw error;
    }
  },

  // --- vendor_lead_quota ---
  getVendorLeadQuota: async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_lead_quota')
        .select('*')
        .eq('vendor_id', vendorId).single();
      if (error?.code === 'PGRST116') return null;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching lead quota:', error);
      throw error;
    }
  },

  // --- vendor_plan_subscriptions ---
  getVendorSubscriptions: async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_plan_subscriptions')
        .select('*, vendor_plans(*)')
        .eq('vendor_id', vendorId);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching vendor subscriptions:', error);
      throw error;
    }
  },

  // --- vendor_plans ---
  getVendorPlans: async () => {
    try {
      const { data, error } = await supabase
        .from('vendor_plans')
        .select('*')
        .eq('is_active', true)
        .order('price');
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching vendor plans:', error);
      throw error;
    }
  },

  // --- vendor_additional_leads ---
  getAdditionalLeads: async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_additional_leads')
        .select('*')
        .eq('vendor_id', vendorId);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching additional leads:', error);
      throw error;
    }
  },

  // --- vendor_subscriptions (services) ---
  getVendorServiceSubscriptions: async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from('vendor_subscriptions')
        .select('*, vendor_services(*)')
        .eq('vendor_id', vendorId);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching service subscriptions:', error);
      throw error;
    }
  },

  // --- vendor_otp_codes ---
  createVendorOTP: async (vendorId, email) => {
    try {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60000).toISOString(); // 10 mins
      const { data, error } = await supabase
        .from('vendor_otp_codes')
        .insert([{ vendor_id: vendorId, otp_code: otpCode, email, expires_at: expiresAt }])
        .select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating OTP:', error);
      throw error;
    }
  }
};

