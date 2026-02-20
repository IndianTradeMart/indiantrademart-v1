/**
 * Extract meaningful keywords from a sentence
 * Removes common words, extracts nouns
 */
export const extractKeywords = (sentence) => {
  if (!sentence || sentence.length < 2) return [];
  
  // Common words to ignore
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'from', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'could', 'may', 'might', 'must', 'can', 'me', 'my', 'myself', 'you',
    // common marketplace filler words
    'best', 'top', 'quality', 'services', 'service', 'provider', 'providers',
    'supplier', 'suppliers', 'company', 'companies', 'pvt', 'ltd', 'limited',
    'manufacturer', 'manufacturers', 'dealer', 'dealers', 'distributor', 'distributors',
    'wholesaler', 'wholesalers', 'trader', 'traders', 'exporter', 'exporters',
    'agency', 'agencies', 'solution', 'solutions', 'consultant', 'consultants',
    'contractor', 'contractors', 'work', 'works', 'job', 'jobs'
  ]);
  
  return sentence
    .toLowerCase()
    .trim()
    .split(/[\s,.-]+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
};

/**
 * Calculate similarity score between two strings (0-1)
 * Uses character-based matching
 */
export const calculateSimilarity = (str1, str2) => {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // Levenshtein-like distance calculation
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  let matches = 0;
  for (let char of shorter) {
    if (longer.includes(char)) matches++;
  }
  
  return matches / longer.length;
};

/**
 * Find best matching category from a list of micro categories
 * Returns the category with highest match score
 */
export const findBestMatchingCategory = (productName, microCategories) => {
  if (!productName || !microCategories || microCategories.length === 0) {
    return null;
  }
  
  const keywords = extractKeywords(productName);
  if (keywords.length === 0) return null;
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const category of microCategories) {
    // Score based on name matching
    let score = 0;
    
    // Direct name match (highest weight)
    score += calculateSimilarity(productName, category.name) * 0.5;
    
    // Keyword matching (medium weight)
    const catKeywords = extractKeywords(category.name);
    let keywordMatches = 0;
    for (const keyword of keywords) {
      for (const catKeyword of catKeywords) {
        if (keyword === catKeyword || calculateSimilarity(keyword, catKeyword) > 0.7) {
          keywordMatches++;
        }
      }
    }
    
    if (keywords.length > 0) {
      score += (keywordMatches / keywords.length) * 0.5;
    }
    
    // Description match if available (low weight)
    if (category.description) {
      const descriptionScore = calculateSimilarity(productName, category.description);
      score += descriptionScore * 0.1;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }
  
  // Only return if score is above threshold (0.3 = 30% match)
  return bestScore > 0.3 ? { category: bestMatch, score: bestScore } : null;
};

/**
 * Validate if a match is strong enough to auto-select
 * Strong match = score > 0.6
 */
export const isStrongMatch = (score) => {
  return score && score > 0.6;
};
