import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
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
  type GridPinnedColumnFields,
  type GridRowGroupingModel,
  type GridRowId,
  type GridRowIdGetter,
  type GridSortModel,
  type GridValidRowModel,
  useGridApiRef,
} from '@mui/x-data-grid-premium';

const DEFAULT_STORAGE_VERSION = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_HISTORY = 100;

const tiwariGridTheme = createTheme({
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
    borderRadius: 16,
  },
  typography: {
    fontFamily:
      '"Manrope", "Avenir Next", "Segoe UI", "Noto Sans", sans-serif',
  },
});

type PersistedColumnLayout = {
  field: string;
  width: number;
  hidden: boolean;
  order: number;
};

type PersistedGridState<R extends GridValidRowModel> = {
  gridId: string;
  version: number;
  rows: R[];
  columns: PersistedColumnLayout[];
  sortModel: GridSortModel;
  filterModel: GridFilterModel;
  rowGroupingModel: GridRowGroupingModel;
  pinnedColumns: GridPinnedColumnFields;
  density: GridDensity;
  paginationModel: GridPaginationModel;
  uiState: {
    expandedGroups: string[];
  };
};

type HistorySnapshot<R extends GridValidRowModel> = {
  rows: R[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  columnVisibilityModel: GridColumnVisibilityModel;
  sortModel: GridSortModel;
  filterModel: GridFilterModel;
  rowGroupingModel: GridRowGroupingModel;
  pinnedColumns: GridPinnedColumnFields;
  density: GridDensity;
  paginationModel: GridPaginationModel;
  expandedGroups: string[];
};

export type TiwariGridProps<R extends GridValidRowModel = GridValidRowModel> = {
  gridId: string;
  rows: R[];
  columns: GridColDef<R>[];
  getRowId?: GridRowIdGetter<R>;
  title?: string;
  subtitle?: string;
  storageVersion?: number;
  initialGroupingModel?: GridRowGroupingModel;
  initialPageSize?: number;
  onRowsChange?: (rows: R[]) => void;
};

function sanitizeColumnOrder(order: string[], allFields: string[]): string[] {
  const unique = order.filter(
    (field, index) => allFields.includes(field) && order.indexOf(field) === index,
  );

  for (const field of allFields) {
    if (!unique.includes(field)) {
      unique.push(field);
    }
  }

  return unique;
}

function isValidDensity(value: unknown): value is GridDensity {
  return value === 'compact' || value === 'standard' || value === 'comfortable';
}

function isValidPaginationModel(value: unknown): value is GridPaginationModel {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const page = (value as GridPaginationModel).page;
  const pageSize = (value as GridPaginationModel).pageSize;

  return Number.isFinite(page) && Number.isFinite(pageSize);
}

function readPersistedState<R extends GridValidRowModel>(
  storageKey: string,
  expectedVersion: number,
): PersistedGridState<R> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedGridState<R>;

    if (parsed.version !== expectedVersion) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function cloneSnapshot<R extends GridValidRowModel>(
  snapshot: HistorySnapshot<R>,
): HistorySnapshot<R> {
  return JSON.parse(JSON.stringify(snapshot)) as HistorySnapshot<R>;
}

export function TiwariGrid<R extends GridValidRowModel = GridValidRowModel>({
  gridId,
  rows,
  columns,
  getRowId,
  title = 'TiwariGrid',
  subtitle =
    'Editable, groupable, sortable, filterable, pinnable, searchable grid with layout persistence.',
  storageVersion = DEFAULT_STORAGE_VERSION,
  initialGroupingModel = [],
  initialPageSize = DEFAULT_PAGE_SIZE,
  onRowsChange,
}: TiwariGridProps<R>) {
  const apiRef = useGridApiRef();
  const storageKey = useMemo(() => `tiwari-grid-state:${gridId}`, [gridId]);
  const persisted = useMemo(
    () => readPersistedState<R>(storageKey, storageVersion),
    [storageKey, storageVersion],
  );

  const allFields = useMemo(
    () => columns.map((column) => String(column.field)),
    [columns],
  );

  const initialColumnOrder = useMemo(
    () =>
      sanitizeColumnOrder(
        [...(persisted?.columns ?? [])]
          .sort((a, b) => a.order - b.order)
          .map((column) => column.field),
        allFields,
      ),
    [allFields, persisted],
  );

  const initialColumnWidths = useMemo(() => {
    const widths: Record<string, number> = {};

    for (const column of columns) {
      const field = String(column.field);
      if (typeof column.width === 'number') {
        widths[field] = column.width;
      }
    }

    for (const layout of persisted?.columns ?? []) {
      widths[layout.field] = layout.width;
    }

    return widths;
  }, [columns, persisted]);

  const initialColumnVisibility = useMemo(() => {
    const visibility: GridColumnVisibilityModel = {};

    for (const layout of persisted?.columns ?? []) {
      visibility[layout.field] = !layout.hidden;
    }

    return visibility;
  }, [persisted]);

  const initialSortModel = useMemo<GridSortModel>(
    () => persisted?.sortModel ?? [],
    [persisted],
  );

  const initialFilterModel = useMemo<GridFilterModel>(
    () => persisted?.filterModel ?? { items: [] },
    [persisted],
  );

  const initialPinnedColumns = useMemo<GridPinnedColumnFields>(
    () => persisted?.pinnedColumns ?? {},
    [persisted],
  );

  const initialDensity = useMemo<GridDensity>(() => {
    if (isValidDensity(persisted?.density)) {
      return persisted.density;
    }

    return 'standard';
  }, [persisted]);

  const initialPaginationModel = useMemo<GridPaginationModel>(() => {
    if (isValidPaginationModel(persisted?.paginationModel)) {
      return persisted.paginationModel;
    }

    return { page: 0, pageSize: initialPageSize };
  }, [initialPageSize, persisted]);

  const initialExpandedGroups = persisted?.uiState?.expandedGroups ?? [];

  const [gridRows, setGridRows] = useState<R[]>(() => persisted?.rows ?? rows);
  const [columnOrder, setColumnOrder] = useState<string[]>(initialColumnOrder);
  const [columnWidths, setColumnWidths] =
    useState<Record<string, number>>(initialColumnWidths);
  const [columnVisibilityModel, setColumnVisibilityModel] =
    useState<GridColumnVisibilityModel>(initialColumnVisibility);
  const [sortModel, setSortModel] = useState<GridSortModel>(initialSortModel);
  const [filterModel, setFilterModel] =
    useState<GridFilterModel>(initialFilterModel);
  const [rowGroupingModel, setRowGroupingModel] = useState<GridRowGroupingModel>(
    persisted?.rowGroupingModel ?? initialGroupingModel,
  );
  const [pinnedColumns, setPinnedColumns] =
    useState<GridPinnedColumnFields>(initialPinnedColumns);
  const [density, setDensity] = useState<GridDensity>(initialDensity);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>(
    initialPaginationModel,
  );
  const [expandedGroups, setExpandedGroups] =
    useState<string[]>(initialExpandedGroups);

  const effectiveColumnVisibilityModel = useMemo(() => {
    const next = { ...columnVisibilityModel };

    for (const groupedField of rowGroupingModel) {
      next[groupedField] = false;
    }

    return next;
  }, [columnVisibilityModel, rowGroupingModel]);

  const orderedColumns = useMemo<GridColDef<R>[]>(() => {
    const orderLookup = new Map(
      sanitizeColumnOrder(columnOrder, allFields).map((field, index) => [field, index]),
    );

    return [...columns]
      .sort(
        (left, right) =>
          (orderLookup.get(String(left.field)) ?? 9999) -
          (orderLookup.get(String(right.field)) ?? 9999),
      )
      .map((column) => {
        const field = String(column.field);
        const width = columnWidths[field];
        const isNumeric = column.type === 'number';
        const baseColumn = {
          ...column,
          align: column.align ?? (isNumeric ? 'center' : 'left'),
          headerAlign: column.headerAlign ?? (isNumeric ? 'center' : 'left'),
        };

        if (typeof width === 'number') {
          return {
            ...baseColumn,
            width,
          };
        }

        return baseColumn;
      });
  }, [allFields, columnOrder, columnWidths, columns]);

  const groupingOptions = useMemo(
    () =>
      columns
        .filter((column) => column.groupable !== false)
        .map((column) => ({
          field: String(column.field),
          label: column.headerName ?? String(column.field),
        })),
    [columns],
  );

  const resolveRowId = useCallback(
    (row: R): GridRowId => {
      if (getRowId) {
        return getRowId(row);
      }

      const rowId = (row as { id?: GridRowId }).id;

      if (rowId == null) {
        throw new Error(
          'TiwariGrid: row.id is missing. Provide `getRowId` prop when rows do not have an `id` field.',
        );
      }

      return rowId;
    },
    [getRowId],
  );

  const syncColumnOrderFromGrid = useCallback(() => {
    if (!apiRef.current) {
      return;
    }

    const nextOrder = apiRef.current
      .getAllColumns()
      .map((column) => String(column.field))
      .filter((field) => allFields.includes(field));

    setColumnOrder(sanitizeColumnOrder(nextOrder, allFields));
  }, [allFields, apiRef]);

  const handleProcessRowUpdate = useCallback(
    (newRow: R) => {
      const rowId = resolveRowId(newRow);

      setGridRows((previousRows) => {
        const nextRows = previousRows.map((row) =>
          resolveRowId(row) === rowId ? newRow : row,
        );

        onRowsChange?.(nextRows);
        return nextRows;
      });

      return newRow;
    },
    [onRowsChange, resolveRowId],
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

  const persistedState = useMemo<PersistedGridState<R>>(
    () => ({
      gridId,
      version: storageVersion,
      rows: gridRows,
      columns: sanitizeColumnOrder(columnOrder, allFields).map((field, index) => ({
        field,
        width: Math.round(columnWidths[field] ?? 180),
        hidden: columnVisibilityModel[field] === false,
        order: index + 1,
      })),
      sortModel,
      filterModel,
      rowGroupingModel,
      pinnedColumns,
      density,
      paginationModel,
      uiState: {
        expandedGroups: Array.from(new Set(expandedGroups)),
      },
    }),
    [
      allFields,
      columnOrder,
      columnWidths,
      density,
      expandedGroups,
      filterModel,
      gridId,
      gridRows,
      paginationModel,
      pinnedColumns,
      columnVisibilityModel,
      rowGroupingModel,
      sortModel,
      storageVersion,
    ],
  );

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(persistedState, null, 2));
  }, [persistedState, storageKey]);

  const historyRef = useRef<HistorySnapshot<R>[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);
  const lastSignatureRef = useRef('');
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });

  const snapshot = useMemo<HistorySnapshot<R>>(
    () => ({
      rows: gridRows,
      columnOrder,
      columnWidths,
      columnVisibilityModel,
      sortModel,
      filterModel,
      rowGroupingModel,
      pinnedColumns,
      density,
      paginationModel,
      expandedGroups,
    }),
    [
      columnOrder,
      columnVisibilityModel,
      columnWidths,
      density,
      expandedGroups,
      filterModel,
      gridRows,
      paginationModel,
      pinnedColumns,
      rowGroupingModel,
      sortModel,
    ],
  );

  const snapshotSignature = useMemo(() => JSON.stringify(snapshot), [snapshot]);

  const updateHistoryMeta = useCallback(() => {
    setHistoryMeta({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1,
    });
  }, []);

  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      lastSignatureRef.current = snapshotSignature;
      return;
    }

    if (snapshotSignature === lastSignatureRef.current) {
      return;
    }

    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(cloneSnapshot(snapshot));

    if (nextHistory.length > MAX_HISTORY) {
      nextHistory.shift();
    }

    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    lastSignatureRef.current = snapshotSignature;
    updateHistoryMeta();
  }, [snapshot, snapshotSignature, updateHistoryMeta]);

  const applySnapshot = useCallback(
    (historySnapshot: HistorySnapshot<R>) => {
      skipHistoryRef.current = true;

      setGridRows(historySnapshot.rows);
      setColumnOrder(sanitizeColumnOrder(historySnapshot.columnOrder, allFields));
      setColumnWidths(historySnapshot.columnWidths);
      setColumnVisibilityModel(historySnapshot.columnVisibilityModel);
      setSortModel(historySnapshot.sortModel);
      setFilterModel(historySnapshot.filterModel);
      setRowGroupingModel(historySnapshot.rowGroupingModel);
      setPinnedColumns(historySnapshot.pinnedColumns);
      setDensity(historySnapshot.density);
      setPaginationModel(historySnapshot.paginationModel);
      setExpandedGroups(historySnapshot.expandedGroups);
      onRowsChange?.(historySnapshot.rows);
    },
    [allFields, onRowsChange],
  );

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) {
      return;
    }

    historyIndexRef.current -= 1;
    const target = historyRef.current[historyIndexRef.current];
    applySnapshot(cloneSnapshot(target));
    updateHistoryMeta();
  }, [applySnapshot, updateHistoryMeta]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) {
      return;
    }

    historyIndexRef.current += 1;
    const target = historyRef.current[historyIndexRef.current];
    applySnapshot(cloneSnapshot(target));
    updateHistoryMeta();
  }, [applySnapshot, updateHistoryMeta]);

  const handleDownloadState = useCallback(() => {
    const stateJson = JSON.stringify(persistedState, null, 2);
    const blob = new Blob([stateJson], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${gridId}-state.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }, [gridId, persistedState]);

  return (
    <ThemeProvider theme={tiwariGridTheme}>
      <Box
        sx={{
          width: '100%',
          minHeight: '100%',
          boxSizing: 'border-box',
          p: { xs: 1, sm: 1.5, md: 2 },
          background:
            'linear-gradient(165deg, #f2f6f8 0%, #ffffff 45%, #edf3ff 100%)',
        }}
      >
        <Card
          elevation={0}
          sx={(theme) => ({
            border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
            boxShadow: `0 12px 42px ${alpha(theme.palette.primary.dark, 0.12)}`,
          })}
        >
          <CardContent sx={{ p: { xs: 1.25, sm: 1.75 } }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.2}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', md: 'center' }}
              sx={{ mb: 1.25 }}
            >
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
                  {title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel id={`${gridId}-grouping`}>Group by</InputLabel>
                  <Select
                    labelId={`${gridId}-grouping`}
                    label="Group by"
                    value={rowGroupingModel[0] ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRowGroupingModel(value ? [value] : []);
                    }}
                  >
                    <MenuItem value="">None</MenuItem>
                    {groupingOptions.map((option) => (
                      <MenuItem key={option.field} value={option.field}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleUndo}
                  disabled={!historyMeta.canUndo}
                >
                  Undo
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleRedo}
                  disabled={!historyMeta.canRedo}
                >
                  Redo
                </Button>
                <Button size="small" variant="contained" onClick={handleDownloadState}>
                  Share
                </Button>
              </Stack>
            </Stack>

            <Box sx={{ width: '100%', height: { xs: 460, sm: 560, md: 640 } }}>
              <DataGridPremium
                apiRef={apiRef}
                rows={gridRows}
                columns={orderedColumns}
                getRowId={resolveRowId}
                showToolbar
                editMode="cell"
                pagination
                pageSizeOptions={[5, 10, 25, 50]}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                sortModel={sortModel}
                onSortModelChange={setSortModel}
                filterModel={filterModel}
                onFilterModelChange={setFilterModel}
                rowGroupingModel={rowGroupingModel}
                onRowGroupingModelChange={setRowGroupingModel}
                pinnedColumns={pinnedColumns}
                onPinnedColumnsChange={setPinnedColumns}
                density={density}
                onDensityChange={setDensity}
                columnVisibilityModel={effectiveColumnVisibilityModel}
                onColumnVisibilityModelChange={(nextModel) => {
                  setColumnVisibilityModel((previousModel) => {
                    const resolvedModel = { ...nextModel };

                    // Grouped fields are always hidden in the rendered grid,
                    // but we preserve the user's explicit visibility choice.
                    for (const groupedField of rowGroupingModel) {
                      const previousValue = previousModel[groupedField];

                      if (typeof previousValue === 'boolean') {
                        resolvedModel[groupedField] = previousValue;
                      } else {
                        delete resolvedModel[groupedField];
                      }
                    }

                    return resolvedModel;
                  });
                }}
                onColumnOrderChange={syncColumnOrderFromGrid}
                onColumnWidthChange={(params) => {
                  const field = String(params.colDef.field);

                  if (!allFields.includes(field)) {
                    return;
                  }

                  setColumnWidths((previous) => ({
                    ...previous,
                    [field]: Math.round(params.width),
                  }));
                }}
                disableColumnReorder={false}
                processRowUpdate={handleProcessRowUpdate}
                onProcessRowUpdateError={(error) => {
                  // Surface update failures for consumer debugging.
                  console.error('TiwariGrid row update failed:', error);
                }}
                defaultGroupingExpansionDepth={0}
                isGroupExpandedByDefault={isGroupExpandedByDefault}
                slotProps={{
                  toolbar: {
                    showQuickFilter: true,
                    quickFilterProps: {
                      debounceMs: 250,
                    },
                  },
                }}
                sx={(theme) => ({
                  border: 0,
                  borderRadius: 2.4,
                  backgroundColor: alpha(theme.palette.common.white, 0.95),
                  boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.16)}`,
                  '& .MuiDataGrid-toolbarContainer': {
                    p: 1,
                    gap: 1,
                    borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                    backgroundColor: alpha(theme.palette.primary.main, 0.03),
                  },
                  '& .MuiDataGrid-columnHeaders': {
                    borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.14)}`,
                    backgroundColor: alpha(theme.palette.primary.dark, 0.08),
                  },
                  '& .MuiDataGrid-columnHeaderTitle': {
                    fontWeight: 800,
                    fontSize: '12px',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                  },
                  '& .MuiDataGrid-columnHeader': {
                    fontSize: '12px',
                    alignItems: 'center',
                  },
                  '& .MuiDataGrid-cell': {
                    fontSize: '12px',
                    borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                    alignItems: 'center',
                  },
                  '& .MuiDataGrid-cellContent': {
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    minHeight: '100%',
                    fontSize: '12px',
                  },
                  '& .MuiDataGrid-row:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
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
                mt: 1,
                display: 'block',
                color: 'text.secondary',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              localStorage key: {storageKey}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </ThemeProvider>
  );
}
