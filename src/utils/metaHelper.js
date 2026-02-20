/**
 * Generate dynamic meta tags by appending state and city
 * @param {string} baseMeta - Base meta tags (comma separated)
 * @param {string} city - City name
 * @param {string} state - State name
 * @returns {string} Enhanced meta tags with location
 */
export const generateDynamicMetaTags = (baseMeta, city, state) => {
  if (!baseMeta || !baseMeta.trim()) {
    return `${city}, ${state}`;
  }
  
  // Add city and state to the end of meta tags
  return `${baseMeta}, ${city}, ${state}`;
};

/**
 * Generate dynamic description by appending state and city
 * @param {string} baseDescription - Base description
 * @param {string} city - City name
 * @param {string} state - State name
 * @returns {string} Enhanced description with location
 */
export const generateDynamicDescription = (baseDescription, city, state) => {
  if (!baseDescription || !baseDescription.trim()) {
    return `Available in ${city}, ${state}`;
  }
  
  // Append location to description
  return `${baseDescription} in ${city}, ${state}`;
};

/**
 * Generate both meta tags and description
 * @param {object} meta - Meta object {meta_tags, description}
 * @param {string} city - City name
 * @param {string} state - State name
 * @returns {object} Object with dynamicMetaTags and dynamicDescription
 */
export const generateDynamicMeta = (meta, city, state) => {
  if (!meta) {
    return {
      dynamicMetaTags: `${city}, ${state}`,
      dynamicDescription: `Available in ${city}, ${state}`
    };
  }

  return {
    dynamicMetaTags: generateDynamicMetaTags(meta.meta_tags || meta.meta_tag, city, state),
    dynamicDescription: generateDynamicDescription(meta.description, city, state)
  };
};
