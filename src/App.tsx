import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import {
  DataGridPremium,
  type GridColDef,
  type GridColumnVisibilityModel,
  type GridDensity,
  type GridFilterModel,
  type GridGroupNode,
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

type PersistedFilter = {
  field: string;
  operator: string;
  value: string | number | boolean | null;
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
  filters: PersistedFilter[];
  editedCells: PersistedEditedCell[];
  uiState: {
    expandedGroups: string[];
    density: GridDensity;
  };
};

const DEFAULT_WIDTHS: Record<GridField, number> = {
  securityName: 220,
  assetClass: 180,
  quantity: 120,
  price: 120,
  notes: 250,
};

const DEFAULT_HIDDEN: Record<GridField, boolean> = {
  securityName: false,
  assetClass: true,
  quantity: false,
  price: false,
  notes: false,
};

const EDITABLE_FIELDS: GridField[] = [
  'securityName',
  'assetClass',
  'quantity',
  'price',
  'notes',
];

const ASSET_CLASS_OPTIONS = ['Equity', 'Mutual Funds', 'ETF', 'Bonds'];

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

    return ['assetClass'];
  }, [persisted]);

  const initialGroupColumnHidden =
    persisted?.grouping?.groupColumnHidden ?? true;

  const initialVisibilityModel = useMemo<GridColumnVisibilityModel>(() => {
    const visibilityModel: GridColumnVisibilityModel = {};

    for (const field of GRID_FIELDS) {
      const savedColumn = persistedColumns.find((column) => column.field === field);
      const hidden = savedColumn?.hidden ?? DEFAULT_HIDDEN[field];
      visibilityModel[field] = !hidden;
    }

    const groupedField = initialGroupingModel[0];

    if (groupedField && initialGroupColumnHidden) {
      visibilityModel[groupedField] = false;
    }

    return visibilityModel;
  }, [initialGroupColumnHidden, initialGroupingModel, persistedColumns]);

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
    () => ({
      items: (persisted?.filters ?? [])
        .filter((item) => isGridField(item.field) && Boolean(item.operator))
        .map((item, index) => ({
          id: index + 1,
          field: item.field,
          operator: item.operator,
          value: item.value,
        })),
    }),
    [persisted],
  );

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
  const [columnVisibilityModel, setColumnVisibilityModel] =
    useState<GridColumnVisibilityModel>(initialVisibilityModel);
  const [rowGroupingModel, setRowGroupingModel] =
    useState<GridRowGroupingModel>(initialGroupingModel);
  const [groupColumnHidden, setGroupColumnHidden] = useState<boolean>(
    initialGroupColumnHidden,
  );
  const [sortModel, setSortModel] = useState<GridSortModel>(initialSortModel);
  const [filterModel, setFilterModel] =
    useState<GridFilterModel>(initialFilterModel);
  const [expandedGroups, setExpandedGroups] =
    useState<string[]>(initialExpandedGroups);
  const [density, setDensity] = useState<GridDensity>(initialDensity);

  const columns = useMemo<GridColDef<SecurityRow>[]>(() => {
    const orderLookup = new Map(
      sanitizeColumnOrder(columnOrder).map((field, index) => [field, index]),
    );

    const baseColumns: GridColDef<SecurityRow>[] = [
      {
        field: 'securityName',
        headerName: 'Security Name',
        minWidth: 180,
        width: columnWidths.securityName,
        flex: 1.2,
        editable: true,
      },
      {
        field: 'assetClass',
        headerName: 'Asset Class',
        minWidth: 160,
        width: columnWidths.assetClass,
        flex: 0.9,
        editable: true,
        type: 'singleSelect',
        valueOptions: ASSET_CLASS_OPTIONS,
      },
      {
        field: 'quantity',
        headerName: 'Quantity',
        type: 'number',
        minWidth: 120,
        width: columnWidths.quantity,
        editable: true,
        align: 'right',
        headerAlign: 'right',
        valueParser: (value) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        },
      },
      {
        field: 'price',
        headerName: 'Price',
        type: 'number',
        minWidth: 120,
        width: columnWidths.price,
        editable: true,
        align: 'right',
        headerAlign: 'right',
        valueParser: (value) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        },
      },
      {
        field: 'notes',
        headerName: 'Notes',
        minWidth: 220,
        width: columnWidths.notes,
        flex: 1.4,
        editable: true,
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
      const previousGroupField = rowGroupingModel[0];
      const nextGroupField = nextModel[0];

      setRowGroupingModel(nextModel);

      if (!groupColumnHidden) {
        return;
      }

      setColumnVisibilityModel((previous) => {
        const next = { ...previous };

        if (previousGroupField && previousGroupField !== nextGroupField) {
          next[previousGroupField] = true;
        }

        if (nextGroupField) {
          next[nextGroupField] = false;
        }

        return next;
      });
    },
    [groupColumnHidden, rowGroupingModel],
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
        groupColumnHidden: groupedField ? groupColumnHidden : false,
      },
      columns: safeColumnOrder.map((field, index) => ({
        field,
        width: Math.round(columnWidths[field] ?? DEFAULT_WIDTHS[field]),
        hidden: columnVisibilityModel[field] === false,
        order: index + 1,
        ...(groupColumnHidden && rowGroupingModel.includes(field)
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
      filters: filterModel.items
        .filter((item) => isGridField(item.field) && Boolean(item.operator))
        .map((item) => ({
          field: item.field,
          operator: item.operator,
          value: item.value ?? null,
        })),
      editedCells,
      uiState: {
        expandedGroups: Array.from(new Set(expandedGroups)),
        density,
      },
    };
  }, [
    columnOrder,
    columnVisibilityModel,
    columnWidths,
    density,
    editedCells,
    expandedGroups,
    filterModel.items,
    groupColumnHidden,
    rowGroupingModel,
    sortModel,
  ]);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(persistedConfig, null, 2),
    );
  }, [persistedConfig]);

  return (
    <Box
      sx={{
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        p: { xs: 1.25, sm: 2, md: 3 },
        background:
          'linear-gradient(160deg, #f6f8fb 0%, #ffffff 45%, #edf3ff 100%)',
      }}
    >
      <Card
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ p: { xs: 1.25, sm: 2 } }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            sx={{ mb: 1.5 }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Securities Grid
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Double-click any editable cell to update content. Grid settings
                auto-save to localStorage.
              </Typography>
            </Box>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
            >
              <FormControl size="small" sx={{ minWidth: 200 }}>
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

              <FormControlLabel
                control={
                  <Switch
                    checked={groupColumnHidden}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setGroupColumnHidden(checked);

                      const groupedField = rowGroupingModel[0];
                      if (groupedField) {
                        setColumnVisibilityModel((previous) => ({
                          ...previous,
                          [groupedField]: !checked,
                        }));
                      }
                    }}
                  />
                }
                label="Hide grouped column"
              />
            </Stack>
          </Stack>

          <Box
            sx={{
              width: '100%',
              height: { xs: 500, sm: 560, md: 640 },
              '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus': {
                outline: 'none',
              },
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
              initialState={{
                pagination: {
                  paginationModel: {
                    page: 0,
                    pageSize: 10,
                  },
                },
              }}
              rowGroupingModel={rowGroupingModel}
              onRowGroupingModelChange={setGroupingAndVisibility}
              defaultGroupingExpansionDepth={0}
              isGroupExpandedByDefault={isGroupExpandedByDefault}
              columnVisibilityModel={columnVisibilityModel}
              onColumnVisibilityModelChange={setColumnVisibilityModel}
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
                // Keep a visible failure signal in dev tools for invalid edits.
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
            />
          </Box>

          <Box sx={{ mt: 1.5 }}>
            <Typography
              variant="caption"
              sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
            >
              Saved key: {STORAGE_KEY}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default App;
