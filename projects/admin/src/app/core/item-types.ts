/**
 * Inventory item-type contract (INVENTORY-CONTRACT.md §1, §3, §4, §5).
 *
 * Pure data and pure functions only: no Angular imports, so the section maps,
 * required-field rules, price derivation and naming rules can be unit tested
 * without a component. `Category.itemType` is the single switch; the legacy
 * `show*Fields` flags are only consulted as a last-resort fallback for a
 * backend that has not yet been migrated.
 */

export type ItemType =
  | 'JEWELLERY'
  | 'LOOSE_GEMSTONE'
  | 'GEMSTONE_LOT'
  | 'ROUGH'
  | 'IDOL_CARVING'
  | 'STRAND_BEADS'
  | 'COMPONENT'
  | 'SET';

export type SaleMode = 'PER_PIECE' | 'PER_CARAT' | 'PER_GRAM' | 'PER_LOT' | 'PER_STRAND';

export type GemGrade = 'PRECIOUS' | 'SEMI_PRECIOUS' | 'ORGANIC' | 'LAB_GROWN';

export type PlainOrStudded = 'PLAIN' | 'STUDDED';

export const ITEM_TYPES: ReadonlyArray<{ value: ItemType; label: string }> = [
  { value: 'JEWELLERY', label: 'Jewellery' },
  { value: 'LOOSE_GEMSTONE', label: 'Loose gemstone' },
  { value: 'GEMSTONE_LOT', label: 'Gemstone lot' },
  { value: 'ROUGH', label: 'Rough / specimen' },
  { value: 'IDOL_CARVING', label: 'Idol / carving' },
  { value: 'STRAND_BEADS', label: 'Strand / beads' },
  { value: 'COMPONENT', label: 'Component' },
  { value: 'SET', label: 'Set' }
];

export const ITEM_TYPE_LABEL: Record<ItemType, string> = ITEM_TYPES.reduce(
  (acc, t) => ({ ...acc, [t.value]: t.label }),
  {} as Record<ItemType, string>
);

export function isItemType(value: unknown): value is ItemType {
  return typeof value === 'string' && value in ITEM_TYPE_LABEL;
}

export const SALE_MODE_LABEL: Record<SaleMode, string> = {
  PER_PIECE: 'Per piece',
  PER_CARAT: 'Per carat',
  PER_GRAM: 'Per gram',
  PER_LOT: 'Per lot',
  PER_STRAND: 'Per strand'
};

/** §1: allowed sale modes per item type, default first. */
export const ALLOWED_SALE_MODES: Record<ItemType, ReadonlyArray<SaleMode>> = {
  JEWELLERY: ['PER_PIECE'],
  LOOSE_GEMSTONE: ['PER_PIECE', 'PER_CARAT'],
  GEMSTONE_LOT: ['PER_LOT', 'PER_CARAT'],
  ROUGH: ['PER_PIECE', 'PER_CARAT', 'PER_GRAM', 'PER_LOT'],
  IDOL_CARVING: ['PER_PIECE'],
  STRAND_BEADS: ['PER_STRAND', 'PER_PIECE'],
  COMPONENT: ['PER_PIECE', 'PER_GRAM', 'PER_LOT'],
  SET: ['PER_PIECE']
};

export function defaultSaleMode(type: ItemType | null): SaleMode {
  return type ? ALLOWED_SALE_MODES[type][0] : 'PER_PIECE';
}

export const CRAFTS: ReadonlyArray<string> = [
  'Polki', 'Kundan', 'Meenakari', 'Jadau', 'Filigree', 'Temple', 'Antique', 'Plain', 'Other'
];

export const GEM_GRADES: ReadonlyArray<{ value: GemGrade; label: string }> = [
  { value: 'PRECIOUS', label: 'Precious' },
  { value: 'SEMI_PRECIOUS', label: 'Semi-precious' },
  { value: 'ORGANIC', label: 'Organic' },
  { value: 'LAB_GROWN', label: 'Lab grown' }
];

// ---------------------------------------------------------------------------
// Sections (§5)
// ---------------------------------------------------------------------------

/**
 * Optional form sections. Basic Information, Inventory & Verification, Media
 * and Sale & Pricing are always shown and are therefore not listed.
 */
export type FormSection =
  | 'JEWELLERY_DETAILS'
  | 'LOOSE_GEMSTONE_DETAILS'
  | 'LOT_DETAILS'
  | 'ROUGH_DETAILS'
  | 'IDOL_DETAILS'
  | 'STRAND_DETAILS'
  | 'COMPONENT_DETAILS'
  | 'CERTIFICATION'
  | 'PRICE_BREAKUP'
  | 'CUSTOMIZATION';

export const SECTIONS_BY_TYPE: Record<ItemType, ReadonlyArray<FormSection>> = {
  JEWELLERY: ['JEWELLERY_DETAILS', 'PRICE_BREAKUP', 'CUSTOMIZATION'],
  SET: ['JEWELLERY_DETAILS', 'PRICE_BREAKUP', 'CUSTOMIZATION'],
  LOOSE_GEMSTONE: ['LOOSE_GEMSTONE_DETAILS', 'CERTIFICATION'],
  GEMSTONE_LOT: ['LOT_DETAILS', 'CERTIFICATION'],
  ROUGH: ['ROUGH_DETAILS'],
  IDOL_CARVING: ['IDOL_DETAILS'],
  STRAND_BEADS: ['STRAND_DETAILS'],
  COMPONENT: ['COMPONENT_DETAILS']
};

export function sectionsFor(type: ItemType | null): ReadonlySet<FormSection> {
  return new Set(type ? SECTIONS_BY_TYPE[type] : []);
}

// ---------------------------------------------------------------------------
// Required fields (§4)
// ---------------------------------------------------------------------------

/** Form value shape the rules read. Paths are dotted form-control paths. */
export type FormValues = Record<string, any>;

export interface RequiredRule {
  /** Satisfied when ANY of these control paths holds a value. */
  fields: ReadonlyArray<string>;
  /** Human label used in the "missing fields" summary. */
  label: string;
  /** Optional precondition; the rule is ignored when it returns false. */
  when?: (values: FormValues) => boolean;
}

export const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  category: 'Category',
  price: 'Selling price',
  unitPrice: 'Unit price',
  stockQuantity: 'Stock quantity',
  'metalDetails.metalType': 'Metal type',
  'metalDetails.metalPurity': 'Metal purity',
  'metalDetails.netWeight': 'Net weight',
  grossWeight: 'Gross weight',
  stoneDetails: 'At least one mounted stone',
  caratWeight: 'Carat weight',
  species: 'Species',
  variety: 'Variety',
  shape: 'Shape',
  pieceCount: 'Piece count',
  lotTotalCaratWeight: 'Lot total carat weight',
  roughWeight: 'Rough weight',
  roughMaterial: 'Rough material',
  gemstoneMaterial: 'Gemstone material',
  heightInches: 'Height',
  dimensions: 'Dimensions',
  material: 'Material',
  beadSizeMm: 'Bead size',
  strandLengthInches: 'Strand length',
  strandCount: 'Strand count',
  componentType: 'Component type',
  quantityPcs: 'Quantity (pcs)',
  totalWeight: 'Total weight'
};

const isStudded = (v: FormValues) => v['plainOrStudded'] === 'STUDDED';

export const REQUIRED_RULES: Record<ItemType, ReadonlyArray<RequiredRule>> = {
  JEWELLERY: [
    { fields: ['metalDetails.metalType'], label: FIELD_LABELS['metalDetails.metalType'] },
    { fields: ['metalDetails.metalPurity'], label: FIELD_LABELS['metalDetails.metalPurity'] },
    { fields: ['grossWeight'], label: FIELD_LABELS['grossWeight'] },
    { fields: ['stoneDetails'], label: FIELD_LABELS['stoneDetails'], when: isStudded }
  ],
  SET: [
    { fields: ['metalDetails.metalType'], label: FIELD_LABELS['metalDetails.metalType'] },
    { fields: ['metalDetails.metalPurity'], label: FIELD_LABELS['metalDetails.metalPurity'] },
    { fields: ['grossWeight'], label: FIELD_LABELS['grossWeight'] }
  ],
  LOOSE_GEMSTONE: [
    { fields: ['caratWeight'], label: FIELD_LABELS['caratWeight'] },
    { fields: ['species', 'variety'], label: 'Species or variety' },
    { fields: ['shape'], label: FIELD_LABELS['shape'] }
  ],
  GEMSTONE_LOT: [
    { fields: ['pieceCount'], label: FIELD_LABELS['pieceCount'] },
    { fields: ['lotTotalCaratWeight'], label: FIELD_LABELS['lotTotalCaratWeight'] },
    { fields: ['species', 'variety'], label: 'Species or variety' }
  ],
  ROUGH: [
    { fields: ['roughWeight'], label: FIELD_LABELS['roughWeight'] },
    { fields: ['roughMaterial'], label: FIELD_LABELS['roughMaterial'] }
  ],
  IDOL_CARVING: [
    { fields: ['gemstoneMaterial'], label: FIELD_LABELS['gemstoneMaterial'] },
    { fields: ['heightInches', 'dimensions'], label: 'Height or dimensions' }
  ],
  STRAND_BEADS: [
    { fields: ['material'], label: 'Bead material' },
    { fields: ['beadSizeMm'], label: FIELD_LABELS['beadSizeMm'] },
    { fields: ['strandLengthInches'], label: FIELD_LABELS['strandLengthInches'] }
  ],
  COMPONENT: [
    { fields: ['componentType'], label: FIELD_LABELS['componentType'] },
    { fields: ['pieceCount', 'quantityPcs'], label: 'Piece count or quantity (pcs)' }
  ]
};

/** Rules that apply to every product regardless of type. */
export const ALWAYS_REQUIRED: ReadonlyArray<RequiredRule> = [
  { fields: ['name'], label: FIELD_LABELS['name'] },
  { fields: ['description'], label: FIELD_LABELS['description'] },
  { fields: ['category'], label: FIELD_LABELS['category'] },
  { fields: ['stockQuantity'], label: FIELD_LABELS['stockQuantity'] }
];

/**
 * Every control path a required validator may be attached to. The component
 * clears validators on all of these before re-applying the current rule set,
 * so hidden sections never keep a stale `required`.
 */
export const DYNAMIC_REQUIRED_PATHS: ReadonlyArray<string> = Array.from(
  new Set<string>([
    ...Object.values(REQUIRED_RULES).flatMap(rules => rules.flatMap(r => r.fields)),
    'unitPrice',
    'caratWeight', 'lotTotalCaratWeight', 'roughWeight', 'totalWeight', 'grossWeight'
  ])
).filter(p => p !== 'stoneDetails');

export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  return true;
}

export function readPath(values: FormValues, path: string): unknown {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), values);
}

// ---------------------------------------------------------------------------
// Sale & pricing (§4)
// ---------------------------------------------------------------------------

export type QuantityUnit = 'ct' | 'g' | 'pieces' | 'strand';

export interface QuantityField {
  path: string;
  label: string;
  unit: QuantityUnit;
  /** True when the price cannot be derived without it (PER_CARAT, PER_GRAM). */
  requiredForPrice: boolean;
}

/**
 * The quantity input shown in Sale & Pricing for a given type and mode.
 * PER_PIECE has none: the price is typed directly.
 */
export function quantityFieldFor(type: ItemType | null, mode: SaleMode): QuantityField | null {
  switch (mode) {
    case 'PER_CARAT': {
      const path = type === 'GEMSTONE_LOT' ? 'lotTotalCaratWeight'
        : type === 'ROUGH' ? 'roughWeight'
        : 'caratWeight';
      return { path, label: FIELD_LABELS[path], unit: 'ct', requiredForPrice: true };
    }
    case 'PER_GRAM': {
      const path = type === 'COMPONENT' ? 'totalWeight' : 'grossWeight';
      return { path, label: FIELD_LABELS[path], unit: 'g', requiredForPrice: true };
    }
    case 'PER_LOT':
      return { path: 'pieceCount', label: 'Pieces in lot', unit: 'pieces', requiredForPrice: false };
    case 'PER_STRAND':
      return { path: 'strandCount', label: 'Strands per item', unit: 'strand', requiredForPrice: false };
    case 'PER_PIECE':
    default:
      return null;
  }
}

/**
 * GROWTH-CONTRACT §1: the one weight a quick capture asks for, mapped server-side
 * to the item type's key weight field. Carats for stones / lots / rough, grams
 * for everything else. `null` when the type is unknown (no weight input shown).
 */
export function primaryWeightFieldFor(type: ItemType | null): QuantityField | null {
  switch (type) {
    case 'LOOSE_GEMSTONE':
      return { path: 'caratWeight', label: FIELD_LABELS['caratWeight'], unit: 'ct', requiredForPrice: false };
    case 'GEMSTONE_LOT':
      return { path: 'lotTotalCaratWeight', label: FIELD_LABELS['lotTotalCaratWeight'], unit: 'ct', requiredForPrice: false };
    case 'ROUGH':
      return { path: 'roughWeight', label: FIELD_LABELS['roughWeight'], unit: 'ct', requiredForPrice: false };
    case 'COMPONENT':
      return { path: 'totalWeight', label: FIELD_LABELS['totalWeight'], unit: 'g', requiredForPrice: false };
    case 'JEWELLERY':
    case 'SET':
    case 'IDOL_CARVING':
    case 'STRAND_BEADS':
      return { path: 'grossWeight', label: FIELD_LABELS['grossWeight'], unit: 'g', requiredForPrice: false };
    default:
      return null;
  }
}

export const UNIT_PRICE_SUFFIX: Record<SaleMode, string> = {
  PER_PIECE: '/ piece',
  PER_CARAT: '/ ct',
  PER_GRAM: '/ g',
  PER_LOT: '/ lot',
  PER_STRAND: '/ strand'
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function firstNumber(values: FormValues, paths: string[]): { value: number | null; path: string } {
  for (const p of paths) {
    const n = toNumber(readPath(values, p));
    if (n !== null) return { value: n, path: p };
  }
  return { value: null, path: paths[0] };
}

/** HALF_UP to 2 dp, matching BigDecimal.setScale(2, RoundingMode.HALF_UP) for non-negative amounts. */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface DerivedPrice {
  price: number | null;
  /** Set when derivation is impossible; names the control that is missing. */
  missingField?: string;
}

/**
 * §4 price derivation, computed exactly as the server does:
 *   PER_CARAT  price = unitPrice * (lotTotalCaratWeight ?? caratWeight ?? roughWeight)
 *   PER_GRAM   price = unitPrice * (totalWeight ?? grossWeight ?? metalDetails.netWeight)
 *   PER_LOT / PER_STRAND / PER_PIECE   price = unitPrice
 * Returns `{ price: null }` when unitPrice itself is missing.
 */
export function derivePrice(mode: SaleMode, values: FormValues): DerivedPrice {
  const unitPrice = toNumber(values['unitPrice']);
  if (unitPrice === null) return { price: null, missingField: 'unitPrice' };

  switch (mode) {
    case 'PER_CARAT': {
      const q = firstNumber(values, ['lotTotalCaratWeight', 'caratWeight', 'roughWeight']);
      if (q.value === null) return { price: null, missingField: q.path };
      return { price: roundMoney(unitPrice * q.value) };
    }
    case 'PER_GRAM': {
      const q = firstNumber(values, ['totalWeight', 'grossWeight', 'metalDetails.netWeight']);
      if (q.value === null) return { price: null, missingField: q.path };
      return { price: roundMoney(unitPrice * q.value) };
    }
    case 'PER_LOT':
    case 'PER_STRAND':
    case 'PER_PIECE':
    default:
      return { price: roundMoney(unitPrice) };
  }
}

/** averagePieceWeight = lotTotalCaratWeight / pieceCount when both present (3 dp). */
export function averagePieceWeight(values: FormValues): number | null {
  const total = toNumber(values['lotTotalCaratWeight']);
  const count = toNumber(values['pieceCount']);
  if (total === null || count === null || count <= 0) return null;
  return Math.round((total / count) * 1000) / 1000;
}

/**
 * Labels of every required field that is currently missing, combining the
 * always-required set, the per-type rules and the sale-mode derivation needs.
 */
export function missingRequired(type: ItemType | null, mode: SaleMode, values: FormValues): string[] {
  const missing: string[] = [];
  const check = (rule: RequiredRule) => {
    if (rule.when && !rule.when(values)) return;
    if (!rule.fields.some(f => hasValue(readPath(values, f)))) missing.push(rule.label);
  };

  ALWAYS_REQUIRED.forEach(check);

  if (mode === 'PER_PIECE') {
    check({ fields: ['price'], label: FIELD_LABELS['price'] });
  } else {
    check({ fields: ['unitPrice'], label: `${FIELD_LABELS['unitPrice']} (${UNIT_PRICE_SUFFIX[mode]})` });
    const q = quantityFieldFor(type, mode);
    if (q?.requiredForPrice) {
      check({ fields: [q.path], label: `${q.label} (needed for ${SALE_MODE_LABEL[mode].toLowerCase()} pricing)` });
    }
  }

  if (type) REQUIRED_RULES[type].forEach(check);
  return missing;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CategoryNode {
  id: string;
  name: string;
  displayName: string;
  isActive?: boolean;
  /** Effective type from the backend (resolved through parents) or null. */
  itemType?: ItemType | string | null;
  parentId?: string | null;
  subcategories?: CategoryNode[];
  // Legacy flags, kept for a fallback only.
  showJewelryFields?: boolean;
  showGemstoneFields?: boolean;
  showComponentFields?: boolean;
  showIdolFields?: boolean;
  showRoughFields?: boolean;
}

export interface FlatCategory extends CategoryNode {
  level: number;
  /** Display names from the root down to this node. */
  path: string[];
}

/** Depth-first flattening of the tree, preserving order, with level and path. */
export function flattenCategoryTree(roots: ReadonlyArray<CategoryNode>): FlatCategory[] {
  const out: FlatCategory[] = [];
  const walk = (nodes: ReadonlyArray<CategoryNode>, level: number, path: string[], parentId: string | null) => {
    for (const n of nodes) {
      const nodePath = [...path, n.displayName || n.name];
      out.push({ ...n, level, path: nodePath, parentId: n.parentId ?? parentId });
      if (n.subcategories?.length) walk(n.subcategories, level + 1, nodePath, n.id);
    }
  };
  walk(roots, 0, [], null);
  return out;
}

export function indexById(flat: ReadonlyArray<FlatCategory>): Map<string, FlatCategory> {
  return new Map(flat.map(c => [c.id, c]));
}

/** The node and all of its ancestors, nearest first. */
export function ancestry(node: FlatCategory | null | undefined, byId: Map<string, FlatCategory>): FlatCategory[] {
  const chain: FlatCategory[] = [];
  const seen = new Set<string>();
  let cur: FlatCategory | undefined = node ?? undefined;
  while (cur && !seen.has(cur.id)) {
    chain.push(cur);
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

function itemTypeFromLegacyFlags(c: CategoryNode): ItemType | null {
  if (c.showJewelryFields) return 'JEWELLERY';
  if (c.showGemstoneFields) return 'LOOSE_GEMSTONE';
  if (c.showRoughFields) return 'ROUGH';
  if (c.showIdolFields) return 'IDOL_CARVING';
  if (c.showComponentFields) return 'COMPONENT';
  return null;
}

/**
 * Effective item type: the DTO's `itemType` (already resolved server-side),
 * otherwise the nearest ancestor's, otherwise the legacy flags on the chain.
 */
export function resolveItemType(node: FlatCategory | null | undefined, byId: Map<string, FlatCategory>): ItemType | null {
  const chain = ancestry(node, byId);
  for (const c of chain) {
    if (isItemType(c.itemType)) return c.itemType;
  }
  for (const c of chain) {
    const legacy = itemTypeFromLegacyFlags(c);
    if (legacy) return legacy;
  }
  return null;
}

/** True when the node's effective type is the same as its parent's, i.e. nothing of its own to show. */
export function isInheritedItemType(node: FlatCategory, byId: Map<string, FlatCategory>): boolean {
  if (!node.parentId) return false;
  const parent = byId.get(node.parentId);
  if (!parent) return false;
  return resolveItemType(node, byId) === resolveItemType(parent, byId);
}

/**
 * §5 gemGrade default from the category branch. Checked nearest-first so a
 * "Natural Pearl (Moti)" leaf under "Precious" resolves to ORGANIC.
 */
export function defaultGemGrade(chain: ReadonlyArray<{ name: string; displayName: string }>): GemGrade | null {
  for (const c of chain) {
    const text = `${c.displayName} ${c.name}`.toLowerCase();
    if (/pearl|coral|amber|organic/.test(text)) return 'ORGANIC';
    if (/lab[\s-]?grown|lab\b|cvd|synthetic/.test(text)) return 'LAB_GROWN';
    if (/semi[\s-]?precious/.test(text)) return 'SEMI_PRECIOUS';
    if (/precious/.test(text)) return 'PRECIOUS';
  }
  return null;
}

/** Idols branch (as opposed to Carvings): deity-specific fields are shown. */
export function isIdolBranch(chain: ReadonlyArray<{ name: string; displayName: string }>): boolean {
  return chain.some(c => /idol|deity/i.test(`${c.displayName} ${c.name}`));
}

// ---------------------------------------------------------------------------
// Auto name and description (§5)
// ---------------------------------------------------------------------------

export interface NamingContext extends FormValues {
  /** Display name of the selected category node. */
  categoryLabel?: string;
  /** Display name of the selected sub-category node, if any. */
  subCategoryLabel?: string;
}

/** "7.20" for 7.2, "58" for 58, "" for null. */
export function formatQty(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function words(...parts: Array<string | null | undefined>): string {
  return parts.map(p => (p ?? '').toString().trim()).filter(p => p !== '').join(' ');
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

/** Skip "Rose" when the metal type is already "Rose Gold". */
function metalWords(v: FormValues): string {
  const type = str(v['metalDetails']?.metalType);
  const color = str(v['metalColor']);
  if (!color || type.toLowerCase().includes(color.toLowerCase())) return type;
  return words(color, type);
}

function craftWord(v: FormValues): string {
  const craft = str(v['craft']);
  return craft && craft !== 'Plain' && craft !== 'Other' ? craft : '';
}

function mainStone(v: FormValues): string {
  const stones: any[] = Array.isArray(v['stoneDetails']) ? v['stoneDetails'] : [];
  return str(stones[0]?.stoneType);
}

export function buildAutoName(type: ItemType | null, v: NamingContext): string {
  const purity = str(v['metalDetails']?.metalPurity);
  const piece = str(v.subCategoryLabel) || str(v.categoryLabel);
  const gem = str(v['variety']) || str(v['species']);
  const origin = str(v['originProvenance']);

  switch (type) {
    case 'JEWELLERY': {
      const stone = v['plainOrStudded'] === 'STUDDED' ? mainStone(v) : '';
      return words(purity, metalWords(v), craftWord(v), piece, stone ? `with ${stone}` : '');
    }
    case 'SET':
      return words(purity, str(v['metalDetails']?.metalType), craftWord(v), piece);
    case 'LOOSE_GEMSTONE': {
      const ct = formatQty(v['caratWeight']);
      const lab = str(v['labReportNumber']) ? 'Certified' : '';
      return words(ct ? `${ct} ct` : '', gem, str(v['shape']), origin, lab);
    }
    case 'GEMSTONE_LOT': {
      const count = formatQty(v['pieceCount']);
      const ct = formatQty(v['lotTotalCaratWeight']);
      const head = words(count ? `Lot of ${count}` : 'Lot of', gem, str(v['shape']));
      const tail = words(ct ? `${ct} ct` : '', str(v['sizeRange']));
      if (!count && !gem) return '';
      return tail ? `${head}, ${tail}` : head;
    }
    case 'ROUGH': {
      const ct = formatQty(v['roughWeight']);
      const material = str(v['roughMaterial']);
      if (!material) return '';
      return words(material, 'Rough', ct ? `${ct} ct` : '', str(v['mineOrigin']));
    }
    case 'IDOL_CARVING': {
      const deity = str(v['subjectDeityName']);
      const subject = deity ? `${deity} Idol` : str(v['carvingStyle']);
      const material = str(v['gemstoneMaterial']);
      const height = formatQty(v['heightInches']);
      if (!subject && !material) return '';
      const head = material ? words(subject, 'in', material) : subject;
      return height ? `${head}, ${height} in` : head;
    }
    case 'STRAND_BEADS': {
      const material = str(v['material']);
      const size = formatQty(v['beadSizeMm']);
      const length = formatQty(v['strandLengthInches']);
      if (!material && !str(v['beadStyle'])) return '';
      const head = words(material, str(v['beadStyle']), 'Strand', size ? `${size} mm` : '');
      return length ? `${head}, ${length} in` : head;
    }
    case 'COMPONENT': {
      const count = formatQty(v['pieceCount']) || formatQty(v['quantityPcs']);
      const componentType = str(v['componentType']);
      if (!componentType) return '';
      return words(componentType, str(v['material']), str(v['purity']), count ? `x${count}` : '');
    }
    default:
      return words(piece);
  }
}

export function buildAutoDescription(type: ItemType | null, v: NamingContext, name: string): string {
  if (!name) return '';
  const gem = str(v['variety']) || str(v['species']);
  const origin = str(v['originProvenance']);
  const treatment = str(v['treatmentStatus']);

  switch (type) {
    case 'JEWELLERY':
    case 'SET': {
      const metal = words(str(v['metalDetails']?.metalPurity), metalWords(v));
      const gross = formatQty(v['grossWeight']);
      const stones: any[] = Array.isArray(v['stoneDetails']) ? v['stoneDetails'] : [];
      const stoneCount = stones.reduce((n, s) => n + (toNumber(s?.pieceCount) ?? 0), 0);
      const stone = mainStone(v);
      const craft = craftWord(v);
      const piece = str(v.subCategoryLabel) || str(v.categoryLabel) || name;
      return `${piece}${metal ? ` crafted in ${metal}` : ''}${craft ? ` in ${craft} work` : ''}` +
        `${gross ? `, gross weight ${gross} g` : ''}` +
        `${stoneCount > 0 ? `, set with ${stoneCount} ${stone ? stone.toLowerCase() : 'stone'}${stoneCount === 1 ? '' : 's'}`
          : (stone && v['plainOrStudded'] === 'STUDDED' ? `, set with ${stone.toLowerCase()}` : '')}` +
        `${str(v['huid']) ? `, BIS hallmarked (HUID ${str(v['huid'])})` : ''}.`;
    }
    case 'LOOSE_GEMSTONE': {
      const ct = formatQty(v['caratWeight']);
      return `${ct ? `${ct} ct ` : ''}${words(str(v['shape']), gem)}` +
        `${origin ? ` from ${origin}` : ''}` +
        `${str(v['clarity']) ? `, ${str(v['clarity'])} clarity` : ''}` +
        `${treatment ? `, treatment: ${treatment}` : ''}` +
        `${str(v['labReportNumber']) ? `, certified (report ${str(v['labReportNumber'])})` : ''}.`;
    }
    case 'GEMSTONE_LOT': {
      const count = formatQty(v['pieceCount']);
      const ct = formatQty(v['lotTotalCaratWeight']);
      const avg = averagePieceWeight(v);
      return `Parcel of ${count || 'several'} ${words(str(v['shape']), gem)} stones` +
        `${ct ? ` totalling ${ct} ct` : ''}${avg !== null ? ` (about ${avg} ct each)` : ''}` +
        `${str(v['sizeRange']) ? `, ${str(v['sizeRange'])}` : ''}` +
        `${v['calibrated'] ? ', calibrated' : ''}` +
        `${origin ? `, origin ${origin}` : ''}${treatment ? `, treatment: ${treatment}` : ''}.`;
    }
    case 'ROUGH': {
      const ct = formatQty(v['roughWeight']);
      const count = formatQty(v['pieceCount']);
      return `${str(v['roughMaterial'])} rough${ct ? ` weighing ${ct} ct` : ''}` +
        `${count ? ` in ${count} piece${count === '1' ? '' : 's'}` : ''}` +
        `${str(v['mineOrigin']) ? ` from ${str(v['mineOrigin'])}` : ''}` +
        `${str(v['crystalMorphology']) ? `, ${str(v['crystalMorphology'])}` : ''}` +
        `${str(v['manufacturingStage']) ? `, stage: ${str(v['manufacturingStage'])}` : ''}.`;
    }
    case 'IDOL_CARVING': {
      const deity = str(v['subjectDeityName']);
      const subject = deity ? `${deity} idol` : (str(v['carvingStyle']) || 'Carving');
      const material = str(v['gemstoneMaterial']);
      const height = formatQty(v['heightInches']);
      const gross = formatQty(v['grossWeight']);
      return `${subject}${material ? ` hand-finished in ${material}` : ''}` +
        `${deity && str(v['carvingStyle']) ? `, ${str(v['carvingStyle'])} style` : ''}` +
        `${height ? `, ${height} in tall` : (str(v['dimensions']) ? `, ${str(v['dimensions'])}` : '')}` +
        `${gross ? `, ${gross} g` : ''}` +
        `${str(v['artistName']) ? `, by ${str(v['artistName'])}` : ''}` +
        `${str(v['carvingTechnique']) ? `, ${str(v['carvingTechnique'])}` : ''}.`;
    }
    case 'STRAND_BEADS': {
      const size = formatQty(v['beadSizeMm']);
      const length = formatQty(v['strandLengthInches']);
      const beads = formatQty(v['pieceCount']);
      const strands = formatQty(v['strandCount']);
      return `${words(str(v['material']), str(v['beadStyle']))} bead strand` +
        `${size ? `, ${size} mm beads` : ''}${length ? `, ${length} in long` : ''}` +
        `${beads ? `, ${beads} beads` : ''}${strands && strands !== '1' ? `, ${strands} strands` : ''}` +
        `${origin ? `, origin ${origin}` : ''}${treatment ? `, treatment: ${treatment}` : ''}.`;
    }
    case 'COMPONENT': {
      const count = formatQty(v['pieceCount']) || formatQty(v['quantityPcs']);
      const each = formatQty(v['weightPerPiece']);
      const total = formatQty(v['totalWeight']);
      return `${words(str(v['componentType']), 'in', words(str(v['material']), str(v['purity'])))}` +
        `${count ? `, pack of ${count}` : ''}${each ? `, ${each} g each` : ''}${total ? `, ${total} g total` : ''}` +
        `${str(v['sizeRange']) ? `, ${str(v['sizeRange'])}` : ''}.`;
    }
    default:
      return `${name}.`;
  }
}
