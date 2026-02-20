/**
 * Migration utility to add slugs to all existing products without slugs
 * Run this in browser console or as part of app initialization
 */

import { supabase } from '@/lib/customSupabaseClient';
import { generateUniqueSlug } from '@/shared/utils/slugUtils';

export const migrateProductSlugs = async () => {
  try {
    console.log('🔄 Starting product slug migration...');
    
    // Get all products without slugs
    const { data: productsWithoutSlugs, error: fetchError } = await supabase
      .from('products')
      .select('id, name')
      .or('slug.is.null,slug.eq.""');
    
    if (fetchError) throw fetchError;
    
    if (!productsWithoutSlugs || productsWithoutSlugs.length === 0) {
      console.log('✅ All products already have slugs!');
      return { success: true, updated: 0 };
    }
    
    console.log(`📝 Found ${productsWithoutSlugs.length} products without slugs`);
    
    let updated = 0;
    let failed = 0;
    
    // Update each product with a generated slug
    for (const product of productsWithoutSlugs) {
      try {
        const slug = generateUniqueSlug(product.name);
        
        const { error: updateError } = await supabase
          .from('products')
          .update({ slug })
          .eq('id', product.id);
        
        if (updateError) {
          console.error(`❌ Failed to update product ${product.id}:`, updateError);
          failed++;
        } else {
          console.log(`✅ Updated product "${product.name}" with slug: ${slug}`);
          updated++;
        }
      } catch (error) {
        console.error(`❌ Error processing product ${product.id}:`, error);
        failed++;
      }
    }
    
    console.log(`\n🎉 Migration complete!`);
    console.log(`✅ Updated: ${updated}`);
    console.log(`❌ Failed: ${failed}`);
    
    return { success: true, updated, failed };
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

// Alternative: Batch update for better performance
export const migrateProductSlugsBatch = async (batchSize = 50) => {
  try {
    console.log('🔄 Starting batch product slug migration...');
    
    let updated = 0;
    let failed = 0;
    let offset = 0;
    
    while (true) {
      // Get batch of products without slugs
      const { data: batch, error: fetchError } = await supabase
        .from('products')
        .select('id, name')
        .or('slug.is.null,slug.eq.""')
        .range(offset, offset + batchSize - 1);
      
      if (fetchError) throw fetchError;
      
      if (!batch || batch.length === 0) break;
      
      // Prepare updates for batch
      const updates = batch.map(product => ({
        id: product.id,
        slug: generateUniqueSlug(product.name)
      }));
      
      // Update all in batch
      for (const update of updates) {
        try {
          const { error: updateError } = await supabase
            .from('products')
            .update({ slug: update.slug })
            .eq('id', update.id);
          
          if (updateError) {
            failed++;
            console.error(`❌ Failed product ${update.id}:`, updateError);
          } else {
            updated++;
          }
        } catch (error) {
          failed++;
          console.error(`❌ Error updating ${update.id}:`, error);
        }
      }
      
      offset += batchSize;
      console.log(`📊 Progress: ${updated} updated, ${failed} failed`);
    }
    
    console.log(`\n🎉 Batch migration complete!`);
    console.log(`✅ Total Updated: ${updated}`);
    console.log(`❌ Total Failed: ${failed}`);
    
    return { success: true, updated, failed };
  } catch (error) {
    console.error('Batch migration failed:', error);
    throw error;
  }
};
