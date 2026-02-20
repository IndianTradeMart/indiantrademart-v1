
/**
 * Simple CSV Parser and Validator
 */

export const parseCSV = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const rows = text.split('\n').map(row => row.trim()).filter(r => r);
        
        if (rows.length === 0) {
            resolve({ headers: [], data: [] });
            return;
        }

        // Assume first row is header
        const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
        const data = [];

        for (let i = 1; i < rows.length; i++) {
          const values = rows[i].split(',').map(v => v.trim());
          // Basic handle for comma inside quotes could be added here if needed
          // For now, simple split
          
          if (values.length === headers.length) {
             const rowObj = {};
             headers.forEach((h, index) => {
                 rowObj[h] = values[index];
             });
             data.push(rowObj);
          } else if (values.length > 0 && values.some(v => v)) {
             // Handle mismatch length but not empty
             // Map as much as possible
             const rowObj = {};
             headers.forEach((h, index) => {
                 rowObj[h] = values[index] || '';
             });
             rowObj['_error'] = 'Column count mismatch';
             data.push(rowObj);
          }
        }
        resolve({ headers, data });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
};

export const validateCategories = (data, existingCategories = []) => {
    // data is array of objects { head_category, sub_category, micro_category }
    const validated = data.map((row, index) => {
        const errors = [];
        if (!row.head_category) errors.push('Missing Head Category');
        if (!row.sub_category) errors.push('Missing Sub Category');
        if (!row.micro_category) errors.push('Missing Micro Category');
        
        // Check local duplicates in this batch
        const isDuplicateInBatch = data.findIndex((r, i) => 
            i !== index && 
            r.head_category === row.head_category && 
            r.sub_category === row.sub_category && 
            r.micro_category === row.micro_category
        ) !== -1;

        if (isDuplicateInBatch) errors.push('Duplicate in file');

        // Check DB duplicates (if existingCategories provided)
        // Optimization: Create a set of signatures for O(1) lookup
        // Doing simple find for now as lists might be manageable
        /* 
        const exists = existingCategories.some(c => 
            c.head_category === row.head_category && 
            c.sub_category === row.sub_category && 
            c.micro_category === row.micro_category
        );
        if (exists) errors.push('Already exists in Database');
        */

        return {
            ...row,
            isValid: errors.length === 0,
            errors
        };
    });

    return validated;
};

export const validateLocations = (data) => {
    // data is array of objects { state, city }
    const validated = data.map((row, index) => {
        const errors = [];
        if (!row.state) errors.push('Missing State');
        if (!row.city) errors.push('Missing City');

        const isDuplicateInBatch = data.findIndex((r, i) => 
            i !== index && 
            r.state === row.state && 
            r.city === row.city
        ) !== -1;

        if (isDuplicateInBatch) errors.push('Duplicate in file');

        return {
            ...row,
            isValid: errors.length === 0,
            errors
        };
    });
    return validated;
};
