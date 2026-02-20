import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const BASE_URL = 'https://indiantrademart.com';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const isMissingColumnError = (err) => {
  if (!err) return false;
  return err.code === '42703' || /column .* does not exist/i.test(err.message || '');
};

const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const xmlFooter = '</urlset>';

const createUrlEntry = (location, lastmod, priority = '0.7', changefreq = 'weekly') => {
  return `  <url>
    <loc>${location}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priority}</priority>
    <changefreq>${changefreq}</changefreq>
  </url>`;
};

const getCurrentDate = () => new Date().toISOString().split('T')[0];

const generateProductsSitemap = async () => {
  console.log('📦 Generating products sitemap...');

  try {
    let products = null;
    let error = null;

    ({ data: products, error } = await supabase
      .from('products')
      .select('id, slug, updated_at, status')
      .eq('status', 'PUBLISHED')
      .order('updated_at', { ascending: false }));

    if (error && isMissingColumnError(error)) {
      ({ data: products, error } = await supabase
        .from('products')
        .select('id, slug, created_at, status')
        .eq('status', 'PUBLISHED')
        .order('created_at', { ascending: false }));
    }

    if (error && isMissingColumnError(error)) {
      ({ data: products, error } = await supabase
        .from('products')
        .select('id, slug, created_at')
        .order('created_at', { ascending: false }));
    }

    if (error) {
      console.error('Error fetching products:', error);
      return null;
    }

    if (!products || products.length === 0) {
      console.warn('⚠️  No published products found');
      return null;
    }

    const urls = products.map((p) => {
      const lastmodRaw = p.updated_at || p.created_at;
      const lastmod = lastmodRaw ? lastmodRaw.split('T')[0] : getCurrentDate();
      return createUrlEntry(`${BASE_URL}/products/${p.id}`, lastmod, '0.8', 'weekly');
    });

    return `${xmlHeader}\n${urls.join('\n')}\n${xmlFooter}`;
  } catch (err) {
    console.error('Fatal error generating products sitemap:', err);
    return null;
  }
};

const generateVendorsSitemap = async () => {
  console.log('🏢 Generating vendors sitemap...');

  try {
    let vendors = null;
    let error = null;

    ({ data: vendors, error } = await supabase
      .from('vendors')
      .select('id, updated_at, status')
      .eq('status', 'VERIFIED')
      .order('updated_at', { ascending: false }));

    if (error && isMissingColumnError(error)) {
      ({ data: vendors, error } = await supabase
        .from('vendors')
        .select('id, created_at, status')
        .eq('status', 'VERIFIED')
        .order('created_at', { ascending: false }));
    }

    if (error && isMissingColumnError(error)) {
      ({ data: vendors, error } = await supabase
        .from('vendors')
        .select('id, created_at')
        .order('created_at', { ascending: false }));
    }

    if (error) {
      console.error('Error fetching vendors:', error);
      return null;
    }

    if (!vendors || vendors.length === 0) {
      console.warn('⚠️  No verified vendors found');
      return null;
    }

    const urls = vendors.map((v) => {
      const lastmodRaw = v.updated_at || v.created_at;
      const lastmod = lastmodRaw ? lastmodRaw.split('T')[0] : getCurrentDate();
      return createUrlEntry(`${BASE_URL}/directory/vendor/${v.id}`, lastmod, '0.8', 'weekly');
    });

    return `${xmlHeader}\n${urls.join('\n')}\n${xmlFooter}`;
  } catch (err) {
    console.error('Fatal error generating vendors sitemap:', err);
    return null;
  }
};

const generateCategoriesSitemap = async () => {
  console.log('📂 Generating categories sitemap...');

  try {
    const { data: categories, error } = await supabase
      .from('micro_categories')
      .select(`
        id,
        slug,
        name,
        sub_categories!inner(
          id,
          slug,
          name,
          head_categories!inner(
            id,
            slug,
            name
          )
        ),
        updated_at
      `)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching categories:', error);
      return null;
    }

    if (!categories || categories.length === 0) {
      console.warn('⚠️  No categories found');
      return null;
    }

    // ✅ Cities fetch with fallback for missing state_slug
    let cities = null;
    let citiesError = null;

    ({ data: cities, error: citiesError } = await supabase
      .from('cities')
      .select('id, slug, name, state_slug')
      .order('supplier_count', { ascending: false })
      .limit(50));

    // If state_slug missing -> retry without it and skip location pages
    if (citiesError && isMissingColumnError(citiesError)) {
      console.warn('⚠️  cities.state_slug missing. City+state pages will be skipped (build continues).');
      ({ data: cities, error: citiesError } = await supabase
        .from('cities')
        .select('id, slug, name')
        .order('supplier_count', { ascending: false })
        .limit(50));
    }

    if (citiesError) {
      console.warn('Warning: Could not fetch cities for category pages:', citiesError);
      cities = null;
    }

    const urls = [];

    categories.forEach((category) => {
      const lastmod = category.updated_at ? category.updated_at.split('T')[0] : getCurrentDate();

      // Base category page
      urls.push(createUrlEntry(`${BASE_URL}/directory/${category.slug}`, lastmod, '0.7', 'monthly'));

      // Location pages only if state_slug available
      if (cities && cities.length > 0) {
        cities.forEach((city) => {
          if (!city.state_slug) return; // skip if missing
          const locationUrl = `${BASE_URL}/directory/${category.slug}-in-${city.slug}-${city.state_slug}`;
          urls.push(createUrlEntry(locationUrl, lastmod, '0.6', 'monthly'));
        });
      }
    });

    return `${xmlHeader}\n${urls.join('\n')}\n${xmlFooter}`;
  } catch (err) {
    console.error('Fatal error generating categories sitemap:', err);
    return null;
  }
};

const writeSitemapFile = (filename, content) => {
  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const filePath = path.join(publicDir, filename);
  fs.writeFileSync(filePath, content);
  console.log(`✅ Created ${filename}`);
};

const generateSitemapIndex = (sitemaps) => {
  const header = '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  const footer = '</sitemapindex>';

  const entries = sitemaps.map((s) => {
    return `  <sitemap>
    <loc>${BASE_URL}/${s.name}</loc>
    <lastmod>${getCurrentDate()}</lastmod>
  </sitemap>`;
  });

  return `${header}\n${entries.join('\n')}\n${footer}`;
};

const generateAllSitemaps = async () => {
  console.log('🤖 Starting dynamic sitemap generation...');

  const sitemaps = [
    { name: 'sitemap-products.xml', generator: generateProductsSitemap },
    { name: 'sitemap-vendors.xml', generator: generateVendorsSitemap },
    { name: 'sitemap-categories.xml', generator: generateCategoriesSitemap }
  ];

  const generated = [];

  for (const sitemap of sitemaps) {
    try {
      const content = await sitemap.generator();
      if (content) {
        writeSitemapFile(sitemap.name, content);
        generated.push(sitemap);
      } else {
        console.warn(`⚠️  Skipping empty sitemap: ${sitemap.name}`);
      }
    } catch (err) {
      console.error(`Error generating ${sitemap.name}:`, err);
    }
  }

  // sitemap index
  if (generated.length > 0) {
    const sitemapIndex = generateSitemapIndex(generated);
    writeSitemapFile('sitemap.xml', sitemapIndex);
    console.log('✅ Created sitemap index file: sitemap.xml');
  }

  console.log(`✨ Sitemap generation complete! (${generated.length}/${sitemaps.length} sitemaps generated)`);
  console.log('📍 Reference these in robots.txt:');
  sitemaps.forEach((s) => console.log(`   Sitemap: ${BASE_URL}/${s.name}`));
};

generateAllSitemaps().catch(console.error);
