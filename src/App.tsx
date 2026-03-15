import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  CssBaseline,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  DataGridPremium,
  type GridColDef,
  type GridColumnVisibilityModel,
  type GridDensity,
  type GridFilterModel,
  type GridGroupNode,
  type GridPaginationModel,
  type GridRenderCellParams,
  type GridRowGroupingModel,
  type GridRowId,
  type GridSortModel,
  useGridApiRef,
} from '@mui/x-data-grid-premium';
import testJsonRaw from 'fast-json-stable-stringify/benchmark/test.json?raw';

const GRID_ID = 'securitiesGrid';
const GRID_VERSION = 1;
const STORAGE_KEY = `mui-grid-state:${GRID_ID}`;

const GRID_FIELDS = [
  'securityName',
  'assetClass',
  'quantity',
  'price',
  'notes',
] as const;

type GridField = (typeof GRID_FIELDS)[number];

type SourceRecord = {
  _id: string;
  index: number;
  name: string;
  age: number;
  balance: string;
  company: string;
  favoriteFruit: string;
  isActive: boolean;
};

type SecurityRow = {
  securityId: string;
  securityName: string;
  assetClass: string;
  quantity: number;
  price: number;
  notes: string;
};

type PersistedEditedCell = {
  rowId: GridRowId;
  field: string;
  value: unknown;
};

type PersistedGridState = {
  gridId: string;
  version: number;
  grouping: {
    enabled: boolean;
    groupBy: string | null;
    groupColumnHidden: boolean;
  };
  columns: Array<{
    field: string;
    width: number;
    hidden: boolean;
    order: number;
    hiddenWhenGrouped?: boolean;
  }>;
  sorting: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
  filters:
    | GridFilterModel
    | Array<{
        field: string;
        operator: string;
        value: string | number | boolean | null;
      }>;
  editedCells: PersistedEditedCell[];
  uiState: {
    expandedGroups: string[];
    density: GridDensity;
    paginationModel?: GridPaginationModel;
  };
};

const DEFAULT_WIDTHS: Record<GridField, number> = {
  securityName: 220,
  assetClass: 180,
  quantity: 120,
  price: 120,
  notes: 250,
};

const EDITABLE_FIELDS: GridField[] = [
  'securityName',
  'assetClass',
  'quantity',
  'price',
  'notes',
];

const ASSET_CLASS_OPTIONS = ['Equity', 'Mutual Funds', 'ETF', 'Bonds'];

const uiTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0A6764',
      light: '#58A9A3',
      dark: '#064644',
    },
    secondary: {
      main: '#B86A36',
      light: '#D99B65',
      dark: '#8B4B1F',
    },
    background: {
      default: '#ECF3F6',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#10262E',
      secondary: '#4C6671',
    },
  },
  shape: {
    borderRadius: 18,
  },
  typography: {
    fontFamily:
      '"Manrope", "Avenir Next", "Segoe UI", "Noto Sans", sans-serif',
    h3: {
      fontFamily: '"Fraunces", "Iowan Old Style", serif',
      fontWeight: 700,
      letterSpacing: '-0.03em',
      lineHeight: 1.05,
    },
    h6: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    button: {
      textTransform: 'none',
      fontWeight: 700,
    },
  },
});

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function isGridField(field: string): field is GridField {
  return GRID_FIELDS.includes(field as GridField);
}

function sanitizeColumnOrder(fields: string[]): GridField[] {
  const uniqueFields = fields.filter(
    (field, index, arr): field is GridField =>
      isGridField(field) && arr.indexOf(field) === index,
  );

  for (const field of GRID_FIELDS) {
    if (!uniqueFields.includes(field)) {
      uniqueFields.push(field);
    }
  }

  return uniqueFields;
}

function parseBalance(value: string): number {
  const numeric = Number(value.replace(/[$,]/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function toAssetClass(favoriteFruit: string, index: number): string {
  const normalized = favoriteFruit.toLowerCase();

  if (normalized === 'banana') {
    return 'Equity';
  }

  if (normalized === 'strawberry') {
    return 'Mutual Funds';
  }

  if (normalized === 'apple') {
    return 'ETF';
  }

  return index % 2 === 0 ? 'Bonds' : 'ETF';
}

function toSecurityRows(): SecurityRow[] {
  const source = JSON.parse(testJsonRaw) as SourceRecord[];

  return source.map((item) => ({
    securityId: `SEC${String(item.index + 101).padStart(3, '0')}`,
    securityName: item.name,
    assetClass: toAssetClass(item.favoriteFruit, item.index),
    quantity: item.age * (item.isActive ? 3 : 2),
    price: parseBalance(item.balance),
    notes: `Mapped from ${item.company}`,
  }));
}

function isValidDensity(value: unknown): value is GridDensity {
  return (
    value === 'compact' || value === 'standard' || value === 'comfortable'
  );
}

function readPersistedState(): PersistedGridState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedGridState;

    if (parsed.gridId !== GRID_ID || parsed.version !== GRID_VERSION) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function applyEditedCells(
  baseRows: SecurityRow[],
  editedCells: PersistedEditedCell[],
): SecurityRow[] {
  if (editedCells.length === 0) {
    return baseRows;
  }

  const updatesByRow = new Map<GridRowId, PersistedEditedCell[]>();

  for (const edit of editedCells) {
    if (!isGridField(edit.field)) {
      continue;
    }

    const existing = updatesByRow.get(edit.rowId) ?? [];
    existing.push(edit);
    updatesByRow.set(edit.rowId, existing);
  }

  return baseRows.map((row) => {
    const rowUpdates = updatesByRow.get(row.securityId);

    if (!rowUpdates || rowUpdates.length === 0) {
      return row;
    }

    const nextRow: SecurityRow = { ...row };

    for (const update of rowUpdates) {
      const field = update.field as GridField;

      if (field === 'quantity' || field === 'price') {
        const parsed = Number(update.value);
        nextRow[field] = Number.isFinite(parsed) ? parsed : 0;
      } else {
        nextRow[field] = String(update.value ?? '');
      }
    }

    return nextRow;
  });
}

function App() {
  const apiRef = useGridApiRef();

  const baseRows = useMemo(() => toSecurityRows(), []);
  const baseRowLookup = useMemo(
    () => new Map(baseRows.map((row) => [row.securityId, row])),
    [baseRows],
  );

  const persisted = useMemo(() => readPersistedState(), []);

  const persistedColumns = useMemo(
    () =>
      (persisted?.columns ?? []).filter((column) =>
        isGridField(column.field),
      ) as PersistedGridState['columns'],
    [persisted],
  );

  const initialColumnOrder = useMemo(() => {
    if (persistedColumns.length === 0) {
      return [...GRID_FIELDS];
    }

    const ordered = [...persistedColumns]
      .sort((a, b) => a.order - b.order)
      .map((column) => column.field);

    return sanitizeColumnOrder(ordered);
  }, [persistedColumns]);

  const initialWidths = useMemo(() => {
    const widths: Record<GridField, number> = { ...DEFAULT_WIDTHS };

    for (const column of persistedColumns) {
      widths[column.field as GridField] = Math.round(column.width);
    }

    return widths;
  }, [persistedColumns]);

  const initialGroupingModel = useMemo<GridRowGroupingModel>(() => {
    const groupBy = persisted?.grouping?.groupBy;

    if (
      persisted?.grouping?.enabled === true &&
      typeof groupBy === 'string' &&
      isGridField(groupBy)
    ) {
      return [groupBy];
    }

    return [];
  }, [persisted]);

  const initialSortModel = useMemo<GridSortModel>(
    () =>
      (persisted?.sorting ?? [])
        .filter(
          (item): item is { field: string; direction: 'asc' | 'desc' } =>
            isGridField(item.field) &&
            (item.direction === 'asc' || item.direction === 'desc'),
        )
        .map((item) => ({
          field: item.field,
          sort: item.direction,
        })),
    [persisted],
  );

  const initialFilterModel = useMemo<GridFilterModel>(
    () => {
      const persistedFilters = persisted?.filters;

      if (
        persistedFilters &&
        !Array.isArray(persistedFilters) &&
        Array.isArray(persistedFilters.items)
      ) {
        return persistedFilters;
      }

      return {
        items: (Array.isArray(persistedFilters) ? persistedFilters : [])
          .filter((item) => isGridField(item.field) && Boolean(item.operator))
          .map((item, index) => ({
            id: index + 1,
            field: item.field,
            operator: item.operator,
            value: item.value,
          })),
      };
    },
    [persisted],
  );

  const initialPaginationModel = useMemo<GridPaginationModel>(() => {
    const model = persisted?.uiState?.paginationModel;

    if (!model) {
      return { page: 0, pageSize: 10 };
    }

    const safePage = Number.isFinite(model.page) && model.page >= 0 ? model.page : 0;
    const safePageSize =
      Number.isFinite(model.pageSize) && model.pageSize > 0 ? model.pageSize : 10;

    return { page: safePage, pageSize: safePageSize };
  }, [persisted]);

  const defaultExpandedGroups = useMemo(
    () => Array.from(new Set(baseRows.map((row) => row.assetClass))),
    [baseRows],
  );

  const initialExpandedGroups =
    persisted?.uiState?.expandedGroups ?? defaultExpandedGroups;

  const initialDensity: GridDensity = isValidDensity(persisted?.uiState?.density)
    ? persisted.uiState.density
    : 'standard';

  const [editedCells, setEditedCells] = useState<PersistedEditedCell[]>(
    persisted?.editedCells ?? [],
  );
  const [rows, setRows] = useState<SecurityRow[]>(() =>
    applyEditedCells(baseRows, persisted?.editedCells ?? []),
  );

  const [columnOrder, setColumnOrder] = useState<GridField[]>(initialColumnOrder);
  const [columnWidths, setColumnWidths] =
    useState<Record<GridField, number>>(initialWidths);
  const [rowGroupingModel, setRowGroupingModel] =
    useState<GridRowGroupingModel>(initialGroupingModel);
  const [sortModel, setSortModel] = useState<GridSortModel>(initialSortModel);
  const [filterModel, setFilterModel] =
    useState<GridFilterModel>(initialFilterModel);
  const [paginationModel, setPaginationModel] =
    useState<GridPaginationModel>(initialPaginationModel);
  const [expandedGroups, setExpandedGroups] =
    useState<string[]>(initialExpandedGroups);
  const [density, setDensity] = useState<GridDensity>(initialDensity);

  const effectiveColumnVisibilityModel = useMemo<GridColumnVisibilityModel>(() => {
    const next: GridColumnVisibilityModel = {};

    for (const field of GRID_FIELDS) {
      next[field] = true;
    }

    for (const groupedField of rowGroupingModel) {
      next[groupedField] = false;
    }

    return next;
  }, [rowGroupingModel]);

  const totalMarketValue = useMemo(
    () => rows.reduce((sum, row) => sum + row.price * row.quantity, 0),
    [rows],
  );

  const totalQuantity = useMemo(
    () => rows.reduce((sum, row) => sum + row.quantity, 0),
    [rows],
  );

  const visibleColumnCount = useMemo(
    () =>
      GRID_FIELDS.filter(
        (field) => effectiveColumnVisibilityModel[field] !== false,
      ).length,
    [effectiveColumnVisibilityModel],
  );

  const columns = useMemo<GridColDef<SecurityRow>[]>(() => {
    const orderLookup = new Map(
      sanitizeColumnOrder(columnOrder).map((field, index) => [field, index]),
    );

    const baseColumns: GridColDef<SecurityRow>[] = [
      {
        field: 'securityName',
        headerName: 'Security Name',
        minWidth: 210,
        width: columnWidths.securityName,
        flex: 1.2,
        editable: true,
        align: 'left',
        headerAlign: 'left',
        renderCell: (params: GridRenderCellParams<SecurityRow, string>) => (
          <Typography
            sx={{
              fontWeight: 700,
              letterSpacing: '-0.01em',
              fontSize: '12px',
              lineHeight: 1.35,
              width: '100%',
              textAlign: 'left',
            }}
          >
            {params.value ?? ''}
          </Typography>
        ),
      },
      {
        field: 'assetClass',
        headerName: 'Asset Class',
        minWidth: 160,
        width: columnWidths.assetClass,
        flex: 0.9,
        editable: true,
        type: 'singleSelect',
        align: 'left',
        headerAlign: 'left',
        valueOptions: ASSET_CLASS_OPTIONS,
        renderCell: (params: GridRenderCellParams<SecurityRow, string>) => (
          <Chip
            size="small"
            label={params.value ?? '-'}
            sx={(theme) => ({
              fontWeight: 700,
              borderRadius: 999,
              color: theme.palette.primary.dark,
              fontSize: '12px',
              backgroundColor: alpha(theme.palette.primary.light, 0.2),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
            })}
          />
        ),
      },
      {
        field: 'quantity',
        headerName: 'Quantity',
        type: 'number',
        minWidth: 120,
        width: columnWidths.quantity,
        editable: true,
        align: 'center',
        headerAlign: 'center',
        valueParser: (value) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        },
      },
      {
        field: 'price',
        headerName: 'Price',
        type: 'number',
        minWidth: 140,
        width: columnWidths.price,
        editable: true,
        align: 'center',
        headerAlign: 'center',
        valueParser: (value) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        },
        renderCell: (params: GridRenderCellParams<SecurityRow, number>) => (
          <Typography
            sx={{
              width: '100%',
              textAlign: 'center',
              fontWeight: 700,
              color: 'secondary.dark',
              fontSize: '12px',
              lineHeight: 1.35,
            }}
          >
            {formatCurrency(Number(params.value ?? 0))}
          </Typography>
        ),
      },
      {
        field: 'notes',
        headerName: 'Notes',
        minWidth: 220,
        width: columnWidths.notes,
        flex: 1.4,
        editable: true,
        align: 'left',
        headerAlign: 'left',
      },
    ];

    return baseColumns.sort(
      (left, right) =>
        (orderLookup.get(left.field as GridField) ?? 999) -
        (orderLookup.get(right.field as GridField) ?? 999),
    );
  }, [columnOrder, columnWidths]);

  const syncColumnOrderFromGrid = useCallback(() => {
    if (!apiRef.current) {
      return;
    }

    const nextOrder = apiRef.current
      .getAllColumns()
      .map((column) => column.field)
      .filter((field): field is GridField => isGridField(field));

    if (nextOrder.length > 0) {
      setColumnOrder(sanitizeColumnOrder(nextOrder));
    }
  }, [apiRef]);

  const handleColumnWidthChange = useCallback(
    (field: string, width: number) => {
      if (!isGridField(field)) {
        return;
      }

      setColumnWidths((previous) => ({
        ...previous,
        [field]: Math.round(width),
      }));
    },
    [],
  );

  const processRowUpdate = useCallback(
    (newRow: SecurityRow) => {
      setRows((previousRows) =>
        previousRows.map((row) =>
          row.securityId === newRow.securityId ? newRow : row,
        ),
      );

      const originalRow = baseRowLookup.get(newRow.securityId);

      if (!originalRow) {
        return newRow;
      }

      setEditedCells((previous) => {
        const edits = new Map(
          previous.map((edit) => [`${edit.rowId}::${edit.field}`, edit]),
        );

        for (const field of EDITABLE_FIELDS) {
          const key = `${newRow.securityId}::${field}`;
          const nextValue = newRow[field];
          const originalValue = originalRow[field];

          if (nextValue !== originalValue) {
            edits.set(key, {
              rowId: newRow.securityId,
              field,
              value: nextValue,
            });
          } else {
            edits.delete(key);
          }
        }

        return Array.from(edits.values());
      });

      return newRow;
    },
    [baseRowLookup],
  );

  const setGroupingAndVisibility = useCallback(
    (nextModel: GridRowGroupingModel) => {
      setRowGroupingModel(nextModel);
    },
    [],
  );

  useEffect(() => {
    if (!apiRef.current) {
      return;
    }

    const unsubscribe = apiRef.current.subscribeEvent(
      'rowExpansionChange',
      (node: GridGroupNode) => {
        const groupedField = rowGroupingModel[0];

        if (
          !groupedField ||
          node.groupingField !== groupedField ||
          node.groupingKey == null
        ) {
          return;
        }

        const key = String(node.groupingKey);

        setExpandedGroups((previous) => {
          if (node.childrenExpanded) {
            return previous.includes(key) ? previous : [...previous, key];
          }

          return previous.filter((item) => item !== key);
        });
      },
    );

    return unsubscribe;
  }, [apiRef, rowGroupingModel]);

  const isGroupExpandedByDefault = useCallback(
    (node: GridGroupNode) => {
      const groupedField = rowGroupingModel[0];

      if (!groupedField || node.groupingField !== groupedField) {
        return false;
      }

      return expandedGroups.includes(String(node.groupingKey));
    },
    [expandedGroups, rowGroupingModel],
  );

  const persistedConfig = useMemo<PersistedGridState>(() => {
    const safeColumnOrder = sanitizeColumnOrder(columnOrder);
    const groupedField = rowGroupingModel[0] ?? null;

    return {
      gridId: GRID_ID,
      version: GRID_VERSION,
      grouping: {
        enabled: rowGroupingModel.length > 0,
        groupBy: groupedField,
        groupColumnHidden: rowGroupingModel.length > 0,
      },
      columns: safeColumnOrder.map((field, index) => ({
        field,
        width: Math.round(columnWidths[field] ?? DEFAULT_WIDTHS[field]),
        hidden: effectiveColumnVisibilityModel[field] === false,
        order: index + 1,
        ...(rowGroupingModel.includes(field)
          ? { hiddenWhenGrouped: true }
          : {}),
      })),
      sorting: sortModel
        .filter(
          (item): item is { field: string; sort: 'asc' | 'desc' } =>
            isGridField(item.field) &&
            (item.sort === 'asc' || item.sort === 'desc'),
        )
        .map((item) => ({
          field: item.field,
          direction: item.sort,
        })),
      filters: filterModel,
      editedCells,
      uiState: {
        expandedGroups: Array.from(new Set(expandedGroups)),
        density,
        paginationModel,
      },
    };
  }, [
    columnOrder,
    columnWidths,
    density,
    editedCells,
    effectiveColumnVisibilityModel,
    expandedGroups,
    filterModel,
    paginationModel,
    rowGroupingModel,
    sortModel,
  ]);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(persistedConfig, null, 2),
    );
  }, [persistedConfig]);

  const handleShareState = useCallback(() => {
    const stateJson =
      window.localStorage.getItem(STORAGE_KEY) ??
      JSON.stringify(persistedConfig, null, 2);
    const blob = new Blob([stateJson], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${GRID_ID}-state.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }, [persistedConfig]);

  return (
    <ThemeProvider theme={uiTheme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          position: 'relative',
          overflow: 'hidden',
          py: { xs: 2, sm: 3, md: 4 },
          '&::before': {
            content: '""',
            position: 'absolute',
            width: 420,
            height: 420,
            borderRadius: '50%',
            top: -160,
            right: -120,
            background: `radial-gradient(circle, ${alpha('#0A6764', 0.35)} 0%, ${alpha('#0A6764', 0)} 70%)`,
            pointerEvents: 'none',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            width: 360,
            height: 360,
            borderRadius: '50%',
            bottom: -140,
            left: -120,
            background: `radial-gradient(circle, ${alpha('#B86A36', 0.27)} 0%, ${alpha('#B86A36', 0)} 70%)`,
            pointerEvents: 'none',
          },
        }}
      >
        <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 1 }}>
          <Stack spacing={2.2}>
            <Card
              elevation={0}
              sx={(theme) => ({
                border: `1px solid ${alpha(theme.palette.primary.main, 0.14)}`,
                backgroundColor: alpha(theme.palette.common.white, 0.88),
                backdropFilter: 'blur(8px)',
                animation: 'fadeLift 620ms ease-out both',
              })}
            >
              <CardContent sx={{ p: { xs: 2.2, md: 3 } }}>
                <Stack
                  direction={{ xs: 'column', lg: 'row' }}
                  spacing={2.5}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', lg: 'center' }}
                >
                  <Box sx={{ maxWidth: 760 }}>
                    <Typography
                      variant="overline"
                      sx={{
                        color: 'primary.main',
                        letterSpacing: '0.14em',
                        fontWeight: 800,
                      }}
                    >
                      Portfolio Workbench
                    </Typography>
                    <Typography
                      variant="h3"
                      sx={{
                        mt: 0.25,
                        fontSize: { xs: '2rem', md: '2.8rem' },
                      }}
                    >
                      Securities Grid Experience
                    </Typography>
                    <Typography
                      sx={{
                        mt: 1,
                        color: 'text.secondary',
                        fontSize: { xs: '0.94rem', md: '1rem' },
                        maxWidth: 620,
                      }}
                    >
                      Responsive, data-dense, and interaction-first UI. Use the
                      toolbar to filter and hide columns, double-click cells to
                      edit, and drag any column header to rearrange position.
                    </Typography>
                  </Box>

                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    sx={{ width: { xs: '100%', lg: 'auto' } }}
                  >
                    <Box
                      sx={(theme) => ({
                        minWidth: 160,
                        borderRadius: 2,
                        p: 1.2,
                        backgroundColor: alpha(theme.palette.primary.main, 0.1),
                        border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
                      })}
                    >
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Market Value
                      </Typography>
                      <Typography variant="h6">{formatCurrency(totalMarketValue)}</Typography>
                    </Box>
                    <Box
                      sx={(theme) => ({
                        minWidth: 160,
                        borderRadius: 2,
                        p: 1.2,
                        backgroundColor: alpha(theme.palette.secondary.main, 0.1),
                        border: `1px solid ${alpha(theme.palette.secondary.main, 0.18)}`,
                      })}
                    >
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Total Quantity
                      </Typography>
                      <Typography variant="h6">{totalQuantity.toLocaleString()}</Typography>
                    </Box>
                    <Box
                      sx={(theme) => ({
                        minWidth: 160,
                        borderRadius: 2,
                        p: 1.2,
                        backgroundColor: alpha(theme.palette.common.black, 0.03),
                        border: `1px solid ${alpha(theme.palette.text.primary, 0.14)}`,
                      })}
                    >
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Visible Columns
                      </Typography>
                      <Typography variant="h6">{visibleColumnCount}</Typography>
                    </Box>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card
              elevation={0}
              sx={(theme) => ({
                border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
                boxShadow: `0 18px 50px ${alpha(theme.palette.primary.dark, 0.14)}`,
                animation: 'fadeLift 760ms ease-out both',
              })}
            >
              <CardContent sx={{ p: { xs: 1.4, sm: 1.8, md: 2.2 } }}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1.2}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                  sx={{ mb: 1.5 }}
                >
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                  >
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                      <InputLabel id="group-by-field">Group rows by</InputLabel>
                      <Select
                        labelId="group-by-field"
                        label="Group rows by"
                        value={rowGroupingModel[0] ?? ''}
                        onChange={(event) => {
                          const nextField = event.target.value;
                          setGroupingAndVisibility(
                            nextField ? ([nextField] as GridRowGroupingModel) : [],
                          );
                        }}
                      >
                        <MenuItem value="">None</MenuItem>
                        <MenuItem value="assetClass">Asset Class</MenuItem>
                        <MenuItem value="securityName">Security Name</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>

                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <Chip label="Drag headers to reorder columns" color="primary" />
                    <Chip label="Grouped column hides automatically" variant="outlined" />
                    <Chip label={`${editedCells.length} edited cell(s)`} variant="outlined" />
                    <Chip
                      label={`Grouping: ${rowGroupingModel[0] ?? 'None'}`}
                      variant="outlined"
                    />
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleShareState}
                    >
                      Share
                    </Button>
                  </Stack>
                </Stack>

                <Box
                  sx={{
                    width: '100%',
                    height: { xs: 500, sm: 560, md: 650 },
                  }}
                >
                  <DataGridPremium
                    apiRef={apiRef}
                    rows={rows}
                    columns={columns}
                    getRowId={(row) => row.securityId}
                    showToolbar
                    disableColumnReorder={false}
                    editMode="cell"
                    pagination
                    pageSizeOptions={[5, 10, 25]}
                    paginationModel={paginationModel}
                    onPaginationModelChange={setPaginationModel}
                    rowGroupingModel={rowGroupingModel}
                    onRowGroupingModelChange={setGroupingAndVisibility}
                    defaultGroupingExpansionDepth={0}
                    isGroupExpandedByDefault={isGroupExpandedByDefault}
                    columnVisibilityModel={effectiveColumnVisibilityModel}
                    onColumnOrderChange={syncColumnOrderFromGrid}
                    onColumnWidthChange={(params) =>
                      handleColumnWidthChange(params.colDef.field, params.width)
                    }
                    sortModel={sortModel}
                    onSortModelChange={setSortModel}
                    filterModel={filterModel}
                    onFilterModelChange={setFilterModel}
                    processRowUpdate={processRowUpdate}
                    onProcessRowUpdateError={(error) => {
                      console.error('Row update failed:', error);
                    }}
                    density={density}
                    onDensityChange={setDensity}
                    slotProps={{
                      toolbar: {
                        showQuickFilter: true,
                        quickFilterProps: {
                          debounceMs: 300,
                        },
                      },
                    }}
                    sx={(theme) => ({
                      border: 0,
                      borderRadius: 2.8,
                      backgroundColor: alpha(theme.palette.common.white, 0.94),
                      boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.15)}`,
                      '& .MuiDataGrid-toolbarContainer': {
                        p: 1,
                        gap: 1,
                        borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                        backgroundColor: alpha(theme.palette.primary.main, 0.03),
                      },
                      '& .MuiDataGrid-columnHeaders': {
                        borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
                        backgroundColor: alpha(theme.palette.primary.dark, 0.1),
                      },
                      '& .MuiDataGrid-columnHeaderTitle': {
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                      },
                      '& .MuiDataGrid-columnHeader': {
                        fontSize: '12px',
                        alignItems: 'center',
                      },
                      '& .MuiDataGrid-columnHeaderTitleContainer': {
                        alignItems: 'center',
                      },
                      '& .MuiDataGrid-columnHeader--alignLeft .MuiDataGrid-columnHeaderTitleContainer': {
                        justifyContent: 'flex-start',
                      },
                      '& .MuiDataGrid-columnHeader--alignCenter .MuiDataGrid-columnHeaderTitleContainer': {
                        justifyContent: 'center',
                      },
                      '& .MuiDataGrid-cell': {
                        borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                        fontSize: '12px',
                        alignItems: 'center',
                      },
                      '& .MuiDataGrid-cellContent': {
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        minHeight: '100%',
                        width: '100%',
                      },
                      '& .MuiDataGrid-cell--textLeft .MuiDataGrid-cellContent': {
                        justifyContent: 'flex-start',
                      },
                      '& .MuiDataGrid-cell--textCenter .MuiDataGrid-cellContent': {
                        justifyContent: 'center',
                      },
                      '& .MuiDataGrid-row': {
                        transition: 'background-color 160ms ease',
                      },
                      '& .MuiDataGrid-row:hover': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.055),
                      },
                      '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus': {
                        outline: 'none',
                      },
                      '& .MuiDataGrid-footerContainer': {
                        borderTop: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                        backgroundColor: alpha(theme.palette.primary.main, 0.02),
                      },
                    })}
                  />
                </Box>

                <Typography
                  variant="caption"
                  sx={{
                    mt: 1.2,
                    display: 'block',
                    color: 'text.secondary',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                >
                  localStorage key: {STORAGE_KEY}
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
