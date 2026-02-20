import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const BASE_URL = process.env.VITE_SITE_URL || 'https://indiantrademart.com';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const distDir = path.join(process.cwd(), 'dist');
const templatePath = path.join(distDir, 'index.html');

if (!fs.existsSync(templatePath)) {
  console.error('Missing dist/index.html. Run `vite build` first.');
  process.exit(1);
}

const templateHtml = fs.readFileSync(templatePath, 'utf8');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const isMissingColumnError = (err) => {
  if (!err) return false;
  return err.code === '42703' || /column .* does not exist/i.test(err.message || '');
};

const escapeHtml = (value) =>
  String(value || '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });

const setTitle = (html, title) => {
  if (!title) return html;
  const safeTitle = `<title>${escapeHtml(title)}</title>`;
  if (/<title>.*<\/title>/i.test(html)) {
    return html.replace(/<title>.*<\/title>/i, safeTitle);
  }
  return html.replace('</head>', `  ${safeTitle}\n</head>`);
};

const upsertMeta = (html, name, content) => {
  if (!content) return html;
  const safe = escapeHtml(content);
  const tag = `<meta name="${name}" content="${safe}">`;
  const re = new RegExp(`<meta\\s+name=["']${name}["'][^>]*>`, 'i');
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</head>', `  ${tag}\n</head>`);
};

const upsertCanonical = (html, href) => {
  if (!href) return html;
  const safe = escapeHtml(href);
  const tag = `<link rel="canonical" href="${safe}">`;
  const re = /<link\s+rel=["']canonical["'][^>]*>/i;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</head>', `  ${tag}\n</head>`);
};

const applyMeta = (html, meta = {}) => {
  let out = html;
  out = setTitle(out, meta.title);
  out = upsertMeta(out, 'description', meta.description);
  out = upsertMeta(out, 'keywords', meta.keywords);
  out = upsertCanonical(out, meta.canonical);
  return out;
};

const writeRoute = (route, meta) => {
  const cleaned = String(route || '/').trim();
  const isRoot = cleaned === '/' || cleaned === '';
  const targetDir = isRoot
    ? distDir
    : path.join(distDir, cleaned.replace(/^\/+/, '').replace(/\/+$/, ''));

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const outPath = path.join(targetDir, 'index.html');
  const finalHtml = applyMeta(templateHtml, meta);
  fs.writeFileSync(outPath, finalHtml);
};

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const buildKeywords = (...items) => {
  const seen = new Set();
  const out = [];
  items
    .flat()
    .filter(Boolean)
    .forEach((item) => {
      String(item)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => {
          const key = s.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(s);
          }
        });
    });
  return out.join(', ');
};

const HOME_SEO = {
  title:
    "Indian Trade Mart- India's leading online B2B marketplace and platform for Indian Manufacturers, Suppliers, Exporters, Service provider, Directory.",
  description:
    "indiantrademart.com is  single window & India's leading online B2B marketplace and platform for Indian Manufacturers, Suppliers, Exporters & Service provider, serving as the pivotal link between buyers and suppliers, free online business directory & yellow page with listing Indian & International companies. We provide a platform to empowering generations of entrepreneurs, Small & Medium Enterprises, Large Enterprises as well as individual users. Find here quality products, trade leads, manufacturers, suppliers, exporters & international buyers.",
  keywords:
    'online B2B marketplace, online B2B platform, Business directory, business directory in India, business e-commerce, business listings, B2C online marketplaces in India, Digital commerce platform, business website, business marketplace, companies business listings, companies database india, companies directory, companies directory india, directory of companies, directory of indian companies, service provider, e-commerce in india, trade & commerce, exporter importer directory, exporters business directory, exporters in india, free business listings, free business listings in india, free business marketplace, free indian companies business listings, free manufacturers directory india, importers, india business directory, india export import, india importers, Indian Trade Mart, indian business, Indian companies directory, indian exporters, indian exporters directory, indian manufacturers directory, indian market, indian service providers, manufacturers directory, manufacturers in india, online business directory, suppliers directory, yellow pages, Properties, Builder & Real Estate, Survey & Soil Investigation, Engineering Services, Construction Materials & Machines, Construction Materials & Machines, Electrical Equipment, Electronics & Electrical, R & D and Testing Labs, Business & Audit Services, Product Rental & Leasing, Product Rental & Leasing, Hand & Machine Tools, Mechanical Parts & Spares, Industrial Supplies, Industrial Plants & Machinery, Food & Beverages, Apparel & Garments, Packaging Machines & Goods, Chemicals, Dyes & Solvents, Lab Instruments & Supplies, Furniture & Supplies, Automobile, Parts & Spares, Housewares & Supplies, Metals, Alloys & Minerals, Handicrafts & Decorative, Kitchen Utensils & Appliances, Textiles, Yarn & Fabrics, Books & Stationery, Cosmetics & Personal Care, Home Textile & Furnishing, Drugs & Pharmaceuticals, Gems, Jewelry & Astrology, Computer & IT Solutions, Fashion Accessories & Gear, Herbal & Ayurvedic Product, Security Systems & Services, Sports Goods, Toys & Games, Paper & Paper Products, Bags, Belts & Wallets, Media, PR & Publishing, Marble, Granite & Stones, Event Planner & Organizer, IT & Telecom Services, Transportation & Logistics, Financial & Legal Services, Education & Training, Travel, Tourism & Hotels, Call Center & BPO Services, Bicycle, Rickshaw & Spares, Hospital & Diagnostics, HR Planning & Recruitment, Rail, Shipping & Aviation, House Keeping Services, Leather Products, Misc Contractors & Freelancers, Electronics Components, Hospital, Clinic & Consultation, Construction & Infrastructural Consultant, Album, Movies, Commercial Ads',
};

const DIRECTORY_SEO = {
  title: 'Business Directory, India Business Directory,Companies Directory in India',
  description:
    'India Business Directory - Online business & companies directory with free business listings of indian companies, exporter importer and detailed information about their business profiles. Free list yourself at largest & most trusted business directory in india.',
  keywords:
    'Business directory, india business directory, directory of companies, exporter importer directory, companies directory in india, companies database india, business directory in india, business listings, companies directories, online business directory, free directory, Indian companies directory, free business listings in india, free business listings, business directory, companies directory, business to business companies, directory of indian companies, exporters business directory, companies business listings, companies directory india, free indian companies business listings, indiamart',
};

const fetchHeads = async () => {
  let res = await supabase
    .from('head_categories')
    .select('id, name, slug, description, meta_tags, keywords');

  if (res.error && isMissingColumnError(res.error)) {
    res = await supabase
      .from('head_categories')
      .select('id, name, slug, description');
  }

  if (res.error && isMissingColumnError(res.error)) {
    res = await supabase
      .from('head_categories')
      .select('id, name, slug');
  }

  if (res.error) {
    console.warn('Head categories fetch failed:', res.error);
    return [];
  }

  return res.data || [];
};

const fetchSubs = async () => {
  let res = await supabase
    .from('sub_categories')
    .select('id, name, slug, description, meta_tags, keywords, head_categories!inner(id, name, slug)');

  if (res.error && isMissingColumnError(res.error)) {
    res = await supabase
      .from('sub_categories')
      .select('id, name, slug, description, head_categories!inner(id, name, slug)');
  }

  if (res.error && isMissingColumnError(res.error)) {
    res = await supabase
      .from('sub_categories')
      .select('id, name, slug, head_categories!inner(id, name, slug)');
  }

  if (res.error) {
    console.warn('Sub categories fetch failed:', res.error);
    return [];
  }

  return res.data || [];
};

const fetchMicros = async () => {
  const res = await supabase
    .from('micro_categories')
    .select(
      'id, name, slug, sub_categories!inner(id, name, slug, head_categories!inner(id, name, slug))'
    );

  if (res.error) {
    console.warn('Micro categories fetch failed:', res.error);
    return [];
  }

  return res.data || [];
};

const fetchMicroMetaMap = async (ids) => {
  const map = new Map();
  const chunks = chunkArray(ids, 100);

  for (const chunk of chunks) {
    let res = await supabase
      .from('micro_category_meta')
      .select('micro_categories, meta_tags, description, keywords')
      .in('micro_categories', chunk);

    if (res.error && isMissingColumnError(res.error)) {
      res = await supabase
        .from('micro_category_meta')
        .select('micro_categories, meta_tags, description')
        .in('micro_categories', chunk);
    }

    if (res.error) {
      console.warn('Micro meta fetch failed:', res.error);
      continue;
    }

    (res.data || []).forEach((row) => {
      map.set(row.micro_categories, row);
    });
  }

  return map;
};

const run = async () => {
  writeRoute('/', {
    title: HOME_SEO.title,
    description: HOME_SEO.description,
    keywords: HOME_SEO.keywords,
    canonical: `${BASE_URL}/`,
  });

  writeRoute('/directory', {
    title: DIRECTORY_SEO.title,
    description: DIRECTORY_SEO.description,
    keywords: DIRECTORY_SEO.keywords,
    canonical: `${BASE_URL}/directory`,
  });

  const [heads, subs, micros] = await Promise.all([fetchHeads(), fetchSubs(), fetchMicros()]);
  const microMetaMap = await fetchMicroMetaMap(micros.map((m) => m.id).filter(Boolean));

  heads.forEach((head) => {
    const title = head.meta_tags || `${head.name} | IndianTradeMart`;
    const description = head.description || `Browse ${head.name} categories on IndianTradeMart.`;
    const keywords = head.keywords || buildKeywords(head.name, 'suppliers', 'manufacturers', 'IndianTradeMart');
    writeRoute(`/directory/${head.slug}`, {
      title,
      description,
      keywords,
      canonical: `${BASE_URL}/directory/${head.slug}`,
    });
  });

  subs.forEach((sub) => {
    const head = sub.head_categories;
    if (!head?.slug) return;

    const title = sub.meta_tags || `${sub.name} | ${head.name} - IndianTradeMart`;
    const description = sub.description || `Browse ${sub.name} sub-categories under ${head.name}.`;
    const keywords = sub.keywords || buildKeywords(sub.name, head.name, 'suppliers', 'products', 'IndianTradeMart');

    writeRoute(`/directory/${head.slug}/${sub.slug}`, {
      title,
      description,
      keywords,
      canonical: `${BASE_URL}/directory/${head.slug}/${sub.slug}`,
    });
  });

  micros.forEach((micro) => {
    const sub = micro.sub_categories;
    const head = sub?.head_categories;
    if (!sub?.slug || !head?.slug) return;

    const meta = microMetaMap.get(micro.id) || {};
    const title = meta.meta_tags || `${micro.name} Suppliers & Manufacturers | ${sub.name} - ${head.name} | IndianTradeMart`;
    const description = meta.description || `Browse ${micro.name} products and suppliers on IndianTradeMart.`;
    const keywords = meta.keywords || buildKeywords(meta.meta_tags, micro.name, sub.name, head.name, 'suppliers', 'manufacturers');

    writeRoute(`/directory/${head.slug}/${sub.slug}/${micro.slug}`, {
      title,
      description,
      keywords,
      canonical: `${BASE_URL}/directory/${head.slug}/${sub.slug}/${micro.slug}`,
    });
  });

  console.log(`✅ SEO prerender complete. Generated ${heads.length} head, ${subs.length} sub, ${micros.length} micro pages.`);
};

run().catch((err) => {
  console.error('SEO prerender failed:', err);
  process.exit(1);
});
