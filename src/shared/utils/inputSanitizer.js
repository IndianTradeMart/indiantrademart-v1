const toStringValue = (value) => {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
};

const toLower = (value) => toStringValue(value).toLowerCase();

const includesAny = (value, needles = []) => needles.some((needle) => value.includes(needle));

const compactSpaces = (value) => value.replace(/\s{2,}/g, ' ');

const normalizeHintFragment = (value) =>
  toStringValue(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasCodeToken = (value, token) => {
  if (!value || !token) return false;
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(token)}(?:[^a-z0-9]|$)`);
  return pattern.test(value);
};

export const detectInputKind = ({
  type,
  name,
  id,
  autoComplete,
  placeholder,
  inputMode,
  ariaLabel,
  title,
  labelText,
} = {}) => {
  const normalizedType = toLower(type);
  const normalizedName = normalizeHintFragment(name || id);
  const hintText = [
    normalizedName,
    normalizeHintFragment(autoComplete),
    normalizeHintFragment(placeholder),
    normalizeHintFragment(ariaLabel),
    normalizeHintFragment(title),
    normalizeHintFragment(labelText),
  ]
    .filter(Boolean)
    .join(' ');

  if (
    [
      'password',
      'file',
      'date',
      'datetime-local',
      'time',
      'month',
      'week',
      'color',
      'range',
      'checkbox',
      'radio',
    ].includes(normalizedType)
  ) {
    return 'none';
  }

  if (includesAny(hintText, ['password', 'passcode', 'pwd'])) {
    return 'none';
  }

  if (
    normalizedType === 'search' ||
    includesAny(hintText, ['search', 'query', 'keyword', 'filter'])
  ) {
    return 'search';
  }

  if (normalizedType === 'email' || includesAny(hintText, ['email', 'e-mail', 'mail'])) {
    return 'email';
  }

  if (includesAny(hintText, ['otp', 'one time password', 'verification code'])) {
    return 'otp';
  }

  if (includesAny(hintText, ['pincode', 'pin code', 'postal', 'zip'])) {
    return 'pincode';
  }

  if (
    normalizedType === 'tel' ||
    includesAny(hintText, ['phone', 'mobile', 'contact', 'landline', 'whatsapp'])
  ) {
    return 'phone';
  }

  if (hasCodeToken(hintText, 'gst')) return 'gst';
  if (hasCodeToken(hintText, 'pan')) return 'pan';
  if (hasCodeToken(hintText, 'aadhaar') || hasCodeToken(hintText, 'aadhar')) return 'aadhaar';
  if (hasCodeToken(hintText, 'cin')) return 'cin';
  if (hasCodeToken(hintText, 'llpin')) return 'llpin';
  if (hasCodeToken(hintText, 'iec')) return 'iec';
  if (hasCodeToken(hintText, 'tan')) return 'tan';

  if (normalizedType === 'url' || includesAny(hintText, ['website', 'url', 'link'])) {
    return 'url';
  }

  const numericHint = includesAny(hintText, [
    'qty',
    'quantity',
    'budget',
    'price',
    'amount',
    'rate',
    'turnover',
    'year',
    'stock',
    'count',
  ]);

  if (normalizedType === 'number' || toLower(inputMode) === 'numeric') return 'digits';
  if (toLower(inputMode) === 'decimal') return 'decimal';
  if (numericHint) {
    if (includesAny(hintText, ['budget', 'price', 'amount', 'rate', 'turnover'])) return 'decimal';
    return 'digits';
  }

  const isPersonName =
    includesAny(hintText, [
      'full name',
      'owner name',
      'first name',
      'last name',
      'full_name',
      'owner_name',
      'first_name',
      'last_name',
    ]) && !includesAny(hintText, ['company']);

  if (isPersonName) return 'person_name';

  return 'none';
};

const getElementLabelText = (element) => {
  if (!element) return '';

  let text = '';

  if (element.labels && element.labels.length) {
    text += ` ${Array.from(element.labels)
      .map((label) => label?.textContent || '')
      .join(' ')}`;
  }

  const wrapper = element.closest('div, section, article, form');
  const siblingLabel = wrapper?.querySelector('label');
  if (siblingLabel?.textContent) {
    text += ` ${siblingLabel.textContent}`;
  }

  return compactSpaces(toStringValue(text).trim());
};

export const detectInputKindFromElement = (element) => {
  if (!element) return 'none';

  const typeAttr = element.getAttribute?.('type') || element.type;
  const nameAttr = element.getAttribute?.('name') || element.name;
  const idAttr = element.getAttribute?.('id') || element.id;
  const autoCompleteAttr = element.getAttribute?.('autocomplete') || element.autocomplete;
  const placeholderAttr = element.getAttribute?.('placeholder') || element.placeholder;
  const inputModeAttr = element.getAttribute?.('inputmode') || element.inputMode;
  const ariaLabelAttr = element.getAttribute?.('aria-label') || element.ariaLabel;
  const titleAttr = element.getAttribute?.('title') || element.title;
  const labelText = getElementLabelText(element);

  return detectInputKind({
    type: typeAttr,
    name: nameAttr,
    id: idAttr,
    autoComplete: autoCompleteAttr,
    placeholder: placeholderAttr,
    inputMode: inputModeAttr,
    ariaLabel: ariaLabelAttr,
    title: titleAttr,
    labelText,
  });
};

const keepOnlyDigits = (value) => value.replace(/\D/g, '');

const keepSingleDecimal = (value) => {
  const cleaned = value.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  const before = cleaned.slice(0, firstDot + 1);
  const after = cleaned.slice(firstDot + 1).replace(/\./g, '');
  return `${before}${after}`;
};

export const sanitizeInputByKind = (kind, rawValue) => {
  const value = toStringValue(rawValue);

  switch (kind) {
    case 'email':
      return value.replace(/\s+/g, '').toLowerCase();
    case 'otp':
      return keepOnlyDigits(value).slice(0, 6);
    case 'pincode':
      return keepOnlyDigits(value).slice(0, 6);
    case 'phone': {
      let next = value.replace(/[^\d+]/g, '');
      next = next.replace(/(?!^)\+/g, '');
      if (next.startsWith('+')) {
        next = `+${next.slice(1).replace(/\+/g, '')}`;
      }
      return next.slice(0, 16);
    }
    case 'gst':
      return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    case 'pan':
      return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    case 'aadhaar':
      return keepOnlyDigits(value).slice(0, 12);
    case 'cin':
      return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 21);
    case 'llpin':
      return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    case 'iec':
      return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    case 'tan':
      return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    case 'digits':
      return keepOnlyDigits(value);
    case 'decimal':
      return keepSingleDecimal(value);
    case 'person_name':
      return compactSpaces(value.replace(/[^A-Za-z\s.'-]/g, '')).replace(/^\s+/, '');
    case 'url':
      return value.replace(/\s/g, '');
    default:
      return value;
  }
};

export const maxLengthByKind = {
  otp: 6,
  pincode: 6,
  phone: 16,
  gst: 15,
  pan: 10,
  aadhaar: 12,
  cin: 21,
  llpin: 8,
  iec: 10,
  tan: 10,
};
