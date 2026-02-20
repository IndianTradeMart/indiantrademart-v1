import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  },
  body: JSON.stringify(body),
});

const getSupabase = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

const parseTail = (eventPath = '') => {
  const parts = String(eventPath || '').split('/').filter(Boolean);
  const idx = parts.lastIndexOf('migration');
  return idx >= 0 ? parts.slice(idx + 1) : parts;
};

const readBody = (event) => {
  if (!event?.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

function generateVendorId(ownerName = '', companyName = '', phone = '') {
  const part1 = ownerName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4)
    .padEnd(4, 'X');

  const part2 = companyName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4)
    .padEnd(4, 'Z');

  const part3 = phone
    ? phone.replace(/\D/g, '').slice(-2).padStart(2, '0')
    : Math.floor(Math.random() * 100)
        .toString()
        .padStart(2, '0');

  const part4 = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, '0');

  return `${part1}-V-${part2}-${part3}${part4}`;
}

async function generateUniqueVendorId(supabase, vendor) {
  let newVendorId = generateVendorId(vendor.owner_name, vendor.company_name, vendor.phone);
  let attempts = 0;
  let isUnique = false;

  while (!isUnique && attempts < 10) {
    // eslint-disable-next-line no-await-in-loop
    const { data: existing } = await supabase
      .from('vendors')
      .select('id')
      .eq('vendor_id', newVendorId)
      .maybeSingle();

    if (!existing) {
      isUnique = true;
    } else {
      newVendorId = generateVendorId(vendor.owner_name, vendor.company_name, vendor.phone);
      attempts += 1;
    }
  }

  if (!isUnique) throw new Error('Could not generate unique vendor ID');
  return newVendorId;
}

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getSupabase();
    const tail = parseTail(event.path);
    const body = readBody(event);

    // POST /api/migration/vendor-ids/migrate-single
    if (tail[0] === 'vendor-ids' && tail[1] === 'migrate-single') {
      const vendorId = body?.vendorId;
      if (!vendorId) return json(400, { error: 'Vendor ID is required' });

      const { data: vendor, error: vendorError } = await supabase
        .from('vendors')
        .select('id, owner_name, company_name, phone, vendor_id')
        .eq('id', vendorId)
        .maybeSingle();

      if (vendorError || !vendor) return json(404, { error: 'Vendor not found' });

      if (vendor.vendor_id && String(vendor.vendor_id).includes('-V-')) {
        return json(200, {
          success: true,
          message: 'Already migrated',
          vendorId: vendor.vendor_id,
          skipped: true,
        });
      }

      const newVendorId = await generateUniqueVendorId(supabase, vendor);
      const { error: updateError } = await supabase
        .from('vendors')
        .update({ vendor_id: newVendorId })
        .eq('id', vendorId);

      if (updateError) {
        return json(500, { error: `Failed to update vendor: ${updateError.message}` });
      }

      return json(200, {
        success: true,
        message: 'Vendor migrated successfully',
        vendorId: newVendorId,
      });
    }

    // POST /api/migration/vendor-ids/migrate-all
    if (tail[0] === 'vendor-ids' && tail[1] === 'migrate-all') {
      const { data: vendors, error: vendorsError } = await supabase
        .from('vendors')
        .select('id, owner_name, company_name, phone, vendor_id')
        .order('created_at', { ascending: false });

      if (vendorsError) {
        return json(500, { error: `Failed to fetch vendors: ${vendorsError.message}` });
      }

      const pendingVendors = (vendors || []).filter(
        (v) => !v.vendor_id || !String(v.vendor_id).includes('-V-')
      );

      if (pendingVendors.length === 0) {
        return json(200, {
          success: true,
          message: 'All vendors are already migrated',
          migrated: 0,
          total: vendors?.length || 0,
        });
      }

      const results = [];
      let successful = 0;
      let failed = 0;

      for (const vendor of pendingVendors) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const newVendorId = await generateUniqueVendorId(supabase, vendor);
          // eslint-disable-next-line no-await-in-loop
          const { error: updateError } = await supabase
            .from('vendors')
            .update({ vendor_id: newVendorId })
            .eq('id', vendor.id);

          if (updateError) throw updateError;

          results.push({
            vendorId: vendor.id,
            status: 'success',
            newVendorId,
          });
          successful += 1;
        } catch (error) {
          results.push({
            vendorId: vendor.id,
            status: 'error',
            error: error.message,
          });
          failed += 1;
        }
      }

      return json(200, {
        success: true,
        message: `Migration complete: ${successful} successful, ${failed} failed`,
        migrated: successful,
        failed,
        total: pendingVendors.length,
        results,
      });
    }

    return json(404, { error: 'Invalid migration route' });
  } catch (error) {
    return json(500, { error: error.message || 'Migration failed' });
  }
};
