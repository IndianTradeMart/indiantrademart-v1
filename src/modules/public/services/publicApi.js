import { supabase } from '@/lib/customSupabaseClient';

export const publicApi = {
  // --- LOCATIONS ---
  getStates: async () => {
    const { data, error } = await supabase
      .from('states')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  getCities: async (stateId) => {
    if (!stateId) return [];
    const { data, error } = await supabase
      .from('cities')
      .select('*')
      .eq('state_id', stateId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  // --- CATEGORIES HIERARCHY ---
  getHeadCategories: async () => {
    const { data, error } = await supabase
      .from('head_categories')
      .select('id, name, slug, image_url, description')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  getSubCategories: async (headCategoryId) => {
    if (!headCategoryId) return [];
    const { data, error } = await supabase
      .from('sub_categories')
      .select('id, name, slug, image_url, description, head_category_id')
      .eq('head_category_id', headCategoryId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  getMicroCategories: async (subCategoryId) => {
    if (!subCategoryId) return [];
    const { data, error } = await supabase
      .from('micro_categories')
      .select('id, name, slug, description, sub_category_id')
      .eq('sub_category_id', subCategoryId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  getCategoryHierarchy: async () => {
    const { data, error } = await supabase
      .from('head_categories')
      .select(`
        id, 
        name, 
        slug, 
        image_url,
        sub_categories(
          id,
          name,
          slug,
          image_url,
          micro_categories(
            id,
            name,
            slug
          )
        )
      `)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  // --- BRANDS ---
  getBrands: async () => {
    // Brands table doesn't exist in schema - return empty array
    return [];
  },

  // --- PRODUCTS ---
  getProducts: async (filters = {}) => {
    let query = supabase
      .from('products')
      .select('*, vendors(company_name, seller_rating, verification_badge, profile_image)');

    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.micro_category_id) {
      query = query.eq('micro_category_id', filters.micro_category_id);
    }
    if (filters.vendor_id) {
      query = query.eq('vendor_id', filters.vendor_id);
    }
    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }
    if (filters.minPrice) {
      query = query.gte('price', filters.minPrice);
    }
    if (filters.maxPrice) {
      query = query.lte('price', filters.maxPrice);
    }

    query = query.eq('status', 'ACTIVE');

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  },

  getProductDetail: async (productId) => {
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*, vendors(*)')
      .eq('id', productId)
      .single();

    if (productError) throw productError;

    const { data: images } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', productId);

    const { data: videos } = await supabase
      .from('product_videos')
      .select('*')
      .eq('product_id', productId);

    return {
      ...product,
      images: images || [],
      videos: videos || []
    };
  },

  // --- VENDORS ---
  searchVendors: async (filters = {}) => {
    let query = supabase
      .from('vendors')
      .select('id, company_name, email, phone, profile_image, verification_badge, seller_rating, state, city, owner_name, website_url');

    if (filters.state_id) {
      query = query.eq('state_id', filters.state_id);
    }
    if (filters.city_id) {
      query = query.eq('city_id', filters.city_id);
    }
    if (filters.search) {
      query = query.ilike('company_name', `%${filters.search}%`);
    }
    if (filters.verified_only) {
      query = query.eq('is_verified', true);
    }

    query = query.eq('is_active', true);

    const { data, error } = await query
      .order('seller_rating', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data || [];
  },

  getVendorDetail: async (vendorId) => {
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .eq('is_active', true)
      .single();

    if (vendorError) throw vendorError;

    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('status', 'ACTIVE');

    return {
      ...vendor,
      products: products || []
    };
  },

  getVendorRatings: async (vendorId) => {
    const { data, error } = await supabase
      .from('vendors')
      .select('seller_rating, trust_score, response_time, cancellation_rate, return_rate, dispute_resolution')
      .eq('id', vendorId)
      .single();

    if (error) throw error;
    return data;
  },

  // --- LEADS ---
  getPublicLeads: async (filters = {}) => {
    let query = supabase.from('leads').select('id, buyer_name, title, product_name, quantity, budget, category, location, created_at');

    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.location) {
      query = query.ilike('location', `%${filters.location}%`);
    }

    query = query.eq('status', 'AVAILABLE');

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  },

  // --- CONTACT SUBMISSIONS ---
  submitContact: async (contactData) => {
    const { data, error } = await supabase
      .from('contact_submissions')
      .insert([{
        name: contactData.name,
        email: contactData.email,
        phone: contactData.phone,
        message: contactData.message,
        status: 'new',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- QUOTES ---
  submitQuote: async (quoteData) => {
    const { data, error } = await supabase
      .from('quotes')
      .insert([{
        product_name: quoteData.product_name,
        quantity: quoteData.quantity,
        unit: quoteData.unit,
        email: quoteData.email,
        phone: quoteData.phone,
        status: 'Pending',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- REQUIREMENTS ---
  submitRequirement: async (requirementData) => {
    const { data, error } = await supabase
      .from('requirements')
      .insert([{
        name: requirementData.name,
        email: requirementData.email,
        phone: requirementData.phone,
        company_name: requirementData.company_name,
        requirement_description: requirementData.requirement_description,
        budget: requirementData.budget,
        timeline: requirementData.timeline,
        state_id: requirementData.state_id,
        city_id: requirementData.city_id,
        status: 'Pending',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- PLATFORM FEEDBACK ---
  submitFeedback: async (feedbackData) => {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('platform_feedback')
      .insert([{
        user_id: user?.id || null,
        subject: feedbackData.subject,
        message: feedbackData.message,
        status: 'NEW',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- PAGE STATUS ---
  getPageStatus: async (pageRoute) => {
    const { data, error } = await supabase
      .from('page_status')
      .select('*')
      .eq('page_route', pageRoute)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // --- NOTIFICATIONS ---
  getNotifications: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  markNotificationAsRead: async (notificationId) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
  }
};
